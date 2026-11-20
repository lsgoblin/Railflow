package com.railflow.web;

import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import com.railflow.geometry.SegmentGeometryCalculator;
import com.railflow.importer.FixedPackage;
import com.railflow.web.dto.MvpDtos;
import com.railflow.web.mapper.TripMapper;
import com.railflow.web.model.ShapePointRow;
import com.railflow.web.model.StopTimeRow;
import com.railflow.web.model.TripRow;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Segment geometry for the consumed board/alight interval (docs/design/mvp-contract.md §7).
 *
 * <p>Unavailability is a 200 response with {@code status=UNAVAILABLE} and a reason; it never
 * removes the textual trip result and is never reported as an HTTP failure.
 */
@Service
public class GeometryService {

    private final DatasetResolver datasetResolver;
    private final TripMapper tripMapper;
    private final TripService tripService;

    public GeometryService(DatasetResolver datasetResolver, TripMapper tripMapper, TripService tripService) {
        this.datasetResolver = datasetResolver;
        this.tripMapper = tripMapper;
        this.tripService = tripService;
    }

    public MvpDtos.SegmentGeometry segment(String datasetVersion, String tripIdRaw, String referenceServiceDateRaw,
                                           String fromStopIdRaw, String toStopIdRaw, String boardSequenceRaw,
                                           String alightSequenceRaw) {
        // Format validation before any version lookup or database access (task 20261118-19).
        String version = Params.requireText(datasetVersion, "datasetVersion", 64);
        String tripId = Params.requireText(tripIdRaw, "tripId", 128);
        String fromStopId = Params.requireText(fromStopIdRaw, "fromStopId", 128);
        String toStopId = Params.requireText(toStopIdRaw, "toStopId", 128);
        int boardSequence = Params.requiredPositiveInt(boardSequenceRaw, "boardSequence");
        int alightSequence = Params.requiredPositiveInt(alightSequenceRaw, "alightSequence");
        LocalDate referenceDate = Params.requireIsoDate(referenceServiceDateRaw, "referenceServiceDate");
        DatasetResolver.Resolved resolved = datasetResolver.resolve(version);
        datasetResolver.requireCoverage(resolved.row(), referenceDate);

        long datasetId = resolved.row().id;
        TripRow trip = tripMapper.findTrip(datasetId, tripId);
        if (trip == null) {
            throw new ApiException(ErrorCode.TRIP_NOT_FOUND);
        }
        tripService.requireServiceRuns(datasetId, trip, referenceDate);

        List<StopTimeRow> stops = tripMapper.findStopTimes(datasetId, tripId);
        int boardIndex = indexOfSequence(stops, boardSequence);
        int alightIndex = indexOfSequence(stops, alightSequence);
        if (boardIndex < 0 || alightIndex < 0 || boardSequence >= alightSequence) {
            throw new ApiException(ErrorCode.SEGMENT_ORDER_INVALID);
        }
        if (!stops.get(boardIndex).stopId.equals(fromStopId) || !stops.get(alightIndex).stopId.equals(toStopId)) {
            throw new ApiException(ErrorCode.SEGMENT_ORDER_INVALID);
        }

        MvpDtos.SegmentGeometry unavailable = unavailable(version, referenceDate, trip, fromStopId, toStopId,
                boardSequence, alightSequence);
        if (trip.shapeId == null || trip.shapeId.isBlank()) {
            return withReason(unavailable, "NO_SHAPE");
        }
        List<ShapePointRow> shapeRows = tripMapper.findShapePoints(datasetId, trip.shapeId);
        if (shapeRows.isEmpty()) {
            return withReason(unavailable, "NO_SHAPE");
        }
        List<SegmentGeometryCalculator.Point> shape = new ArrayList<>(shapeRows.size());
        for (ShapePointRow row : shapeRows) {
            if (row.shapePtLat == null || row.shapePtLon == null) {
                return withReason(unavailable, "INVALID_SHAPE");
            }
            shape.add(new SegmentGeometryCalculator.Point(row.shapePtLat.doubleValue(),
                    row.shapePtLon.doubleValue()));
        }
        List<SegmentGeometryCalculator.Point> stopPoints = new ArrayList<>(stops.size());
        for (StopTimeRow stop : stops) {
            if (stop.stopLat == null || stop.stopLon == null) {
                return withReason(unavailable, "INVALID_STATION_COORDINATE");
            }
            stopPoints.add(new SegmentGeometryCalculator.Point(stop.stopLat.doubleValue(),
                    stop.stopLon.doubleValue()));
        }

        SegmentGeometryCalculator.Result result =
                new SegmentGeometryCalculator().compute(shape, stopPoints, boardIndex, alightIndex);
        if (!result.ready()) {
            return withReason(unavailable, result.reason());
        }
        return new MvpDtos.SegmentGeometry(version, referenceDate.toString(), tripId, trip.shapeId, fromStopId,
                toStopId, boardSequence, alightSequence, "WGS84", "READY", null, result.points(), "APPROXIMATE",
                SegmentGeometryCalculator.METHOD, result.fromDistanceMeters(), result.toDistanceMeters(), source(version));
    }

    private MvpDtos.SegmentGeometry unavailable(String version, LocalDate referenceDate, TripRow trip,
                                                String fromStopId, String toStopId, int boardSequence,
                                                int alightSequence) {
        return new MvpDtos.SegmentGeometry(version, referenceDate.toString(), trip.tripId, trip.shapeId, fromStopId,
                toStopId, boardSequence, alightSequence, "WGS84", "UNAVAILABLE", null, List.of(), "APPROXIMATE",
                SegmentGeometryCalculator.METHOD, null, null, source(version));
    }

    private MvpDtos.SegmentGeometry withReason(MvpDtos.SegmentGeometry base, String reason) {
        return new MvpDtos.SegmentGeometry(base.datasetVersion(), base.referenceServiceDate(), base.tripId(),
                base.shapeId(), base.fromStopId(), base.toStopId(), base.boardSequence(), base.alightSequence(),
                base.coordinateSystem(), "UNAVAILABLE", reason, List.of(), base.accuracy(), base.method(), null, null,
                base.source());
    }

    private static String source(String version) {
        return "GTFS shapes.txt · wensimehrp/chinese-railway-gtfs " + version + " (CC BY 4.0)";
    }

    private static int indexOfSequence(List<StopTimeRow> stops, int sequence) {
        for (int i = 0; i < stops.size(); i++) {
            if (stops.get(i).stopSequence == sequence) {
                return i;
            }
        }
        return -1;
    }

    static boolean isFinite(BigDecimal value) {
        return value != null && Double.isFinite(value.doubleValue());
    }
}
