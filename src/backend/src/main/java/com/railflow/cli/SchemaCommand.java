package com.railflow.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.railflow.importer.CliError;
import com.railflow.importer.NamedLock;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

/**
 * {@code --spring.profiles.active=schema}: applies migration 1 on the authorised local database.
 *
 * <p>Runs while holding the same named lock as the importer, on the same physical connection.
 * Idempotent: existing tables are never altered or dropped, and an existing {@code dataset_active}
 * pointer is preserved.
 *
 * <p>Tasks 20261118-17/25: {@code CREATE TABLE IF NOT EXISTS} keeps an incompatible pre-existing
 * table unchanged, so the migration is registered only after the engine, required columns (type,
 * length, nullability, identifier collation), primary key, required indexes/unique keys and status
 * CHECK constraints are verified. Otherwise the command fails with {@code SCHEMA_NOT_READY} and
 * does not record the migration.
 */
@Component
@Profile("schema")
public class SchemaCommand implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SchemaCommand.class);

    private final DataSource dataSource;
    private final ObjectMapper objectMapper;

    public SchemaCommand(DataSource dataSource, ObjectMapper objectMapper) {
        this.dataSource = dataSource;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        long startedAt = System.currentTimeMillis();
        Map<String, Object> summary = new LinkedHashMap<>();
        int exitCode = 0;
        try (Connection connection = dataSource.getConnection()) {
            int lock = NamedLock.acquire(connection);
            if (lock != 1) {
                summary.put("result", "FAILED");
                summary.put("errorCode", CliError.IMPORT_IN_PROGRESS.name());
                summary.put("message", "另一个导入或迁移进程正持有命名锁");
                exitCode = CliError.IMPORT_IN_PROGRESS.exitCode();
            } else {
                try {
                    ScriptUtils.executeSqlScript(connection,
                            new ClassPathResource("db/migration/V1__mvp_schema.sql"));
                    List<String> violations = SchemaGuard.check(loadTableInfo(connection));
                    if (!violations.isEmpty()) {
                        log.error("schema structure incompatible with migration 1: {}", violations);
                        summary.put("result", "FAILED");
                        summary.put("errorCode", CliError.SCHEMA_NOT_READY.name());
                        summary.put("message", "既有结构与迁移 1 不兼容，未登记迁移成功；未知表已保留");
                        summary.put("violations", summarize(violations));
                        exitCode = CliError.SCHEMA_NOT_READY.exitCode();
                    } else {
                        registerMigration(connection);
                        Long activePointer = readActivePointer(connection);
                        summary.put("result", "SCHEMA_READY");
                        summary.put("migration", 1);
                        summary.put("database", databaseName(connection));
                        summary.put("applicationTables", SchemaGuard.expectedTables().size());
                        summary.put("activeDatasetId", activePointer);
                        summary.put("elapsedMs", System.currentTimeMillis() - startedAt);
                        summary.put("message", "迁移 1 已应用（幂等），既有 active 指针保持不变");
                    }
                } finally {
                    NamedLock.release(connection);
                }
            }
        } catch (SQLException e) {
            log.error("schema command failed: {}", e.getClass().getSimpleName());
            summary.put("result", "FAILED");
            summary.put("errorCode", CliError.DATABASE_UNAVAILABLE.name());
            summary.put("message", "数据库不可用或结构初始化失败");
            exitCode = CliError.DATABASE_UNAVAILABLE.exitCode();
        } catch (RuntimeException e) {
            log.error("schema command failed: {}", e.getClass().getSimpleName());
            summary.put("result", "FAILED");
            summary.put("errorCode", CliError.SCHEMA_NOT_READY.name());
            summary.put("message", "迁移脚本执行失败");
            exitCode = CliError.SCHEMA_NOT_READY.exitCode();
        }
        summary.putIfAbsent("elapsedMs", System.currentTimeMillis() - startedAt);
        CliOutput.emit(objectMapper, summary, exitCode);
    }

    /** Records migration 1 and ensures the singleton pointer row exists without touching it. */
    private void registerMigration(Connection connection) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO schema_version (version, applied_at) VALUES (1, UTC_TIMESTAMP(3)) "
                        + "ON DUPLICATE KEY UPDATE version = version")) {
            ps.executeUpdate();
        }
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO dataset_active (singleton_id, dataset_id) VALUES (1, NULL) "
                        + "ON DUPLICATE KEY UPDATE singleton_id = singleton_id")) {
            ps.executeUpdate();
        }
    }

    private Map<String, SchemaGuard.TableInfo> loadTableInfo(Connection connection) throws SQLException {
        Set<String> expected = new LinkedHashSet<>();
        for (SchemaGuard.TableSpec spec : SchemaGuard.expectedTables()) {
            expected.add(spec.table());
        }
        Map<String, String> engines = new LinkedHashMap<>();
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT table_name, engine FROM information_schema.tables WHERE table_schema = DATABASE()");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String table = normalize(rs.getString(1));
                if (expected.contains(table)) {
                    engines.put(table, rs.getString(2));
                }
            }
        }
        Map<String, Map<String, SchemaGuard.ColumnInfo>> columns = new LinkedHashMap<>();
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT table_name, column_name, column_type, is_nullable, collation_name, "
                        + "character_set_name FROM information_schema.columns "
                        + "WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String table = normalize(rs.getString(1));
                if (!expected.contains(table)) {
                    continue;
                }
                SchemaGuard.ColumnInfo column = new SchemaGuard.ColumnInfo(
                        normalize(rs.getString(2)), rs.getString(3),
                        "YES".equalsIgnoreCase(rs.getString(4)), rs.getString(5), rs.getString(6));
                columns.computeIfAbsent(table, key -> new LinkedHashMap<>()).put(column.name(), column);
            }
        }
        Map<String, Map<String, List<String>>> indexColumns = new LinkedHashMap<>();
        Map<String, Map<String, Boolean>> indexUnique = new LinkedHashMap<>();
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT table_name, index_name, non_unique, seq_in_index, column_name "
                        + "FROM information_schema.statistics WHERE table_schema = DATABASE() "
                        + "ORDER BY table_name, index_name, seq_in_index");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String table = normalize(rs.getString(1));
                if (!expected.contains(table)) {
                    continue;
                }
                String indexName = rs.getString(2);
                indexColumns.computeIfAbsent(table, key -> new LinkedHashMap<>())
                        .computeIfAbsent(indexName, key -> new ArrayList<>())
                        .add(normalize(rs.getString(5)));
                indexUnique.computeIfAbsent(table, key -> new LinkedHashMap<>())
                        .put(indexName, rs.getInt(3) == 0);
            }
        }
        Map<String, Map<String, String>> checks = new LinkedHashMap<>();
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT tc.table_name, cc.constraint_name, cc.check_clause "
                        + "FROM information_schema.table_constraints tc "
                        + "JOIN information_schema.check_constraints cc "
                        + "ON cc.constraint_schema = tc.constraint_schema "
                        + "AND cc.constraint_name = tc.constraint_name "
                        + "WHERE tc.table_schema = DATABASE() AND tc.constraint_type = 'CHECK'");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String table = normalize(rs.getString(1));
                if (expected.contains(table)) {
                    checks.computeIfAbsent(table, key -> new LinkedHashMap<>())
                            .put(normalize(rs.getString(2)), rs.getString(3));
                }
            }
        }
        Map<String, SchemaGuard.TableInfo> result = new LinkedHashMap<>();
        for (String table : expected) {
            Map<String, SchemaGuard.ColumnInfo> tableColumns = columns.getOrDefault(table, Map.of());
            List<SchemaGuard.IndexInfo> indexes = new ArrayList<>();
            Map<String, List<String>> tableIndexes = indexColumns.getOrDefault(table, Map.of());
            Map<String, Boolean> tableUnique = indexUnique.getOrDefault(table, Map.of());
            for (Map.Entry<String, List<String>> entry : tableIndexes.entrySet()) {
                indexes.add(new SchemaGuard.IndexInfo(entry.getKey(),
                        tableUnique.getOrDefault(entry.getKey(), false), entry.getValue()));
            }
            result.put(table, new SchemaGuard.TableInfo(table, engines.get(table), tableColumns, indexes,
                    checks.getOrDefault(table, Map.of())));
        }
        return result;
    }

    private static String normalize(String value) {
        return value == null ? null : value.toLowerCase(Locale.ROOT);
    }

    private Long readActivePointer(Connection connection) throws SQLException {
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

    private String databaseName(Connection connection) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("SELECT DATABASE()");
             ResultSet rs = ps.executeQuery()) {
            return rs.next() ? rs.getString(1) : null;
        }
    }

    static List<String> summarize(List<String> violations) {
        return violations.size() > 20 ? new ArrayList<>(violations.subList(0, 20)) : violations;
    }
}
