package com.railflow.web;

import com.railflow.web.dto.MvpDtos;
import com.railflow.web.mapper.TimetableMapper;
import com.railflow.web.mapper.TimetableMapper.ScheduledStop;
import com.railflow.web.mapper.TimetableMapper.ServiceDay;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("web")
public class RailTimetable {

    private static final int SECONDS_PER_DAY = 86_400;
    private final TimetableMapper mapper;
    private Snapshot loaded;

    public RailTimetable(TimetableMapper mapper) {
        this.mapper = mapper;
    }

    public synchronized Snapshot load(long datasetId) {
        if (loaded == null || loaded.datasetId() != datasetId) {
            loaded = index(datasetId, mapper.findStops(datasetId), mapper.findServiceDays(datasetId));
        }
        return loaded;
    }

    static Snapshot index(long datasetId, List<ScheduledStop> stops, List<ServiceDay> serviceDays) {
        Map<String, List<LocalDate>> byService = new HashMap<>();
        for (ServiceDay day : serviceDays) {
            byService.computeIfAbsent(day.serviceId, ignored -> new ArrayList<>()).add(day.serviceDate);
        }
        Map<String, List<ScheduledStop>> trips = new LinkedHashMap<>();
        for (ScheduledStop stop : stops) {
            trips.computeIfAbsent(stop.tripId, ignored -> new ArrayList<>()).add(stop);
        }
        Map<String, List<Boarding>> byStop = new HashMap<>();
        Map<String, Long> lastArrivals = new HashMap<>();
        for (List<ScheduledStop> calls : trips.values()) {
            calls.sort(Comparator.comparingInt(s -> s.stopSequence));
            for (LocalDate date : byService.getOrDefault(calls.get(0).serviceId, List.of())) {
                Run run = new Run(date, calls);
                for (int i = 0; i < calls.size() - 1; i++) {
                    ScheduledStop stop = calls.get(i);
                    var boarding = new Boarding(run, i, run.midnight() + stop.departureSeconds);
                    byStop.computeIfAbsent(stop.stopId, ignored -> new ArrayList<>()).add(boarding);
                    ScheduledStop next = calls.get(i + 1);
                    lastArrivals.merge(next.stopId, run.midnight() + next.arrivalSeconds, Math::max);
                }
            }
        }
        Comparator<Boarding> order = Comparator.comparingLong(Boarding::departure)
                .thenComparing(b -> b.run().calls().get(0).tripId)
                .thenComparingInt(Boarding::index);
        byStop.replaceAll((stopId, boardings) -> {
            boardings.sort(order);
            return List.copyOf(boardings);
        });
        return new Snapshot(datasetId, Map.copyOf(byStop), Map.copyOf(lastArrivals));
    }

    static long midnight(LocalDate date) {
        return date.toEpochDay() * SECONDS_PER_DAY;
    }

    static LocalDate day(long seconds) {
        return LocalDate.ofEpochDay(Math.floorDiv(seconds, SECONDS_PER_DAY));
    }

    record Run(LocalDate serviceDate, List<ScheduledStop> calls) {
        long midnight() {
            return RailTimetable.midnight(serviceDate);
        }
    }

    record Boarding(Run run, int index, long departure) {
        ScheduledStop stop() {
            return run.calls().get(index);
        }
    }

    record Ride(Boarding boarding, int alightIndex, long arrival) {
        ScheduledStop to() {
            return boarding.run().calls().get(alightIndex);
        }

        MvpDtos.TripSummary summary() {
            ScheduledStop from = boarding.stop();
            ScheduledStop to = to();
            LocalDate date = boarding.run().serviceDate();
            return new MvpDtos.TripSummary(from.tripId + ":" + from.stopSequence + ":" + to.stopSequence,
                    from.tripId, TripService.trainName(from.tripShortName, from.routeShortName, from.tripId),
                    from.serviceId, from.shapeId, from.stopSequence, to.stopSequence,
                    TripService.stopTime(date, from), TripService.stopTime(date, to));
        }
    }

    record Snapshot(long datasetId, Map<String, List<Boarding>> byStop, Map<String, Long> lastArrivals) {
        List<Boarding> departures(String stopId, long earliest) {
            List<Boarding> result = byStop.getOrDefault(stopId, List.of());
            int low = 0;
            int high = result.size();
            while (low < high) {
                int mid = low + (high - low) / 2;
                if (result.get(mid).departure() < earliest) {
                    low = mid + 1;
                } else {
                    high = mid;
                }
            }
            return result.subList(low, result.size());
        }
    }
}
