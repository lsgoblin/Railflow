package com.railflow.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.railflow.importer.PackageScanner.FileStat;
import com.railflow.importer.PackageScanner.PackageManifest;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Fixed-package importer (docs/design/mvp-contract.md §4).
 *
 * <p>One attempt runs entirely on one physical JDBC connection that holds the MySQL named lock:
 * package check, batch writes, validation, cleanup and the activation transaction. A batch COMMIT
 * never releases the lock, and the connection is never handed to another pool connection.
 */
@Service
public class ImportService {

    private static final Logger log = LoggerFactory.getLogger(ImportService.class);

    static final int BATCH_SIZE = 1_000;
    static final int COMMIT_EVERY_BATCHES = 20;

    private static final String[] BUSINESS_TABLES = {
            "gtfs_agency", "gtfs_calendar_date", "gtfs_feed_info", "gtfs_route", "gtfs_shape_point",
            "gtfs_stop_time", "gtfs_stop", "gtfs_translation", "gtfs_trip"
    };

    private final DataSource dataSource;
    private final PackageScanner scanner;
    private final ObjectMapper objectMapper;

    public ImportService(DataSource dataSource, PackageScanner scanner, ObjectMapper objectMapper) {
        this.dataSource = dataSource;
        this.scanner = scanner;
        this.objectMapper = objectMapper;
    }

    public ImportSummary run(Path zipPath, String versionName, String expectedSha256) {
        long startedAtMs = System.currentTimeMillis();
        Instant startedAt = Instant.now();
        try (Connection connection = dataSource.getConnection()) {
            int lock;
            try {
                lock = NamedLock.acquire(connection);
            } catch (SQLException e) {
                throw new ImportFailure(CliError.DATABASE_UNAVAILABLE,
                        "获取导入命名锁失败: " + e.getClass().getSimpleName(), e);
            }
            if (lock != 1) {
                throw new ImportFailure(CliError.IMPORT_IN_PROGRESS, "另一个导入进程正持有导入锁，本次未执行");
            }
            try {
                return runLocked(connection, zipPath, versionName, expectedSha256, startedAtMs, startedAt);
            } catch (SQLException e) {
                throw new ImportFailure(CliError.DATABASE_UNAVAILABLE,
                        "数据库操作失败: " + e.getClass().getSimpleName(), e);
            } finally {
                NamedLock.release(connection);
            }
        } catch (SQLException e) {
            throw new ImportFailure(CliError.DATABASE_UNAVAILABLE,
                    "无法获取数据库连接: " + e.getClass().getSimpleName(), e);
        }
    }

