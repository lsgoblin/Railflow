package com.railflow.web;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** Cumulative GTFS time evaluation (contract §3/§6): never modulo 24 hours, never LocalTime. */
class ServiceDateTimesTest {

    @Test
    void sameDayTime() {
        assertEquals("2026-11-16T06:20:00+08:00", ServiceDateTimes.dateTime(LocalDate.of(2026, 11, 16), 22_800));
        assertEquals(0, ServiceDateTimes.dayOffset(22_800));
    }

    @Test
    void twentySixHoursCrossesOneDay() {
        assertEquals(93_960, 26 * 3600 + 6 * 60);
        assertEquals("2026-11-17T02:06:00+08:00", ServiceDateTimes.dateTime(LocalDate.of(2026, 11, 16), 93_960));
        assertEquals(1, ServiceDateTimes.dayOffset(93_960));
    }

    @Test
    void seventyHoursCrossesTwoDays() {
        assertEquals(255_420, 70 * 3600 + 57 * 60);
        assertEquals("2026-11-18T22:57:00+08:00", ServiceDateTimes.dateTime(LocalDate.of(2026, 11, 16), 255_420));
        assertEquals(2, ServiceDateTimes.dayOffset(255_420));
    }

    @Test
    void monthRolloverUsesCalendarArithmetic() {
        assertEquals("2026-12-01T06:00:00+08:00", ServiceDateTimes.dateTime(LocalDate.of(2026, 11, 30), 30 * 3600));
        assertEquals(1, ServiceDateTimes.dayOffset(30 * 3600));
    }

    @Test
    void usesFixedBeijingStandardTimeOnFormerDaylightSavingTransitions() {
        assertEquals("1991-04-14T06:14:00+08:00", ServiceDateTimes.dateTime(LocalDate.of(1991, 4, 14), 22_440));
        assertEquals("1991-09-15T06:14:00+08:00", ServiceDateTimes.dateTime(LocalDate.of(1991, 9, 15), 22_440));
        assertEquals("1991-04-14T02:06:00+08:00", ServiceDateTimes.dateTime(LocalDate.of(1991, 4, 13), 93_960));
    }
}
