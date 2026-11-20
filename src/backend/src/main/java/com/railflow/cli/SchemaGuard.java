package com.railflow.cli;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Structural compatibility check of migration 1 (tasks 20261118-17, 25 and 27).
 *
 * <p>{@code CREATE TABLE IF NOT EXISTS} silently keeps an existing table whose structure differs
 * from the migration. The schema command therefore compares the actual {@code information_schema}
 * metadata with what migration 1 requires: InnoDB engine, required columns with compatible type,
 * length, nullability, identifier collation and utf8mb4 character set, the primary key, the required
 * indexes/unique keys and the status CHECK constraint <em>expressions</em>. A CHECK constraint with
 * the expected name but a different allowed-value set is rejected (task 20261118-27). Compatible
 * extra columns are allowed; unknown tables are never altered or dropped. A mismatch must fail with
 * {@code SCHEMA_NOT_READY} and must not register the migration as applied.
 */
public final class SchemaGuard {

    public record ColumnSpec(String name, String columnType, boolean nullable, String collation,
                             String charset) {
    }

    public record IndexSpec(boolean unique, List<String> columns) {
    }

    /**
     * Expected CHECK constraint. {@code allowedValues} is set for {@code IN (...)} status checks and
     * is compared as a set (order independent); otherwise {@code canonicalExpression} is compared
     * after normalisation.
     */
    public record CheckSpec(String name, List<String> allowedValues, String canonicalExpression) {
        public static CheckSpec in(String name, String... values) {
            return new CheckSpec(name, List.of(values), null);
        }

        public static CheckSpec expression(String name, String expression) {
            return new CheckSpec(name, null, expression);
        }
    }

    public record TableSpec(String table, List<ColumnSpec> columns, List<String> primaryKey,
                            List<IndexSpec> indexes, List<CheckSpec> checks) {
    }

    public record ColumnInfo(String name, String columnType, boolean nullable, String collation,
                             String charset) {
    }

    public record IndexInfo(String name, boolean unique, List<String> columns) {
    }

    /** @param checks constraint name to raw {@code check_clause} text from information_schema */
    public record TableInfo(String table, String engine, Map<String, ColumnInfo> columns,
                            List<IndexInfo> indexes, Map<String, String> checks) {
    }

