package com.railflow.web.mapper;

import com.railflow.web.model.StationRow;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** Station lookup inside one dataset version. */
@Mapper
public interface StationMapper {

    @Select("SELECT stop_id, stop_name, stop_lat, stop_lon, location_type FROM gtfs_stop "
            + "WHERE dataset_id = #{datasetId} ORDER BY stop_id ASC")
    List<StationRow> findAll(@Param("datasetId") long datasetId);

    @Select("SELECT stop_id, stop_name, stop_lat, stop_lon, location_type FROM gtfs_stop "
            + "WHERE dataset_id = #{datasetId} AND ("
            + "stop_name LIKE CONCAT('%', #{q}, '%') ESCAPE '!' OR stop_id LIKE CONCAT('%', #{q}, '%') ESCAPE '!') "
            + "ORDER BY stop_id ASC LIMIT #{limit} OFFSET #{offset}")
    List<StationRow> search(@Param("datasetId") long datasetId, @Param("q") String q,
                            @Param("limit") int limit, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM gtfs_stop WHERE dataset_id = #{datasetId} AND ("
            + "stop_name LIKE CONCAT('%', #{q}, '%') ESCAPE '!' OR stop_id LIKE CONCAT('%', #{q}, '%') ESCAPE '!')")
    long countSearch(@Param("datasetId") long datasetId, @Param("q") String q);

    @Select("SELECT stop_id, stop_name, stop_lat, stop_lon, location_type FROM gtfs_stop "
            + "WHERE dataset_id = #{datasetId} AND stop_id = #{stopId}")
    StationRow findById(@Param("datasetId") long datasetId, @Param("stopId") String stopId);

    @Select("SELECT COUNT(*) FROM gtfs_stop WHERE dataset_id = #{datasetId} AND stop_id = #{stopId}")
    long countById(@Param("datasetId") long datasetId, @Param("stopId") String stopId);
}
