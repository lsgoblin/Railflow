package com.railflow.web;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectReader;
import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("web")
public class AiIntentService {
    private static final String PROMPT = """
            你是 RailFlow 的铁路行程意图解析器。只输出一个 JSON 对象，使用下面的字段，未知或本轮未改字段填 null。
            {"origin":null,"destination":null,"region":null,"suggestedCity":null,"departureDate":null,
             "departureOffsetDays":null,"referenceDate":null,"minimumTransferMinutes":null,"preference":null,"stops":[]}
            只提取 message 本轮提出的新条件或明确补答。context 是当前有效行程、待补条件和本轮可用的上下文，
            用于判断补答含义。保留原条件的方法是输出 null，不要把旧条件重复输出，也不要默认出发地、日期或换乘间隔。
            origin/destination 是用户明确的城市、站名或站码。目的地是区域时仅填 region 和可修改的具体 suggestedCity，
            例如“去新疆”给 region“新疆”、suggestedCity“乌鲁木齐”，不要填 destination。
            departureDate 和 referenceDate 用 yyyy-MM-dd。今天、明天、后天及几天后用整数 departureOffsetDays
            （包括 0），不同时输出两个出发日期字段。其他相对日期可按给定北京时间确定绝对日期。
            仅明确要求更换历史参考日时填写 referenceDate，单独提及出发日期不能填参考日。
            minimumTransferMinutes 是用户明确的最短换乘分钟数，偏好是短字符串，例如“慢节奏铁路出行”，
            不把“慢摇”转换成车型、席别或换乘约束。明确取消偏好用空字符串，无修改用 null。
            中间停靠变更填 stops 数组，条目格式 {"place":"郑州","action":"STOP","stayDays":null}。
            动作为 STOP（加停或修改停留天数）、REMOVE（移除中间节点）、PASS（仅经过）、TRANSFER（指定换乘）、
            UNCLEAR（只说途经或经由，需问经过、换乘或停留）、CLEAR（撤销待补条件，保留已有行程节点）。
            stayDays 仅在 STOP 且用户说出天数时填正整数。
            用户补答“下车停一天”等表达时，使用 context.pendingStops 中对应的地点，并输出新的 action。
            更正待补地点时先对原地点输出 CLEAR，再对新地点输出变更；明确跳过待补条件用 CLEAR。
            无关且无可提取的请求所有字段用 null，stops 用空数组。不要输出路线、车次、票价、坐标、自由文本或其他字段。
            """;
    private static final Set<String> FIELDS = Set.of("origin", "destination", "region", "suggestedCity", "departureDate",
            "departureOffsetDays", "referenceDate", "minimumTransferMinutes", "preference", "stops");
    private static final Set<String> STOP_FIELDS = Set.of("place", "action", "stayDays");
    private static final Set<String> ACTIONS = Set.of("STOP", "REMOVE", "PASS", "TRANSFER", "UNCLEAR", "CLEAR");

    private final String key;
    private final URI endpoint;
    private final String model;
    private final ObjectMapper mapper;
    private final ObjectReader json;
    private final Clock clock;
    private final Duration timeout;
    private final HttpClient client;
    private final Semaphore active = new Semaphore(1);

    @Autowired
    public AiIntentService(@Value("${DEEPSEEK_API_KEY:}") String key,
                           @Value("${DEEPSEEK_BASE_URL:https://api.deepseek.com}") String baseUrl,
                           @Value("${DEEPSEEK_MODEL:deepseek-flash}") String model, ObjectMapper mapper) {
        this(key, httpsEndpoint(baseUrl), model, mapper, Clock.system(ZoneOffset.ofHours(8)), Duration.ofSeconds(20));
    }

    AiIntentService(String key, URI endpoint, String model, ObjectMapper mapper, Clock clock, Duration timeout) {
        this.key = key.strip();
        this.endpoint = endpoint;
        this.model = model.strip();
        this.mapper = mapper;
        this.json = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .with(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
        this.clock = clock;
        this.timeout = timeout;
        this.client = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    private static URI httpsEndpoint(String baseUrl) {
        try {
            URI uri = URI.create(baseUrl.strip().replaceFirst("/+$", "") + "/chat/completions");
            if ("https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null &&
                    uri.getQuery() == null && uri.getFragment() == null) return uri;
        } catch (IllegalArgumentException ignored) {
            // Invalid local configuration is reported through the API envelope.
        }
        return null;
    }

    Intent parse(String message, JsonNode context) {
        if (key.isEmpty() || endpoint == null || model.isEmpty()) throw new ApiException(ErrorCode.AI_NOT_CONFIGURED);
        if (!active.tryAcquire()) throw new ApiException(ErrorCode.AI_BUSY);
        LocalDate today = LocalDate.now(clock);
        try {
            var payload = Map.of("model", model, "max_tokens", 1000, "thinking", Map.of("type", "disabled"),
                    "response_format", Map.of("type", "json_object"), "messages", List.of(
                            Map.of("role", "system", "content", PROMPT + "当前北京时间日期：" + today),
                            Map.of("role", "user", "content", mapper.writeValueAsString(Map.of("message", message, "context", context)))));
            var request = HttpRequest.newBuilder(endpoint).timeout(timeout)
                    .header("Authorization", "Bearer " + key).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(mapper.writeValueAsBytes(payload))).build();
            var pending = client.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray());
            HttpResponse<byte[]> response;
            try {
                response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            } catch (TimeoutException | InterruptedException ex) {
                pending.cancel(true);
                throw ex;
            }
            return switch (response.statusCode()) {
                case 200 -> decode(response.body(), today);
                case 408, 504 -> throw new ApiException(ErrorCode.AI_TIMEOUT);
                case 429 -> throw new ApiException(ErrorCode.AI_BUSY);
                default -> throw new ApiException(ErrorCode.AI_UNAVAILABLE);
            };
        } catch (TimeoutException ex) {
            throw new ApiException(ErrorCode.AI_TIMEOUT);
        } catch (ExecutionException ex) {
            throw new ApiException(ex.getCause() instanceof java.net.http.HttpTimeoutException
                    ? ErrorCode.AI_TIMEOUT : ErrorCode.AI_UNAVAILABLE);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ApiException(ErrorCode.AI_UNAVAILABLE);
        } catch (IOException | IllegalArgumentException ex) {
            throw new ApiException(ErrorCode.AI_UNAVAILABLE);
        } finally {
            active.release();
        }
    }

