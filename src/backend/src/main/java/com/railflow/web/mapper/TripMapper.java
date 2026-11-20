package com.railflow.web.mapper;

import com.railflow.web.model.ShapePointRow;
import com.railflow.web.model.StopTimeRow;
import com.railflow.web.model.TripPairRow;
import com.railflow.web.model.TripRow;
import java.time.LocalDate;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** Trip, stop-time, calendar and shape queries inside one dataset version. */
@Mapper
public interface TripMapper {

    @Select("SELECT t.trip_id, t.route_id, t.service_id, t.trip_short_name, t.trip_headsign, t.shape_id, "
            + "r.route_short_name FROM gtfs_trip t "
            + "LEFT JOIN gtfs_route r ON r.dataset_id = t.dataset_id AND r.route_id = t.route_id "
            + "WHERE t.dataset_id = #{datasetId} AND t.trip_id = #{tripId}")
    TripRow findTrip(@Param("datasetId") long datasetId, @Param("tripId") String tripId);

    /**
     * Every ordered board/alight pair of one trip where the board stop comes first. The calendar
     * flag is evaluated for the requested reference service date; trips that do not run on that
     * date are still returned so the caller can distinguish "no direct trip" from "no service".
     */
    @Select("SELECT b.trip_id, t.route_id, t.service_id, t.trip_short_name, r.route_short_name, t.shape_id, "
            + "b.stop_sequence AS board_sequence, b.stop_id AS board_stop_id, sb.stop_name AS board_stop_name, "
            + "b.arrival_time AS board_arrival_time, b.departure_time AS board_departure_time, "
            + "b.arrival_seconds AS board_arrival_seconds, b.departure_seconds AS board_departure_seconds, "
            + "a.stop_sequence AS alight_sequence, a.stop_id AS alight_stop_id, sa.stop_name AS alight_stop_name, "
            + "a.arrival_time AS alight_arrival_time, a.departure_time AS alight_departure_time, "
            + "a.arrival_seconds AS alight_arrival_seconds, a.departure_seconds AS alight_departure_seconds, "
            + "(SELECT COUNT(*) FROM gtfs_calendar_date c WHERE c.dataset_id = b.dataset_id "
            + " AND c.service_id = t.service_id AND c.service_date = #{serviceDate} AND c.exception_type = 1) "
            + "AS runs_on_date "
            + "FROM gtfs_stop_time b "
            + "JOIN gtfs_stop_time a ON a.dataset_id = b.dataset_id AND a.trip_id = b.trip_id "
            + " AND a.stop_id = #{toStopId} AND a.stop_sequence > b.stop_sequence "
            + "JOIN gtfs_trip t ON t.dataset_id = b.dataset_id AND t.trip_id = b.trip_id "
            + "LEFT JOIN gtfs_route r ON r.dataset_id = t.dataset_id AND r.route_id = t.route_id "
            + "JOIN gtfs_stop sb ON sb.dataset_id = b.dataset_id AND sb.stop_id = b.stop_id "
            + "JOIN gtfs_stop sa ON sa.dataset_id = a.dataset_id AND sa.stop_id = a.stop_id "
            + "WHERE b.dataset_id = #{datasetId} AND b.stop_id = #{fromStopId} "
            + "ORDER BY b.departure_seconds ASC, b.trip_id ASC, b.stop_sequence ASC, a.stop_sequence ASC")
    List<TripPairRow> findSegmentPairs(@Param("datasetId") long datasetId, @Param("fromStopId") String fromStopId,
                                       @Param("toStopId") String toStopId,
                                       @Param("serviceDate") LocalDate serviceDate);

    @Select("SELECT s.trip_id, s.stop_id, o.stop_name, s.stop_sequence, s.arrival_time, s.departure_time, "
            + "s.arrival_seconds, s.departure_seconds, o.stop_lat, o.stop_lon "
            + "FROM gtfs_stop_time s "
            + "JOIN gtfs_stop o ON o.dataset_id = s.dataset_id AND o.stop_id = s.stop_id "
            + "WHERE s.dataset_id = #{datasetId} AND s.trip_id = #{tripId} ORDER BY s.stop_sequence ASC")
    List<StopTimeRow> findStopTimes(@Param("datasetId") long datasetId, @Param("tripId") String tripId);

    @Select("SELECT shape_pt_sequence, shape_pt_lat, shape_pt_lon FROM gtfs_shape_point "
            + "WHERE dataset_id = #{datasetId} AND shape_id = #{shapeId} ORDER BY shape_pt_sequence ASC")
    List<ShapePointRow> findShapePoints(@Param("datasetId") long datasetId, @Param("shapeId") String shapeId);

    @Select("SELECT COUNT(*) FROM gtfs_calendar_date WHERE dataset_id = #{datasetId} AND service_id = #{serviceId} "
            + "AND service_date = #{serviceDate} AND exception_type = 1")
    int countServiceRuns(@Param("datasetId") long datasetId, @Param("serviceId") String serviceId,
                         @Param("serviceDate") LocalDate serviceDate);
}
