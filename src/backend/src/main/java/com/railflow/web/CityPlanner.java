package com.railflow.web;

import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import com.railflow.web.RailTimetable.Boarding;
import com.railflow.web.RailTimetable.Ride;
import com.railflow.web.dto.MvpDtos;
import com.railflow.web.model.DatasetRow;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("web")
public class CityPlanner {

    private static final String NO_ROUTE = "NO_ROUTE";
    private static final Comparator<Path> PATH_ORDER = Comparator.comparingInt(Path::targetRank)
            .thenComparingLong(Path::firstDeparture);
    private final DatasetResolver datasets;
    private final CityCatalog catalog;
    private final RailTimetable timetable;

    public CityPlanner(DatasetResolver datasets, CityCatalog catalog, RailTimetable timetable) {
        this.datasets = datasets;
        this.catalog = catalog;
        this.timetable = timetable;
    }

    public Plan plan(Request request) {
        if (request == null || request.nodes() == null || request.nodes().size() < 2) {
            throw invalid("行程至少需要两个城市节点");
        }
        String version = Params.requireText(request.datasetVersion(), "datasetVersion", 64);
        LocalDate departure = Params.requireIsoDate(request.departureDate(), "departureDate");
        LocalDate reference = Params.requireIsoDate(request.referenceDate(), "referenceDate");
        if (departure.getYear() < 1 || departure.getYear() > 9999) {
            throw invalid("departureDate 年份超出范围");
        }
        int minimumTransfer = positiveInteger(request.minimumTransferMinutes(), "minimumTransferMinutes");
        var resolved = datasets.resolve(version);
        DatasetRow dataset = resolved.row();
        datasets.requireCoverage(dataset, reference);
        var directory = catalog.load(dataset);
        var nodes = new ArrayList<Visit>();
        for (int i = 0; i < request.nodes().size(); i++) {
            NodeInput node = request.nodes().get(i);
            if (node == null) {
                throw invalid("城市节点不能为空");
            }
            String id = Params.requireText(node.cityId(), "cityId", 64);
            var city = directory.requireCity(id);
            boolean intermediate = i > 0 && i < request.nodes().size() - 1;
            int stay = 0;
            if (intermediate) {
                stay = node.stayDays() == null ? 1 : positiveInteger(node.stayDays(), "stayDays");
            } else if (node.stayDays() != null && node.stayDays().signum() != 0) {
                positiveInteger(node.stayDays(), "stayDays");
            }
            var arrivals = candidates(city, node.arrivalStopId());
            var departures = candidates(city, node.departureStopId());
            nodes.add(new Visit(new Node(id, node.arrivalStopId() == null ? null : arrivals.get(0),
                    node.departureStopId() == null ? null : departures.get(0), stay), arrivals, departures));
        }
        long offset = ChronoUnit.DAYS.between(reference, departure);
        var search = new Search(timetable.load(dataset.id), nodes, dataset.coverageEnd,
                minimumTransfer * 60L, directory.stopCodesByGroup(), CrossStationTransfers.load(resolved, directory));
        Attempt attempt = search.from(0, reference);
        List<Leg> legs = new ArrayList<>();
        for (int i = 0; i < attempt.paths().size(); i++) {
            Path path = attempt.paths().get(i);
            List<Train> trains = new ArrayList<>();
            var rides = path.rides();
            var connections = new ArrayList<Connection>();
            for (int j = 0; j < rides.size(); j++) {
                Ride ride = rides.get(j);
                LocalDate serviceDay = ride.boarding().run().serviceDate();
                LocalDate displayDay = serviceDay.plusDays(offset);
                var from = directory.stations().get(ride.boarding().stop().stopId);
                var to = directory.stations().get(ride.to().stopId);
                trains.add(new Train(serviceDay, from.cityId(), to.cityId(), ride.summary(),
                        ServiceDateTimes.dateTime(displayDay, ride.boarding().stop().departureSeconds),
                        ServiceDateTimes.dateTime(displayDay, ride.to().arrivalSeconds), from.station(), to.station()));
                if (j > 0) {
                    connections.add(search.connection(rides.get(j - 1), ride));
                }
            }
            legs.add(new Leg(i, nodes.get(i).node().cityId(), nodes.get(i + 1).node().cityId(),
                    connections.size(), List.copyOf(trains), List.copyOf(connections)));
        }
        return new Plan(version, departure, reference, offset, nodes.stream().map(Visit::node).toList(),
                List.copyOf(legs), attempt.failureIndex(), attempt.reason());
    }