    private static final List<TableSpec> EXPECTED = List.of(
            new TableSpec("schema_version",
                    List.of(col("version", "int", false), col("applied_at", "datetime(3)", false)),
                    List.of("version"), List.of(), List.of()),
            new TableSpec("dataset_version",
                    List.of(col("id", "bigint", false), id("version_name", "varchar(64)"),
                            bin("sha256", "char(64)", "ascii_bin"), text("source_url", "text"),
                            text("feed_version", "varchar(32)"), col("coverage_start", "date", false),
                            col("coverage_end", "date", false), text("status", "varchar(16)"),
                            col("created_at", "datetime(3)", false), col("activated_at", "datetime(3)", true)),
                    List.of("id"),
                    List.of(new IndexSpec(true, List.of("version_name"))),
                    List.of(CheckSpec.in("ck_dataset_version_status",
                            "IMPORTING", "VALIDATING", "ACTIVE", "FAILED"))),
            new TableSpec("dataset_active",
                    List.of(col("singleton_id", "tinyint", false), col("dataset_id", "bigint", true)),
                    List.of("singleton_id"), List.of(),
                    List.of(CheckSpec.expression("ck_dataset_active_singleton", "singleton_id=1"))),
            new TableSpec("dataset_import_run",
                    List.of(col("id", "bigint", false), col("dataset_id", "bigint", true),
                            text("requested_version", "varchar(64)"), text("status", "varchar(16)"),
                            col("started_at", "datetime(3)", false), col("finished_at", "datetime(3)", true),
                            col("elapsed_ms", "bigint", true), textNullable("error_code", "varchar(64)"),
                            col("report_json", "json", true)),
                    List.of("id"),
                    List.of(new IndexSpec(false, List.of("dataset_id", "id"))),
                    List.of(CheckSpec.in("ck_import_run_status",
                            "CHECKING", "IMPORTING", "VALIDATING", "SUCCEEDED", "NOOP", "FAILED",
                            "INTERRUPTED"))),
            new TableSpec("dataset_file",
                    List.of(col("dataset_id", "bigint", false), text("file_name", "varchar(64)"),
                            bin("sha256", "char(64)", "ascii_bin"), text("header", "text"),
                            col("source_rows", "bigint", false), col("imported_rows", "bigint", false),
                            col("uncompressed_bytes", "bigint", false)),
                    List.of("dataset_id", "file_name"), List.of(), List.of()),
            new TableSpec("gtfs_agency",
                    List.of(col("dataset_id", "bigint", false), id("agency_id", "varchar(128)"),
                            text("agency_name", "varchar(255)"), text("agency_url", "text"),
                            text("agency_timezone", "varchar(64)")),
                    List.of("dataset_id", "agency_id"), List.of(), List.of()),
            new TableSpec("gtfs_feed_info",
                    List.of(col("dataset_id", "bigint", false), col("row_no", "int", false),
                            text("feed_publisher_name", "varchar(255)"),
                            text("feed_publisher_url", "text"), text("feed_lang", "varchar(32)"),
                            col("feed_start_date", "date", false), col("feed_end_date", "date", false),
                            text("feed_version", "varchar(32)")),
                    List.of("dataset_id", "row_no"), List.of(), List.of()),
            new TableSpec("gtfs_stop",
                    List.of(col("dataset_id", "bigint", false), id("stop_id", "varchar(128)"),
                            text("stop_name", "varchar(255)"), col("stop_lat", "decimal(10,7)", false),
                            col("stop_lon", "decimal(10,7)", false), col("location_type", "int", false)),
                    List.of("dataset_id", "stop_id"),
                    List.of(new IndexSpec(false, List.of("dataset_id", "stop_name", "stop_id"))), List.of()),
            new TableSpec("gtfs_route",
                    List.of(col("dataset_id", "bigint", false), id("route_id", "varchar(128)"),
                            id("agency_id", "varchar(128)"), text("route_short_name", "varchar(255)"),
                            col("route_type", "int", false)),
                    List.of("dataset_id", "route_id"),
                    List.of(new IndexSpec(false, List.of("dataset_id", "agency_id"))), List.of()),
            new TableSpec("gtfs_trip",
                    List.of(col("dataset_id", "bigint", false), id("trip_id", "varchar(128)"),
                            id("route_id", "varchar(128)"), id("service_id", "varchar(128)"),
                            text("trip_short_name", "varchar(255)"),
                            text("trip_headsign", "varchar(255)"), idNullable("shape_id", "varchar(128)")),
                    List.of("dataset_id", "trip_id"),
                    List.of(new IndexSpec(false, List.of("dataset_id", "service_id", "trip_id")),
                            new IndexSpec(false, List.of("dataset_id", "shape_id"))),
                    List.of()),
            new TableSpec("gtfs_stop_time",
                    List.of(col("dataset_id", "bigint", false), id("trip_id", "varchar(128)"),
                            col("stop_sequence", "int", false), id("stop_id", "varchar(128)"),
                            text("arrival_time", "varchar(16)"), text("departure_time", "varchar(16)"),
                            col("arrival_seconds", "int unsigned", false),
                            col("departure_seconds", "int unsigned", false)),
                    List.of("dataset_id", "trip_id", "stop_sequence"),
                    List.of(new IndexSpec(false, List.of("dataset_id", "stop_id", "trip_id", "stop_sequence"))),
                    List.of()),
            new TableSpec("gtfs_calendar_date",
                    List.of(col("dataset_id", "bigint", false), id("service_id", "varchar(128)"),
                            col("service_date", "date", false), col("exception_type", "tinyint", false)),
                    List.of("dataset_id", "service_id", "service_date"),
                    List.of(new IndexSpec(false,
                            List.of("dataset_id", "service_date", "exception_type", "service_id"))),
                    List.of()),
            new TableSpec("gtfs_shape_point",
                    List.of(col("dataset_id", "bigint", false), id("shape_id", "varchar(128)"),
                            col("shape_pt_sequence", "int", false), col("shape_pt_lat", "decimal(10,7)", false),
                            col("shape_pt_lon", "decimal(10,7)", false)),
                    List.of("dataset_id", "shape_id", "shape_pt_sequence"), List.of(), List.of()),
            new TableSpec("gtfs_translation",
                    List.of(col("dataset_id", "bigint", false), col("row_no", "int", false),
                            text("table_name", "varchar(128)"), text("field_name", "varchar(128)"),
                            text("language", "varchar(32)"), text("translation", "text"),
                            text("record_id", "varchar(128)")),
                    List.of("dataset_id", "row_no"), List.of(), List.of())
    );

