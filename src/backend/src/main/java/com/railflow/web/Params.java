package com.railflow.web;

import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.regex.Pattern;

/** Request parameter validation with the contract's 422 VALIDATION_FAILED semantics. */
public final class Params {
    private static final Pattern OUTER_WHITESPACE = Pattern.compile(
            "\\A\\s++|(?<!\\s)\\s++\\z", Pattern.UNICODE_CHARACTER_CLASS);

    private Params() {
    }

    static String trimUnicodeWhitespace(String value) {
        return value == null ? null : OUTER_WHITESPACE.matcher(value).replaceAll("");
    }

    public static String requireText(String value, String name, int maxLength) {
        if (value == null || value.trim().isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "缺少参数 " + name);
        }
        String trimmed = value.trim();
        if (trimmed.length() > maxLength) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "参数 " + name + " 超长");
        }
        return trimmed;
    }

    public static LocalDate requireIsoDate(String value, String name) {
        if (value == null || value.trim().isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "缺少参数 " + name);
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "参数 " + name + " 不是 ISO 日期");
        }
    }

    public static int optionalInt(String value, String name, int defaultValue, int min, int max) {
        if (value == null || value.trim().isEmpty()) {
            return defaultValue;
        }
        int parsed;
        try {
            parsed = Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "参数 " + name + " 不是整数");
        }
        if (parsed < min || parsed > max) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "参数 " + name + " 超出范围 " + min + "-" + max);
        }
        return parsed;
    }

    public static int requiredPositiveInt(String value, String name) {
        if (value == null || value.trim().isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "缺少参数 " + name);
        }
        int parsed;
        try {
            parsed = Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "参数 " + name + " 不是整数");
        }
        if (parsed <= 0) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "参数 " + name + " 必须为正整数");
        }
        return parsed;
    }

    /** Escapes LIKE wildcards for a literal containment search using ESCAPE '!'. */
    public static String escapeLike(String value) {
        return value.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }
}
