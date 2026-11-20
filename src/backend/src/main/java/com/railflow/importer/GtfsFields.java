package com.railflow.importer;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;

/** Field-level parsing/validation of the fixed GTFS CSV files. */
public final class GtfsFields {

    /** STRICT: an impossible date such as 20260230 must fail instead of being clamped. */
    private static final DateTimeFormatter GTFS_DATE =
            DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT);

    private GtfsFields() {
    }

    public static String requireText(String[] row, int index, String file, long recordNo, String field) {
        if (index >= row.length) {
            throw invalid(file, recordNo, "缺少字段 " + field);
        }
        String value = row[index];
        if (value == null || value.isEmpty()) {
            throw invalid(file, recordNo, "必填字段为空: " + field);
        }
        return value;
    }

    public static String optionalText(String[] row, int index) {
        if (index >= row.length) {
            return "";
        }
        String value = row[index];
        return value == null ? "" : value;
    }

    public static int parseInt(String value, String file, long recordNo, String field) {
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            throw invalid(file, recordNo, field + " 不是整数: " + abbreviate(value));
        }
    }

    public static int requireNonNegativeInt(String value, String file, long recordNo, String field) {
        int parsed = parseInt(value, file, recordNo, field);
        if (parsed < 0) {
            throw invalid(file, recordNo, field + " 不能为负");
        }
        return parsed;
    }

    public static double parseCoordinate(String value, String file, long recordNo, String field) {
        double parsed;
        try {
            parsed = Double.parseDouble(value.trim());
        } catch (NumberFormatException e) {
            throw invalid(file, recordNo, field + " 不是数值: " + abbreviate(value));
        }
        if (!Double.isFinite(parsed)) {
            throw invalid(file, recordNo, field + " 不是有限数值");
        }
        return parsed;
    }

    public static double requireLatitude(String value, String file, long recordNo, String field) {
        double lat = parseCoordinate(value, file, recordNo, field);
        if (lat < -90.0 || lat > 90.0) {
            throw invalid(file, recordNo, field + " 超出纬度范围");
        }
        return lat;
    }

    public static double requireLongitude(String value, String file, long recordNo, String field) {
        double lon = parseCoordinate(value, file, recordNo, field);
        if (lon < -180.0 || lon > 180.0) {
            throw invalid(file, recordNo, field + " 超出经度范围");
        }
        return lon;
    }

    public static LocalDate parseGtfsDate(String value, String file, long recordNo, String field) {
        try {
            return LocalDate.parse(value.trim(), GTFS_DATE);
        } catch (DateTimeParseException e) {
            throw invalid(file, recordNo, field + " 不是 yyyyMMdd 日期: " + abbreviate(value));
        }
    }

    /**
     * Parses a GTFS cumulative time {@code H:MM:SS} into non-negative seconds. Hours may exceed 23
     * (the fixed package contains values up to 70:57:00); minutes and seconds must be 0-59.
     */
    public static int parseCumulativeSeconds(String value, String file, long recordNo, String field) {
        String text = value == null ? "" : value.trim();
        String[] parts = text.split(":", -1);
        if (parts.length != 3) {
            throw invalid(file, recordNo, field + " 不是 HH:MM:SS: " + abbreviate(value));
        }
        int hours;
        int minutes;
        int seconds;
        try {
            hours = Integer.parseInt(parts[0]);
            minutes = Integer.parseInt(parts[1]);
            seconds = Integer.parseInt(parts[2]);
        } catch (NumberFormatException e) {
            throw invalid(file, recordNo, field + " 不是 HH:MM:SS: " + abbreviate(value));
        }
        if (hours < 0 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
            throw invalid(file, recordNo, field + " 的分/秒必须为 0-59 且小时非负: " + abbreviate(value));
        }
        long total = (long) hours * 3600L + (long) minutes * 60L + seconds;
        if (total > Integer.MAX_VALUE) {
            throw invalid(file, recordNo, field + " 超出累计秒范围");
        }
        return (int) total;
    }

    public static ImportFailure invalid(String file, long recordNo, String detail) {
        return new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                file + " 第 " + recordNo + " 条记录: " + detail);
    }

    private static String abbreviate(String value) {
        if (value == null) {
            return "null";
        }
        String trimmed = value.trim();
        return trimmed.length() <= 40 ? trimmed : trimmed.substring(0, 40) + "...";
    }
}
