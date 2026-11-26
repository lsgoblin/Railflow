package com.railflow.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

class AiIntentServiceTest {
    private static final Clock BEIJING = Clock.fixed(Instant.parse("2026-11-25T16:01:00Z"), ZoneOffset.ofHours(8));
    private final ObjectMapper mapper = new ObjectMapper();
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void sendsJsonFormatAndResolvesRelativeDateAtBeijingMidnight() throws Exception {
        var request = new AtomicReference<JsonNode>();
        var service = fixture(200, """
                {"origin":"北京南站","destination":"哈尔滨","departureOffsetDays":0,
                 "preference":"慢节奏铁路出行","stops":[{"place":"沈阳","action":"STOP","stayDays":2}]}
                """, Duration.ofSeconds(3), request);
        var result = service.parse("今天北京南出发去哈尔滨，在沈阳停两天，慢慢坐火车", mapper.createObjectNode());
        assertEquals(LocalDate.of(2026, 11, 26), result.departureDate());
        assertNull(result.referenceDate());
        assertNull(result.minimumTransferMinutes());
        assertEquals("北京南站", result.origin());
        assertEquals("哈尔滨", result.destination());
        assertEquals("慢节奏铁路出行", result.preference());
        assertEquals(List.of(new AiIntentService.Stop("沈阳", "STOP", 2)), result.stops());
        assertEquals("json_object", request.get().path("response_format").path("type").textValue());
    }

    @ParameterizedTest
    @ValueSource(strings = {"   ", "{\"origin\":", "{\"departureOffsetDays\":\"0\"}",
            "{\"stops\":[{\"place\":\"沈阳\",\"action\":\"PASS\",\"stayDays\":1}]}",
            "{\"departureDate\":\"2026-02-30\"}", "{\"origin\":\"北京\"} {}",
            "{\"origin\":\"北京\",\"origin\":\"上海\"}", "{\"destination\":\"北京\",\"region\":\"新疆\"}"})
    void rejectsBlankTruncatedOrInvalidContent(String content) throws Exception {
        var service = new AiIntentService("", null, "fixture", mapper, BEIJING, Duration.ofSeconds(1));
        assertEquals(ErrorCode.AI_INVALID_RESPONSE, assertThrows(ApiException.class,
                () -> service.decode(response("stop", content), LocalDate.now(BEIJING))).code());
    }

    @Test
    void rejectsValidJsonWhenTheProviderReportsTruncation() throws Exception {
        var service = new AiIntentService("", null, "fixture", mapper, BEIJING, Duration.ofSeconds(1));
        assertEquals(ErrorCode.AI_INVALID_RESPONSE, assertThrows(ApiException.class,
                () -> service.decode(response("length", "{\"destination\":\"北京\"}"), LocalDate.now(BEIJING))).code());
    }

    @ParameterizedTest
    @CsvSource({"429, AI_BUSY", "504, AI_TIMEOUT", "502, AI_UNAVAILABLE"})
    void mapsProviderErrors(int status, ErrorCode expected) throws Exception {
        var service = fixture(status, "", Duration.ofSeconds(3), new AtomicReference<>());
        assertEquals(expected, assertThrows(ApiException.class,
                () -> service.parse("从北京出发", mapper.createObjectNode())).code());
    }

    @Test
    void timesOutWithNoProviderResponseBody() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/completions", exchange -> {
            try (exchange) {
                exchange.sendResponseHeaders(200, 200);
                exchange.getResponseBody().write('{');
                exchange.getResponseBody().flush();
                Thread.sleep(450);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
        });
        server.start();
        var service = service(Duration.ofMillis(150));
        assertEquals(ErrorCode.AI_TIMEOUT, assertThrows(ApiException.class,
                () -> service.parse("从北京出发", mapper.createObjectNode())).code());
    }

    @Test
    void rejectsRemoteAndUnicodeBlankRequestsBeforeCallingProvider() throws IOException {
        var controller = new AiController(null);
        var connection = new MockHttpServletRequest();
        JsonNode blank = mapper.readTree("""
                {"message":"　","context":{}}
                """);
        assertEquals(ErrorCode.VALIDATION_FAILED, assertThrows(ApiException.class,
                () -> controller.intent(blank, connection)).code());
        connection.setRemoteAddr("192.0.2.1");
        assertEquals(ErrorCode.AI_LOCAL_ONLY, assertThrows(ApiException.class,
                () -> controller.intent(blank, connection)).code());
    }

    private AiIntentService fixture(int status, String content, Duration timeout,
                                    AtomicReference<JsonNode> request) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        byte[] body = response("stop", content);
        server.createContext("/chat/completions", exchange -> {
            try (exchange) {
                request.set(mapper.readTree(exchange.getRequestBody()));
                exchange.sendResponseHeaders(status, body.length);
                exchange.getResponseBody().write(body);
            }
        });
        server.start();
        return service(timeout);
    }

    private AiIntentService service(Duration timeout) {
        return new AiIntentService("test-only-key", URI.create("http://127.0.0.1:" + server.getAddress().getPort()
                + "/chat/completions"), "fixture", mapper, BEIJING, timeout);
    }

    private byte[] response(String finish, String content) throws IOException {
        return mapper.writeValueAsBytes(Map.of("choices", List.of(Map.of("finish_reason", finish,
                "message", Map.of("content", content)))));
    }
}
