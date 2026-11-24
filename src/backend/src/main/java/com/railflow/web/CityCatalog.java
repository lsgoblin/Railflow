package com.railflow.web;

import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import com.railflow.importer.FixedPackage;
import com.railflow.web.dto.MvpDtos;
import com.railflow.web.mapper.StationMapper;
import com.railflow.web.model.DatasetRow;
import com.railflow.web.model.StationRow;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
@Profile("web")
public class CityCatalog {

    static final int STATION_COUNT = 3180;
    private static final String SEED = "gtfs/" + FixedPackage.RELEASE_NAME + "-city-stops.tsv";
    private static final Set<String> NON_ANCHOR_SOURCES = Set.of("xikang", "leshancity", "ha-yi-station-sites",
            "chengdu-station-sites", "qingan-station-report", "xian-east-plan");
    private final StationMapper stationMapper;
    private Snapshot loaded;

    public CityCatalog(StationMapper stationMapper) {
        this.stationMapper = stationMapper;
    }

    public synchronized Snapshot load(DatasetRow dataset) {
        if (!FixedPackage.RELEASE_NAME.equals(dataset.versionName)
                || !FixedPackage.SHA256.equalsIgnoreCase(dataset.sha256)) {
            throw new ApiException(ErrorCode.DATASET_NOT_READY, "该数据版本尚无全量城市目录");
        }
        if (loaded == null || loaded.datasetId() != dataset.id) {
            loaded = assemble(dataset.id, stationMapper.findAll(dataset.id), readSeed());
        }
        return loaded;
    }

    static Snapshot assemble(long datasetId, List<StationRow> rows, Map<String, CitySeed> seed) {
        if (rows.size() != STATION_COUNT || seed.size() != STATION_COUNT) {
            throw new ApiException(ErrorCode.DATASET_NOT_READY, "城市目录与固定 GTFS 的站点总数不一致");
        }
        Map<String, CitySeed> profiles = new LinkedHashMap<>();
        Map<String, List<Station>> groups = new TreeMap<>();
        Map<String, Station> stationIndex = new TreeMap<>();
        Map<StationKey, String> stationGroups = new HashMap<>();
        Map<String, List<String>> stopCodesByGroup = new HashMap<>();
        for (StationRow row : rows.stream().sorted(Comparator.comparing(s -> s.stopId)).toList()) {
            CitySeed entry = seed.get(row.stopId);
            if (entry == null || stationIndex.containsKey(row.stopId)) {
                throw new ApiException(ErrorCode.DATASET_NOT_READY, "城市目录与固定 GTFS 的站点标识不一致");
            }
            CitySeed previous = profiles.putIfAbsent(entry.cityId(), entry);
            if (previous != null && (!previous.cityName().equals(entry.cityName())
                    || !previous.administration().equals(entry.administration()))) {
                throw new IllegalStateException("Inconsistent city metadata for " + entry.cityId());
            }
            var details = new MvpDtos.Station(row.stopId, row.stopName, row.stopLon, row.stopLat,
                    "WGS84", row.locationType);
            var key = new StationKey(entry.cityId(), row.stopName, row.stopLon.stripTrailingZeros(),
                    row.stopLat.stripTrailingZeros());
            String stationGroupId = stationGroups.computeIfAbsent(key, ignored -> row.stopId);
            stopCodesByGroup.computeIfAbsent(stationGroupId, ignored -> new ArrayList<>()).add(row.stopId);
            var station = new Station(entry.cityId(), details, entry.source(), stationGroupId);
            stationIndex.put(row.stopId, station);
            groups.computeIfAbsent(entry.cityId(), ignored -> new ArrayList<>()).add(station);
        }
        Map<String, CityDetail> cities = new LinkedHashMap<>();
        groups.forEach((cityId, stations) -> {
            CitySeed profile = profiles.get(cityId);
            Station anchor = anchor(profile.cityName(), stations);
            var city = new City(cityId, profile.cityName(), profile.administration(), anchor.station().longitude(),
                    anchor.station().latitude(), "WGS84", anchor.station().stopId(), stations.size(),
                    (int) stations.stream().map(Station::stationGroupId).distinct().count());
            cities.put(cityId, new CityDetail(city, List.copyOf(stations)));
        });
        stopCodesByGroup.replaceAll((stationGroupId, codes) -> List.copyOf(codes));
        return new Snapshot(datasetId, Collections.unmodifiableMap(cities), Collections.unmodifiableMap(stationIndex),
                Map.copyOf(stopCodesByGroup));
    }

