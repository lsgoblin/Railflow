package com.railflow.web.mapper;

import com.railflow.web.model.StopTimeRow;
import java.time.LocalDate;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Result;

@Mapper
public interface TimetableMapper {

    @Select("""
            SELECT s.trip_id, s.stop_id, o.stop_name, s.stop_sequence, s.arrival_time, s.departure_time,
                   s.arrival_seconds, s.departure_seconds, t.service_id, t.trip_short_name, t.shape_id,
                   r.route_short_name
            FROM gtfs_stop_time s
            JOIN gtfs_trip t ON t.dataset_id = s.dataset_id AND t.trip_id = s.trip_id
            JOIN gtfs_stop o ON o.dataset_id = s.dataset_id AND o.stop_id = s.stop_id
            LEFT JOIN gtfs_route r ON r.dataset_id = t.dataset_id AND r.route_id = t.route_id
            WHERE s.dataset_id = #{datasetId}
            ORDER BY s.trip_id, s.stop_sequence
            """)
    List<ScheduledStop> findStops(@Param("datasetId") long datasetId);

    @Select("""
            SELECT service_id, service_date FROM gtfs_calendar_date
            WHERE dataset_id = #{datasetId} AND exception_type = 1
            ORDER BY service_id, service_date
            """)
    @Results({@Result(column = "service_id", property = "serviceId"),
            @Result(column = "service_date", property = "serviceDate")})
    List<ServiceDay> findServiceDays(@Param("datasetId") long datasetId);

    class ScheduledStop extends StopTimeRow {
        public String serviceId;
        public String tripShortName;
        public String routeShortName;
        public String shapeId;
    }

    class ServiceDay {
        public String serviceId;
        public LocalDate serviceDate;
    }
}
