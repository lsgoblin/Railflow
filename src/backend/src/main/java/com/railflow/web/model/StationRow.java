package com.railflow.web.model;

import java.math.BigDecimal;

/** Row of {@code gtfs_stop}. */
public class StationRow {

    public String stopId;
    public String stopName;
    public BigDecimal stopLat;
    public BigDecimal stopLon;
    public int locationType;
}
