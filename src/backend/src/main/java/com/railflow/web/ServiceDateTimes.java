package com.railflow.web;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * Reference service date arithmetic of the MVP contract §3/§6: the raw GTFS cumulative time is
 * added to the service date at midnight using fixed Beijing standard time (UTC+08:00). Times such as 26:06:00 or
 * 70:57:00 keep their day offset; they are never truncated to a clock time or modulo 24 hours.
 */
public final class ServiceDateTimes {

    private static final ZoneOffset BEIJING_OFFSET = ZoneOffset.ofHours(8);
    public static final String REPLAY_LABEL = "历史回放 · 参考日期/版本";

    private ServiceDateTimes() {
    }

    /** Full ISO 8601 date-time with +08:00 offset, e.g. 2026-11-17T02:06:00+08:00. */
    public static String dateTime(LocalDate referenceServiceDate, int cumulativeSeconds) {
        return referenceServiceDate.atStartOfDay().plusSeconds(cumulativeSeconds)
                .atOffset(BEIJING_OFFSET).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    /** Whole days after the reference service date; 26:06:00 gives 1, 70:57:00 gives 2. */
    public static int dayOffset(int cumulativeSeconds) {
        return Math.floorDiv(cumulativeSeconds, 86_400);
    }
}
