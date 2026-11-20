package com.railflow.web;

import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import com.railflow.web.dto.MvpDtos;
import com.railflow.web.mapper.StationMapper;
import com.railflow.web.mapper.TripMapper;
import com.railflow.web.model.StopTimeRow;
import com.railflow.web.model.TripPairRow;
import com.railflow.web.model.TripRow;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Direct-trip search and trip stop detail (docs/design/mvp-contract.md §5/§6).
 *
 * <p>Only pairs where the board stop precedes the alight stop on the same {@code trip_id} are
 * returned. The calendar of the requested reference service date decides whether the trip runs;
 * the feed-wide date range is never treated as "runs every day".
 */
@Service
public class TripService {

    public static final String NO_DIRECT_TRIP = "NO_DIRECT_TRIP";
    public static final String NO_SERVICE_ON_DATE = "NO_SERVICE_ON_DATE";

    private final DatasetResolver datasetResolver;
    private final TripMapper tripMapper;
    private final StationMapper stationMapper;

    public TripService(DatasetResolver datasetResolver, TripMapper tripMapper, StationMapper stationMapper) {
        this.datasetResolver = datasetResolver;
        this.tripMapper = tripMapper;
        this.stationMapper = stationMapper;
    }

    public MvpDtos.TripSearch search(String datasetVersion, String fromStopIdRaw, String toStopIdRaw,
                                     String referenceServiceDateRaw) {
        // Format validation before any version lookup or database access (task 20261118-19).
        String version = Params.requireText(datasetVersion, "datasetVersion", 64);
        String fromStopId = Params.requireText(fromStopIdRaw, "fromStopId", 128);
        String toStopId = Params.requireText(toStopIdRaw, "toStopId", 128);
        LocalDate referenceDate = Params.requireIsoDate(referenceServiceDateRaw, "referenceServiceDate");
        DatasetResolver.Resolved resolved = datasetResolver.resolve(version);
        datasetResolver.requireCoverage(resolved.row(), referenceDate);
        long datasetId = resolved.row().id;
        if (stationMapper.countById(datasetId, fromStopId) == 0) {
            throw new ApiException(ErrorCode.STATION_NOT_FOUND, "起点站点在该数据版本中不存在");
        }
        if (stationMapper.countById(datasetId, toStopId) == 0) {
            throw new ApiException(ErrorCode.STATION_NOT_FOUND, "终点站点在该数据版本中不存在");
        }
        // SAME_STATION is a business condition of the trip query (contract §5/§8), so it is checked
        // after version/active, coverage and station identity — not as a format error (task 25).
        if (fromStopId.equals(toStopId)) {
            throw new ApiException(ErrorCode.SAME_STATION);
        }

        List<TripPairRow> pairs = tripMapper.findSegmentPairs(datasetId, fromStopId, toStopId, referenceDate);
        String versionName = resolved.row().versionName;
        if (pairs.isEmpty()) {
            return new MvpDtos.TripSearch(versionName, referenceDate.toString(), fromStopId, toStopId, List.of(), 0,
                    NO_DIRECT_TRIP, ServiceDateTimes.REPLAY_LABEL);
        }
        List<MvpDtos.TripSummary> items = new ArrayList<>();
        for (TripPairRow pair : pairs) {
            if (pair.runsOnDate <= 0) {
                continue;
            }
            items.add(summary(pair, referenceDate));
        }
        if (items.isEmpty()) {
            return new MvpDtos.TripSearch(versionName, referenceDate.toString(), fromStopId, toStopId, List.of(), 0,
                    NO_SERVICE_ON_DATE, ServiceDateTimes.REPLAY_LABEL);
        }
        return new MvpDtos.TripSearch(versionName, referenceDate.toString(), fromStopId, toStopId, items,
                items.size(), null, ServiceDateTimes.REPLAY_LABEL);
    }