    private static List<String> candidates(CityCatalog.CityDetail city, String requested) {
        if (requested == null) {
            return city.stations().stream().map(s -> s.station().stopId()).toList();
        }
        String stopId = Params.requireText(requested, "stopId", 128);
        if (city.stations().stream().noneMatch(s -> s.station().stopId().equals(stopId))) {
            throw invalid("指定车站不属于节点城市 " + city.city().name());
        }
        return List.of(stopId);
    }

    private static ApiException invalid(String message) {
        return new ApiException(ErrorCode.VALIDATION_FAILED, message);
    }

    private static int positiveInteger(BigDecimal value, String parameter) {
        if (value != null) {
            try {
                int integer = value.intValueExact();
                if (integer > 0) {
                    return integer;
                }
            } catch (ArithmeticException ignored) {
                // Reject fractional or overflowing values without truncation.
            }
        }
        throw invalid(parameter + " 必须为正整数");
    }

    static class Search {
        private final RailTimetable.Snapshot schedule;
        private final List<Visit> nodes;
        private final LocalDate coverageEnd;
        private final long transferSeconds;
        private final Map<String, List<String>> codesByGroup;
        private final Map<String, Map<String, Integer>> crossStationSeconds;
        private final Map<String, String> groupsByCode = new HashMap<>();
        private final Map<Step, Attempt> memo = new HashMap<>();

        Search(RailTimetable.Snapshot schedule, List<Visit> nodes, LocalDate coverageEnd, long transferSeconds,
               Map<String, List<String>> codesByGroup, Map<String, Map<String, Integer>> crossStationSeconds) {
            this.schedule = schedule;
            this.nodes = nodes;
            this.coverageEnd = coverageEnd;
            this.transferSeconds = transferSeconds;
            this.codesByGroup = codesByGroup;
            this.crossStationSeconds = crossStationSeconds;
            codesByGroup.forEach((group, codes) -> {
                if (codes.size() > 1) {
                    codes.forEach(code -> groupsByCode.put(code, group));
                }
            });
        }

        Attempt from(int index, LocalDate day) {
            if (index == nodes.size() - 1) {
                return new Attempt(List.of(), null, null, 0);
            }
            Step step = new Step(index, day);
            Attempt result = memo.get(step);
            if (result == null) {
                result = search(index, day);
                memo.put(step, result);
            }
            return result;
        }