    private static final Pattern IN_LIST = Pattern.compile("^[a-z0-9_]+in\\((.*)\\)$");
    private static final Pattern QUOTED_VALUE = Pattern.compile("'((?:[^']|'')*)'");
    private static final Pattern CHARSET_INTRODUCER = Pattern.compile("_[a-z0-9]+(?=')");

    private SchemaGuard() {
    }

    private static ColumnSpec col(String name, String columnType, boolean nullable) {
        return new ColumnSpec(name, columnType, nullable, null, null);
    }

    /** Non-identifier character column: no collation requirement, but utf8mb4 storage (task 27). */
    private static ColumnSpec text(String name, String columnType) {
        return new ColumnSpec(name, columnType, false, null, "utf8mb4");
    }

    private static ColumnSpec textNullable(String name, String columnType) {
        return new ColumnSpec(name, columnType, true, null, "utf8mb4");
    }

    /** Identifier column: VARCHAR with the binary collation required by the contract. */
    private static ColumnSpec id(String name, String columnType) {
        return new ColumnSpec(name, columnType, false, "utf8mb4_bin", "utf8mb4");
    }

    private static ColumnSpec idNullable(String name, String columnType) {
        return new ColumnSpec(name, columnType, true, "utf8mb4_bin", "utf8mb4");
    }

    private static ColumnSpec bin(String name, String columnType, String collation) {
        return new ColumnSpec(name, columnType, false, collation, "ascii");
    }

    public static List<TableSpec> expectedTables() {
        return EXPECTED;
    }

    /**
     * @param actual table metadata from information_schema (engine, columns, indexes, check constraints)
     * @return human readable violations; empty when migration 1 structure is satisfied
     */
    public static List<String> check(Map<String, TableInfo> actual) {
        List<String> violations = new ArrayList<>();
        for (TableSpec spec : EXPECTED) {
            TableInfo info = actual.get(spec.table());
            if (info == null) {
                violations.add("缺少表 " + spec.table());
                continue;
            }
            if (info.engine() == null || !"innodb".equals(info.engine().toLowerCase(Locale.ROOT))) {
                violations.add("表 " + spec.table() + " 引擎不是 InnoDB: " + info.engine());
            }
            checkColumns(spec, info, violations);
            checkPrimaryKey(spec, info, violations);
            checkIndexes(spec, info, violations);
            checkConstraints(spec, info, violations);
        }
        return violations;
    }

