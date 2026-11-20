package com.railflow.web.model;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Row of {@code dataset_version}. */
public class DatasetRow {

    public long id;
    public String versionName;
    public String sha256;
    public String sourceUrl;
    public String feedVersion;
    public LocalDate coverageStart;
    public LocalDate coverageEnd;
    public String status;
    public LocalDateTime createdAt;
    public LocalDateTime activatedAt;
}
