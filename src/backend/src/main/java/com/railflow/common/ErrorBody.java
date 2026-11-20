package com.railflow.common;

/** Single error envelope of the MVP contract: {@code {"error":{"code","message"}}}. */
public record ErrorBody(String code, String message) {

    public record Envelope(ErrorBody error) {
    }

    public static Envelope of(ErrorCode code, String message) {
        return new Envelope(new ErrorBody(code.name(), message));
    }
}
