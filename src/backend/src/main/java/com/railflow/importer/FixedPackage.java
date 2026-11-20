package com.railflow.importer;

import java.time.LocalDate;
import java.util.List;

/**
 * Identity of the single fixed GTFS release accepted by this build
 * (docs/design/mvp-contract.md §2). Nothing here may be overridden by command-line
 * arguments: the importer refuses any other release, hash or file inventory.
 */
public final class FixedPackage {

    public static final String RELEASE_NAME = "gtfs-20261116-085531";
    public static final String FEED_VERSION = "20261116";
    public static final String SOURCE_URL =
            "https://github.com/wensimehrp/chinese-railway-gtfs/releases/download/gtfs-20261116-085531/output_gtfs.zip";
    public static final String SHA256 = "4D60E72512C4595B516A5E13BE41235C87620A1C39D38FD2310E1094A5D9666D";
    public static final long ZIP_BYTES = 73_465_159L;
    public static final LocalDate COVERAGE_START = LocalDate.of(2026, 11, 1);
    public static final LocalDate COVERAGE_END = LocalDate.of(2027, 2, 2);
    public static final String ATTRIBUTION =
            "wensimehrp (Jeremy Gao) / chinese-railway-gtfs, CC BY 4.0";
    public static final String DEFAULT_REFERENCE_SERVICE_DATE = "2026-11-16";

    /** One CSV file of the fixed package: name, exact header and fixed data-row count. */
    public record FileSpec(String fileName, String header, long rows) {
    }

    public static final List<FileSpec> FILES = List.of(
            new FileSpec("agency.txt", "agency_id,agency_name,agency_url,agency_timezone", 1),
            new FileSpec("calendar_dates.txt", "service_id,date,exception_type", 23_041),
            new FileSpec("feed_info.txt",
                    "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version", 1),
            new FileSpec("routes.txt", "route_id,agency_id,route_short_name,route_type", 11_806),
            new FileSpec("shapes.txt", "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence", 4_612_246),
            new FileSpec("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence", 109_793),
            new FileSpec("stops.txt", "stop_id,stop_name,stop_lat,stop_lon,location_type", 3_180),
            new FileSpec("translations.txt", "table_name,field_name,language,translation,record_id", 6_266),
            new FileSpec("trips.txt", "route_id,service_id,trip_id,trip_short_name,trip_headsign,shape_id", 11_806)
    );

    private FixedPackage() {
    }
}
