package com.railflow.web;

import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import com.railflow.importer.FixedPackage;
import com.railflow.web.dto.MvpDtos;
import com.railflow.web.mapper.DatasetMapper;
import com.railflow.web.model.DatasetFileRow;
import com.railflow.web.model.DatasetRow;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Resolves the requested dataset version against the single active pointer exactly once per
 * request and exposes the Dataset DTO (docs/design/mvp-contract.md §5/§6).
 */
@Service
public class DatasetResolver {

    private final DatasetMapper datasetMapper;

    public DatasetResolver(DatasetMapper datasetMapper) {
        this.datasetMapper = datasetMapper;
    }

    public record Resolved(DatasetRow row, List<DatasetFileRow> files) {
    }

    /** Version must exist and be the active one; otherwise 404 / 409. */
    public Resolved resolve(String datasetVersion) {
        String version = Params.requireText(datasetVersion, "datasetVersion", 64);
        DatasetRow row = datasetMapper.findByVersionName(version);
        if (row == null) {
            throw new ApiException(ErrorCode.DATASET_NOT_FOUND);
        }
        // Contract §5: a known version that is not the active one is 409 DATASET_NOT_ACTIVE,
        // also when the active pointer is still empty (no version has been activated yet).
        Long activeId = datasetMapper.findActiveDatasetId();
        if (activeId == null || activeId != row.id) {
            throw new ApiException(ErrorCode.DATASET_NOT_ACTIVE);
        }
        return new Resolved(row, datasetMapper.findFiles(row.id));
    }

    /** Used by /context: no active version is 503 DATASET_NOT_READY. */
    public Resolved resolveActive() {
        Long activeId = datasetMapper.findActiveDatasetId();
        if (activeId == null) {
            throw new ApiException(ErrorCode.DATASET_NOT_READY);
        }
        DatasetRow row = datasetMapper.findById(activeId);
        if (row == null) {
            throw new ApiException(ErrorCode.DATASET_NOT_READY);
        }
        return new Resolved(row, datasetMapper.findFiles(row.id));
    }

    public void requireCoverage(DatasetRow row, LocalDate referenceServiceDate) {
        if (referenceServiceDate.isBefore(row.coverageStart) || referenceServiceDate.isAfter(row.coverageEnd)) {
            throw new ApiException(ErrorCode.DATE_OUTSIDE_COVERAGE);
        }
    }

    public MvpDtos.Dataset toDto(Resolved resolved) {
        DatasetRow row = resolved.row();
        List<MvpDtos.DatasetFile> files = new ArrayList<>(resolved.files().size());
        for (DatasetFileRow file : resolved.files()) {
            files.add(new MvpDtos.DatasetFile(file.fileName, file.sha256, file.sourceRows, file.importedRows,
                    file.uncompressedBytes));
        }
        // MVP-C1.2 §3.1: the fixed version always exposes the known source-time anomaly warning.
        List<String> warnings = FixedPackage.RELEASE_NAME.equals(row.versionName)
                ? com.railflow.importer.KnownSourceAnomalies.loadFromClasspath().warnings()
                : List.of();
        return new MvpDtos.Dataset(row.versionName, row.sha256, row.sourceUrl, row.feedVersion,
                row.coverageStart.toString(), row.coverageEnd.toString(),
                utc(row.activatedAt != null ? row.activatedAt : row.createdAt),
                "WGS84", FixedPackage.ATTRIBUTION, files, warnings);
    }

    private static String utc(LocalDateTime value) {
        return value == null ? null : value.toInstant(ZoneOffset.UTC).toString();
    }
}
