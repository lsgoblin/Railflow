package com.railflow;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * RailFlow MVP backend.
 *
 * <p>Three run modes, selected by Spring profile (see docs/design/mvp-contract.md §4):
 * {@code schema} creates migration 1 on the authorised local database, {@code import}
 * performs the one-off fixed GTFS import, {@code web} serves the read-only /api/mvp API.
 */
@SpringBootApplication
@MapperScan("com.railflow.web.mapper")
public class RailFlowApplication {

    public static void main(String[] args) {
        SpringApplication.run(RailFlowApplication.class, args);
    }
}
