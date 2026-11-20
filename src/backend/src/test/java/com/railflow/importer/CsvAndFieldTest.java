package com.railflow.importer;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.io.StringReader;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** CSV and field parsing behaviour required by contract §2/§3. */
class CsvAndFieldTest {

    @Test
    void parsesQuotedFieldsWithCommaQuoteAndNewline() throws IOException {
        String csv = "a,b,c\n"
                + "\"x,y\",\"he said \"\"hi\"\"\",\"line1\nline2\"\n";
        try (CsvReader reader = new CsvReader(new StringReader(csv))) {
            assertArrayEquals(new String[]{"a", "b", "c"}, reader.nextRecord());
            assertArrayEquals(new String[]{"x,y", "he said \"hi\"", "line1\nline2"}, reader.nextRecord());
            assertNull(reader.nextRecord());
        }
    }

    @Test
    void parsesCrLfAndStripsBom() throws IOException {
        String csv = "\uFEFFstop_id,stop_name\r\nNKH,\u5357\u4EAC\u5357\r\n";
        try (CsvReader reader = new CsvReader(new StringReader(csv))) {
            assertArrayEquals(new String[]{"stop_id", "stop_name"}, reader.nextRecord());
            assertArrayEquals(new String[]{"NKH", "\u5357\u4EAC\u5357"}, reader.nextRecord());
            assertNull(reader.nextRecord());
        }
    }

    @Test
    void keepsEmptyTrailingField() throws IOException {
        try (CsvReader reader = new CsvReader(new StringReader("a,b,\n"))) {
            assertArrayEquals(new String[]{"a", "b", ""}, reader.nextRecord());
        }
    }

    @Test
    void cumulativeSecondsSupportMoreThanTwentyFourHours() {
        assertEquals(93_960, GtfsFields.parseCumulativeSeconds("26:06:00", "stop_times.txt", 1, "arrival_time"));
        assertEquals(255_420, GtfsFields.parseCumulativeSeconds("70:57:00", "stop_times.txt", 1, "arrival_time"));
        assertEquals(0, GtfsFields.parseCumulativeSeconds("00:00:00", "stop_times.txt", 1, "arrival_time"));
    }

    @Test
    void rejectsInvalidCumulativeTimes() {
        assertThrows(ImportFailure.class,
                () -> GtfsFields.parseCumulativeSeconds("26:60:00", "stop_times.txt", 1, "arrival_time"));
        assertThrows(ImportFailure.class,
                () -> GtfsFields.parseCumulativeSeconds("26:06:60", "stop_times.txt", 1, "arrival_time"));
        assertThrows(ImportFailure.class,
                () -> GtfsFields.parseCumulativeSeconds("-1:06:00", "stop_times.txt", 1, "arrival_time"));
        assertThrows(ImportFailure.class,
                () -> GtfsFields.parseCumulativeSeconds("2606", "stop_times.txt", 1, "arrival_time"));
    }

    @Test
    void parsesGtfsDateAndRejectsInvalidDate() {
        assertEquals(LocalDate.of(2026, 11, 16), GtfsFields.parseGtfsDate("20261116", "calendar_dates.txt", 1, "date"));
        assertThrows(ImportFailure.class,
                () -> GtfsFields.parseGtfsDate("2026-11-16", "calendar_dates.txt", 1, "date"));
        assertThrows(ImportFailure.class,
                () -> GtfsFields.parseGtfsDate("20260230", "calendar_dates.txt", 1, "date"));
    }

    @Test
    void rejectsOutOfRangeCoordinates() {
        assertThrows(ImportFailure.class, () -> GtfsFields.requireLatitude("91.0", "stops.txt", 1, "stop_lat"));
        assertThrows(ImportFailure.class, () -> GtfsFields.requireLongitude("-180.5", "stops.txt", 1, "stop_lon"));
        assertThrows(ImportFailure.class, () -> GtfsFields.requireLatitude("NaN", "stops.txt", 1, "stop_lat"));
    }

    @Test
    void escapesLikeWildcardsLiterally() {
        assertEquals("100!%!%", com.railflow.web.Params.escapeLike("100%%"));
        assertEquals("a!_b!!c", com.railflow.web.Params.escapeLike("a_b!c"));
    }
}
