package com.railflow.importer;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * MySQL named lock shared by the schema and import profiles.
 *
 * <p>The lock name is built with {@code CONCAT('railflow-import-', DATABASE())}; both acquire and
 * release use the same expression. The lock belongs to one physical connection: every batch,
 * validation, cleanup and the activation transaction of an attempt must use that connection
 * (docs/design/mvp-contract.md §4). A batch COMMIT does not release the lock.
 */
public final class NamedLock {

    private static final Logger log = LoggerFactory.getLogger(NamedLock.class);

    static final String ACQUIRE_SQL = "SELECT GET_LOCK(CONCAT('railflow-import-', DATABASE()), 0)";
    static final String RELEASE_SQL = "SELECT RELEASE_LOCK(CONCAT('railflow-import-', DATABASE()))";

    private NamedLock() {
    }

    /**
     * @return 1 when acquired, 0 when another session holds the lock
     * @throws SQLException when the database reports NULL or fails, which must be treated as a
     *                      database failure rather than a lock conflict
     */
    public static int acquire(Connection connection) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(ACQUIRE_SQL);
             ResultSet rs = ps.executeQuery()) {
            if (!rs.next()) {
                throw new SQLException("GET_LOCK returned no row");
            }
            int value = rs.getInt(1);
            if (rs.wasNull()) {
                throw new SQLException("GET_LOCK returned NULL");
            }
            return value;
        }
    }

    public static void release(Connection connection) {
        try (PreparedStatement ps = connection.prepareStatement(RELEASE_SQL);
             ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                log.debug("named lock release result={}", rs.getObject(1));
            }
        } catch (SQLException e) {
            log.warn("named lock release failed: {}", e.getClass().getSimpleName());
        }
    }
}