    private static Station anchor(String name, List<Station> stations) {
        String shortName = name.endsWith("市") ? name.substring(0, name.length() - 1) : name;
        // Keep source coordinates for display. Shared or misplaced points cannot anchor a city.
        List<Station> located = stations.stream().filter(s -> !NON_ANCHOR_SOURCES.contains(s.membershipSource()))
                .toList();
        if (located.isEmpty()) {
            throw new IllegalStateException("No usable city anchor for " + name);
        }
        for (Station station : located) {
            if (station.station().stopName().equals(shortName)) {
                return station;
            }
        }
        double longitude = located.stream().mapToDouble(s -> s.station().longitude().doubleValue()).average().orElseThrow();
        double latitude = located.stream().mapToDouble(s -> s.station().latitude().doubleValue()).average().orElseThrow();
        double longitudeScale = Math.cos(Math.toRadians(latitude));
        return located.stream().min(Comparator.comparingDouble(s -> Math.hypot(
                (s.station().longitude().doubleValue() - longitude) * longitudeScale,
                s.station().latitude().doubleValue() - latitude))).orElseThrow();
    }

    static Map<String, CitySeed> readSeed() {
        try (var reader = new BufferedReader(new InputStreamReader(new ClassPathResource(SEED).getInputStream(),
                StandardCharsets.UTF_8))) {
            if (!"stop_id\tcity_id\tcity_name\tadministration\tsource".equals(reader.readLine())) {
                throw new IllegalStateException("Invalid city seed header");
            }
            Map<String, CitySeed> seed = new LinkedHashMap<>();
            for (String line; (line = reader.readLine()) != null;) {
                String[] fields = line.split("\t", -1);
                if (fields.length != 5 || Arrays.stream(fields).anyMatch(String::isBlank)) {
                    throw new IllegalStateException("Incomplete city seed row");
                }
                var value = new CitySeed(fields[1], fields[2], fields[3], fields[4]);
                if (seed.putIfAbsent(fields[0], value) != null) {
                    throw new IllegalStateException("Duplicate stop in city seed: " + fields[0]);
                }
            }
            return seed;
        } catch (IOException e) {
            throw new IllegalStateException("Could not read " + SEED, e);
        }
    }

    public record City(String cityId, String name, String administration, BigDecimal longitude,
                       BigDecimal latitude, String coordinateSystem, String anchorStopId, int stationCount,
                       int stationGroupCount) {
    }

    public record Station(String cityId, MvpDtos.Station station, String membershipSource, String stationGroupId) {
    }

    public record CityDetail(City city, List<Station> stations) {
    }

    public record Location(String type, City city, Station station) {
    }

    record CitySeed(String cityId, String cityName, String administration, String source) {
    }

    private record StationKey(String cityId, String name, BigDecimal longitude, BigDecimal latitude) {
    }

    public record Snapshot(long datasetId, Map<String, CityDetail> cities, Map<String, Station> stations,
                           Map<String, List<String>> stopCodesByGroup) {

        CityDetail requireCity(String cityId) {
            CityDetail result = cities.get(cityId);
            if (result == null) {
                throw new ApiException(ErrorCode.NOT_FOUND, "城市不在该数据版本的目录中");
            }
            return result;
        }

        List<Location> search(String query) {
            String key = query.toUpperCase(Locale.ROOT);
            var result = new ArrayList<Location>();
            for (CityDetail detail : cities.values()) {
                if (detail.city().name().toUpperCase(Locale.ROOT).contains(key)) {
                    result.add(new Location("CITY", detail.city(), null));
                }
            }
            for (Station station : stations.values()) {
                MvpDtos.Station details = station.station();
                if (details.stopName().toUpperCase(Locale.ROOT).contains(key)
                        || details.stopId().toUpperCase(Locale.ROOT).contains(key)) {
                    result.add(new Location("STATION", cities.get(station.cityId()).city(), station));
                }
            }
            return result;
        }
    }
}
