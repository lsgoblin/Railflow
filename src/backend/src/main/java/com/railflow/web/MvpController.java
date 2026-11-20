package com.railflow.web;

import com.railflow.importer.FixedPackage;
import com.railflow.web.dto.MvpDtos;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only MVP API (docs/design/mvp-contract.md §5). Historical public data, no login, no user
 * resources and no admin endpoints. Every parameter is validated manually so that failures use
 * the contract's 422 VALIDATION_FAILED instead of framework defaults.
 */
@RestController
@RequestMapping("/api/mvp")
@Profile("web")
public class MvpController {

    private final DatasetResolver datasetResolver;
    private final StationService stationService;
    private final TripService tripService;
    private final GeometryService geometryService;
    private final ImportHistoryService importHistoryService;

    public MvpController(DatasetResolver datasetResolver, StationService stationService, TripService tripService,
                         GeometryService geometryService, ImportHistoryService importHistoryService) {
        this.datasetResolver = datasetResolver;
        this.stationService = stationService;
        this.tripService = tripService;
        this.geometryService = geometryService;
        this.importHistoryService = importHistoryService;
    }

    @GetMapping("/context")
    public MvpDtos.Context context() {
        DatasetResolver.Resolved resolved = datasetResolver.resolveActive();
        return new MvpDtos.Context(datasetResolver.toDto(resolved), FixedPackage.DEFAULT_REFERENCE_SERVICE_DATE,
                "SELECTABLE_REFERENCE_SERVICE_DATE", "Asia/Shanghai",
                new MvpDtos.Capabilities(true, false, false, true), ServiceDateTimes.REPLAY_LABEL);
    }

    @GetMapping("/stations")
    public MvpDtos.StationPage stations(@RequestParam(name = "datasetVersion", required = false) String datasetVersion,
                                        @RequestParam(name = "q", required = false) String q,
                                        @RequestParam(name = "offset", required = false) String offset,
                                        @RequestParam(name = "limit", required = false) String limit) {
        return stationService.search(datasetVersion, q, offset, limit);
    }

    @GetMapping("/trips")
    public MvpDtos.TripSearch trips(@RequestParam(name = "datasetVersion", required = false) String datasetVersion,
                                    @RequestParam(name = "fromStopId", required = false) String fromStopId,
                                    @RequestParam(name = "toStopId", required = false) String toStopId,
                                    @RequestParam(name = "referenceServiceDate", required = false)
                                    String referenceServiceDate) {
        return tripService.search(datasetVersion, fromStopId, toStopId, referenceServiceDate);
    }

    @GetMapping("/trips/{tripId}/stops")
    public MvpDtos.TripStops stops(@PathVariable("tripId") String tripId,
                                   @RequestParam(name = "datasetVersion", required = false) String datasetVersion,
                                   @RequestParam(name = "referenceServiceDate", required = false)
                                   String referenceServiceDate) {
        return tripService.stops(datasetVersion, tripId, referenceServiceDate);
    }

    @GetMapping("/trips/{tripId}/geometry")
    public MvpDtos.SegmentGeometry geometry(@PathVariable("tripId") String tripId,
                                            @RequestParam(name = "datasetVersion", required = false)
                                            String datasetVersion,
                                            @RequestParam(name = "referenceServiceDate", required = false)
                                            String referenceServiceDate,
                                            @RequestParam(name = "fromStopId", required = false) String fromStopId,
                                            @RequestParam(name = "toStopId", required = false) String toStopId,
                                            @RequestParam(name = "boardSequence", required = false)
                                            String boardSequence,
                                            @RequestParam(name = "alightSequence", required = false)
                                            String alightSequence) {
        return geometryService.segment(datasetVersion, tripId, referenceServiceDate, fromStopId, toStopId,
                boardSequence, alightSequence);
    }

    @GetMapping("/datasets/{datasetVersion}/imports")
    public MvpDtos.ImportPage imports(@PathVariable("datasetVersion") String datasetVersion,
                                      @RequestParam(name = "offset", required = false) String offset,
                                      @RequestParam(name = "limit", required = false) String limit) {
        return importHistoryService.page(datasetVersion, offset, limit);
    }
}
