package com.railflow.common;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Maps every failure to the single contract envelope. Internal diagnostics stay in the log;
 * responses never contain SQL, stack traces, paths or credentials.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorBody.Envelope> handleApi(ApiException ex) {
        ErrorCode code = ex.code();
        return ResponseEntity.status(code.httpStatus()).body(ErrorBody.of(code, ex.getMessage()));
    }

    @ExceptionHandler({
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class,
            IllegalArgumentException.class
    })
    public ResponseEntity<ErrorBody.Envelope> handleBadRequest(Exception ex) {
        log.debug("validation failure: {}", ex.getMessage());
        return ResponseEntity.status(ErrorCode.VALIDATION_FAILED.httpStatus())
                .body(ErrorBody.of(ErrorCode.VALIDATION_FAILED, ErrorCode.VALIDATION_FAILED.defaultMessage()));
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    public ResponseEntity<ErrorBody.Envelope> handleNoHandler(Exception ex) {
        return ResponseEntity.status(ErrorCode.NOT_FOUND.httpStatus())
                .body(ErrorBody.of(ErrorCode.NOT_FOUND, ErrorCode.NOT_FOUND.defaultMessage()));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorBody.Envelope> handleMethod(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(ErrorCode.NOT_FOUND.httpStatus())
                .body(ErrorBody.of(ErrorCode.NOT_FOUND, "该路径不支持此请求方法"));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ErrorBody.Envelope> handleDataAccess(DataAccessException ex, HttpServletRequest request) {
        log.error("database failure on {}: {}", request.getRequestURI(), ex.getClass().getSimpleName());
        return ResponseEntity.status(ErrorCode.DATABASE_UNAVAILABLE.httpStatus())
                .body(ErrorBody.of(ErrorCode.DATABASE_UNAVAILABLE, ErrorCode.DATABASE_UNAVAILABLE.defaultMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorBody.Envelope> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("unexpected failure on {}: {}", request.getRequestURI(), ex.getClass().getName());
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.httpStatus())
                .body(ErrorBody.of(ErrorCode.INTERNAL_ERROR, ErrorCode.INTERNAL_ERROR.defaultMessage()));
    }
}