    public MvpDtos.TripStops stops(String datasetVersion, String tripIdRaw, String referenceServiceDateRaw) {
        // Format validation before any version lookup or database access (task 20261118-19).
        String version = Params.requireText(datasetVersion, "datasetVersion", 64);
        String tripId = Params.requireText(tripIdRaw, "tripId", 128);
        LocalDate referenceDate = Params.requireIsoDate(referenceServiceDateRaw, "referenceServiceDate");
        DatasetResolver.Resolved resolved = datasetResolver.resolve(version);
        datasetResolver.requireCoverage(resolved.row(), referenceDate);
        long datasetId = resolved.row().id;
        TripRow trip = tripMapper.findTrip(datasetId, tripId);
        if (trip == null) {
            throw new ApiException(ErrorCode.TRIP_NOT_FOUND);
        }
        requireServiceRuns(datasetId, trip, referenceDate);
        List<StopTimeRow> rows = tripMapper.findStopTimes(datasetId, tripId);
        List<MvpDtos.StopTime> stops = new ArrayList<>(rows.size());
        for (StopTimeRow row : rows) {
            stops.add(stopTime(referenceDate, row));
        }
        return new MvpDtos.TripStops(resolved.row().versionName, referenceDate.toString(), tripId,
                trainName(trip), trip.serviceId, trip.shapeId, stops);
    }

    public void requireServiceRuns(long datasetId, TripRow trip, LocalDate referenceDate) {
        if (tripMapper.countServiceRuns(datasetId, trip.serviceId, referenceDate) <= 0) {
            throw new ApiException(ErrorCode.SERVICE_NOT_RUNNING);
        }
    }

    public static String trainName(TripRow trip) {
        return trainName(trip.tripShortName, trip.routeShortName, trip.tripId);
    }

    public static String trainName(String tripShortName, String routeShortName, String tripId) {
        if (tripShortName != null && !tripShortName.isBlank()) {
            return tripShortName;
        }
        if (routeShortName != null && !routeShortName.isBlank()) {
            return routeShortName;
        }
        return tripId;
    }

    private MvpDtos.TripSummary summary(TripPairRow pair, LocalDate referenceDate) {
        MvpDtos.StopTime from = new MvpDtos.StopTime(pair.boardStopId, pair.boardStopName, pair.boardSequence,
                pair.boardArrivalTime, pair.boardDepartureTime, pair.boardArrivalSeconds, pair.boardDepartureSeconds,
                ServiceDateTimes.dateTime(referenceDate, pair.boardArrivalSeconds),
                ServiceDateTimes.dateTime(referenceDate, pair.boardDepartureSeconds),
                ServiceDateTimes.dayOffset(pair.boardArrivalSeconds),
                ServiceDateTimes.dayOffset(pair.boardDepartureSeconds));
        MvpDtos.StopTime to = new MvpDtos.StopTime(pair.alightStopId, pair.alightStopName, pair.alightSequence,
                pair.alightArrivalTime, pair.alightDepartureTime, pair.alightArrivalSeconds,
                pair.alightDepartureSeconds,
                ServiceDateTimes.dateTime(referenceDate, pair.alightArrivalSeconds),
                ServiceDateTimes.dateTime(referenceDate, pair.alightDepartureSeconds),
                ServiceDateTimes.dayOffset(pair.alightArrivalSeconds),
                ServiceDateTimes.dayOffset(pair.alightDepartureSeconds));
        String segmentId = pair.tripId + ":" + pair.boardSequence + ":" + pair.alightSequence;
        return new MvpDtos.TripSummary(segmentId, pair.tripId,
                trainName(pair.tripShortName, pair.routeShortName, pair.tripId), pair.serviceId, pair.shapeId,
                pair.boardSequence, pair.alightSequence, from, to);
    }

    public static MvpDtos.StopTime stopTime(LocalDate referenceDate, StopTimeRow row) {
        return new MvpDtos.StopTime(row.stopId, row.stopName, row.stopSequence, row.arrivalTime, row.departureTime,
                row.arrivalSeconds, row.departureSeconds,
                ServiceDateTimes.dateTime(referenceDate, row.arrivalSeconds),
                ServiceDateTimes.dateTime(referenceDate, row.departureSeconds),
                ServiceDateTimes.dayOffset(row.arrivalSeconds),
                ServiceDateTimes.dayOffset(row.departureSeconds));
    }
}
