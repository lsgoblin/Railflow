package com.railflow.geometry;

import java.util.ArrayList;
import java.util.List;

/**
 * Ordered shape projection and segment clipping (docs/design/mvp-contract.md §7).
 *
 * <p>The fixed package has no {@code shape_dist_traveled}, so station boundaries are located by
 * projecting every stop coordinate onto the shape polyline and keeping the local minima of the
 * along-line distance function. Candidates are then filtered by a non-decreasing chain over the
 * whole trip stop order. Only a unique candidate at both ends yields {@code READY}; short
 * reversals, repeated passes and unresolvable ordering return {@code UNAVAILABLE} instead of
 * silently picking the nearest point.
 */
public final class SegmentGeometryCalculator {

    public static final String METHOD = "ORDERED_PROJECTION_200M_V1";
    public static final double MAX_DISTANCE_METERS = 200.0;
    public static final double EARTH_RADIUS_METERS = 6_371_008.8;

    /** Candidates whose along-line distance differs by at most this are the same position. */
    static final double SAME_POSITION_METERS = 0.01;
    /** Epsilon for the untruncated projection parameter u. */
    static final double U_EPSILON = 1e-9;
    /** Epsilon for monotone chain comparisons in metres. */
    static final double CHAIN_EPSILON_METERS = 1e-6;

    public record Point(double lat, double lon) {
    }

    public record Candidate(double s, double distance, double lat, double lon) {
    }

    public record Result(String status, String reason, List<double[]> points, Double fromDistanceMeters,
                         Double toDistanceMeters) {

        public static Result unavailable(String reason) {
            return new Result("UNAVAILABLE", reason, List.of(), null, null);
        }

        public boolean ready() {
            return "READY".equals(status);
        }
    }

    public Result compute(List<Point> rawShape, List<Point> stops, int boardIndex, int alightIndex) {
        List<Point> shape = dedupeAdjacent(rawShape);
        if (shape.size() < 2) {
            return Result.unavailable("INVALID_SHAPE");
        }
        double[] s = cumulative(shape);

        List<List<Candidate>> candidates = new ArrayList<>(stops.size());
        for (Point stop : stops) {
            if (!isFinite(stop)) {
                return Result.unavailable("INVALID_STATION_COORDINATE");
            }
            candidates.add(candidatesForStop(shape, s, stop));
        }

        int n = stops.size();
        List<List<Candidate>> feasible = new ArrayList<>(n);
        double[] minForward = new double[n];
        boolean[] forwardExists = new boolean[n];
        for (int i = 0; i < n; i++) {
            List<Candidate> current = candidates.get(i);
            List<Candidate> keep = new ArrayList<>();
            if (i == 0) {
                keep.addAll(current);
            } else if (forwardExists[i - 1]) {
                double min = minForward[i - 1];
                for (Candidate candidate : current) {
                    if (candidate.s() >= min - CHAIN_EPSILON_METERS) {
                        keep.add(candidate);
                    }
                }
            }
            if (!keep.isEmpty()) {
                forwardExists[i] = true;
                minForward[i] = keep.get(0).s();
            }
            feasible.add(keep);
        }

        double[] maxBackward = new double[n];
        boolean[] backwardExists = new boolean[n];
        for (int i = n - 1; i >= 0; i--) {
            List<Candidate> current = candidates.get(i);
            List<Candidate> keep = new ArrayList<>();
            if (i == n - 1) {
                keep.addAll(current);
            } else if (backwardExists[i + 1]) {
                double max = maxBackward[i + 1];
                for (Candidate candidate : current) {
                    if (candidate.s() <= max + CHAIN_EPSILON_METERS) {
                        keep.add(candidate);
                    }
                }
            }
            if (!keep.isEmpty()) {
                backwardExists[i] = true;
                maxBackward[i] = keep.get(keep.size() - 1).s();
            }
            feasible.set(i, intersect(feasible.get(i), keep));
        }

        for (List<Candidate> list : feasible) {
            if (list.isEmpty()) {
                return Result.unavailable("BOUNDARY_UNRESOLVED");
            }
        }
        if (boardIndex < 0 || boardIndex >= n || alightIndex < 0 || alightIndex >= n) {
            return Result.unavailable("BOUNDARY_UNRESOLVED");
        }
        List<Candidate> boardCandidates = feasible.get(boardIndex);
        List<Candidate> alightCandidates = feasible.get(alightIndex);
        if (boardCandidates.size() > 1 || alightCandidates.size() > 1) {
            return Result.unavailable("BOUNDARY_AMBIGUOUS");
        }
        Candidate from = boardCandidates.get(0);
        Candidate to = alightCandidates.get(0);
        if (from.s() >= to.s()) {
            return Result.unavailable("BOUNDARY_UNRESOLVED");
        }
        List<double[]> points = extract(shape, s, from, to);
        if (points.size() < 2) {
            return Result.unavailable("BOUNDARY_UNRESOLVED");
        }
        return new Result("READY", null, points, round(from.distance(), 3), round(to.distance(), 3));
    }

