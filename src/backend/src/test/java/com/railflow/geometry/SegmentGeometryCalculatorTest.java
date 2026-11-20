package com.railflow.geometry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.railflow.geometry.SegmentGeometryCalculator.Point;
import com.railflow.geometry.SegmentGeometryCalculator.Result;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Algorithm regression for docs/design/mvp-contract.md §7, including the short-reversal counter
 * example that the independent review used to reject the first contract draft.
 */
class SegmentGeometryCalculatorTest {

    private static final double ORIGIN_LAT = 30.0;
    private static final double ORIGIN_LON = 120.0;

    /** Converts metres in a local east/north plane around (ORIGIN_LAT, ORIGIN_LON) to WGS84. */
    private static Point metres(double east, double north) {
        double lat = ORIGIN_LAT + Math.toDegrees(north / SegmentGeometryCalculator.EARTH_RADIUS_METERS);
        double lon = ORIGIN_LON + Math.toDegrees(east
                / (SegmentGeometryCalculator.EARTH_RADIUS_METERS * Math.cos(Math.toRadians(ORIGIN_LAT))));
        return new Point(lat, lon);
    }

    private static List<Point> shape(double[][] metres) {
        List<Point> points = new ArrayList<>();
        for (double[] pair : metres) {
            points.add(metres(pair[0], pair[1]));
        }
        return points;
    }

    @Test
    void shortReversalKeepsBothPassesAndIsAmbiguous() {
        // Counter example of contract §7: two passes of the same station 190 m apart along the line.
        List<Point> shape = shape(new double[][]{
                {-2000, 0}, {-75, 0}, {75, 0}, {75, 40}, {-75, 40}, {-2000, 40}
        });
        List<Point> stops = List.of(metres(0, 0), metres(-2000, 40));
        Result result = new SegmentGeometryCalculator().compute(shape, stops, 0, 1);

        assertEquals("UNAVAILABLE", result.status());
        assertEquals("BOUNDARY_AMBIGUOUS", result.reason());
        assertTrue(result.points().isEmpty());
        assertNull(result.fromDistanceMeters());
    }

    @Test
    void stationExactlyOnSharedVertexHasSingleCandidate() {
        List<Point> shape = shape(new double[][]{{0, 0}, {1000, 0}, {2000, 0}});
        List<Point> stops = List.of(metres(1000, 0), metres(2000, 0));
        Result result = new SegmentGeometryCalculator().compute(shape, stops, 0, 1);

        assertTrue(result.ready(), "expected READY, got " + result.status() + "/" + result.reason());
        assertNotNull(result.fromDistanceMeters());
        assertTrue(result.fromDistanceMeters() <= 0.01, "distance " + result.fromDistanceMeters());
        assertEquals(2, result.points().size());
    }

    @Test
    void nonAdjacentSameCoordinateKeepsTwoCandidates() {
        // The station coordinate appears at both the start and the end of the polyline.
        List<Point> shape = shape(new double[][]{{0, 0}, {1000, 0}, {1000, 500}, {0, 500}, {0, 0}});
        List<SegmentGeometryCalculator.Candidate> candidates = SegmentGeometryCalculator.candidatesForStop(shape,
                SegmentGeometryCalculator.cumulative(shape), metres(0, 0));

        assertEquals(2, candidates.size(), "both passes must be kept");
        assertTrue(candidates.get(0).s() < candidates.get(1).s());
        assertTrue(candidates.get(1).s() - candidates.get(0).s() > 1000);
    }

    @Test
    void boardAfterAlightIsUnresolvedInsteadOfReversed() {
        List<Point> shape = shape(new double[][]{{0, 0}, {1000, 0}, {2000, 0}});
        List<Point> stops = List.of(metres(1500, 0), metres(500, 0));
        Result result = new SegmentGeometryCalculator().compute(shape, stops, 0, 1);

        assertEquals("UNAVAILABLE", result.status());
        assertEquals("BOUNDARY_UNRESOLVED", result.reason());
    }

    @Test
    void alightStopThreeHundredMetresFromShapeIsUnresolved() {
        List<Point> shape = shape(new double[][]{{0, 0}, {2000, 0}});
        List<Point> stops = List.of(metres(0, 0), metres(1000, 300));
        Result result = new SegmentGeometryCalculator().compute(shape, stops, 0, 1);

        assertEquals("UNAVAILABLE", result.status());
        assertEquals("BOUNDARY_UNRESOLVED", result.reason());
    }

    @Test
    void clippedSegmentDoesNotExtendBeyondAlightStop() {
        List<Point> shape = shape(new double[][]{{0, 0}, {1000, 0}, {2000, 0}, {3000, 0}});
        List<Point> stops = List.of(metres(1000, 0), metres(2000, 0));
        Result result = new SegmentGeometryCalculator().compute(shape, stops, 0, 1);

        assertTrue(result.ready());
        List<double[]> points = result.points();
        double firstEast = east(points.get(0));
        double lastEast = east(points.get(points.size() - 1));
        assertTrue(Math.abs(firstEast - 1000) < 1.0, "first point east=" + firstEast);
        assertTrue(Math.abs(lastEast - 2000) < 1.0, "last point east=" + lastEast);
        assertEquals(2, points.size(), "no intermediate shape point between the two boundaries");
    }

    @Test
    void shapeWithFewerThanTwoPointsIsInvalid() {
        Result result = new SegmentGeometryCalculator().compute(List.of(metres(0, 0)),
                List.of(metres(0, 0), metres(1000, 0)), 0, 1);
        assertEquals("UNAVAILABLE", result.status());
        assertEquals("INVALID_SHAPE", result.reason());
    }

    @Test
    void invalidStationCoordinateIsReported() {
        List<Point> shape = shape(new double[][]{{0, 0}, {1000, 0}});
        List<Point> stops = new ArrayList<>();
        stops.add(new Point(Double.NaN, 120.0));
        stops.add(metres(1000, 0));
        Result result = new SegmentGeometryCalculator().compute(shape, stops, 0, 1);
        assertEquals("UNAVAILABLE", result.status());
        assertEquals("INVALID_STATION_COORDINATE", result.reason());
    }

    @Test
    void adjacentDuplicateCoordinatesAreCollapsedBeforeProjection() {
        List<Point> shape = shape(new double[][]{{0, 0}, {0, 0}, {1000, 0}, {1000, 0}, {2000, 0}});
        List<Point> stops = List.of(metres(0, 0), metres(2000, 0));
        Result result = new SegmentGeometryCalculator().compute(shape, stops, 0, 1);
        assertTrue(result.ready());
        assertFalse(result.points().size() > 4);
    }

    private static double east(double[] lonLat) {
        double lon = lonLat[0];
        return Math.toRadians(lon - ORIGIN_LON) * SegmentGeometryCalculator.EARTH_RADIUS_METERS
                * Math.cos(Math.toRadians(ORIGIN_LAT));
    }
}
