package com.railflow.web.mapper;

import com.railflow.web.model.DatasetFileRow;
import com.railflow.web.model.DatasetRow;
import com.railflow.web.model.ImportRunRow;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** Read-only dataset/version/import queries. */
@Mapper
public interface DatasetMapper {

    @Select("SELECT dataset_id FROM dataset_active WHERE singleton_id = 1")
    Long findActiveDatasetId();

    @Select("SELECT id, version_name, sha256, source_url, feed_version, coverage_start, coverage_end, status, "
            + "created_at, activated_at FROM dataset_version WHERE version_name = #{versionName}")
    DatasetRow findByVersionName(@Param("versionName") String versionName);

    @Select("SELECT id, version_name, sha256, source_url, feed_version, coverage_start, coverage_end, status, "
            + "created_at, activated_at FROM dataset_version WHERE id = #{id}")
    DatasetRow findById(@Param("id") long id);

    @Select("SELECT file_name, sha256, header, source_rows, imported_rows, uncompressed_bytes "
            + "FROM dataset_file WHERE dataset_id = #{datasetId} ORDER BY file_name")
    List<DatasetFileRow> findFiles(@Param("datasetId") long datasetId);

    @Select("SELECT COUNT(*) FROM dataset_import_run WHERE dataset_id = #{datasetId}")
    long countRuns(@Param("datasetId") long datasetId);

    @Select("SELECT id, dataset_id, requested_version, status, started_at, finished_at, elapsed_ms, error_code, "
            + "report_json FROM dataset_import_run WHERE dataset_id = #{datasetId} "
            + "ORDER BY id DESC LIMIT #{limit} OFFSET #{offset}")
    List<ImportRunRow> findRuns(@Param("datasetId") long datasetId, @Param("limit") int limit,
                                @Param("offset") int offset);
}