    Intent decode(byte[] body, LocalDate today) {
        try {
            JsonNode choice = json.readTree(body).path("choices").path(0);
            JsonNode content = choice.path("message").path("content");
            if (!"stop".equals(choice.path("finish_reason").textValue()) || !content.isTextual() ||
                    content.textValue().isBlank() || content.textValue().length() > 6000) throw invalid();
            JsonNode data = json.readTree(content.textValue());
            if (data == null || !data.isObject() || data.isEmpty()) throw invalid();
            checkFields(data, FIELDS);
            String origin = text(data, "origin", 64, false);
            String destination = text(data, "destination", 64, false);
            String region = text(data, "region", 64, false);
            String suggestion = text(data, "suggestedCity", 64, false);
            if ((suggestion != null && region == null) || (destination != null && region != null)) throw invalid();
            LocalDate departure = date(data, "departureDate");
            Integer offset = integer(data, "departureOffsetDays", -3660, 3660);
            if (offset != null) {
                if (departure != null) throw invalid();
                departure = today.plusDays(offset);
            }
            var stops = new ArrayList<Stop>();
            JsonNode values = data.path("stops");
            if (!values.isMissingNode() && (!values.isArray() || values.size() > 12)) throw invalid();
            for (JsonNode stop : values) {
                if (!stop.isObject()) throw invalid();
                checkFields(stop, STOP_FIELDS);
                String place = text(stop, "place", 64, false);
                String action = text(stop, "action", 12, false);
                Integer stay = integer(stop, "stayDays", 1, Integer.MAX_VALUE);
                if (place == null || action == null || !ACTIONS.contains(action) || (stay != null && !"STOP".equals(action))) {
                    throw invalid();
                }
                stops.add(new Stop(place, action, stay));
            }
            return new Intent(origin, destination, region, suggestion, departure, date(data, "referenceDate"),
                    integer(data, "minimumTransferMinutes", 1, Integer.MAX_VALUE),
                    text(data, "preference", 120, true), List.copyOf(stops));
        } catch (IOException | DateTimeParseException ex) {
            throw invalid();
        }
    }

    private static void checkFields(JsonNode node, Set<String> known) {
        var names = node.fieldNames();
        while (names.hasNext()) if (!known.contains(names.next())) throw invalid();
    }

    private static String text(JsonNode data, String name, int max, boolean allowEmpty) {
        JsonNode field = data.get(name);
        if (field == null || field.isNull()) return null;
        if (!field.isTextual()) throw invalid();
        String value = Params.trimUnicodeWhitespace(field.textValue());
        if ((!allowEmpty && value.isEmpty()) || value.length() > max || value.chars().anyMatch(Character::isISOControl)) {
            throw invalid();
        }
        return value;
    }

    private static LocalDate date(JsonNode data, String name) {
        String value = text(data, name, 10, false);
        if (value == null) return null;
        LocalDate date = LocalDate.parse(value);
        if (value.length() != 10 || date.getYear() < 1) throw invalid();
        return date;
    }

    private static Integer integer(JsonNode data, String name, int min, int max) {
        JsonNode field = data.get(name);
        if (field == null || field.isNull()) return null;
        if (!field.isIntegralNumber() || !field.canConvertToInt() || field.intValue() < min || field.intValue() > max) {
            throw invalid();
        }
        return field.intValue();
    }

    private static ApiException invalid() {
        return new ApiException(ErrorCode.AI_INVALID_RESPONSE);
    }

    public record Intent(String origin, String destination, String region, String suggestedCity, LocalDate departureDate,
                         LocalDate referenceDate, Integer minimumTransferMinutes, String preference, List<Stop> stops) {}

    public record Stop(String place, String action, Integer stayDays) {}
}
