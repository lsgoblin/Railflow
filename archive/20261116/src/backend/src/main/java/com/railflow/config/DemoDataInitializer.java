package com.railflow.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Seeds the demo data required by the prototype flow. It only runs when the
 * accounts table is empty, so restarting the application does not duplicate data.
 */
@Component
public class DemoDataInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataInitializer.class);

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;

    public DemoDataInitializer(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        Integer accountCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM accounts", Integer.class);
        if (accountCount != null && accountCount > 0) {
            log.info("Demo data already present; skip seeding");
            return;
        }

        Long chenYuId = insertAccount("陈屿", "chen.yu@railflow.cn", "railflow123", "USER", "13800138001");
        Long linZhixiaId = insertAccount("林知夏", "lin.zhixia@railflow.cn", "railflow123", "USER", "13800138002");
        insertAccount("周明", "admin@railflow.cn", "admin123", "ADMIN", "13800138003");

        insertPassenger(chenYuId, "陈屿", "310101199203184512", "13800138001");
        insertPassenger(chenYuId, "沈清和", "310104199507226629", "13800138011");
        insertPassenger(chenYuId, "苏予安", "330106199811093345", "13800138012");
        insertPassenger(linZhixiaId, "林知夏", "110105199001127753", "13800138002");
        insertPassenger(linZhixiaId, "顾青", "510107199209155566", "13800138021");

        seedTrainRuns();
        log.info("Demo data seeded");
    }

    private Long insertAccount(String name, String email, String password, String role, String phone) {
        jdbcTemplate.update(
                "INSERT INTO accounts (email, password_hash, display_name, phone, role) VALUES (?, ?, ?, ?, ?)",
                email, passwordEncoder.encode(password), name, phone, role);
        return jdbcTemplate.queryForObject("SELECT id FROM accounts WHERE email = ?", Long.class, email);
    }

    private void insertPassenger(Long accountId, String name, String idNo, String phone) {
        jdbcTemplate.update(
                "INSERT INTO passengers (account_id, name, id_no, phone, type) VALUES (?, ?, ?, ?, ?)",
                accountId, name, idNo, phone, "成人");
    }

    private void seedTrainRuns() {
        Map<String, Long> stationIds = new HashMap<>();
        jdbcTemplate.query("SELECT code, id FROM stations", rs -> {
            stationIds.put(rs.getString("code"), rs.getLong("id"));
        });

        List<Route> routes = List.of(
                new Route("G2", "SHH", "BJP", "07:00", "11:36", new BigDecimal("662.00"), 96),
                new Route("G6", "SHH", "BJP", "10:00", "14:28", new BigDecimal("662.00"), 96),
                new Route("G1", "BJP", "SHH", "07:00", "11:29", new BigDecimal("662.00"), 96),
                new Route("G3", "BJP", "SHH", "09:00", "13:29", new BigDecimal("662.00"), 96),
                new Route("G7301", "SHH", "HGH", "06:30", "07:15", new BigDecimal("73.00"), 120),
                new Route("G7302", "HGH", "SHH", "07:20", "08:05", new BigDecimal("73.00"), 120),
                new Route("G1001", "GZQ", "IOQ", "08:00", "08:36", new BigDecimal("74.50"), 140),
                new Route("G1002", "IOQ", "GZQ", "08:30", "09:06", new BigDecimal("74.50"), 140),
                new Route("G7001", "NKH", "SHH", "07:15", "08:38", new BigDecimal("139.50"), 110),
                new Route("G7002", "SHH", "NKH", "09:05", "10:28", new BigDecimal("139.50"), 110)
        );

        for (int dayOffset = 1; dayOffset <= 2; dayOffset++) {
            LocalDate travelDate = LocalDate.now().plusDays(dayOffset);
            for (Route route : routes) {
                LocalDateTime departTime = LocalDateTime.of(travelDate, LocalTime.parse(route.depart()));
                LocalDateTime arriveTime = LocalDateTime.of(travelDate, LocalTime.parse(route.arrive()));
                if (!arriveTime.isAfter(departTime)) {
                    arriveTime = arriveTime.plusDays(1);
                }
                int confirmedSeats = route.capacity() * 30 / 100;
                int availableSeats = route.capacity() - confirmedSeats;
                jdbcTemplate.update(
                        "INSERT INTO train_runs (train_no, from_station_id, to_station_id, travel_date, "
                                + "depart_time, arrive_time, price, capacity, available_seats, locked_seats, "
                                + "confirmed_seats, sale_open) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        route.trainNo(),
                        stationIds.get(route.fromCode()),
                        stationIds.get(route.toCode()),
                        travelDate,
                        departTime,
                        arriveTime,
                        route.price(),
                        route.capacity(),
                        availableSeats,
                        0,
                        confirmedSeats,
                        true);
            }
        }
    }

    private record Route(String trainNo, String fromCode, String toCode, String depart, String arrive,
                         BigDecimal price, int capacity) {
    }
}
