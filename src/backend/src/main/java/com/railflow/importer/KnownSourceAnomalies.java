package com.railflow.importer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Known source-time anomalies of the fixed release (MVP-C1.2 §3.1, decision task 15 option A).
 *
 * <p>The fixed package contains 193 stop_time rows whose arrival is later than the departure of
 * the same stop. They are historical source values without an authoritative correction, so they
 * are imported verbatim, but only when the complete set matches the versioned manifest exactly
 * (identity {@code (tripId, stopSequence, stopId)} plus both raw time strings). A missing, extra,
 * duplicated or altered record, or a manifest whose SHA-256 differs, must reject activation.
 *
 * <p>The manifest is packaged as a classpath resource with the same bytes as
 * {@code docs/design/fixtures/gtfs-20261116-085531-time-anomalies.json}; its SHA-256 is pinned here.
 */
public final class KnownSourceAnomalies {

    public static final String POLICY = "MVP-C1.2";
    public static final String MANIFEST_RESOURCE = "gtfs/gtfs-20261116-085531-time-anomalies.json";
    public static final String MANIFEST_SHA256 =
            "2D0EF97E3D0AD3F627097728F61AC18E27EA405BB84362052FC8E817E00BC2B4";
    public static final int EXPECTED_COUNT = 193;
    public static final int EXPECTED_TRIPS = 192;
    public static final String SUMMARY_WARNING =
            "固定数据包含193条到达晚于发车的源时刻记录（192个车次），原值未修正，仅供历史参考。";

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Comparator<Anomaly> ORDER =
            Comparator.comparing(Anomaly::tripId).thenComparingInt(Anomaly::stopSequence);

    private static volatile KnownSourceAnomalies cached;

    public record Anomaly(String tripId, int stopSequence, String stopId, String arrivalTime,
                          String departureTime) {
    }

    private final List<Anomaly> records;
    private final String manifestSha256;

    private KnownSourceAnomalies(List<Anomaly> records, String manifestSha256) {
        this.records = List.copyOf(records);
        this.manifestSha256 = manifestSha256;
    }

    /** Loads the packaged manifest once; a broken resource fails the import instead of passing. */
    public static KnownSourceAnomalies loadFromClasspath() {
        KnownSourceAnomalies value = cached;
        if (value != null) {
            return value;
        }
        synchronized (KnownSourceAnomalies.class) {
            if (cached == null) {
                try (InputStream in = KnownSourceAnomalies.class.getClassLoader()
                        .getResourceAsStream(MANIFEST_RESOURCE)) {
                    if (in == null) {
                        throw new ImportFailure(CliError.IMPORT_FAILED,
                                "缺少已知源异常清单资源 " + MANIFEST_RESOURCE);
                    }
                    cached = parse(in.readAllBytes());
                } catch (IOException e) {
                    throw new ImportFailure(CliError.IMPORT_FAILED,
                            "读取已知源异常清单失败: " + e.getClass().getSimpleName(), e);
                }
            }
            return cached;
        }
    }

