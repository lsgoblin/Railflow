package com.railflow.importer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Regression for MVP-C1.2 §3.1 (task 15 option A): the 193 known source-time anomalies of the fixed
 * release are imported verbatim only when the complete set matches the versioned manifest exactly.
 */
class KnownSourceAnomaliesTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void packagedManifestMatchesPinnedIdentity() {
        KnownSourceAnomalies manifest = KnownSourceAnomalies.loadFromClasspath();
        assertEquals(193, manifest.records().size());
        assertEquals(192, manifest.records().stream().map(KnownSourceAnomalies.Anomaly::tripId).distinct().count());
        assertEquals(KnownSourceAnomalies.MANIFEST_SHA256, manifest.manifestSha256());
        assertEquals(1, manifest.warnings().size());
        assertTrue(manifest.warnings().get(0).contains("193"));
        assertEquals(193, manifest.recordsAsMaps().size());
        // sorted by tripId binary order then stopSequence
        List<KnownSourceAnomalies.Anomaly> copy = new ArrayList<>(manifest.records());
        copy.sort(java.util.Comparator.comparing(KnownSourceAnomalies.Anomaly::tripId)
                .thenComparingInt(KnownSourceAnomalies.Anomaly::stopSequence));
        assertEquals(copy, manifest.records());
    }

    @Test
    void manifestHashMismatchIsRejected() {
        byte[] original;
        try {
            original = KnownSourceAnomalies.class.getClassLoader()
                    .getResourceAsStream(KnownSourceAnomalies.MANIFEST_RESOURCE).readAllBytes();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
        String text = new String(original, java.nio.charset.StandardCharsets.UTF_8);
        byte[] tampered = text.replace("47:53:00", "47:54:00").getBytes(java.nio.charset.StandardCharsets.UTF_8);
        ImportFailure failure = assertThrows(ImportFailure.class, () -> KnownSourceAnomalies.parse(tampered));
        assertEquals(CliError.PACKAGE_CONTENT_INVALID, failure.error());
    }

    @Test
    void duplicateIdentityIsRejected() throws Exception {
        List<KnownSourceAnomalies.Anomaly> records = manifestRecords();
        records.set(1, records.get(0));
        byte[] json = buildJson(records, 193, "gtfs-20261116-085531", FixedPackage.SHA256);
        ImportFailure failure = assertThrows(ImportFailure.class,
                () -> KnownSourceAnomalies.parseVerified(json, KnownSourceAnomalies.MANIFEST_SHA256));
        assertTrue(failure.getMessage().contains("重复"));
    }

    @Test
    void wrongCountIsRejected() throws Exception {
        List<KnownSourceAnomalies.Anomaly> records = manifestRecords();
        records.remove(0);
        byte[] json = buildJson(records, 193, "gtfs-20261116-085531", FixedPackage.SHA256);
        ImportFailure failure = assertThrows(ImportFailure.class,
                () -> KnownSourceAnomalies.parseVerified(json, KnownSourceAnomalies.MANIFEST_SHA256));
        assertEquals(CliError.PACKAGE_CONTENT_INVALID, failure.error());
    }

    @Test
    void unsortedManifestIsRejected() throws Exception {
        List<KnownSourceAnomalies.Anomaly> records = manifestRecords();
        java.util.Collections.swap(records, 0, 5);
        byte[] json = buildJson(records, 193, "gtfs-20261116-085531", FixedPackage.SHA256);
        ImportFailure failure = assertThrows(ImportFailure.class,
                () -> KnownSourceAnomalies.parseVerified(json, KnownSourceAnomalies.MANIFEST_SHA256));
        assertTrue(failure.getMessage().contains("排序"));
    }

    @Test
    void wrongPackageHashInManifestIsRejected() throws Exception {
        byte[] json = buildJson(manifestRecords(), 193, "gtfs-20261116-085531", "0".repeat(64));
        ImportFailure failure = assertThrows(ImportFailure.class,
                () -> KnownSourceAnomalies.parseVerified(json, KnownSourceAnomalies.MANIFEST_SHA256));
        assertTrue(failure.getMessage().contains("包哈希"));
    }

    @Test
    void auditAcceptsTheExactSet() {
        KnownSourceAnomalies manifest = KnownSourceAnomalies.loadFromClasspath();
        assertEquals(List.of(), manifest.audit(manifest.records()));
    }

    @Test
    void auditRejectsMissingExtraAndAlteredRecords() {
        KnownSourceAnomalies manifest = KnownSourceAnomalies.loadFromClasspath();
        List<KnownSourceAnomalies.Anomaly> base = new ArrayList<>(manifest.records());

        List<KnownSourceAnomalies.Anomaly> missing = new ArrayList<>(base);
        missing.remove(0);
        assertTrue(manifest.audit(missing).stream().anyMatch(v -> v.contains("缺少")));

        List<KnownSourceAnomalies.Anomaly> extra = new ArrayList<>(base);
        extra.add(new KnownSourceAnomalies.Anomaly("99999X", 1, "XXX", "01:00:00", "00:30:00"));
        assertTrue(manifest.audit(extra).stream().anyMatch(v -> v.contains("清单之外")));

        KnownSourceAnomalies.Anomaly first = base.get(0);
        List<KnownSourceAnomalies.Anomaly> changedArrival = new ArrayList<>(base);
        changedArrival.set(0, new KnownSourceAnomalies.Anomaly(first.tripId(), first.stopSequence(), first.stopId(),
                "47:54:00", first.departureTime()));
        assertTrue(manifest.audit(changedArrival).stream().anyMatch(v -> v.contains("原时刻被改动")));

        List<KnownSourceAnomalies.Anomaly> changedStop = new ArrayList<>(base);
        changedStop.set(0, new KnownSourceAnomalies.Anomaly(first.tripId(), first.stopSequence(), "ZZZ",
                first.arrivalTime(), first.departureTime()));
        List<String> stopViolations = manifest.audit(changedStop);
        assertTrue(stopViolations.stream().anyMatch(v -> v.contains("缺少")));
        assertTrue(stopViolations.stream().anyMatch(v -> v.contains("清单之外")));

        List<KnownSourceAnomalies.Anomaly> duplicated = new ArrayList<>(base);
        duplicated.set(1, base.get(0));
        assertTrue(manifest.audit(duplicated).stream().anyMatch(v -> v.contains("重复")));
    }

    private static List<KnownSourceAnomalies.Anomaly> manifestRecords() {
        return new ArrayList<>(KnownSourceAnomalies.loadFromClasspath().records());
    }

    private static byte[] buildJson(List<KnownSourceAnomalies.Anomaly> records, int count, String version,
                                    String packageSha) throws Exception {
        ObjectNode root = MAPPER.createObjectNode();
        root.put("datasetVersion", version);
        root.put("packageSha256", packageSha);
        root.put("sourceFile", "stop_times.txt");
        root.put("sourceFileSha256", "B532C301E6C0CC7762BC5ECFAC33BD0D0458E3140FCF58D92464218E78CCEE5B");
        root.put("code", "KNOWN_SOURCE_ARRIVAL_AFTER_DEPARTURE");
        root.put("count", count);
        ArrayNode array = root.putArray("records");
        for (KnownSourceAnomalies.Anomaly record : records) {
            ObjectNode node = array.addObject();
            node.put("tripId", record.tripId());
            node.put("stopSequence", record.stopSequence());
            node.put("stopId", record.stopId());
            node.put("arrivalTime", record.arrivalTime());
            node.put("departureTime", record.departureTime());
        }
        return MAPPER.writeValueAsBytes(root);
    }
}