        private Attempt search(int index, LocalDate day) {
            if (day.isAfter(coverageEnd)) {
                return new Attempt(List.of(), index, ErrorCode.DATE_OUTSIDE_COVERAGE.name(), 0);
            }
            long start = RailTimetable.midnight(day);
            long end = RailTimetable.midnight(day.plusDays(1));
            List<String> origins = nodes.get(index).departure();
            Map<String, Integer> targets = new HashMap<>();
            List<String> arrivals = nodes.get(index + 1).arrival();
            for (int i = 0; i < arrivals.size(); i++) {
                targets.put(arrivals.get(i), i);
            }

            Attempt best = new Attempt(List.of(), index, NO_ROUTE, 0);
            long lastArrival = arrivals.stream().mapToLong(code -> schedule.lastArrivals().getOrDefault(code, 0L))
                    .max().orElseThrow();
            if (lastArrival < start) {
                return best;
            }
            var destination = new Query(targets, lastArrival);
            for (String origin : origins) {
                Map<Destination, Path> options = new LinkedHashMap<>();
                scan(origin, null, start, end, destination, options, null);
                best = continueWith(index, options, best, 0);
                if (best.reason() == null && best.transfers() == 0) {
                    return best;
                }
            }
            // Any remaining candidate needs at least one transfer on this leg alone.
            if (best.reason() == null && best.transfers() == 1) {
                return best;
            }

            // Each round adds one train. Earlier arrivals reached in fewer rounds dominate at
            // transfer stations because they can wait for the very same onward departures.
            List<Frontier> frontiers = new ArrayList<>();
            for (String origin : origins) {
                var frontier = new Frontier(origin);
                scan(origin, null, start, end, destination, null, frontier);
                frontiers.add(frontier);
            }
            for (int transfers = 1; (best.reason() != null || transfers < best.transfers())
                    && frontiers.stream().anyMatch(f -> !f.next.isEmpty()); transfers++) {
                for (Frontier frontier : frontiers) {
                    Map<TransferPoint, Trace> current = frontier.next;
                    frontier.next = new LinkedHashMap<>();
                    Map<Destination, Path> options = new LinkedHashMap<>();
                    for (var entry : current.entrySet()) {
                        Trace previous = entry.getValue();
                        TransferPoint point = entry.getKey();
                        long earliest = previous.ride().arrival() + transferSeconds;
                        for (String stop : codesByGroup.getOrDefault(point.group(), List.of(point.group()))) {
                            scan(stop, previous, earliest, destination.lastArrival() + 1, destination, options, frontier);
                        }
                        if (point.crossStationArrival() != null) {
                            for (var cross : crossStationSeconds.get(point.crossStationArrival()).entrySet()) {
                                scan(cross.getKey(), previous, earliest + cross.getValue(),
                                        destination.lastArrival() + 1, destination, options, frontier);
                            }
                        }
                    }
                    best = continueWith(index, options, best, transfers);
                    if (best.reason() == null && best.transfers() == transfers) {
                        return best;
                    }
                }
            }
            return best;
        }

        Connection connection(Ride previous, Ride next) {
            String arrival = previous.to().stopId;
            String departure = next.boarding().stop().stopId;
            String fromGroup = groupOf(arrival);
            String toGroup = groupOf(departure);
            boolean cross = !fromGroup.equals(toGroup);
            int seconds = cross ? crossStationSeconds.get(arrival).get(departure) : 0;
            return new Connection(arrival, departure, cross, seconds, transferSeconds,
                    next.boarding().departure() - previous.arrival(), cross ? "transfers.txt" : null);
        }

        private void scan(String from, Trace previous, long start, long end, Query query,
                          Map<Destination, Path> options, Frontier frontier) {
            String originGroup = groupOf(frontier == null ? from : frontier.origin);
            for (Boarding board : schedule.departures(from, start)) {
                if (board.departure() >= end || board.departure() > query.lastArrival()) {
                    break;
                }
                if (board.stop().arrivalSeconds > board.stop().departureSeconds
                        || (previous != null && previous.ride().boarding().run() == board.run())) {
                    continue;
                }
                var calls = board.run().calls();
                for (int j = board.index() + 1; j < calls.size(); j++) {
                    var alight = calls.get(j);
                    if (alight.arrivalSeconds < calls.get(j - 1).departureSeconds
                            || alight.arrivalSeconds > alight.departureSeconds) {
                        break;
                    }
                    long arrival = board.run().midnight() + alight.arrivalSeconds;
                    if (arrival > query.lastArrival()) {
                        break;
                    }
                    if (groupOf(alight.stopId).equals(originGroup)) {
                        continue;
                    }
                    Integer rank = query.targets().get(alight.stopId);
                    if (rank != null) {
                        if (options != null) {
                            var destination = new Destination(rank, RailTimetable.day(arrival));
                            long departure = previous == null ? board.departure() : previous.firstDeparture();
                            Path old = options.get(destination);
                            if (old == null || departure < old.firstDeparture()) {
                                var trace = new Trace(previous, new Ride(board, j, arrival), departure);
                                options.put(destination, new Path(rank, trace));
                            }
                        }
                    } else if (frontier != null) {
                        // Earlier arrivals at another group member may have different cross-station edges.
                        String crossStationArrival = crossStationSeconds.getOrDefault(alight.stopId, Map.of()).isEmpty()
                                ? null : alight.stopId;
                        var point = new TransferPoint(groupOf(alight.stopId), crossStationArrival);
                        if (arrival < frontier.earliest.getOrDefault(point, Long.MAX_VALUE)) {
                            frontier.earliest.put(point, arrival);
                            long departure = previous == null ? board.departure() : previous.firstDeparture();
                            frontier.next.put(point, new Trace(previous, new Ride(board, j, arrival), departure));
                        }
                    }
                }
            }
        }

