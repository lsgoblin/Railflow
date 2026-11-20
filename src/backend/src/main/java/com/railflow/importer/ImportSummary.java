package com.railflow.importer;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Result of one importer invocation; also the JSON summary printed on stdout. */
public record ImportSummary(
        String result,
        Long runId,
        Long datasetId,
        String datasetVersion,
        String sha256,
        long elapsedMs,
        List<FileCount> files,
        Map<String, Long> tables,
        Map<String, Object> storage,
        String errorCode,
        String message,
        List<String> warnings,
        String validationPolicy,
        String sourceAnomalyManifestSha256,
        Integer knownSourceAnomalyCount) {

    public record FileCount(String fileName, long sourceRows, long importedRows, String sha256) {
    }

    public static ImportSummary noop(long runId, long datasetId, String version, String sha256, long elapsedMs,
                                     Map<String, Long> tables, List<String> warnings,
                                     String manifestSha256, int anomalyCount) {
        return new ImportSummary("NOOP", runId, datasetId, version, sha256, elapsedMs, List.of(), tables, Map.of(),
                null, "已存在同哈希的激活版本；已按 MVP-C1.2 审计异常集合，未重复写入数据", warnings,
                KnownSourceAnomalies.POLICY, manifestSha256, anomalyCount);
    }

    public static ImportSummary success(long runId, long datasetId, String version, String sha256, long elapsedMs,
                                        List<FileCount> files, Map<String, Long> tables,
                                        Map<String, Object> storage, List<String> warnings,
                                        String manifestSha256, int anomalyCount) {
        return new ImportSummary("SUCCEEDED", runId, datasetId, version, sha256, elapsedMs, files, tables, storage,
                null, "整包导入并校验通过，版本已激活", warnings, KnownSourceAnomalies.POLICY, manifestSha256,
                anomalyCount);
    }

    public Map<String, Object> toJsonMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("result", result);
        map.put("runId", runId);
        map.put("datasetId", datasetId);
        map.put("datasetVersion", datasetVersion);
        map.put("sha256", sha256);
        map.put("elapsedMs", elapsedMs);
        if (!files.isEmpty()) {
            List<Map<String, Object>> fileList = new ArrayList<>();
            for (FileCount file : files) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("fileName", file.fileName());
                entry.put("sourceRows", file.sourceRows());
                entry.put("importedRows", file.importedRows());
                entry.put("sha256", file.sha256());
                fileList.add(entry);
            }
            map.put("files", fileList);
        }
        if (!tables.isEmpty()) {
            map.put("tables", tables);
        }
        if (!storage.isEmpty()) {
            map.put("storage", storage);
        }
        if (errorCode != null) {
            map.put("errorCode", errorCode);
        }
        map.put("message", message);
        if (validationPolicy != null) {
            map.put("validationPolicy", validationPolicy);
            map.put("sourceAnomalyManifestSha256", sourceAnomalyManifestSha256);
            map.put("knownSourceAnomalyCount", knownSourceAnomalyCount);
        }
        map.put("warnings", warnings == null ? List.of() : warnings);
        return map;
    }
}