    private static void checkColumns(TableSpec spec, TableInfo info, List<String> violations) {
        for (ColumnSpec column : spec.columns()) {
            ColumnInfo actualColumn = info.columns().get(column.name());
            if (actualColumn == null) {
                violations.add("表 " + spec.table() + " 缺少列 " + column.name());
                continue;
            }
            if (!column.columnType().equalsIgnoreCase(actualColumn.columnType())) {
                violations.add("表 " + spec.table() + " 列 " + column.name() + " 类型不兼容: 期望 "
                        + column.columnType() + "，实际 " + actualColumn.columnType());
            }
            if (column.nullable() != actualColumn.nullable()) {
                violations.add("表 " + spec.table() + " 列 " + column.name() + " 可空性不兼容: 期望 "
                        + (column.nullable() ? "NULL" : "NOT NULL") + "，实际 "
                        + (actualColumn.nullable() ? "NULL" : "NOT NULL"));
            }
            if (column.collation() != null && !column.collation().equalsIgnoreCase(actualColumn.collation())) {
                violations.add("表 " + spec.table() + " 列 " + column.name() + " 排序规则不兼容: 期望 "
                        + column.collation() + "，实际 " + actualColumn.collation());
            }
            if (column.charset() != null && !column.charset().equalsIgnoreCase(actualColumn.charset())) {
                violations.add("表 " + spec.table() + " 列 " + column.name() + " 字符集不兼容: 期望 "
                        + column.charset() + "，实际 " + actualColumn.charset());
            }
        }
    }

    private static void checkPrimaryKey(TableSpec spec, TableInfo info, List<String> violations) {
        IndexInfo primary = info.indexes().stream()
                .filter(index -> "PRIMARY".equalsIgnoreCase(index.name()))
                .findFirst().orElse(null);
        if (primary == null) {
            violations.add("表 " + spec.table() + " 缺少主键");
            return;
        }
        if (!primary.columns().equals(spec.primaryKey())) {
            violations.add("表 " + spec.table() + " 主键不兼容: 期望 (" + String.join(",", spec.primaryKey())
                    + ")，实际 (" + String.join(",", primary.columns()) + ")");
        }
    }

    private static void checkIndexes(TableSpec spec, TableInfo info, List<String> violations) {
        for (IndexSpec required : spec.indexes()) {
            boolean found = false;
            for (IndexInfo index : info.indexes()) {
                if (index.unique() != required.unique()) {
                    continue;
                }
                if (index.columns().size() < required.columns().size()) {
                    continue;
                }
                if (index.columns().subList(0, required.columns().size()).equals(required.columns())) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                violations.add("表 " + spec.table() + " 缺少"
                        + (required.unique() ? "唯一索引/约束" : "索引") + " ("
                        + String.join(",", required.columns()) + ")");
            }
        }
    }

    private static void checkConstraints(TableSpec spec, TableInfo info, List<String> violations) {
        for (CheckSpec required : spec.checks()) {
            String clause = info.checks().get(required.name());
            if (clause == null) {
                violations.add("表 " + spec.table() + " 缺少状态约束 " + required.name());
                continue;
            }
            if (!checkClauseSatisfies(required, clause)) {
                violations.add("表 " + spec.table() + " 状态约束 " + required.name()
                        + " 表达式不兼容: 期望允许 " + describeExpected(required)
                        + "，实际 " + clause.trim());
            }
        }
    }

    private static String describeExpected(CheckSpec required) {
        return required.allowedValues() != null
                ? String.join("/", required.allowedValues())
                : required.canonicalExpression();
    }

    /**
     * Compares a CHECK expression semantically enough for this migration: character-set
     * introducers, backticks, keywords and whitespace are normalised, and {@code IN (...)} value
     * sets are compared regardless of order. Literal values are compared <em>case-sensitively</em>
     * because status columns use {@code utf8mb4_bin}: an all-lowercase value list is not
     * equivalent to the contract's upper-case states (task 20261119-08).
     */
    static boolean checkClauseSatisfies(CheckSpec required, String actualClause) {
        String normalized = normalizeClause(actualClause);
        if (required.allowedValues() != null) {
            List<String> values = inListValues(actualClause);
            if (values == null) {
                return false;
            }
            Set<String> expected = new LinkedHashSet<>(required.allowedValues());
            Set<String> actual = new LinkedHashSet<>(values);
            return expected.equals(actual);
        }
        return normalizeClause(required.canonicalExpression()).equals(normalized);
    }

