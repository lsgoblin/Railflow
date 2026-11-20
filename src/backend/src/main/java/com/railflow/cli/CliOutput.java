package com.railflow.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Prints the machine-readable CLI summary on stdout; diagnostics go to stderr via logback. */
public final class CliOutput {

    private static final Logger log = LoggerFactory.getLogger(CliOutput.class);

    private CliOutput() {
    }

    public static void emit(ObjectMapper mapper, Map<String, Object> summary, int exitCode) {
        String json;
        try {
            json = mapper.writeValueAsString(summary);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            json = "{\"result\":\"FAILED\",\"errorCode\":\"INTERNAL_ERROR\"}";
        }
        System.out.println(json);
        System.out.flush();
        log.debug("CLI summary emitted, exit code {}", exitCode);
        System.exit(exitCode);
    }
}
