package com.railflow.web.model;

import java.math.BigDecimal;

/** Row of {@code gtfs_stop_time} joined with the stop name and coordinates. */
public class StopTimeRow {

    public String tripId;
    public String stopId;
    public String stopName;
    public int stopSequence;
    public String arrivalTime;
    public String departureTime;
    public int arrivalSeconds;
    public int departureSeconds;
    public BigDecimal stopLat;
    public BigDecimal stopLon;
}
