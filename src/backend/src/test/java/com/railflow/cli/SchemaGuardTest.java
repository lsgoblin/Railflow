package com.railflow.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Regression for tasks 20261118-17, 25 and 27: an incompatible pre-existing table must not be
 * reported as a successful migration. Same column names are not enough — engine, types,
 * nullability, identifier collation, utf8mb4 character set, primary key, indexes and the CHECK
 * constraint <em>expressions</em> must match as well. The live counter examples run against the
 * dedicated test database separately.
 */
class SchemaGuardTest {

    @Test
    void compatibleSchemaHasNoViolations() {
        assertEquals(List.of(), SchemaGuard.check(SchemaGuard.compatibleSchema()));
    }

    @Test
    void missingTableIsReported() {
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        schema.remove("gtfs_trip");
        List<String> violations = SchemaGuard.check(schema);
        assertEquals(1, violations.size());
        assertTrue(violations.get(0).contains("gtfs_trip"));
    }

    @Test
    void unknownOnlyTableIsReported() {
        // Original counter example: pre-created gtfs_trip with only unknown_column.
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        schema.put("gtfs_trip", new SchemaGuard.TableInfo("gtfs_trip", "InnoDB",
                Map.of("unknown_column", new SchemaGuard.ColumnInfo("unknown_column", "int", true, null, null)),
                List.of(), Map.of()));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v -> v.contains("gtfs_trip") && v.contains("缺少列")));
        assertTrue(violations.stream().anyMatch(v -> v.contains("缺少主键")));
    }

    @Test
    void sameColumnNamesWithIncompatibleStructureIsReported() {
        // Task 25 counter example: same column names but INT identifiers, MyISAM and no key/index.
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        Map<String, SchemaGuard.ColumnInfo> columns = new LinkedHashMap<>();
        for (SchemaGuard.ColumnSpec spec : SchemaGuard.expectedTables().stream()
                .filter(table -> table.table().equals("gtfs_trip")).findFirst().orElseThrow().columns()) {
            columns.put(spec.name(), new SchemaGuard.ColumnInfo(spec.name(), "int", false, null, null));
        }
        schema.put("gtfs_trip", new SchemaGuard.TableInfo("gtfs_trip", "MyISAM", columns, List.of(), Map.of()));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v -> v.contains("引擎不是 InnoDB")));
        assertTrue(violations.stream().anyMatch(v -> v.contains("类型不兼容")));
        assertTrue(violations.stream().anyMatch(v -> v.contains("排序规则不兼容")));
        assertTrue(violations.stream().anyMatch(v -> v.contains("字符集不兼容")));
        assertTrue(violations.stream().anyMatch(v -> v.contains("缺少主键")));
        assertTrue(violations.stream().anyMatch(v -> v.contains("缺少索引")));
    }

    @Test
    void wrongNullabilityAndCollationAreReported() {
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo trip = schema.get("gtfs_trip");
        Map<String, SchemaGuard.ColumnInfo> columns = new LinkedHashMap<>(trip.columns());
        columns.put("trip_id", new SchemaGuard.ColumnInfo("trip_id", "varchar(128)", true,
                "utf8mb4_0900_ai_ci", "utf8mb4"));
        schema.put("gtfs_trip", new SchemaGuard.TableInfo("gtfs_trip", trip.engine(), columns, trip.indexes(),
                trip.checks()));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v -> v.contains("可空性不兼容")));
        assertTrue(violations.stream().anyMatch(v -> v.contains("排序规则不兼容")));
    }

    @Test
    void missingCheckConstraintIsReported() {
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo version = schema.get("dataset_version");
        schema.put("dataset_version", new SchemaGuard.TableInfo("dataset_version", version.engine(),
                version.columns(), version.indexes(), Map.of()));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v -> v.contains("ck_dataset_version_status")));
    }

    @Test
    void missingUniqueKeyIsReported() {
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo version = schema.get("dataset_version");
        List<SchemaGuard.IndexInfo> indexes = new ArrayList<>();
        for (SchemaGuard.IndexInfo index : version.indexes()) {
            if (!index.unique() || !index.columns().equals(List.of("version_name"))) {
                indexes.add(index);
            }
        }
        schema.put("dataset_version", new SchemaGuard.TableInfo("dataset_version", version.engine(),
                version.columns(), indexes, version.checks()));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v -> v.contains("唯一索引")));
    }

    @Test
    void extraColumnsAreAllowed() {
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo stop = schema.get("gtfs_stop");
        Map<String, SchemaGuard.ColumnInfo> columns = new LinkedHashMap<>(stop.columns());
        columns.put("future_column", new SchemaGuard.ColumnInfo("future_column", "int", true, null, null));
        schema.put("gtfs_stop", new SchemaGuard.TableInfo("gtfs_stop", stop.engine(), columns, stop.indexes(),
                stop.checks()));
        assertEquals(List.of(), SchemaGuard.check(schema));
    }

    @Test
    void sameCheckNameWithNarrowerValueSetIsRejected() {
        // Task 27 counter example: constraint name matches but only CHECKING/IMPORTING are allowed.
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo run = schema.get("dataset_import_run");
        Map<String, String> checks = new LinkedHashMap<>(run.checks());
        checks.put("ck_import_run_status",
                "(`status` in (_utf8mb4'CHECKING',_utf8mb4'IMPORTING'))");
        schema.put("dataset_import_run", new SchemaGuard.TableInfo("dataset_import_run", run.engine(),
                run.columns(), run.indexes(), checks));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v ->
                v.contains("ck_import_run_status") && v.contains("表达式不兼容")));
    }

    @Test
    void sameCheckNameMissingOneAllowedValueIsRejected() {
        // Same name and six of seven values is still incompatible: SUCCEEDED/NOOP/... must all fit.
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo run = schema.get("dataset_import_run");
        Map<String, String> checks = new LinkedHashMap<>(run.checks());
        checks.put("ck_import_run_status",
                "(`status` in ('CHECKING','IMPORTING','VALIDATING','SUCCEEDED','NOOP','FAILED'))");
        schema.put("dataset_import_run", new SchemaGuard.TableInfo("dataset_import_run", run.engine(),
                run.columns(), run.indexes(), checks));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v -> v.contains("ck_import_run_status")));
    }

    @Test
    void nonInCheckExpressionMismatchIsRejected() {
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo active = schema.get("dataset_active");
        Map<String, String> checks = new LinkedHashMap<>(active.checks());
        checks.put("ck_dataset_active_singleton", "(`singleton_id` = 2)");
        schema.put("dataset_active", new SchemaGuard.TableInfo("dataset_active", active.engine(),
                active.columns(), active.indexes(), checks));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v -> v.contains("ck_dataset_active_singleton")));
    }

    @Test
    void checkClauseFormattingIsNormalised() {
        // MySQL may echo extra parentheses, backticks, character-set introducers, backslash-escaped
        // quotes (actual CHECK_CLAUSE format), different value order or spaces.
        SchemaGuard.CheckSpec spec = SchemaGuard.CheckSpec.in("ck_import_run_status",
                "CHECKING", "IMPORTING", "VALIDATING", "SUCCEEDED", "NOOP", "FAILED", "INTERRUPTED");
        String escaped = "((`status` in (_utf8mb4\\'INTERRUPTED\\',_utf8mb4\\'NOOP\\',"
                + "_utf8mb4\\'SUCCEEDED\\',_utf8mb4\\'FAILED\\',_utf8mb4\\'VALIDATING\\',"
                + "_utf8mb4\\'IMPORTING\\',_utf8mb4\\'CHECKING\\')))";
        assertTrue(SchemaGuard.checkClauseSatisfies(spec, escaped));
        String plain = "(`status` in ('CHECKING','IMPORTING','VALIDATING','SUCCEEDED','NOOP',"
                + "'FAILED','INTERRUPTED'))";
        assertTrue(SchemaGuard.checkClauseSatisfies(spec, plain));
    }

    @Test
    void lowercaseCheckValuesAreRejected() {
        // Task 20261119-08: status uses utf8mb4_bin, so an all-lowercase value list is not the
        // contract's upper-case state set and must not be accepted.
        SchemaGuard.CheckSpec spec = SchemaGuard.CheckSpec.in("ck_import_run_status",
                "CHECKING", "IMPORTING", "VALIDATING", "SUCCEEDED", "NOOP", "FAILED", "INTERRUPTED");
        String lowercase = "(`status` in (_utf8mb4\\'checking\\',_utf8mb4\\'importing\\',"
                + "_utf8mb4\\'validating\\',_utf8mb4\\'succeeded\\',_utf8mb4\\'noop\\',"
                + "_utf8mb4\\'failed\\',_utf8mb4\\'interrupted\\'))";
        assertFalse(SchemaGuard.checkClauseSatisfies(spec, lowercase));

        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo run = schema.get("dataset_import_run");
        Map<String, String> checks = new LinkedHashMap<>(run.checks());
        checks.put("ck_import_run_status",
                "(`status` in ('checking','importing','validating','succeeded','noop','failed','interrupted'))");
        schema.put("dataset_import_run", new SchemaGuard.TableInfo("dataset_import_run", run.engine(),
                run.columns(), run.indexes(), checks));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v -> v.contains("ck_import_run_status")));
    }

    @Test
    void nonIdentifierColumnLatin1CharsetIsRejected() {
        // Task 27 counter example: gtfs_stop otherwise correct but stop_name is latin1.
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo stop = schema.get("gtfs_stop");
        Map<String, SchemaGuard.ColumnInfo> columns = new LinkedHashMap<>(stop.columns());
        columns.put("stop_name", new SchemaGuard.ColumnInfo("stop_name", "varchar(255)", false,
                "latin1_swedish_ci", "latin1"));
        schema.put("gtfs_stop", new SchemaGuard.TableInfo("gtfs_stop", stop.engine(), columns, stop.indexes(),
                stop.checks()));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v ->
                v.contains("gtfs_stop") && v.contains("stop_name") && v.contains("字符集不兼容")));
    }

    @Test
    void identifierColumnsStillRequireBinaryCollation() {
        Map<String, SchemaGuard.TableInfo> schema = SchemaGuard.compatibleSchema();
        SchemaGuard.TableInfo stop = schema.get("gtfs_stop");
        Map<String, SchemaGuard.ColumnInfo> columns = new LinkedHashMap<>(stop.columns());
        columns.put("stop_id", new SchemaGuard.ColumnInfo("stop_id", "varchar(128)", false,
                "utf8mb4_0900_ai_ci", "utf8mb4"));
        schema.put("gtfs_stop", new SchemaGuard.TableInfo("gtfs_stop", stop.engine(), columns, stop.indexes(),
                stop.checks()));
        List<String> violations = SchemaGuard.check(schema);
        assertTrue(violations.stream().anyMatch(v -> v.contains("排序规则不兼容")));
    }
}
