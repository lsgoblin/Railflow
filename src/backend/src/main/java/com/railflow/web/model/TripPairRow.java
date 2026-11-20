package com.railflow.web.model;

/** One ordered board/alight stop pair of a trip, with the calendar hit flag for the query date. */
public class TripPairRow {

    public String tripId;
    public String routeId;
    public String serviceId;
    public String tripShortName;
    public String routeShortName;
    public String shapeId;

    public int boardSequence;
    public String boardStopId;
    public String boardStopName;
    public String boardArrivalTime;
    public String boardDepartureTime;
    public int boardArrivalSeconds;
    public int boardDepartureSeconds;

    public int alightSequence;
    public String alightStopId;
    public String alightStopName;
    public String alightArrivalTime;
    public String alightDepartureTime;
    public int alightArrivalSeconds;
    public int alightDepartureSeconds;

    /** 1 when the service runs on the requested reference service date. */
    public int runsOnDate;
}