    // ---------------------------------------------------------------- shape helpers

    static List<Point> dedupeAdjacent(List<Point> raw) {
        List<Point> points = new ArrayList<>(raw.size());
        int[] sourceIndex = new int[raw.size()];
        int kept = 0;
        for (int i = 0; i < raw.size(); i++) {
            Point point = raw.get(i);
            if (points.isEmpty() || !sameCoordinate(points.get(points.size() - 1), point)) {
                points.add(point);
                sourceIndex[kept] = i;
                kept++;
            }
        }
        // sourceIndex keeps the original shape_pt_sequence position of every kept point; the
        // returned points are always original shape points (no synthesised coordinates).
        return points;
    }

    static double[] cumulative(List<Point> points) {
        double[] s = new double[points.size()];
        for (int i = 1; i < points.size(); i++) {
            s[i] = s[i - 1] + haversine(points.get(i - 1), points.get(i));
        }
        return s;
    }

    static double haversine(Point a, Point b) {
        double lat1 = Math.toRadians(a.lat());
        double lat2 = Math.toRadians(b.lat());
        double dLat = lat2 - lat1;
        double dLon = Math.toRadians(b.lon() - a.lon());
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1.0, Math.sqrt(h)));
    }

    /** Local equirectangular plane centred on the station, in metres. */
    static double[] toPlane(Point origin, Point point) {
        double lat0 = Math.toRadians(origin.lat());
        double x = EARTH_RADIUS_METERS * Math.cos(lat0) * Math.toRadians(point.lon() - origin.lon());
        double y = EARTH_RADIUS_METERS * Math.toRadians(point.lat() - origin.lat());
        return new double[]{x, y};
    }

    static List<Candidate> candidatesForStop(List<Point> shape, double[] s, Point station) {
        int segments = shape.size() - 1;
        double[] u = new double[segments];
        List<Candidate> candidates = new ArrayList<>();
        for (int i = 0; i < segments; i++) {
            double[] a = toPlane(station, shape.get(i));
            double[] b = toPlane(station, shape.get(i + 1));
            double dx = b[0] - a[0];
            double dy = b[1] - a[1];
            double lengthSquared = dx * dx + dy * dy;
            double raw = lengthSquared <= 0 ? 0 : -(a[0] * dx + a[1] * dy) / lengthSquared;
            u[i] = raw;
            double clamped = Math.max(0, Math.min(1, raw));
            double px = a[0] + clamped * dx;
            double py = a[1] + clamped * dy;
            if (raw > U_EPSILON && raw < 1 - U_EPSILON) {
                double sAt = s[i] + clamped * (s[i + 1] - s[i]);
                candidates.add(new Candidate(sAt, Math.hypot(px, py),
                        lerp(shape.get(i).lat(), shape.get(i + 1).lat(), clamped),
                        lerp(shape.get(i).lon(), shape.get(i + 1).lon(), clamped)));
            }
        }
        int last = shape.size() - 1;
        if (u[0] <= U_EPSILON) {
            candidates.add(new Candidate(0.0, vertexDistance(station, shape.get(0)), shape.get(0).lat(),
                    shape.get(0).lon()));
        }
        if (u[segments - 1] >= 1 - U_EPSILON) {
            candidates.add(new Candidate(s[last], vertexDistance(station, shape.get(last)), shape.get(last).lat(),
                    shape.get(last).lon()));
        }
        for (int k = 1; k < last; k++) {
            if (u[k - 1] >= 1 - U_EPSILON && u[k] <= U_EPSILON) {
                candidates.add(new Candidate(s[k], vertexDistance(station, shape.get(k)), shape.get(k).lat(),
                        shape.get(k).lon()));
            }
        }
        List<Candidate> filtered = new ArrayList<>(candidates.size());
        for (Candidate candidate : candidates) {
            if (candidate.distance() <= MAX_DISTANCE_METERS) {
                filtered.add(candidate);
            }
        }
        filtered.sort((a, b) -> Double.compare(a.s(), b.s()));
        return dedupeSamePosition(filtered);
    }

    static List<Candidate> dedupeSamePosition(List<Candidate> sorted) {
        List<Candidate> result = new ArrayList<>(sorted.size());
        for (Candidate candidate : sorted) {
            if (!result.isEmpty()
                    && candidate.s() - result.get(result.size() - 1).s() <= SAME_POSITION_METERS) {
                Candidate previous = result.get(result.size() - 1);
                if (candidate.distance() < previous.distance()) {
                    result.set(result.size() - 1, candidate);
                }
                continue;
            }
            result.add(candidate);
        }
        return result;
    }

    static List<Candidate> intersect(List<Candidate> left, List<Candidate> right) {
        List<Candidate> result = new ArrayList<>();
        for (Candidate candidate : left) {
            for (Candidate other : right) {
                if (Math.abs(candidate.s() - other.s()) <= SAME_POSITION_METERS) {
                    result.add(candidate);
                    break;
                }
            }
        }
        return result;
    }

    static double vertexDistance(Point station, Point vertex) {
        double[] plane = toPlane(station, vertex);
        return Math.hypot(plane[0], plane[1]);
    }

    static List<double[]> extract(List<Point> shape, double[] s, Candidate from, Candidate to) {
        List<double[]> raw = new ArrayList<>();
        raw.add(new double[]{round(from.lon(), 7), round(from.lat(), 7)});
        for (int i = 0; i < shape.size(); i++) {
            if (s[i] > from.s() + CHAIN_EPSILON_METERS && s[i] < to.s() - CHAIN_EPSILON_METERS) {
                raw.add(new double[]{round(shape.get(i).lon(), 7), round(shape.get(i).lat(), 7)});
            }
        }
        raw.add(new double[]{round(to.lon(), 7), round(to.lat(), 7)});
        List<double[]> points = new ArrayList<>(raw.size());
        for (double[] point : raw) {
            if (points.isEmpty() || !samePosition(points.get(points.size() - 1), point)) {
                points.add(point);
            }
        }
        return points;
    }

    static boolean samePosition(double[] a, double[] b) {
        return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
    }

    static boolean sameCoordinate(Point a, Point b) {
        return Double.compare(a.lat(), b.lat()) == 0 && Double.compare(a.lon(), b.lon()) == 0;
    }

    static boolean isFinite(Point point) {
        return point != null && Double.isFinite(point.lat()) && Double.isFinite(point.lon())
                && point.lat() >= -90 && point.lat() <= 90 && point.lon() >= -180 && point.lon() <= 180;
    }

    static double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }

    static double round(double value, int digits) {
        double factor = Math.pow(10, digits);
        return Math.round(value * factor) / factor;
    }

    static Double round(Double value, int digits) {
        return value == null ? null : round(value.doubleValue(), digits);
    }
}