        private String groupOf(String stopId) {
            return groupsByCode.getOrDefault(stopId, stopId);
        }

        private Attempt continueWith(int index, Map<Destination, Path> options, Attempt best, int transfers) {
            for (Path path : options.values().stream().sorted(PATH_ORDER).toList()) {
                LocalDate next = RailTimetable.day(path.arrival()).plusDays(nodes.get(index + 1).node().stayDays());
                Attempt rest = from(index + 1, next);
                if (rest.reason() == null) {
                    if (best.reason() != null || transfers + rest.transfers() < best.transfers()) {
                        best = rest.prepend(path, transfers);
                    }
                    if (best.transfers() == transfers) {
                        break;
                    }
                } else if (best.reason() != null && (rest.failureIndex() > best.failureIndex()
                        || (rest.failureIndex().equals(best.failureIndex())
                        && rest.reason().equals(NO_ROUTE) && !best.reason().equals(NO_ROUTE)))) {
                    best = rest.prepend(path, transfers);
                }
            }
            return best;
        }
    }

    private record Query(Map<String, Integer> targets, long lastArrival) {
    }

    private record TransferPoint(String group, String crossStationArrival) {
    }

    private static class Frontier {
        private final String origin;
        private final Map<TransferPoint, Long> earliest = new HashMap<>();
        private Map<TransferPoint, Trace> next = new LinkedHashMap<>();

        Frontier(String origin) {
            this.origin = origin;
        }
    }

    private record Step(int index, LocalDate day) {
    }

    private record Destination(int rank, LocalDate day) {
    }

    private record Trace(Trace previous, Ride ride, long firstDeparture) {
    }

    record Path(int targetRank, Trace end) {
        long firstDeparture() {
            return end.firstDeparture();
        }

        long arrival() {
            return end.ride().arrival();
        }

        List<Ride> rides() {
            var rides = new ArrayList<Ride>();
            for (Trace trace = end; trace != null; trace = trace.previous()) {
                rides.add(trace.ride());
            }
            Collections.reverse(rides);
            return rides;
        }
    }

    record Visit(Node node, List<String> arrival, List<String> departure) {
    }

    record Attempt(List<Path> paths, Integer failureIndex, String reason, int transfers) {
        Attempt prepend(Path path, int legTransfers) {
            List<Path> parts = new ArrayList<>();
            parts.add(path);
            parts.addAll(paths);
            return new Attempt(List.copyOf(parts), failureIndex, reason, legTransfers + transfers);
        }
    }

    public record Node(String cityId, String arrivalStopId, String departureStopId, Integer stayDays) {
    }

    public record NodeInput(String cityId, String arrivalStopId, String departureStopId, BigDecimal stayDays) {
    }

    public record Request(String datasetVersion, String departureDate, String referenceDate,
                          BigDecimal minimumTransferMinutes, List<NodeInput> nodes) {
    }

    public record Train(LocalDate referenceServiceDate, String fromCityId, String toCityId, MvpDtos.TripSummary trip,
                        String departureDateTime, String arrivalDateTime, MvpDtos.Station fromStation,
                        MvpDtos.Station toStation) {
    }

    public record Connection(String arrivalStopId, String departureStopId, boolean crossStation,
                             int transferSeconds, long bufferSeconds, long availableSeconds, String source) {
    }

    public record Leg(int index, String fromCityId, String toCityId, int transfers, List<Train> trains,
                      List<Connection> connections) {
    }

    public record Plan(String datasetVersion, LocalDate departureDate, LocalDate referenceDate, long dateOffsetDays,
                       List<Node> nodes, List<Leg> legs, Integer failedLegIndex, String emptyReason) {
    }
}