    static String normalizeClause(String clause) {
        if (clause == null) {
            return "";
        }
        String normalized = clause.toLowerCase(Locale.ROOT);
        // MySQL stores quoted literals with backslash-escaped quotes in CHECK_CLAUSE.
        normalized = normalized.replace("\\'", "'");
        normalized = CHARSET_INTRODUCER.matcher(normalized).replaceAll("");
        normalized = normalized.replace("`", "").replace("\"", "");
        normalized = normalized.replaceAll("\\s+", "");
        return stripOuterParentheses(normalized);
    }

    private static String stripOuterParentheses(String value) {
        String current = value;
        while (current.length() > 1 && current.charAt(0) == '('
                && current.charAt(current.length() - 1) == ')') {
            int depth = 0;
            boolean wrapsWhole = true;
            for (int i = 0; i < current.length(); i++) {
                char c = current.charAt(i);
                if (c == '(') {
                    depth++;
                } else if (c == ')') {
                    depth--;
                    if (depth == 0 && i < current.length() - 1) {
                        wrapsWhole = false;
                        break;
                    }
                }
            }
            if (!wrapsWhole) {
                break;
            }
            current = current.substring(1, current.length() - 1);
        }
        return current;
    }

    /**
     * @return literal values when the clause is exactly {@code column IN (...)}; values keep their
     *     original case (the structure check uses the normalised form, the values use the raw form)
     */
    private static List<String> inListValues(String rawClause) {
        String normalized = normalizeClause(rawClause);
        Matcher list = IN_LIST.matcher(normalized);
        if (!list.matches()) {
            return null;
        }
        String body = list.group(1);
        int normalizedCount = 0;
        Matcher normalizedQuoted = QUOTED_VALUE.matcher(body);
        while (normalizedQuoted.find()) {
            normalizedCount += 1;
        }
        if (normalizedCount == 0) {
            return null;
        }
        String remainder = QUOTED_VALUE.matcher(body).replaceAll("").replace(",", "");
        if (!remainder.isEmpty()) {
            return null;
        }
        // MySQL stores quoted literals with backslash-escaped quotes; keep the original case.
        String raw = rawClause.replace("\\'", "'");
        List<String> values = new ArrayList<>();
        Matcher quoted = QUOTED_VALUE.matcher(raw);
        while (quoted.find()) {
            values.add(quoted.group(1).replace("''", "'"));
        }
        return values.size() == normalizedCount ? values : null;
    }

    /** Convenience for tests: builds a fully compatible metadata map from the expected spec. */
    public static Map<String, TableInfo> compatibleSchema() {
        Map<String, TableInfo> schema = new LinkedHashMap<>();
        for (TableSpec spec : EXPECTED) {
            Map<String, ColumnInfo> columns = new LinkedHashMap<>();
            for (ColumnSpec column : spec.columns()) {
                columns.put(column.name(), new ColumnInfo(column.name(), column.columnType(), column.nullable(),
                        column.collation(), column.charset()));
            }
            List<IndexInfo> indexes = new ArrayList<>();
            indexes.add(new IndexInfo("PRIMARY", true, spec.primaryKey()));
            int i = 0;
            for (IndexSpec index : spec.indexes()) {
                indexes.add(new IndexInfo("idx_" + (i++), index.unique(), index.columns()));
            }
            Map<String, String> checks = new LinkedHashMap<>();
            for (CheckSpec check : spec.checks()) {
                checks.put(check.name(), renderClause(check));
            }
            schema.put(spec.table(), new TableInfo(spec.table(), "InnoDB", columns, indexes, checks));
        }
        return schema;
    }

    private static String renderClause(CheckSpec check) {
        if (check.allowedValues() != null) {
            StringBuilder values = new StringBuilder();
            for (String value : check.allowedValues()) {
                if (values.length() > 0) {
                    values.append(',');
                }
                values.append("_utf8mb4'").append(value).append('\'');
            }
            return "(`status` in (" + values + "))";
        }
        return "(" + check.canonicalExpression() + ")";
    }
}
