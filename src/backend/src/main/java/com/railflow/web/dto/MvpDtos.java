package com.railflow.web.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** Response DTOs of the MVP contract §6. Field names are part of the contract. */
public final class MvpDtos {

    private MvpDtos() {
    }

    public record Dataset(String version, String sha256, String sourceUrl, String feedVersion, String coverageStart,
                          String coverageEnd, String importedAt, String coordinateSystem, String attribution,
                          List<DatasetFile> files, List<String> warnings) {
    }

    public record DatasetFile(String fileName, String sha256, long sourceRows, long importedRows,
                              long uncompressedBytes) {
    }

    public record Capabilities(boolean directOnly, boolean fares, boolean transfers, boolean geometry) {
    }

    public record Context(Dataset dataset, String defaultReferenceServiceDate, String dateMode, String timezone,
                          Capabilities capabilities, String replayLabel) {
    }

    public record Station(String stopId, String stopName, BigDecimal longitude, BigDecimal latitude,
                          String coordinateSystem, int locationType) {
    }

    public record StationPage(String datasetVersion, List<Station> items, long total, int offset, int limit,
                              boolean hasMore) {
    }

    public record StopTime(String stopId, String stopName, int stopSequence, String arrivalTime,
                           String departureTime, int arrivalSeconds, int departureSeconds, String arrivalDateTime,
                           String departureDateTime, int arrivalDayOffset, int departureDayOffset) {
    }

    public record TripSummary(String segmentId, String tripId, String trainName, String serviceId, String shapeId,
                              int boardSequence, int alightSequence, StopTime from, StopTime to) {
    }

    public record TripSearch(String datasetVersion, String referenceServiceDate, String fromStopId,
                             String toStopId, List<TripSummary> items, long total, String emptyReason,
                             String replayLabel) {
    }

    public record TripStops(String datasetVersion, String referenceServiceDate, String tripId, String trainName,
                            String serviceId, String shapeId, List<StopTime> stops) {
    }

    public record SegmentGeometry(String datasetVersion, String referenceServiceDate, String tripId, String shapeId,
                                  String fromStopId, String toStopId, int boardSequence, int alightSequence,
                                  String coordinateSystem, String status, String reason, List<double[]> points,
                                  String accuracy, String method, Double fromDistanceMeters,
                                  Double toDistanceMeters, String source) {
    }

    public record ImportRun(long runId, String status, String startedAt, String finishedAt, Long elapsedMs,
                            String errorCode, String message, Map<String, Object> fileCounts,
                            List<String> warnings) {
    }

    public record ImportPage(String datasetVersion, List<ImportRun> items, long total, int offset, int limit,
                             boolean hasMore) {
    }
}
