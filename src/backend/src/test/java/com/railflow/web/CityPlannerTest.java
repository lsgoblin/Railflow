package com.railflow.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.railflow.web.mapper.TimetableMapper.ScheduledStop;
import com.railflow.web.mapper.TimetableMapper.ServiceDay;
import java.io.StringReader;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CityPlannerTest {

    private static final LocalDate DAY = LocalDate.of(2026, 11, 16);
    private final List<ScheduledStop> stops = new ArrayList<>();
    private final List<ServiceDay> calendar = new ArrayList<>();

    @Test
    void triesArrivalCandidatesBeforeChangingDepartureAndPrefersDirect() {
        train("earlier-from-second", DAY, "A02", 400, "B01", 500);
        train("retains-first-origin", DAY, "A01", 700, "B02", 900);
        train("transfer-first", DAY, "A01", 300, "X", 400);
        train("transfer-second", DAY, "X", 500, "B01", 600);

        var result = search(30, DAY, visit(0, "A01", "A02"), visit(0, "B01", "B02"));

        assertNull(result.reason());
        assertEquals(List.of("retains-first-origin"), trains(result, 0));
    }

    @Test
    void sameStationTransferHonorsCallerMinimumAndCanCrossMidnight() {
        train("night", DAY, "A", 1430, "X", 1450);
        train("next-day", DAY.plusDays(1), "X", 40, "B", 100);

        var connected = search(30, DAY, visit(0, "A"), visit(0, "B"));
        assertNull(connected.reason());
        assertEquals(List.of("night", "next-day"), trains(connected, 0));

        var missed = search(31, DAY, visit(0, "A"), visit(0, "B"));
        assertEquals("NO_ROUTE", missed.reason());
        assertEquals(0, missed.failureIndex());
    }

    @Test
    void boardingNaturalDateAndServiceDateCanDiffer() {
        train("previous-service-day", DAY.minusDays(1), "A", 1450, "B", 1530);
        train("next-boarding-day", DAY, "C", 1450, "B", 1530);

        var connected = search(30, DAY, visit(0, "A"), visit(0, "B"));
        assertEquals(DAY.minusDays(1), connected.paths().get(0).rides().get(0).boarding().run().serviceDate());
        assertEquals("NO_ROUTE", search(30, DAY, visit(0, "C"), visit(0, "B")).reason());
    }

    @Test
    void crossesDaysAtVisitAndBacktracksWhenPreferredArrivalCannotContinue() {
        train("preferred-but-no-continuation", DAY, "A1", 700, "B-IN", 900);
        train("fallback-overnight", DAY, "A2", 700, "B-IN", 1500);
        train("outbound", DAY.plusDays(2), "B-OUT", 5, "C", 120);
        var visit = new CityPlanner.Visit(new CityPlanner.Node("B", "B-IN", "B-OUT", 1),
                List.of("B-IN"), List.of("B-OUT"));

        var connected = search(30, DAY, visit(0, "A1", "A2"), visit, visit(0, "C"));

        assertNull(connected.reason());
        assertEquals(List.of("fallback-overnight"), trains(connected, 0));
        assertEquals(List.of("outbound"), trains(connected, 1));
    }

    @Test
    void choosesLaterDirectTrainWhenItsContinuationHasFewerTransfers() {
        train("early-direct", DAY, "A", 700, "B", 900);
        train("overnight-direct", DAY, "A", 1300, "B", 1500);
        train("early-connection", DAY.plusDays(1), "B", 100, "X", 200);
        train("early-second", DAY.plusDays(1), "X", 240, "C", 300);
        train("later-direct", DAY.plusDays(2), "B", 100, "C", 200);

        var result = search(30, DAY, visit(0, "A"), visit(1, "B"), visit(0, "C"));

        assertNull(result.reason());
        assertEquals(List.of("overnight-direct"), trains(result, 0));
        assertEquals(List.of("later-direct"), trains(result, 1));
    }

    @Test
    void choosesFirstLegTransferOverDirectWhenItReducesTotalTransfers() {
        train("first-direct", DAY, "A", 100, "B", 250);
        train("via-x", DAY, "A", 1300, "X", 1340);
        train("overnight", DAY, "X", 1380, "B", 1490);
        train("next-day-first", DAY.plusDays(1), "B", 100, "Y", 200);
        train("next-day-second", DAY.plusDays(1), "Y", 240, "Z", 300);
        train("next-day-third", DAY.plusDays(1), "Z", 340, "C", 400);
        train("following-day-direct", DAY.plusDays(2), "B", 100, "C", 200);

        var result = search(30, DAY, visit(0, "A"), visit(1, "B"), visit(0, "C"));

        assertNull(result.reason());
        assertEquals(1, result.transfers());
        assertEquals(List.of("via-x", "overnight"), trains(result, 0));
        assertEquals(List.of("following-day-direct"), trains(result, 1));
    }

    @Test
    void comparesAllReachableTransferRoundsWhenNoDirectTrainCanContinue() {
        train("first", DAY, "A", 100, "X", 200);
        train("early-arrival", DAY, "X", 240, "B", 300);
        train("night", DAY, "X", 1300, "Y", 1440);
        train("overnight-arrival", DAY.plusDays(1), "Y", 40, "B", 90);
        train("early-onward-first", DAY.plusDays(1), "B", 100, "U", 200);
        train("early-onward-second", DAY.plusDays(1), "U", 240, "V", 300);
        train("early-onward-third", DAY.plusDays(1), "V", 340, "C", 400);
        train("later-direct", DAY.plusDays(2), "B", 100, "C", 200);

        var result = search(30, DAY, visit(0, "A"), visit(1, "B"), visit(0, "C"));

        assertNull(result.reason());
        assertEquals(List.of("first", "night", "overnight-arrival"), trains(result, 0));
        assertEquals(List.of("later-direct"), trains(result, 1));
    }

    @Test
    void bypassesAnomalousRideButKeepsValidIntervalsOnTheSameTrain() {
        train("k7066-like", DAY.minusDays(1), "S", 1430, "A", 1455);
        stops.get(1).arrivalSeconds = 2873 * 60;
        stop("k7066-like", "B", 3, 1677);
        stop("k7066-like", "C", 4, 1740);
        train("valid-direct", DAY, "A", 300, "B", 350);

        assertEquals(List.of("valid-direct"), trains(search(30, DAY, visit(0, "A"), visit(0, "B")), 0));
        assertEquals("NO_ROUTE", search(30, DAY.minusDays(1), visit(0, "S"), visit(0, "B")).reason());
        assertEquals(List.of("k7066-like"), trains(search(30, DAY, visit(0, "B"), visit(0, "C")), 0));
    }

    @Test
    void cannotUseAnAnomalousAlightingTimeToConnectToAnotherTrain() {
        train("invalid-arrival", DAY, "A", 100, "X", 200);
        stops.get(1).departureSeconds = 195 * 60;
        train("onward", DAY, "X", 240, "B", 300);

        assertEquals("NO_ROUTE", search(30, DAY, visit(0, "A"), visit(0, "B")).reason());
    }

    @Test
    void canUseMoreThanOneTransferAndSkipsCrossStationWithoutEvidence() {
        train("first", DAY, "A", 100, "X", 200);
        train("different-station", DAY, "X2", 240, "B", 400);
        train("second", DAY, "X", 240, "Y", 400);
        train("third", DAY, "Y", 450, "B", 600);

        assertEquals(List.of("first", "second", "third"),
                trains(search(30, DAY, visit(0, "A"), visit(0, "B")), 0));
    }

    @Test
    void checksDirectedCrossStationEvidenceAndCallerBufferAcrossMidnight() throws Exception {
        train("night", DAY, "A", 1430, "X", 1450);
        train("next-day", DAY.plusDays(1), "Y", 60, "B", 100);
        train("reverse-first", DAY, "D", 300, "Y", 400);
        train("reverse-second", DAY, "X", 470, "E", 500);
        var eligible = Map.of("X", new CityCatalog.Station("hub", null, "", "X"),
                "Y", new CityCatalog.Station("hub", null, "", "Y"));
        var evidence = CrossStationTransfers.read(new StringReader("""
                from_stop_id,to_stop_id,transfer_type,min_transfer_time
                X,Y,2,1200
                """), eligible);
        var schedule = RailTimetable.index(1, stops, calendar);
        var visits = List.of(visit(0, "A"), visit(0, "B"));
        var search = new CityPlanner.Search(schedule, visits, DAY.plusDays(1), 1800, Map.of(), evidence);
        var result = search.from(0, DAY);
        assertNull(result.reason());
        assertEquals(List.of("night", "next-day"), trains(result, 0));
        assertEquals(1, result.transfers());
        var rides = result.paths().get(0).rides();
        assertEquals(new CityPlanner.Connection("X", "Y", true, 1200, 1800, 3000, "transfers.txt"),
                search.connection(rides.get(0), rides.get(1)));
        assertEquals("NO_ROUTE", new CityPlanner.Search(schedule, visits, DAY.plusDays(1), 1860,
                Map.of(), evidence).from(0, DAY).reason());
        assertEquals("NO_ROUTE", new CityPlanner.Search(schedule, visits, DAY.plusDays(1), 1800,
                Map.of(), Map.of()).from(0, DAY).reason());
        assertEquals("NO_ROUTE", new CityPlanner.Search(schedule, List.of(visit(0, "D"), visit(0, "E")),
                DAY.plusDays(1), 1800, Map.of(), evidence).from(0, DAY).reason());
    }

    @Test
    void excludesScopedAndCrossCityEvidence() throws Exception {
        var stations = Map.of("X", new CityCatalog.Station("hub", null, "", "X"),
                "Y", new CityCatalog.Station("hub", null, "", "Y"),
                "Z", new CityCatalog.Station("outside", null, "", "Z"));
        var evidence = CrossStationTransfers.read(new StringReader("""
                from_stop_id,to_stop_id,transfer_type,min_transfer_time,from_trip_id
                X,Y,2,1200,
                X,Y,3,,blocked
                Y,Z,2,1200,
                Z,X,2,1200,
                """), stations);
        assertEquals(Map.of("X", Map.of()), evidence);
    }

    @Test
    void crossStationEvidenceAppliesOnlyToTheActualArrivalAndDepartureCodes() throws Exception {
        train("earlier-alias", DAY, "A", 590, "X-ALIAS", 650);
        train("documented-arrival", DAY, "A", 600, "X", 660);
        train("documented-departure", DAY, "Y", 710, "B", 800);
        train("departure-alias", DAY, "Y-ALIAS", 720, "C", 810);
        train("alias-only-arrival", DAY, "D", 600, "X-ALIAS", 660);
        var schedule = RailTimetable.index(1, stops, calendar);
        var groups = Map.of("X", List.of("X", "X-ALIAS"), "Y", List.of("Y", "Y-ALIAS"));
        var evidence = CrossStationTransfers.read(new StringReader("""
                from_stop_id,to_stop_id,transfer_type,min_transfer_time
                X,Y,2,1200
                """), Map.of("X", new CityCatalog.Station("hub", null, "", "X"),
                "Y", new CityCatalog.Station("hub", null, "", "Y")));
        var documented = new CityPlanner.Search(schedule, List.of(visit(0, "A"), visit(0, "B")),
                DAY, 1800, groups, evidence).from(0, DAY);
        assertEquals(List.of("documented-arrival", "documented-departure"), trains(documented, 0));
        assertEquals("NO_ROUTE", new CityPlanner.Search(schedule, List.of(visit(0, "A"), visit(0, "C")),
                DAY, 1800, groups, evidence).from(0, DAY).reason());
        assertEquals("NO_ROUTE", new CityPlanner.Search(schedule, List.of(visit(0, "D"), visit(0, "B")),
                DAY, 1800, groups, evidence).from(0, DAY).reason());
    }

    @Test
    void reportsOutOfCoverageAtContinuationAndRetainsSuccessfulPrefix() {
        train("first", DAY, "A", 100, "X", 200);
        var result = new CityPlanner.Search(RailTimetable.index(1, stops, calendar),
                List.of(visit(0, "A"), visit(1, "X"), visit(0, "B")), DAY, 1800, Map.of(), Map.of()).from(0, DAY);
        assertEquals("DATE_OUTSIDE_COVERAGE", result.reason());
        assertEquals(1, result.failureIndex());
        assertEquals(List.of("first"), trains(result, 0));
    }

    @Test
    void transfersBetweenGtfsCodesForTheSamePhysicalStation() {
        train("first", DAY, "A", 100, "X", 200);
        train("second", DAY, "X-ALIAS", 240, "B", 400);
        var result = new CityPlanner.Search(RailTimetable.index(1, stops, calendar),
                List.of(visit(0, "A"), visit(0, "B")), DAY, 1800,
                Map.of("X", List.of("X", "X-ALIAS")), Map.of()).from(0, DAY);
        assertEquals(List.of("first", "second"), trains(result, 0));
        assertEquals("X-ALIAS", result.paths().get(0).rides().get(1).boarding().stop().stopId);
    }

    private CityPlanner.Attempt search(int transferMinutes, LocalDate date, CityPlanner.Visit... visits) {
        return new CityPlanner.Search(RailTimetable.index(1, stops, calendar), List.of(visits),
                DAY.plusDays(5), transferMinutes * 60L, Map.of(), Map.of()).from(0, date);
    }

    private static CityPlanner.Visit visit(int stayDays, String... stations) {
        List<String> ids = List.of(stations);
        return new CityPlanner.Visit(new CityPlanner.Node(stations[0], null, null, stayDays), ids, ids);
    }

    private static List<String> trains(CityPlanner.Attempt result, int leg) {
        return result.paths().get(leg).rides().stream().map(r -> r.boarding().stop().tripId).toList();
    }

    private void train(String id, LocalDate date, String from, int departure, String to, int arrival) {
        var day = new ServiceDay();
        day.serviceId = id;
        day.serviceDate = date;
        calendar.add(day);
        stop(id, from, 1, departure);
        stop(id, to, 2, arrival);
    }

    private void stop(String id, String stopId, int sequence, int minutes) {
        var stop = new ScheduledStop();
        stop.tripId = id;
        stop.serviceId = id;
        stop.stopId = stopId;
        stop.stopSequence = sequence;
        stop.arrivalSeconds = minutes * 60;
        stop.departureSeconds = minutes * 60;
        stops.add(stop);
    }
}