    private ImportSummary runLocked(Connection connection, Path zipPath, String versionName, String expectedSha256,
                                    long startedAtMs, Instant startedAt) throws SQLException {
        if (!FixedPackage.RELEASE_NAME.equals(versionName)) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "只接受固定 release " + FixedPackage.RELEASE_NAME);
        }
        String expected = expectedSha256 == null ? "" : expectedSha256.trim();
        if (!FixedPackage.SHA256.equalsIgnoreCase(expected)) {
            throw new ImportFailure(CliError.PACKAGE_HASH_MISMATCH,
                    "expected-sha256 必须是固定包哈希，不能用参数绕过");
        }
        requireSchema(connection);
        KnownSourceAnomalies knownSourceAnomalies = KnownSourceAnomalies.loadFromClasspath();

        String zipSha;
        try {
            zipSha = PackageScanner.sha256(zipPath);
        } catch (IOException e) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "无法读取导入包文件");
        }
        if (!FixedPackage.SHA256.equalsIgnoreCase(zipSha)) {
            throw new ImportFailure(CliError.PACKAGE_HASH_MISMATCH, "ZIP SHA-256 与固定包不一致，拒绝导入");
        }

        ExistingVersion existing = findVersion(connection, versionName);
        if (existing != null && !FixedPackage.SHA256.equalsIgnoreCase(existing.sha256())) {
            throw new ImportFailure(CliError.DATASET_HASH_CONFLICT,
                    "同名版本已存在但哈希不同，拒绝覆盖");
        }
        if (existing != null && "ACTIVE".equals(existing.status())) {
            return noopWithAudit(connection, zipPath, existing.id(), versionName, knownSourceAnomalies, startedAt,
                    startedAtMs);
        }

        PackageManifest manifest = scanner.scan(zipPath);
        recoverInterrupted(connection);

        long runId = insertRun(connection, null, versionName, "CHECKING", startedAt, null, null, null, null);
        long datasetId = -1L;
        try {
            if (existing == null) {
                datasetId = insertVersion(connection, versionName, manifest);
            } else {
                datasetId = existing.id();
                log.info("retrying version {} dataset {}: cleaning previous non-active data", versionName, datasetId);
                cleanupDataset(connection, datasetId);
                deleteDatasetFiles(connection, datasetId);
                updateVersionStatus(connection, datasetId, "IMPORTING");
            }
            updateRun(connection, runId, "IMPORTING", datasetId, null, null, null, null);

            List<ImportSummary.FileCount> fileCounts = new ArrayList<>();
            List<String> warnings = new ArrayList<>();
            importAll(connection, datasetId, zipPath, manifest, knownSourceAnomalies, fileCounts, warnings);

            updateVersionStatus(connection, datasetId, "VALIDATING");
            updateRunStatus(connection, runId, "VALIDATING");

            validateDataset(connection, datasetId, manifest, knownSourceAnomalies, warnings);

            Map<String, Long> tables = tableCounts(connection, datasetId);
            long elapsed = System.currentTimeMillis() - startedAtMs;
            Map<String, Object> report = buildReport("SUCCEEDED", versionName, knownSourceAnomalies, fileCounts,
                    tables, elapsed, warnings);
            activate(connection, datasetId, runId, elapsed, report);

            Map<String, Object> storage = storageStats(connection);
            log.info("import SUCCEEDED: dataset {} version {} in {} ms", datasetId, versionName, elapsed);
            return ImportSummary.success(runId, datasetId, versionName, FixedPackage.SHA256, elapsed,
                    fileCounts, tables, storage, reportWarnings(knownSourceAnomalies, warnings),
                    knownSourceAnomalies.manifestSha256(), knownSourceAnomalies.records().size());
        } catch (ImportFailure failure) {
            markFailed(connection, runId, datasetId, failure, startedAtMs);
            throw failure;
        } catch (RuntimeException e) {
            ImportFailure wrapped = new ImportFailure(CliError.IMPORT_FAILED,
                    "导入失败: " + e.getClass().getSimpleName(), e);
            markFailed(connection, runId, datasetId, wrapped, startedAtMs);
            throw wrapped;
        } catch (SQLException e) {
            // Task 20261118-18: a normal SQL failure on a still-usable connection (for example a
            // failing INSERT of dataset_file) must be recorded as FAILED with a finish time and
            // error code instead of leaving the run and version in IMPORTING. A genuinely lost
            // connection still terminates this attempt: the failure record is written over the same
            // connection only, and the importer never reconnects to continue writing.
            if (isConnectionUsable(connection)) {
                markFailed(connection, runId, datasetId,
                        new ImportFailure(CliError.IMPORT_FAILED,
                                "SQL 执行失败: " + e.getClass().getSimpleName(), e), startedAtMs);
            } else {
                log.error("connection lost during import; attempt terminated without failure record: {}",
                        e.getClass().getSimpleName());
            }
            throw e;
        }
    }

    private static boolean isConnectionUsable(Connection connection) {
        try {
            return !connection.isClosed() && connection.isValid(2);
        } catch (SQLException e) {
            return false;
        }
    }

    /**
     * MVP-C1.2 §3.1 NOOP audit: re-importing the same fixed package against an already active
     * version must re-check the known source-anomaly set from both the ZIP and the active database,
     * then append a new NOOP run carrying the policy, manifest hash and warnings. The active
     * pointer and the business rows stay untouched and old runs are not overwritten.
     */
    private ImportSummary noopWithAudit(Connection connection, Path zipPath, long datasetId, String versionName,
                                        KnownSourceAnomalies knownSourceAnomalies, Instant startedAt,
                                        long startedAtMs) throws SQLException {
        long runId = insertRun(connection, datasetId, versionName, "CHECKING", startedAt, null, null, null, null);
        try {
            List<String> violations = knownSourceAnomalies.audit(scanPackageAnomalies(zipPath));
            if (!violations.isEmpty()) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                        "固定包已知源异常集合与清单不一致: " + String.join("；", violations));
            }
            violations = knownSourceAnomalies.audit(queryDatabaseAnomalies(connection, datasetId));
            if (!violations.isEmpty()) {
                throw new ImportFailure(CliError.IMPORT_FAILED,
                        "现有 active 数据的已知源异常集合与清单不一致: " + String.join("；", violations));
            }
            long elapsed = System.currentTimeMillis() - startedAtMs;
            Map<String, Long> tables = tableCounts(connection, datasetId);
            Map<String, Object> report = buildReport("NOOP", versionName, knownSourceAnomalies, List.of(), tables,
                    elapsed, List.of());
            updateRun(connection, runId, "NOOP", datasetId, Instant.now(), elapsed, null, toJson(report));
            log.info("import NOOP: version {} active, C1.2 anomaly audit passed ({} records)",
                    versionName, knownSourceAnomalies.records().size());
            return ImportSummary.noop(runId, datasetId, versionName, FixedPackage.SHA256, elapsed, tables,
                    reportWarnings(knownSourceAnomalies, List.of()), knownSourceAnomalies.manifestSha256(),
                    knownSourceAnomalies.records().size());
        } catch (ImportFailure failure) {
            markFailed(connection, runId, datasetId, failure, startedAtMs);
            throw failure;
        }
    }

    private void requireKnownAnomalySet(Connection connection, long datasetId,
                                        KnownSourceAnomalies knownSourceAnomalies) throws SQLException {
        List<KnownSourceAnomalies.Anomaly> observed = queryDatabaseAnomalies(connection, datasetId);
        List<String> violations = knownSourceAnomalies.audit(observed);
        if (!violations.isEmpty()) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "固定源时刻异常集合与清单不一致，拒绝激活: " + String.join("；", violations));
        }
    }

    private List<KnownSourceAnomalies.Anomaly> queryDatabaseAnomalies(Connection connection, long datasetId)
            throws SQLException {
        List<KnownSourceAnomalies.Anomaly> anomalies = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT trip_id, stop_sequence, stop_id, arrival_time, departure_time FROM gtfs_stop_time "
                        + "WHERE dataset_id = ? AND arrival_seconds > departure_seconds "
                        + "ORDER BY trip_id ASC, stop_sequence ASC")) {
            ps.setLong(1, datasetId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    anomalies.add(new KnownSourceAnomalies.Anomaly(rs.getString(1), rs.getInt(2), rs.getString(3),
                            rs.getString(4), rs.getString(5)));
                }
            }
        }
        return anomalies;
    }

    /** Reads the anomaly rows straight from the fixed ZIP's stop_times.txt (used by the NOOP audit). */
    private List<KnownSourceAnomalies.Anomaly> scanPackageAnomalies(Path zipPath) {
        try (ZipFile zip = new ZipFile(zipPath.toFile(), StandardCharsets.UTF_8)) {
            ZipEntry entry = zip.getEntry("stop_times.txt");
            if (entry == null) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "固定包缺少 stop_times.txt");
            }
            List<KnownSourceAnomalies.Anomaly> anomalies = new ArrayList<>();
            try (CsvReader csv = new CsvReader(new BufferedReader(
                    new InputStreamReader(zip.getInputStream(entry), StandardCharsets.UTF_8), 1 << 20))) {
                String[] header = csv.nextRecord();
                if (header == null) {
                    throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "stop_times.txt 为空文件");
                }
                long recordNo = 0;
                String[] row;
                while ((row = csv.nextRecord()) != null) {
                    recordNo++;
                    int arrival = GtfsFields.parseCumulativeSeconds(row[1], "stop_times.txt", recordNo,
                            "arrival_time");
                    int departure = GtfsFields.parseCumulativeSeconds(row[2], "stop_times.txt", recordNo,
                            "departure_time");
                    if (arrival > departure) {
                        anomalies.add(new KnownSourceAnomalies.Anomaly(row[0],
                                GtfsFields.requireNonNegativeInt(row[4], "stop_times.txt", recordNo, "stop_sequence"),
                                row[3], row[1], row[2]));
                    }
                }
            }
            return anomalies;
        } catch (IOException e) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "读取固定包 stop_times.txt 失败: " + e.getClass().getSimpleName());
        }
    }

    private Map<String, Object> buildReport(String result, String versionName,
                                            KnownSourceAnomalies knownSourceAnomalies,
                                            List<ImportSummary.FileCount> files, Map<String, Long> tables,
                                            long elapsed, List<String> extraWarnings) {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("result", result);
        report.put("datasetVersion", versionName);
        report.put("sha256", FixedPackage.SHA256);
        report.put("validationPolicy", KnownSourceAnomalies.POLICY);
        report.put("sourceAnomalyManifestSha256", knownSourceAnomalies.manifestSha256());
        report.put("knownSourceAnomalies", knownSourceAnomalies.recordsAsMaps());
        report.put("warnings", reportWarnings(knownSourceAnomalies, extraWarnings));
        if (!files.isEmpty()) {
            report.put("files", fileCountMap(files));
        }
        report.put("tables", tables);
        report.put("elapsedMs", elapsed);
        return report;
    }

    private List<String> reportWarnings(KnownSourceAnomalies knownSourceAnomalies, List<String> extraWarnings) {
        List<String> warnings = new ArrayList<>(knownSourceAnomalies.warnings());
        warnings.addAll(extraWarnings);
        return warnings;
    }

    // ---------------------------------------------------------------- schema / version state

    private void requireSchema(Connection connection) throws SQLException {
        boolean schemaReady = false;
        try (PreparedStatement ps = connection.prepareStatement("SELECT version FROM schema_version WHERE version = 1");
             ResultSet rs = ps.executeQuery()) {
            schemaReady = rs.next();
        }
        boolean activeRow = false;
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT singleton_id FROM dataset_active WHERE singleton_id = 1");
             ResultSet rs = ps.executeQuery()) {
            activeRow = rs.next();
        }
        if (!schemaReady || !activeRow) {
            throw new ImportFailure(CliError.SCHEMA_NOT_READY,
                    "数据库结构未初始化或缺少 dataset_active 单例行，请先运行 schema profile");
        }
    }

    private record ExistingVersion(long id, String sha256, String status) {
    }

    private ExistingVersion findVersion(Connection connection, String versionName) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT id, sha256, status FROM dataset_version WHERE version_name = ?")) {
            ps.setString(1, versionName);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                return new ExistingVersion(rs.getLong(1), rs.getString(2), rs.getString(3));
            }
        }
    }

    private Long readActiveDatasetId(Connection connection) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT dataset_id FROM dataset_active WHERE singleton_id = 1");
             ResultSet rs = ps.executeQuery()) {
            if (!rs.next()) {
                return null;
            }
            long value = rs.getLong(1);
            return rs.wasNull() ? null : value;
        }
    }

    private void recoverInterrupted(Connection connection) throws SQLException {
        Long activeId = readActiveDatasetId(connection);
        List<long[]> leftovers = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT id, dataset_id FROM dataset_import_run WHERE status IN ('IMPORTING','VALIDATING')");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                long runId = rs.getLong(1);
                long datasetId = rs.getLong(2);
                boolean nullDataset = rs.wasNull();
                leftovers.add(new long[]{runId, nullDataset ? -1L : datasetId});
            }
        }
        for (long[] leftover : leftovers) {
            long runId = leftover[0];
            long datasetId = leftover[1];
            try (PreparedStatement ps = connection.prepareStatement(
                    "UPDATE dataset_import_run SET status='INTERRUPTED', finished_at=?, error_code='IMPORT_INTERRUPTED' "
                            + "WHERE id=?")) {
                ps.setTimestamp(1, utcNow());
                ps.setLong(2, runId);
                ps.executeUpdate();
            }
            if (datasetId > 0 && (activeId == null || activeId != datasetId)) {
                try (PreparedStatement ps = connection.prepareStatement(
                        "UPDATE dataset_version SET status='FAILED' WHERE id=? AND status IN ('IMPORTING','VALIDATING')")) {
                    ps.setLong(1, datasetId);
                    ps.executeUpdate();
                }
                cleanupDataset(connection, datasetId);
                deleteDatasetFiles(connection, datasetId);
                log.warn("marked leftover import run {} and dataset {} as interrupted, cleaned non-active data",
                        runId, datasetId);
            }
        }
    }

    private long insertRun(Connection connection, Long datasetId, String versionName, String status,
                           Instant startedAt, Instant finishedAt, Long elapsedMs, String errorCode,
                           String reportJson) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO dataset_import_run (dataset_id, requested_version, status, started_at, finished_at, "
                        + "elapsed_ms, error_code, report_json) VALUES (?,?,?,?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS)) {
            if (datasetId == null) {
                ps.setNull(1, java.sql.Types.BIGINT);
            } else {
                ps.setLong(1, datasetId);
            }
            ps.setString(2, versionName);
            ps.setString(3, status);
            ps.setTimestamp(4, toTimestamp(startedAt));
            ps.setTimestamp(5, finishedAt == null ? null : toTimestamp(finishedAt));
            if (elapsedMs == null) {
                ps.setNull(6, java.sql.Types.BIGINT);
            } else {
                ps.setLong(6, elapsedMs);
            }
            ps.setString(7, errorCode);
            ps.setString(8, reportJson);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (!keys.next()) {
                    throw new SQLException("no generated key for dataset_import_run");
                }
                return keys.getLong(1);
            }
        }
    }

    private void updateRun(Connection connection, long runId, String status, Long datasetId, Instant finishedAt,
                           Long elapsedMs, String errorCode, String reportJson) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "UPDATE dataset_import_run SET status=?, dataset_id=COALESCE(?, dataset_id), finished_at=?, "
                        + "elapsed_ms=?, error_code=?, report_json=? WHERE id=?")) {
            ps.setString(1, status);
            if (datasetId == null) {
                ps.setNull(2, java.sql.Types.BIGINT);
            } else {
                ps.setLong(2, datasetId);
            }
            ps.setTimestamp(3, finishedAt == null ? null : toTimestamp(finishedAt));
            if (elapsedMs == null) {
                ps.setNull(4, java.sql.Types.BIGINT);
            } else {
                ps.setLong(4, elapsedMs);
            }
            ps.setString(5, errorCode);
            ps.setString(6, reportJson);
            ps.setLong(7, runId);
            ps.executeUpdate();
        }
    }

    private void updateRunStatus(Connection connection, long runId, String status) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "UPDATE dataset_import_run SET status=? WHERE id=?")) {
            ps.setString(1, status);
            ps.setLong(2, runId);
            ps.executeUpdate();
        }
    }

    private long insertVersion(Connection connection, String versionName, PackageManifest manifest) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO dataset_version (version_name, sha256, source_url, feed_version, coverage_start, "
                        + "coverage_end, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, versionName);
            ps.setString(2, FixedPackage.SHA256);
            ps.setString(3, FixedPackage.SOURCE_URL);
            ps.setString(4, FixedPackage.FEED_VERSION);
            ps.setDate(5, Date.valueOf(FixedPackage.COVERAGE_START));
            ps.setDate(6, Date.valueOf(FixedPackage.COVERAGE_END));
            ps.setString(7, "IMPORTING");
            ps.setTimestamp(8, utcNow());
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (!keys.next()) {
                    throw new SQLException("no generated key for dataset_version");
                }
                return keys.getLong(1);
            }
        }
    }

    private void updateVersionStatus(Connection connection, long datasetId, String status) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "UPDATE dataset_version SET status=? WHERE id=? AND status <> 'ACTIVE'")) {
            ps.setString(1, status);
            ps.setLong(2, datasetId);
            ps.executeUpdate();
        }
    }

    private void markFailed(Connection connection, long runId, long datasetId, ImportFailure failure,
                            long startedAtMs) {
        try {
            if (!connection.getAutoCommit()) {
                connection.rollback();
                connection.setAutoCommit(true);
            }
        } catch (SQLException e) {
            log.warn("could not reset connection after failure: {}", e.getClass().getSimpleName());
        }
        try {
            long elapsed = System.currentTimeMillis() - startedAtMs;
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("result", "FAILED");
            report.put("errorCode", failure.error().name());
            report.put("message", failure.getMessage());
            updateRun(connection, runId, "FAILED", datasetId > 0 ? datasetId : null, Instant.now(), elapsed,
                    failure.error().name(), toJson(report));
            if (datasetId > 0) {
                Long activeId = readActiveDatasetId(connection);
                if (activeId == null || activeId != datasetId) {
                    updateVersionStatus(connection, datasetId, "FAILED");
                }
            }
        } catch (SQLException e) {
            log.error("could not record import failure: {}", e.getClass().getSimpleName());
        }
    }

    // ---------------------------------------------------------------- data writes

    private void importAll(Connection connection, long datasetId, Path zipPath, PackageManifest manifest,
                           KnownSourceAnomalies knownSourceAnomalies, List<ImportSummary.FileCount> counts,
                           List<String> warnings) throws SQLException {
        try (ZipFile zip = new ZipFile(zipPath.toFile(), StandardCharsets.UTF_8)) {
            long rows = importAgency(connection, datasetId, zip);
            recordFile(connection, datasetId, manifest, "agency.txt", rows, counts);
            rows = importFeedInfo(connection, datasetId, zip);
            recordFile(connection, datasetId, manifest, "feed_info.txt", rows, counts);
            rows = importStops(connection, datasetId, zip);
            recordFile(connection, datasetId, manifest, "stops.txt", rows, counts);
            rows = importRoutes(connection, datasetId, zip);
            recordFile(connection, datasetId, manifest, "routes.txt", rows, counts);
            rows = importTrips(connection, datasetId, zip);
            recordFile(connection, datasetId, manifest, "trips.txt", rows, counts);
            rows = importStopTimes(connection, datasetId, zip);
            recordFile(connection, datasetId, manifest, "stop_times.txt", rows, counts);
            // MVP-C1.2 §3.1: fail fast before the 4.6M shape rows when the known source-anomaly set differs.
            requireKnownAnomalySet(connection, datasetId, knownSourceAnomalies);
            rows = importCalendarDates(connection, datasetId, zip);
            recordFile(connection, datasetId, manifest, "calendar_dates.txt", rows, counts);
            rows = importShapePoints(connection, datasetId, zip);
            recordFile(connection, datasetId, manifest, "shapes.txt", rows, counts);
            rows = importTranslations(connection, datasetId, zip);
            recordFile(connection, datasetId, manifest, "translations.txt", rows, counts);
        } catch (IOException e) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "读取导入包失败: " + e.getClass().getSimpleName());
        }
    }

    private void recordFile(Connection connection, long datasetId, PackageManifest manifest, String fileName,
                            long importedRows, List<ImportSummary.FileCount> counts) throws SQLException {
        PackageScanner.FileStat stat = manifest.file(fileName);
        if (stat.sourceRows() != importedRows) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    fileName + " 导入行数 " + importedRows + " 与固定清单 " + stat.sourceRows() + " 不一致");
        }
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO dataset_file (dataset_id, file_name, sha256, header, source_rows, imported_rows, "
                        + "uncompressed_bytes) VALUES (?,?,?,?,?,?,?)")) {
            ps.setLong(1, datasetId);
            ps.setString(2, stat.fileName());
            ps.setString(3, stat.sha256());
            ps.setString(4, stat.header());
            ps.setLong(5, stat.sourceRows());
            ps.setLong(6, importedRows);
            ps.setLong(7, stat.uncompressedBytes());
            ps.executeUpdate();
        }
        counts.add(new ImportSummary.FileCount(fileName, stat.sourceRows(), importedRows, stat.sha256()));
    }

    @FunctionalInterface
    private interface RowBinder {
        void bind(PreparedStatement ps, String[] record, long recordNo) throws SQLException;
    }

    private long importFile(Connection connection, long datasetId, ZipFile zip, FixedPackage.FileSpec spec,
                            int expectedColumns, String sql, RowBinder binder) {
        ZipEntry entry = zip.getEntry(spec.fileName());
        if (entry == null) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "固定包缺少文件: " + spec.fileName());
        }
        try (CsvReader csv = new CsvReader(new BufferedReader(
                new InputStreamReader(zip.getInputStream(entry), StandardCharsets.UTF_8), 1 << 20))) {
            String[] header = csv.nextRecord();
            if (header == null || !spec.header().equals(String.join(",", header))) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, spec.fileName() + " 表头不一致");
            }
            long rows = 0;
            boolean previousAutoCommit = connection.getAutoCommit();
            boolean committed = false;
            try (PreparedStatement ps = connection.prepareStatement(sql)) {
                connection.setAutoCommit(false);
                String[] record;
                int pending = 0;
                int batches = 0;
                while ((record = csv.nextRecord()) != null) {
                    rows++;
                    if (record.length != expectedColumns) {
                        throw GtfsFields.invalid(spec.fileName(), rows,
                                "字段数 " + record.length + "，期望 " + expectedColumns);
                    }
                    binder.bind(ps, record, rows);
                    ps.addBatch();
                    pending++;
                    if (pending >= BATCH_SIZE) {
                        ps.executeBatch();
                        pending = 0;
                        batches++;
                        if (batches % COMMIT_EVERY_BATCHES == 0) {
                            connection.commit();
                        }
                    }
                }
                if (pending > 0) {
                    ps.executeBatch();
                }
                connection.commit();
                committed = true;
            } finally {
                if (!committed) {
                    try {
                        connection.rollback();
                    } catch (SQLException e) {
                        log.warn("rollback after failed {} batch: {}", spec.fileName(),
                                e.getClass().getSimpleName());
                    }
                }
                connection.setAutoCommit(previousAutoCommit);
            }
            if (rows != spec.rows()) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                        spec.fileName() + " 导入行数 " + rows + " 与固定清单 " + spec.rows() + " 不一致");
            }
            return rows;
        } catch (SQLIntegrityConstraintViolationException e) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    spec.fileName() + " 存在重复业务键或字段超长，拒绝以 INSERT IGNORE 丢行");
        } catch (SQLException e) {
            if (isIntegrityViolation(e)) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                        spec.fileName() + " 存在重复业务键或字段超长，拒绝以 INSERT IGNORE 丢行");
            }
            throw new ImportFailure(CliError.IMPORT_FAILED,
                    spec.fileName() + " 写入失败: " + e.getClass().getSimpleName(), e);
        } catch (IOException e) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    spec.fileName() + " 读取失败: " + e.getClass().getSimpleName());
        }
    }

    private static boolean isIntegrityViolation(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof SQLIntegrityConstraintViolationException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private long importAgency(Connection connection, long datasetId, ZipFile zip) {
        String sql = "INSERT INTO gtfs_agency (dataset_id, agency_id, agency_name, agency_url, agency_timezone) "
                + "VALUES (?,?,?,?,?)";
        return importFile(connection, datasetId, zip, fileSpec("agency.txt"), 4, sql, (ps, row, no) -> {
            ps.setLong(1, datasetId);
            ps.setString(2, GtfsFields.requireText(row, 0, "agency.txt", no, "agency_id"));
            ps.setString(3, GtfsFields.requireText(row, 1, "agency.txt", no, "agency_name"));
            ps.setString(4, GtfsFields.requireText(row, 2, "agency.txt", no, "agency_url"));
            ps.setString(5, GtfsFields.requireText(row, 3, "agency.txt", no, "agency_timezone"));
        });
    }

    private long importFeedInfo(Connection connection, long datasetId, ZipFile zip) {
        String sql = "INSERT INTO gtfs_feed_info (dataset_id, row_no, feed_publisher_name, feed_publisher_url, "
                + "feed_lang, feed_start_date, feed_end_date, feed_version) VALUES (?,?,?,?,?,?,?,?)";
        return importFile(connection, datasetId, zip, fileSpec("feed_info.txt"), 6, sql, (ps, row, no) -> {
            ps.setLong(1, datasetId);
            ps.setInt(2, (int) no);
            ps.setString(3, GtfsFields.requireText(row, 0, "feed_info.txt", no, "feed_publisher_name"));
            ps.setString(4, GtfsFields.requireText(row, 1, "feed_info.txt", no, "feed_publisher_url"));
            ps.setString(5, GtfsFields.requireText(row, 2, "feed_info.txt", no, "feed_lang"));
            ps.setDate(6, Date.valueOf(GtfsFields.parseGtfsDate(row[3], "feed_info.txt", no, "feed_start_date")));
            ps.setDate(7, Date.valueOf(GtfsFields.parseGtfsDate(row[4], "feed_info.txt", no, "feed_end_date")));
            ps.setString(8, GtfsFields.requireText(row, 5, "feed_info.txt", no, "feed_version"));
        });
    }

    private long importStops(Connection connection, long datasetId, ZipFile zip) {
        String sql = "INSERT INTO gtfs_stop (dataset_id, stop_id, stop_name, stop_lat, stop_lon, location_type) "
                + "VALUES (?,?,?,?,?,?)";
        return importFile(connection, datasetId, zip, fileSpec("stops.txt"), 5, sql, (ps, row, no) -> {
            ps.setLong(1, datasetId);
            ps.setString(2, GtfsFields.requireText(row, 0, "stops.txt", no, "stop_id"));
            ps.setString(3, GtfsFields.optionalText(row, 1));
            ps.setBigDecimal(4, BigDecimal.valueOf(
                    GtfsFields.requireLatitude(row[2], "stops.txt", no, "stop_lat")));
            ps.setBigDecimal(5, BigDecimal.valueOf(
                    GtfsFields.requireLongitude(row[3], "stops.txt", no, "stop_lon")));
            ps.setInt(6, GtfsFields.requireNonNegativeInt(row[4], "stops.txt", no, "location_type"));
        });
    }

    private long importRoutes(Connection connection, long datasetId, ZipFile zip) {
        String sql = "INSERT INTO gtfs_route (dataset_id, route_id, agency_id, route_short_name, route_type) "
                + "VALUES (?,?,?,?,?)";
        return importFile(connection, datasetId, zip, fileSpec("routes.txt"), 4, sql, (ps, row, no) -> {
            ps.setLong(1, datasetId);
            ps.setString(2, GtfsFields.requireText(row, 0, "routes.txt", no, "route_id"));
            ps.setString(3, GtfsFields.requireText(row, 1, "routes.txt", no, "agency_id"));
            ps.setString(4, GtfsFields.optionalText(row, 2));
            ps.setInt(5, GtfsFields.parseInt(row[3], "routes.txt", no, "route_type"));
        });
    }

    private long importTrips(Connection connection, long datasetId, ZipFile zip) {
        String sql = "INSERT INTO gtfs_trip (dataset_id, trip_id, route_id, service_id, trip_short_name, "
                + "trip_headsign, shape_id) VALUES (?,?,?,?,?,?,?)";
        return importFile(connection, datasetId, zip, fileSpec("trips.txt"), 6, sql, (ps, row, no) -> {
            ps.setLong(1, datasetId);
            ps.setString(2, GtfsFields.requireText(row, 2, "trips.txt", no, "trip_id"));
            ps.setString(3, GtfsFields.requireText(row, 0, "trips.txt", no, "route_id"));
            ps.setString(4, GtfsFields.requireText(row, 1, "trips.txt", no, "service_id"));
            ps.setString(5, GtfsFields.optionalText(row, 3));
            ps.setString(6, GtfsFields.optionalText(row, 4));
            String shapeId = GtfsFields.optionalText(row, 5).trim();
            if (shapeId.isEmpty()) {
                ps.setNull(7, java.sql.Types.VARCHAR);
            } else {
                ps.setString(7, shapeId);
            }
        });
    }

    private long importStopTimes(Connection connection, long datasetId, ZipFile zip) {
        String sql = "INSERT INTO gtfs_stop_time (dataset_id, trip_id, stop_sequence, stop_id, arrival_time, "
                + "departure_time, arrival_seconds, departure_seconds) VALUES (?,?,?,?,?,?,?,?)";
        return importFile(connection, datasetId, zip, fileSpec("stop_times.txt"), 5, sql, (ps, row, no) -> {
            String arrival = GtfsFields.requireText(row, 1, "stop_times.txt", no, "arrival_time");
            String departure = GtfsFields.requireText(row, 2, "stop_times.txt", no, "departure_time");
            int arrivalSeconds = GtfsFields.parseCumulativeSeconds(arrival, "stop_times.txt", no, "arrival_time");
            int departureSeconds = GtfsFields.parseCumulativeSeconds(departure, "stop_times.txt", no, "departure_time");
            // The fixed release contains 193 rows whose arrival time is later than the departure time
            // of the same stop (upstream source anomaly, e.g. arrival 47:53:00 vs departure 24:15:00).
            // They are imported verbatim and reported as a data-quality warning instead of blocking
            // activation; see README "已知源数据异常" and the contract conflict raised in the handoff.
            ps.setLong(1, datasetId);
            ps.setString(2, GtfsFields.requireText(row, 0, "stop_times.txt", no, "trip_id"));
            ps.setInt(3, GtfsFields.requireNonNegativeInt(row[4], "stop_times.txt", no, "stop_sequence"));
            ps.setString(4, GtfsFields.requireText(row, 3, "stop_times.txt", no, "stop_id"));
            ps.setString(5, arrival);
            ps.setString(6, departure);
            ps.setInt(7, arrivalSeconds);
            ps.setInt(8, departureSeconds);
        });
    }

    private long importCalendarDates(Connection connection, long datasetId, ZipFile zip) {
        String sql = "INSERT INTO gtfs_calendar_date (dataset_id, service_id, service_date, exception_type) "
                + "VALUES (?,?,?,?)";
        return importFile(connection, datasetId, zip, fileSpec("calendar_dates.txt"), 3, sql, (ps, row, no) -> {
            ps.setLong(1, datasetId);
            ps.setString(2, GtfsFields.requireText(row, 0, "calendar_dates.txt", no, "service_id"));
            LocalDate date = GtfsFields.parseGtfsDate(row[1], "calendar_dates.txt", no, "date");
            if (date.isBefore(FixedPackage.COVERAGE_START) || date.isAfter(FixedPackage.COVERAGE_END)) {
                throw GtfsFields.invalid("calendar_dates.txt", no, "服务日超出 feed 覆盖范围");
            }
            ps.setDate(3, Date.valueOf(date));
            int exceptionType = GtfsFields.parseInt(row[2], "calendar_dates.txt", no, "exception_type");
            if (exceptionType != 1 && exceptionType != 2) {
                throw GtfsFields.invalid("calendar_dates.txt", no, "exception_type 只能为 1 或 2");
            }
            ps.setInt(4, exceptionType);
        });
    }

    private long importShapePoints(Connection connection, long datasetId, ZipFile zip) {
        String sql = "INSERT INTO gtfs_shape_point (dataset_id, shape_id, shape_pt_sequence, shape_pt_lat, "
                + "shape_pt_lon) VALUES (?,?,?,?,?)";
        return importFile(connection, datasetId, zip, fileSpec("shapes.txt"), 4, sql, (ps, row, no) -> {
            ps.setLong(1, datasetId);
            ps.setString(2, GtfsFields.requireText(row, 0, "shapes.txt", no, "shape_id"));
            ps.setInt(3, GtfsFields.requireNonNegativeInt(row[3], "shapes.txt", no, "shape_pt_sequence"));
            ps.setBigDecimal(4, BigDecimal.valueOf(
                    GtfsFields.requireLatitude(row[1], "shapes.txt", no, "shape_pt_lat")));
            ps.setBigDecimal(5, BigDecimal.valueOf(
                    GtfsFields.requireLongitude(row[2], "shapes.txt", no, "shape_pt_lon")));
        });
    }

    private long importTranslations(Connection connection, long datasetId, ZipFile zip) {
        String sql = "INSERT INTO gtfs_translation (dataset_id, row_no, table_name, field_name, language, "
                + "translation, record_id) VALUES (?,?,?,?,?,?,?)";
        return importFile(connection, datasetId, zip, fileSpec("translations.txt"), 5, sql, (ps, row, no) -> {
            ps.setLong(1, datasetId);
            ps.setInt(2, (int) no);
            ps.setString(3, GtfsFields.requireText(row, 0, "translations.txt", no, "table_name"));
            ps.setString(4, GtfsFields.requireText(row, 1, "translations.txt", no, "field_name"));
            ps.setString(5, GtfsFields.optionalText(row, 2));
            ps.setString(6, GtfsFields.optionalText(row, 3));
            ps.setString(7, GtfsFields.optionalText(row, 4));
        });
    }

    private FixedPackage.FileSpec fileSpec(String fileName) {
        for (FixedPackage.FileSpec spec : FixedPackage.FILES) {
            if (spec.fileName().equals(fileName)) {
                return spec;
            }
        }
        throw new IllegalStateException("unknown file " + fileName);
    }

    // ---------------------------------------------------------------- validation

    private void validateDataset(Connection connection, long datasetId, PackageManifest manifest,
                                 KnownSourceAnomalies knownSourceAnomalies, List<String> warnings)
            throws SQLException {
        // 1. per-table row counts against the fixed manifest
        expectCount(connection, "gtfs_agency", datasetId, manifest.file("agency.txt").sourceRows());
        expectCount(connection, "gtfs_calendar_date", datasetId, manifest.file("calendar_dates.txt").sourceRows());
        expectCount(connection, "gtfs_feed_info", datasetId, manifest.file("feed_info.txt").sourceRows());
        expectCount(connection, "gtfs_route", datasetId, manifest.file("routes.txt").sourceRows());
        expectCount(connection, "gtfs_shape_point", datasetId, manifest.file("shapes.txt").sourceRows());
        expectCount(connection, "gtfs_stop_time", datasetId, manifest.file("stop_times.txt").sourceRows());
        expectCount(connection, "gtfs_stop", datasetId, manifest.file("stops.txt").sourceRows());
        expectCount(connection, "gtfs_translation", datasetId, manifest.file("translations.txt").sourceRows());
        expectCount(connection, "gtfs_trip", datasetId, manifest.file("trips.txt").sourceRows());
        expectCount(connection, "dataset_file", datasetId, FixedPackage.FILES.size());

        // 2. logical references
        expectZero(connection, "gtfs_trip→gtfs_route",
                "SELECT COUNT(*) FROM gtfs_trip t LEFT JOIN gtfs_route r "
                        + "ON r.dataset_id=t.dataset_id AND r.route_id=t.route_id "
                        + "WHERE t.dataset_id=? AND r.route_id IS NULL", datasetId);
        expectZero(connection, "gtfs_trip→gtfs_calendar_date",
                "SELECT COUNT(*) FROM gtfs_trip t LEFT JOIN gtfs_calendar_date c "
                        + "ON c.dataset_id=t.dataset_id AND c.service_id=t.service_id "
                        + "WHERE t.dataset_id=? AND c.service_id IS NULL", datasetId);
        expectZero(connection, "gtfs_stop_time→gtfs_trip",
                "SELECT COUNT(*) FROM gtfs_stop_time s LEFT JOIN gtfs_trip t "
                        + "ON t.dataset_id=s.dataset_id AND t.trip_id=s.trip_id "
                        + "WHERE s.dataset_id=? AND t.trip_id IS NULL", datasetId);
        expectZero(connection, "gtfs_stop_time→gtfs_stop",
                "SELECT COUNT(*) FROM gtfs_stop_time s LEFT JOIN gtfs_stop o "
                        + "ON o.dataset_id=s.dataset_id AND o.stop_id=s.stop_id "
                        + "WHERE s.dataset_id=? AND o.stop_id IS NULL", datasetId);
        expectZero(connection, "gtfs_route→gtfs_agency",
                "SELECT COUNT(*) FROM gtfs_route r LEFT JOIN gtfs_agency a "
                        + "ON a.dataset_id=r.dataset_id AND a.agency_id=r.agency_id "
                        + "WHERE r.dataset_id=? AND a.agency_id IS NULL", datasetId);

        // 3. shapes may be missing: warning only, never a stop/route/service reference failure
        long tripsWithoutShape = queryCount(connection,
                "SELECT COUNT(*) FROM gtfs_trip WHERE dataset_id=? AND shape_id IS NULL", datasetId);
        long tripsWithUnknownShape = queryCount(connection,
                "SELECT COUNT(DISTINCT t.shape_id) FROM gtfs_trip t LEFT JOIN gtfs_shape_point p "
                        + "ON p.dataset_id=t.dataset_id AND p.shape_id=t.shape_id "
                        + "WHERE t.dataset_id=? AND t.shape_id IS NOT NULL AND p.shape_id IS NULL", datasetId);
        if (tripsWithoutShape > 0 || tripsWithUnknownShape > 0) {
            warnings.add("trips without shape_id: " + tripsWithoutShape
                    + "; shape_id values without shape points: " + tripsWithUnknownShape);
        }

        // 4. feed metadata and coverage
        long feedOk = queryCount(connection,
                "SELECT COUNT(*) FROM gtfs_feed_info WHERE dataset_id=? AND feed_version=? "
                        + "AND feed_start_date=? AND feed_end_date=?", datasetId, FixedPackage.FEED_VERSION,
                Date.valueOf(FixedPackage.COVERAGE_START), Date.valueOf(FixedPackage.COVERAGE_END));
        if (feedOk != 1) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "feed_info 与固定包的版本或覆盖范围不一致");
        }
        expectZero(connection, "gtfs_calendar_date 覆盖范围",
                "SELECT COUNT(*) FROM gtfs_calendar_date WHERE dataset_id=? AND (service_date < ? OR service_date > ?)",
                datasetId, Date.valueOf(FixedPackage.COVERAGE_START), Date.valueOf(FixedPackage.COVERAGE_END));

        // 5. MVP-C1.2 §3.1: the known source-time anomaly set must match the versioned manifest
        //    exactly (identity plus both raw times). The exception is limited to that set; every
        //    other time/coordinate/reference check below stays a hard failure.
        requireKnownAnomalySet(connection, datasetId, knownSourceAnomalies);

        // 6. time and coordinate sanity
        expectZero(connection, "stop_times 站序时间倒退",
                "SELECT COUNT(*) FROM (SELECT s.trip_id, s.arrival_seconds, "
                        + "LAG(s.departure_seconds) OVER (PARTITION BY s.trip_id ORDER BY s.stop_sequence) AS prev_dep "
                        + "FROM gtfs_stop_time s WHERE s.dataset_id=?) x "
                        + "WHERE x.prev_dep IS NOT NULL AND x.arrival_seconds < x.prev_dep", datasetId);
        expectZero(connection, "gtfs_stop 坐标越界",
                "SELECT COUNT(*) FROM gtfs_stop WHERE dataset_id=? AND (stop_lat < -90 OR stop_lat > 90 "
                        + "OR stop_lon < -180 OR stop_lon > 180)", datasetId);
        expectZero(connection, "gtfs_shape_point 坐标越界",
                "SELECT COUNT(*) FROM gtfs_shape_point WHERE dataset_id=? AND (shape_pt_lat < -90 OR shape_pt_lat > 90 "
                        + "OR shape_pt_lon < -180 OR shape_pt_lon > 180)", datasetId);

        // 7. fixed sample identities (G7179 / G531 / T297)
        long sampleTrips = queryCount(connection,
                "SELECT COUNT(*) FROM gtfs_trip WHERE dataset_id=? AND ("
                        + "(trip_id='5l000G717920' AND route_id='G7179' AND service_id='S75' AND shape_id='shape-2406') OR "
                        + "(trip_id='240000G53106' AND route_id='G531' AND service_id='S98' AND shape_id='shape-745') OR "
                        + "(trip_id='240000T2971H' AND route_id='T297' AND service_id='S1' AND shape_id='shape-287'))",
                datasetId);
        if (sampleTrips != 3) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "固定样例车次身份校验失败，实际匹配 " + sampleTrips + " 条");
        }
        long sampleStopTimes = queryCount(connection,
                "SELECT COUNT(*) FROM gtfs_stop_time WHERE dataset_id=? AND ("
                        + "(trip_id='5l000G717920' AND stop_sequence=1 AND stop_id='NKH' AND departure_time='06:20:00' AND departure_seconds=22800) OR "
                        + "(trip_id='5l000G717920' AND stop_sequence=5 AND stop_id='AOH' AND arrival_time='07:49:00' AND arrival_seconds=28140) OR "
                        + "(trip_id='240000G53106' AND stop_sequence=1 AND stop_id='VNP' AND departure_time='06:08:00') OR "
                        + "(trip_id='240000G53106' AND stop_sequence=10 AND stop_id='NKH' AND arrival_time='10:42:00') OR "
                        + "(trip_id='240000G53106' AND stop_sequence=13 AND stop_id='AOH' AND arrival_time='12:04:00') OR "
                        + "(trip_id='240000T2971H' AND stop_sequence=1 AND stop_id='BJP' AND departure_time='12:24:00') OR "
                        + "(trip_id='240000T2971H' AND stop_sequence=8 AND stop_id='HBB' AND arrival_time='26:06:00' AND arrival_seconds=93960) OR "
                        + "(trip_id='240000T2971H' AND stop_sequence=11 AND stop_id='MDB' AND arrival_time='31:18:00'))",
                datasetId);
        if (sampleStopTimes != 8) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "固定样例停站时刻校验失败，实际匹配 " + sampleStopTimes + " 条");
        }
        long sampleServices = queryCount(connection,
                "SELECT COUNT(*) FROM gtfs_calendar_date WHERE dataset_id=? AND service_date='2026-11-16' "
                        + "AND exception_type=1 AND service_id IN ('S75','S98','S1')", datasetId);
        if (sampleServices != 3) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                    "固定样例参考服务日 2026-11-16 的日历校验失败，实际匹配 " + sampleServices + " 条");
        }
    }

    private void expectCount(Connection connection, String table, long datasetId, long expected) throws SQLException {
        long actual = queryCount(connection, "SELECT COUNT(*) FROM " + table + " WHERE dataset_id=?", datasetId);
        if (actual != expected) {
            throw new ImportFailure(CliError.IMPORT_FAILED,
                    table + " 行数 " + actual + " 与固定清单 " + expected + " 不一致");
        }
    }

    private void expectZero(Connection connection, String label, String sql, Object... params) throws SQLException {
        long count = queryCount(connection, sql, params);
        if (count != 0) {
            throw new ImportFailure(CliError.IMPORT_FAILED, label + " 校验失败: " + count + " 条不合法记录");
        }
    }

    private long queryCount(Connection connection, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                ps.setObject(i + 1, params[i]);
            }
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getLong(1) : 0L;
            }
        }
    }

    // ---------------------------------------------------------------- activation

    private void activate(Connection connection, long datasetId, long runId, long elapsedMs,
                          Map<String, Object> report) throws SQLException {
        boolean previousAutoCommit = connection.getAutoCommit();
        try {
            connection.setAutoCommit(false);
            long pointer;
            try (PreparedStatement ps = connection.prepareStatement(
                    "SELECT dataset_id FROM dataset_active WHERE singleton_id = 1 FOR UPDATE");
                 ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new ImportFailure(CliError.SCHEMA_NOT_READY,
                            "dataset_active 单例行缺失，激活事务无法锁定目标");
                }
                long value = rs.getLong(1);
                if (rs.wasNull()) {
                    pointer = -1L;
                } else {
                    pointer = value;
                }
            }
            if (pointer > 0 && pointer != datasetId) {
                throw new ImportFailure(CliError.DATASET_HASH_CONFLICT,
                        "active 指针已指向另一版本，本轮不做版本替换");
            }
            String status;
            try (PreparedStatement ps = connection.prepareStatement(
                    "SELECT status FROM dataset_version WHERE id=? FOR UPDATE")) {
                ps.setLong(1, datasetId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        throw new ImportFailure(CliError.IMPORT_FAILED, "待激活版本不存在");
                    }
                    status = rs.getString(1);
                }
            }
            if (!"VALIDATING".equals(status)) {
                throw new ImportFailure(CliError.IMPORT_FAILED, "版本状态不是 VALIDATING，拒绝激活: " + status);
            }
            try (PreparedStatement ps = connection.prepareStatement(
                    "UPDATE dataset_active SET dataset_id=? WHERE singleton_id=1")) {
                ps.setLong(1, datasetId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = connection.prepareStatement(
                    "UPDATE dataset_version SET status='ACTIVE', activated_at=? WHERE id=?")) {
                ps.setTimestamp(1, utcNow());
                ps.setLong(2, datasetId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = connection.prepareStatement(
                    "UPDATE dataset_import_run SET status='SUCCEEDED', dataset_id=?, finished_at=?, elapsed_ms=?, "
                            + "error_code=NULL, report_json=? WHERE id=?")) {
                ps.setLong(1, datasetId);
                ps.setTimestamp(2, utcNow());
                ps.setLong(3, elapsedMs);
                ps.setString(4, toJson(report));
                ps.setLong(5, runId);
                ps.executeUpdate();
            }
            connection.commit();
        } catch (ImportFailure failure) {
            connection.rollback();
            throw failure;
        } catch (SQLException e) {
            connection.rollback();
            throw e;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
    }

    // ---------------------------------------------------------------- cleanup and stats

    private void cleanupDataset(Connection connection, long datasetId) throws SQLException {
        for (String table : BUSINESS_TABLES) {
            deleteInChunks(connection, "DELETE FROM " + table + " WHERE dataset_id=? LIMIT 100000", datasetId);
        }
        deleteDatasetFiles(connection, datasetId);
    }

    private void deleteDatasetFiles(Connection connection, long datasetId) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("DELETE FROM dataset_file WHERE dataset_id=?")) {
            ps.setLong(1, datasetId);
            ps.executeUpdate();
        }
    }

    private void deleteInChunks(Connection connection, String sql, long datasetId) throws SQLException {
        boolean previousAutoCommit = connection.getAutoCommit();
        try {
            connection.setAutoCommit(false);
            while (true) {
                int deleted;
                try (PreparedStatement ps = connection.prepareStatement(sql)) {
                    ps.setLong(1, datasetId);
                    deleted = ps.executeUpdate();
                }
                connection.commit();
                if (deleted == 0) {
                    break;
                }
            }
        } catch (SQLException e) {
            connection.rollback();
            throw e;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
    }

    private Map<String, Long> tableCounts(Connection connection, long datasetId) throws SQLException {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String table : BUSINESS_TABLES) {
            counts.put(table, queryCount(connection, "SELECT COUNT(*) FROM " + table + " WHERE dataset_id=?",
                    datasetId));
        }
        counts.put("dataset_file", queryCount(connection, "SELECT COUNT(*) FROM dataset_file WHERE dataset_id=?",
                datasetId));
        return counts;
    }

    private Map<String, Object> storageStats(Connection connection) throws SQLException {
        Map<String, Object> storage = new LinkedHashMap<>();
        storage.put("statisticsAt", Instant.now().toString());
        storage.put("note", "DATA_LENGTH/INDEX_LENGTH are InnoDB estimates reported by information_schema");
        Map<String, Object> tables = new LinkedHashMap<>();
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT table_name, data_length, index_length FROM information_schema.tables "
                        + "WHERE table_schema = DATABASE() ORDER BY table_name");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("dataLengthBytes", rs.getLong(2));
                entry.put("indexLengthBytes", rs.getLong(3));
                tables.put(rs.getString(1), entry);
            }
        }
        storage.put("tables", tables);
        return storage;
    }

    private List<Map<String, Object>> fileCountMap(List<ImportSummary.FileCount> counts) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (ImportSummary.FileCount count : counts) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("fileName", count.fileName());
            entry.put("sourceRows", count.sourceRows());
            entry.put("importedRows", count.importedRows());
            entry.put("sha256", count.sha256());
            list.add(entry);
        }
        return list;
    }

    private String toJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return "{}";
        }
    }

    static Timestamp utcNow() {
        return toTimestamp(Instant.now());
    }

    static Timestamp toTimestamp(Instant instant) {
        return Timestamp.valueOf(LocalDateTime.ofInstant(instant, ZoneOffset.UTC));
    }
}
