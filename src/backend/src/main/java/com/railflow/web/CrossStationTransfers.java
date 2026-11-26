package com.railflow.web;

import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import com.railflow.importer.CsvReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.core.io.ClassPathResource;

final class CrossStationTransfers {
    private static final String FILE = "transfers.txt";
    private static final List<String> SCOPE = List.of("from_route_id", "to_route_id", "from_trip_id", "to_trip_id");

    private CrossStationTransfers() {
    }

    static Map<String, Map<String, Integer>> load(DatasetResolver.Resolved dataset, CityCatalog.Snapshot directory) {
        var manifest = dataset.files().stream().filter(file -> FILE.equals(file.fileName)).findFirst();
        if (manifest.isEmpty()) {
            return Map.of();
        }
        var resource = new ClassPathResource("gtfs/" + dataset.row().versionName + "/" + FILE);
        try (var stream = resource.getInputStream()) {
            byte[] bytes = stream.readAllBytes();
            String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            if (!hash.equalsIgnoreCase(manifest.get().sha256)) {
                throw unavailable();
            }
            return read(new InputStreamReader(new ByteArrayInputStream(bytes), StandardCharsets.UTF_8),
                    directory.stations());
        } catch (IOException | NoSuchAlgorithmException e) {
            throw unavailable();
        }
    }

    static Map<String, Map<String, Integer>> read(Reader source, Map<String, CityCatalog.Station> stations)
            throws IOException {
        try (var csv = new CsvReader(source)) {
            var header = csv.nextRecord();
            if (header == null) {
                throw new IOException("Missing transfer header");
            }
            var columns = Arrays.asList(header);
            int from = columns.indexOf("from_stop_id");
            int to = columns.indexOf("to_stop_id");
            int type = columns.indexOf("transfer_type");
            int duration = columns.indexOf("min_transfer_time");
            if (from < 0 || to < 0 || type < 0 || duration < 0) {
                throw new IOException("Missing transfer columns");
            }
            var scope = SCOPE.stream().map(columns::indexOf).filter(index -> index >= 0).toList();
            Map<String, Map<String, Integer>> evidence = new TreeMap<>();
            for (String[] row; (row = csv.nextRecord()) != null;) {
                if (row.length != header.length) {
                    throw new IOException("Invalid transfer record");
                }
                var arrival = stations.get(row[from]);
                var departure = stations.get(row[to]);
                if (arrival == null || departure == null || !arrival.cityId().equals(departure.cityId())
                        || arrival.stationGroupId().equals(departure.stationGroupId())) {
                    continue;
                }
                boolean scoped = false;
                for (int column : scope) {
                    scoped |= !row[column].isBlank();
                }
                int seconds = !scoped && "2".equals(row[type]) ? positiveSeconds(row[duration]) : 0;
                // Conflicting or scoped records invalidate the general rule for this exact stop pair.
                evidence.computeIfAbsent(row[from], ignored -> new TreeMap<>())
                        .merge(row[to], seconds, (old, value) -> old.equals(value) ? old : 0);
            }
            evidence.values().forEach(links -> links.values().removeIf(seconds -> seconds == 0));
            return evidence;
        }
    }

    private static int positiveSeconds(String field) {
        try {
            return Math.max(0, Integer.parseInt(field));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static ApiException unavailable() {
        return new ApiException(ErrorCode.DATASET_NOT_READY, "固定 GTFS 接驳表不可读取或未通过校验");
    }
}
