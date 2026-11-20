package com.railflow.web.model;

import java.time.LocalDateTime;

/** Row of {@code dataset_import_run}. */
public class ImportRunRow {

    public long id;
    public Long datasetId;
    public String requestedVersion;
    public String status;
    public LocalDateTime startedAt;
    public LocalDateTime finishedAt;
    public Long elapsedMs;
    public String errorCode;
    public String reportJson;
}