    /** Verifies the pinned SHA-256, then parses and validates the manifest content. */
    public static KnownSourceAnomalies parse(byte[] bytes) {
        String sha = sha256(bytes);
        if (!MANIFEST_SHA256.equalsIgnoreCase(sha)) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "已知源异常清单 SHA-256 与固定值不一致，拒绝导入");
        }
        return parseVerified(bytes, sha);
    }

    /** Content validation without the hash gate; used by tests to exercise the content checks. */
    static KnownSourceAnomalies parseVerified(byte[] bytes, String sha) {
        JsonNode root;
        try {
            root = MAPPER.readTree(bytes);
        } catch (IOException e) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "已知源异常清单不是合法 JSON");
        }
        JsonNode recordsNode = root.path("records");
        if (!recordsNode.isArray()) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "已知源异常清单缺少 records 数组");
        }
        int declared = root.path("count").asInt(-1);
        if (declared != EXPECTED_COUNT || recordsNode.size() != EXPECTED_COUNT) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "已知源异常清单条数与固定值不一致: 声明 " + declared + "，实际 " + recordsNode.size());
        }
        if (!"gtfs-20261116-085531".equals(root.path("datasetVersion").asText())) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "已知源异常清单版本不是固定 release");
        }
        if (!FixedPackage.SHA256.equalsIgnoreCase(root.path("packageSha256").asText())) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "已知源异常清单的包哈希不是固定 ZIP");
        }
        List<Anomaly> parsed = new ArrayList<>(recordsNode.size());
        Set<String> identities = new HashSet<>();
        for (JsonNode node : recordsNode) {
            Anomaly anomaly = new Anomaly(
                    node.path("tripId").asText(),
                    node.path("stopSequence").asInt(),
                    node.path("stopId").asText(),
                    node.path("arrivalTime").asText(),
                    node.path("departureTime").asText());
            if (anomaly.tripId().isEmpty() || anomaly.stopId().isEmpty()
                    || anomaly.arrivalTime().isEmpty() || anomaly.departureTime().isEmpty()
                    || anomaly.stopSequence() <= 0) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "已知源异常清单存在不完整记录");
            }
            String identity = identity(anomaly);
            if (!identities.add(identity)) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                        "已知源异常清单存在重复身份: " + identity);
            }
            parsed.add(anomaly);
        }
        List<Anomaly> sorted = new ArrayList<>(parsed);
        sorted.sort(ORDER);
        if (!sorted.equals(parsed)) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "已知源异常清单未按 tripId 二进制序/stopSequence 排序");
        }
        long trips = parsed.stream().map(Anomaly::tripId).distinct().count();
        if (trips != EXPECTED_TRIPS) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "已知源异常清单车次数与固定值不一致: " + trips);
        }
        return new KnownSourceAnomalies(parsed, sha);
    }

    public List<Anomaly> records() {
        return records;
    }

    public String manifestSha256() {
        return manifestSha256;
    }

    public List<String> warnings() {
        return List.of(SUMMARY_WARNING);
    }

    /** Full manifest as JSON maps for {@code dataset_import_run.report_json}. */
    public List<Map<String, Object>> recordsAsMaps() {
        List<Map<String, Object>> list = new ArrayList<>(records.size());
        for (Anomaly anomaly : records) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("tripId", anomaly.tripId());
            map.put("stopSequence", anomaly.stopSequence());
            map.put("stopId", anomaly.stopId());
            map.put("arrivalTime", anomaly.arrivalTime());
            map.put("departureTime", anomaly.departureTime());
            list.add(map);
        }
        return list;
    }

    /**
     * Compares an observed anomaly set (from the fixed ZIP or from the active database) with the
     * manifest. Both sides must contain exactly the manifest records, once each, with identical raw
     * time strings; the observed order is normalised here because the ZIP file order is not
     * guaranteed to be binary trip order (only the manifest and the stored report are sorted).
     *
     * @return violations; empty means the observed set matches the manifest exactly
     */
    public List<String> audit(List<Anomaly> observed) {
        List<String> violations = new ArrayList<>();
        if (observed == null) {
            return List.of("无法读取异常集合");
        }
        List<Anomaly> sortedObserved = new ArrayList<>(observed);
        sortedObserved.sort(ORDER);
        Set<String> observedIdentities = new HashSet<>();
        for (Anomaly anomaly : sortedObserved) {
            if (!observedIdentities.add(identity(anomaly))) {
                violations.add("观测到的异常集合存在重复记录: " + identity(anomaly));
            }
        }
        if (sortedObserved.size() != records.size()) {
            violations.add("异常条数不一致: 清单 " + records.size() + "，观测 " + sortedObserved.size());
        }
        Map<String, Anomaly> observedByIdentity = new LinkedHashMap<>();
        for (Anomaly anomaly : sortedObserved) {
            observedByIdentity.put(identity(anomaly), anomaly);
        }
        Map<String, Anomaly> manifestByIdentity = new LinkedHashMap<>();
        for (Anomaly anomaly : records) {
            manifestByIdentity.put(identity(anomaly), anomaly);
        }
        for (Map.Entry<String, Anomaly> entry : manifestByIdentity.entrySet()) {
            Anomaly found = observedByIdentity.get(entry.getKey());
            if (found == null) {
                violations.add("缺少清单中的异常记录: " + entry.getKey());
                continue;
            }
            Anomaly expected = entry.getValue();
            if (!expected.arrivalTime().equals(found.arrivalTime())
                    || !expected.departureTime().equals(found.departureTime())) {
                violations.add("异常记录原时刻被改动: " + entry.getKey()
                        + " 期望 " + expected.arrivalTime() + "/" + expected.departureTime()
                        + " 实际 " + found.arrivalTime() + "/" + found.departureTime());
            }
        }
        for (String identity : observedByIdentity.keySet()) {
            if (!manifestByIdentity.containsKey(identity)) {
                violations.add("出现清单之外的异常记录: " + identity);
            }
        }
        return violations.size() > 10 ? new ArrayList<>(violations.subList(0, 10)) : violations;
    }

    private static String identity(Anomaly anomaly) {
        return anomaly.tripId() + "/" + anomaly.stopSequence() + "/" + anomaly.stopId();
    }

    static String sha256(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return PackageScanner.hex(digest.digest(bytes));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
