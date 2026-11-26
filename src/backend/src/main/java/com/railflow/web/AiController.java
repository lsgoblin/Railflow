package com.railflow.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.railflow.common.ApiException;
import com.railflow.common.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("web")
public class AiController {
    private final AiIntentService intents;

    public AiController(AiIntentService intents) {
        this.intents = intents;
    }

    @PostMapping(path = "/api/ai/intent", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AiIntentService.Intent> intent(@RequestBody JsonNode request, HttpServletRequest connection) {
        try {
            if (!InetAddress.getByName(connection.getRemoteAddr()).isLoopbackAddress()) {
                throw new ApiException(ErrorCode.AI_LOCAL_ONLY);
            }
        } catch (UnknownHostException ex) {
            throw new ApiException(ErrorCode.AI_LOCAL_ONLY);
        }
        JsonNode message = request.path("message");
        JsonNode context = request.path("context");
        if (!message.isTextual() || !context.isObject() || context.toString().length() > 6000) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED);
        }
        String text = Params.requireText(Params.trimUnicodeWhitespace(message.textValue()), "message", 1000);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(intents.parse(text, context));
    }
}
