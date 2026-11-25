package com.railflow.common;

import org.springframework.http.HttpStatus;

/**
 * Error codes of the MVP contract (docs/design/mvp-contract.md §8).
 *
 * <p>The HTTP status is fixed per code so that the single error envelope
 * {@code {"error":{"code","message"}}} stays consistent.
 */
public enum ErrorCode {

    VALIDATION_FAILED(HttpStatus.UNPROCESSABLE_ENTITY, "请求参数不合法"),
    SAME_STATION(HttpStatus.UNPROCESSABLE_ENTITY, "起站与终站不能相同"),
    DATE_OUTSIDE_COVERAGE(HttpStatus.UNPROCESSABLE_ENTITY, "参考服务日超出数据覆盖范围"),
    SEGMENT_ORDER_INVALID(HttpStatus.UNPROCESSABLE_ENTITY, "所乘区间序号或站点不匹配"),

    DATASET_NOT_FOUND(HttpStatus.NOT_FOUND, "数据版本不存在"),
    STATION_NOT_FOUND(HttpStatus.NOT_FOUND, "站点在该数据版本中不存在"),
    TRIP_NOT_FOUND(HttpStatus.NOT_FOUND, "车次在该数据版本中不存在"),
    NOT_FOUND(HttpStatus.NOT_FOUND, "请求的路径不存在"),

    DATASET_NOT_ACTIVE(HttpStatus.CONFLICT, "该数据版本尚未激活"),
    SERVICE_NOT_RUNNING(HttpStatus.CONFLICT, "该车次在所选参考服务日未开行"),

    DATASET_NOT_READY(HttpStatus.SERVICE_UNAVAILABLE, "暂无可用的已激活数据版本"),
    DATABASE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "数据库暂不可用"),

    PLACE_SEARCH_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "普通地点搜索尚未配置"),
    PLACE_SEARCH_PERMISSION_DENIED(HttpStatus.SERVICE_UNAVAILABLE, "高德地点查询权限不足"),
    PLACE_SEARCH_QUOTA_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "高德地点查询额度已用尽或受限"),
    PLACE_SEARCH_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "地点搜索过于频繁，请稍后重试"),
    PLACE_SEARCH_TIMEOUT(HttpStatus.GATEWAY_TIMEOUT, "高德地点查询超时，请重试"),
    PLACE_SEARCH_UNAVAILABLE(HttpStatus.BAD_GATEWAY, "高德地点搜索暂不可用"),

    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "服务内部错误");

    private final HttpStatus httpStatus;
    private final String defaultMessage;

    ErrorCode(HttpStatus httpStatus, String defaultMessage) {
        this.httpStatus = httpStatus;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus httpStatus() {
        return httpStatus;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}
