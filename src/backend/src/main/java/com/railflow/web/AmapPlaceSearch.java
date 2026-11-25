package com.railflow.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("web")
public class AmapPlaceSearch {

    private static final URI AMAP_KEYWORD_SEARCH = URI.create("https://restapi.amap.com/v3/place/text");
    private static final int RESULT_LIMIT = 10;

    private final String key;
    private final ObjectMapper mapper;
    private final URI endpoint;
    private final Duration timeout;
    private final long minIntervalNanos;
    private final HttpClient client;
    private long nextRequestNanos = System.nanoTime();

    @Autowired
    public AmapPlaceSearch(@Value("${AMAP_WEB_SERVICE_KEY:}") String key, ObjectMapper mapper) {
        this(key, mapper, AMAP_KEYWORD_SEARCH, Duration.ofSeconds(5), Duration.ofSeconds(1));
    }

    AmapPlaceSearch(String key, ObjectMapper mapper, URI endpoint, Duration timeout, Duration minInterval) {
        this.key = key.strip();
        this.mapper = mapper;
        this.endpoint = endpoint;
        this.timeout = timeout;
        this.minIntervalNanos = minInterval.toNanos();
        this.client = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    public Results search(String query) {
        if (key.isEmpty()) {
            throw new ApiException(ErrorCode.PLACE_SEARCH_NOT_CONFIGURED);
        }
        reserveRequest();
        URI uri = URI.create(endpoint + "?key=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                + "&keywords=" + URLEncoder.encode(query, StandardCharsets.UTF_8)
                + "&extensions=base&offset=" + RESULT_LIMIT + "&page=1");
        HttpRequest request = HttpRequest.newBuilder(uri).header("Accept", "application/json").build();
        HttpResponse<byte[]> response = fetch(request);
        return switch (response.statusCode()) {
            case 200 -> parse(response.body());
            case 401, 403 -> throw new ApiException(ErrorCode.PLACE_SEARCH_PERMISSION_DENIED);
            case 429 -> throw new ApiException(ErrorCode.PLACE_SEARCH_QUOTA_EXCEEDED);
            case 408, 504 -> throw new ApiException(ErrorCode.PLACE_SEARCH_TIMEOUT);
            default -> throw new ApiException(ErrorCode.PLACE_SEARCH_UNAVAILABLE);
        };
    }

    private synchronized void reserveRequest() {
        long now = System.nanoTime();
        if (now - nextRequestNanos < 0) {
            throw new ApiException(ErrorCode.PLACE_SEARCH_RATE_LIMITED);
        }
        nextRequestNanos = now + minIntervalNanos;
    }

    private HttpResponse<byte[]> fetch(HttpRequest request) {
        var pending = client.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray());
        try {
            return pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException ex) {
            pending.cancel(true);
            throw new ApiException(ErrorCode.PLACE_SEARCH_TIMEOUT);
        } catch (InterruptedException ex) {
            pending.cancel(true);
            Thread.currentThread().interrupt();
            throw new ApiException(ErrorCode.PLACE_SEARCH_UNAVAILABLE);
        } catch (ExecutionException ex) {
            if (ex.getCause() instanceof HttpTimeoutException) {
                throw new ApiException(ErrorCode.PLACE_SEARCH_TIMEOUT);
            }
            throw new ApiException(ErrorCode.PLACE_SEARCH_UNAVAILABLE);
        }
    }

    private Results parse(byte[] body) {
        JsonNode root;
        try {
            root = mapper.readTree(body);
        } catch (IOException ex) {
            throw new ApiException(ErrorCode.PLACE_SEARCH_UNAVAILABLE);
        }
        if (root == null || !root.isObject()) {
            throw new ApiException(ErrorCode.PLACE_SEARCH_UNAVAILABLE);
        }
        if (!"1".equals(root.path("status").asText())) {
            throw new ApiException(providerError(root.path("infocode").asText()));
        }
        JsonNode pois = root.path("pois");
        if (!pois.isArray()) {
            throw new ApiException(ErrorCode.PLACE_SEARCH_UNAVAILABLE);
        }
        var results = new LinkedHashMap<String, Place>();
        for (JsonNode poi : pois) {
            Place place = readPlace(poi);
            if (place != null) {
                results.putIfAbsent(place.poiId(), place);
                if (results.size() == RESULT_LIMIT) {
                    break;
                }
            }
        }
        if (!pois.isEmpty() && results.isEmpty()) {
            throw new ApiException(ErrorCode.PLACE_SEARCH_UNAVAILABLE);
        }
        return new Results("AMAP", "GCJ-02", List.copyOf(results.values()));
    }

    private static ErrorCode providerError(String infoCode) {
        return switch (infoCode) {
            case "10001", "10002", "10005", "10006", "10007", "10008", "10009", "10012", "10013", "10026", "10041" ->
                    ErrorCode.PLACE_SEARCH_PERMISSION_DENIED;
            case "10003", "10004", "10010", "10014", "10015", "10019", "10020", "10021", "10028", "10029", "10044", "10045" ->
                    ErrorCode.PLACE_SEARCH_QUOTA_EXCEEDED;
            default -> ErrorCode.PLACE_SEARCH_UNAVAILABLE;
        };
    }

    private static Place readPlace(JsonNode poi) {
        String id = text(poi, "id");
        String name = text(poi, "name");
        String location = text(poi, "location");
        if (id == null || name == null || location == null) {
            return null;
        }
        String[] coordinates = location.split(",", -1);
        if (coordinates.length != 2) {
            return null;
        }
        BigDecimal longitude = coordinate(coordinates[0], 180);
        BigDecimal latitude = coordinate(coordinates[1], 90);
        if (longitude == null || latitude == null) {
            return null;
        }
        return new Place(id, name, text(poi, "cityname"), text(poi, "adname"),
                text(poi, "address"), longitude, latitude);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() && !value.textValue().isBlank() ? value.textValue().strip() : null;
    }

    private static BigDecimal coordinate(String text, int limit) {
        try {
            BigDecimal number = new BigDecimal(text.strip());
            return number.abs().compareTo(BigDecimal.valueOf(limit)) <= 0 ? number : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    public record Results(String source, String coordinateSystem, List<Place> items) {
    }

    public record Place(String poiId, String name, String city, String district, String address,
                        BigDecimal longitude, BigDecimal latitude) {
    }
}
