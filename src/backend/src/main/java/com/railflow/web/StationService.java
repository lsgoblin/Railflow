package com.railflow.web;

import com.railflow.web.dto.MvpDtos;
import com.railflow.web.mapper.StationMapper;
import com.railflow.web.model.StationRow;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/** Station search by literal name/ID containment inside the active dataset version. */
@Service
public class StationService {

    private final DatasetResolver datasetResolver;
    private final StationMapper stationMapper;

    public StationService(DatasetResolver datasetResolver, StationMapper stationMapper) {
        this.datasetResolver = datasetResolver;
        this.stationMapper = stationMapper;
    }

    public MvpDtos.StationPage search(String datasetVersion, String q, String offsetRaw, String limitRaw) {
        // Format validation before any version lookup or database access (task 20261118-19).
        String version = Params.requireText(datasetVersion, "datasetVersion", 64);
        String query = Params.requireText(q, "q", 64);
        int offset = Params.optionalInt(offsetRaw, "offset", 0, 0, Integer.MAX_VALUE);
        int limit = Params.optionalInt(limitRaw, "limit", 50, 1, 100);
        DatasetResolver.Resolved resolved = datasetResolver.resolve(version);
        String escaped = Params.escapeLike(query);
        long datasetId = resolved.row().id;

        List<StationRow> rows = stationMapper.search(datasetId, escaped, limit, offset);
        long total = stationMapper.countSearch(datasetId, escaped);
        List<MvpDtos.Station> items = new ArrayList<>(rows.size());
        for (StationRow row : rows) {
            items.add(new MvpDtos.Station(row.stopId, row.stopName, row.stopLon, row.stopLat, "WGS84",
                    row.locationType));
        }
        return new MvpDtos.StationPage(resolved.row().versionName, items, total, offset, limit,
                (long) offset + items.size() < total);
    }
}
