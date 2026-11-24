package com.railflow.web;

import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/replay")
@Profile("web")
public class ReplayController {

    private final DatasetResolver datasets;
    private final CityCatalog catalog;
    private final CityPlanner planner;

    public ReplayController(DatasetResolver datasets, CityCatalog catalog, CityPlanner planner) {
        this.datasets = datasets;
        this.catalog = catalog;
        this.planner = planner;
    }

    @GetMapping("/cities")
    public Cities cities(@RequestParam(name = "datasetVersion", required = false) String version) {
        var dataset = datasets.resolve(version).row();
        var directory = catalog.load(dataset);
        return new Cities(dataset.versionName, directory.cities().values().stream().map(CityCatalog.CityDetail::city).toList(),
                directory.stations().size());
    }

    @GetMapping("/cities/{cityId}")
    public City city(@RequestParam(name = "datasetVersion", required = false) String version,
                     @PathVariable("cityId") String cityId) {
        String id = Params.requireText(cityId, "cityId", 64);
        var dataset = datasets.resolve(version).row();
        return new City(dataset.versionName, catalog.load(dataset).requireCity(id));
    }

    @GetMapping("/locations")
    public Locations locations(@RequestParam(name = "datasetVersion", required = false) String version,
                               @RequestParam(name = "q", required = false) String query,
                               @RequestParam(name = "offset", required = false) String offsetRaw,
                               @RequestParam(name = "limit", required = false) String limitRaw) {
        String q = Params.requireText(query, "q", 64);
        int offset = Params.optionalInt(offsetRaw, "offset", 0, 0, Integer.MAX_VALUE);
        int limit = Params.optionalInt(limitRaw, "limit", 50, 1, 100);
        var dataset = datasets.resolve(version).row();
        List<CityCatalog.Location> matches = catalog.load(dataset).search(q);
        int start = Math.min(offset, matches.size());
        int end = Math.min(start + limit, matches.size());
        return new Locations(dataset.versionName, matches.subList(start, end), matches.size(), offset, limit,
                end < matches.size());
    }

    @PostMapping("/plans")
    public CityPlanner.Plan plan(@RequestBody CityPlanner.Request request) {
        return planner.plan(request);
    }

    public record Cities(String datasetVersion, List<CityCatalog.City> items, int stationCount) {
    }

    public record City(String datasetVersion, CityCatalog.CityDetail item) {
    }

    public record Locations(String datasetVersion, List<CityCatalog.Location> items, int total, int offset,
                            int limit, boolean hasMore) {
    }
}
