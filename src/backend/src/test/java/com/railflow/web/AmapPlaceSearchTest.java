package com.railflow.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class AmapPlaceSearchTest {

    private static final String EMPTY = "{\"status\":\"1\",\"pois\":[]}";
    private static final String FIXTURE_KEY = "test-only-key";
    private final AtomicInteger calls = new AtomicInteger();
    private final AtomicReference<String> rawQuery = new AtomicReference<>();
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void sendsEncodedKeywordsAndReturnsOnlyValidDistinctPlaces() throws Exception {
        AmapPlaceSearch search = start(FIXTURE_KEY, 200, """
                {"status":"1","pois":[
                  {"id":"B1","name":"博物馆","cityname":"北京市","adname":"东城区","address":"景山前街4号",
                   "location":"116.397,39.917","tel":"discard-me"},
                  {"id":"B1","name":"重复地点","location":"116.397,39.917"},
                  {"id":"B2","name":"另一个博物馆","pname":"北京市","cityname":[],"address":[],
                   "location":"116.38,39.91"},
                  {"id":"B3","name":"坏坐标","location":"116.3,999"}
                ]}
                """, Duration.ZERO, Duration.ZERO);
        AmapPlaceSearch.Results results = search.search("博物馆 + A&B");

        assertEquals("AMAP", results.source());
        assertEquals("GCJ-02", results.coordinateSystem());
        assertEquals(2, results.items().size());
        assertEquals(new AmapPlaceSearch.Place("B1", "博物馆", "北京市", "东城区", "景山前街4号",
                new BigDecimal("116.397"), new BigDecimal("39.917")), results.items().get(0));
        assertNull(results.items().get(1).city());
        assertNull(results.items().get(1).address());
        assertTrue(rawQuery.get().contains("keywords=%E5%8D%9A%E7%89%A9%E9%A6%86+%2B+A%26B"));
        assertTrue(rawQuery.get().contains("offset=10&page=1"));
        assertFalse(new ObjectMapper().writeValueAsString(results).contains("discard-me"));
    }

    @Test
    void validEmptyListIsSuccessful() throws Exception {
        assertTrue(start(FIXTURE_KEY, 200, EMPTY, Duration.ZERO, Duration.ZERO).search("不存在").items().isEmpty());
    }

    @ParameterizedTest
    @CsvSource({
            "10009, PLACE_SEARCH_PERMISSION_DENIED",
            "10012, PLACE_SEARCH_PERMISSION_DENIED",
            "10003, PLACE_SEARCH_QUOTA_EXCEEDED",
            "10044, PLACE_SEARCH_QUOTA_EXCEEDED",
            "10016, PLACE_SEARCH_UNAVAILABLE"
    })
    void mapsProviderErrorsWithoutEchoingTheProviderMessage(String infoCode, ErrorCode expected) throws Exception {
        String body = "{\"status\":\"0\",\"infocode\":\"" + infoCode + "\",\"info\":\"" + FIXTURE_KEY + "\"}";
        var search = start(FIXTURE_KEY, 200, body, Duration.ZERO, Duration.ZERO);
        ApiException error = assertThrows(ApiException.class, () -> search.search("博物馆"));
        assertEquals(expected, error.code());
        assertEquals(expected.defaultMessage(), error.getMessage());
    }

    @ParameterizedTest
    @CsvSource({"403, PLACE_SEARCH_PERMISSION_DENIED", "429, PLACE_SEARCH_QUOTA_EXCEEDED",
            "504, PLACE_SEARCH_TIMEOUT", "502, PLACE_SEARCH_UNAVAILABLE"})
    void mapsHttpFailures(int status, ErrorCode expected) throws Exception {
        var search = start(FIXTURE_KEY, status, "temporary failure", Duration.ZERO, Duration.ZERO);
        assertEquals(expected, assertThrows(ApiException.class, () -> search.search("博物馆")).code());
    }

    @Test
    void rejectsMalformedSuccessPayloads() throws Exception {
        var search = start(FIXTURE_KEY, 200, "{\"status\":\"1\",\"pois\":[{}]}", Duration.ZERO, Duration.ZERO);
        assertEquals(ErrorCode.PLACE_SEARCH_UNAVAILABLE,
                assertThrows(ApiException.class, () -> search.search("博物馆")).code());
    }

    @Test
    void timeoutAlsoAppliesWhenTheBodyStallsAfterHeaders() throws Exception {
        var search = start(FIXTURE_KEY, 200, EMPTY, Duration.ofSeconds(2), Duration.ZERO);
        assertEquals(ErrorCode.PLACE_SEARCH_TIMEOUT,
                assertThrows(ApiException.class, () -> search.search("博物馆")).code());
        assertEquals(1, calls.get());
    }

    @Test
    void missingKeyPreventsAnOutboundRequest() throws Exception {
        var search = start(" ", 200, EMPTY, Duration.ZERO, Duration.ZERO);
        assertEquals(ErrorCode.PLACE_SEARCH_NOT_CONFIGURED,
                assertThrows(ApiException.class, () -> search.search("博物馆")).code());
        assertEquals(0, calls.get());
    }

    @Test
    void requestsInsideTheLocalIntervalDoNotConsumeProviderQuota() throws Exception {
        var search = start(FIXTURE_KEY, 200, EMPTY, Duration.ZERO, Duration.ofMinutes(1));
        search.search("博物馆");
        assertEquals(ErrorCode.PLACE_SEARCH_RATE_LIMITED,
                assertThrows(ApiException.class, () -> search.search("博物馆")).code());
        assertEquals(1, calls.get());
    }

    private AmapPlaceSearch start(String key, int status, String body, Duration bodyDelay, Duration interval) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/fixture", exchange -> {
            try (exchange) {
                calls.incrementAndGet();
                rawQuery.set(exchange.getRequestURI().getRawQuery());
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, bytes.length);
                if (!bodyDelay.isZero()) {
                    Thread.sleep(bodyDelay.toMillis());
                }
                exchange.getResponseBody().write(bytes);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
        });
        server.start();
        URI endpoint = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/fixture");
        Duration timeout = bodyDelay.isZero() ? Duration.ofSeconds(5) : Duration.ofSeconds(1);
        return new AmapPlaceSearch(key, new ObjectMapper(), endpoint, timeout, interval);
    }
}
