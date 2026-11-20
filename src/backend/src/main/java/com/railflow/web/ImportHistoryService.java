package com.railflow.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.railflow.web.dto.MvpDtos;
import com.railflow.web.mapper.DatasetMapper;
import com.railflow.web.model.ImportRunRow;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Desensitised import history of the active dataset version. */
@Service
public class ImportHistoryService {

    private static final Logger log = LoggerFactory.getLogger(ImportHistoryService.class);

    private final DatasetResolver datasetResolver;
    private final DatasetMapper datasetMapper;
    private final ObjectMapper objectMapper;

    public ImportHistoryService(DatasetResolver datasetResolver, DatasetMapper datasetMapper,
                                ObjectMapper objectMapper) {
        this.datasetResolver = datasetResolver;
        this.datasetMapper = datasetMapper;
        this.objectMapper = objectMapper;
    }

    public MvpDtos.ImportPage page(String datasetVersion, String offsetRaw, String limitRaw) {
        // Format validation first (task 20261118-19); page size default matches StationPage (task 20261118-20).
        String version = Params.requireText(datasetVersion, "datasetVersion", 64);
        int offset = Params.optionalInt(offsetRaw, "offset", 0, 0, Integer.MAX_VALUE);
        int limit = Params.optionalInt(limitRaw, "limit", 50, 1, 100);
        DatasetResolver.Resolved resolved = datasetResolver.resolve(version);
        long datasetId = resolved.row().id;
        List<ImportRunRow> rows = datasetMapper.findRuns(datasetId, limit, offset);
        long total = datasetMapper.countRuns(datasetId);
        List<MvpDtos.ImportRun> items = new ArrayList<>(rows.size());
        for (ImportRunRow row : rows) {
            items.add(new MvpDtos.ImportRun(row.id, row.status, utc(row.startedAt), utc(row.finishedAt),
                    row.elapsedMs, row.errorCode, message(row.status, row.errorCode), fileCounts(row.reportJson),
                    warnings(row.reportJson)));
        }
        return new MvpDtos.ImportPage(resolved.row().versionName, items, total, offset, limit,
                (long) offset + items.size() < total);
    }

    private static String utc(java.time.LocalDateTime value) {
        return value == null ? null : value.toInstant(java.time.ZoneOffset.UTC).toString();
    }

    private static String message(String status, String errorCode) {
        if ("SUCCEEDED".equals(status)) {
            return "导入成功并已激活";
        }
        if ("NOOP".equals(status)) {
            return "同版本已激活，未重复写入数据";
        }
        if ("INTERRUPTED".equals(status)) {
            return "导入被中断，未激活";
        }
        if ("FAILED".equals(status)) {
            return switch (errorCode == null ? "" : errorCode) {
                case "PACKAGE_HASH_MISMATCH" -> "导入包哈希与固定包不一致";
                case "PACKAGE_CONTENT_INVALID" -> "导入包内容校验失败";
                case "SCHEMA_NOT_READY" -> "数据库结构未初始化";
                case "IMPORT_IN_PROGRESS" -> "另一导入进程持有导入锁";
                case "DATASET_HASH_CONFLICT" -> "版本哈希冲突";
                case "DATABASE_UNAVAILABLE" -> "数据库暂不可用";
                default -> "导入失败";
            };
        }
        return "导入进行中";
    }

    private Map<String, Object> fileCounts(String reportJson) {
        Map<String, Object> counts = new LinkedHashMap<>();
        if (reportJson == null || reportJson.isBlank()) {
            return counts;
        }
        try {
            JsonNode root = objectMapper.readTree(reportJson);
            JsonNode files = root.get("files");
            if (files != null && files.isArray()) {
                for (JsonNode file : files) {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("sourceRows", file.path("sourceRows").asLong());
                    entry.put("importedRows", file.path("importedRows").asLong());
                    counts.put(file.path("fileName").asText(), entry);
                }
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("unparseable import report for API response");
        }
        return counts;
    }

    /**
     * MVP-C1.2 §3.1: SUCCEEDED/NOOP runs expose the warnings stored in their report_json. Runs
     * without a warnings field (historical runs) return an empty array; an empty array must not be
     * read as "the times are correct".
     */
    private List<String> warnings(String reportJson) {
        if (reportJson == null || reportJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(reportJson);
            JsonNode warnings = root.get("warnings");
            if (warnings == null || !warnings.isArray()) {
                return List.of();
            }
            List<String> list = new ArrayList<>(warnings.size());
            for (JsonNode node : warnings) {
                list.add(node.asText());
            }
            return list;
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("unparseable import report warnings for API response");
            return List.of();
        }
    }
}
