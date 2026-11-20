package com.railflow.importer;

/**
 * CLI error codes and exit codes of the importer/schema entry points
 * (docs/design/mvp-contract.md §4). They are never mapped onto HTTP responses.
 */
public enum CliError {

    /** Another process holds the named import lock. */
    IMPORT_IN_PROGRESS(3),
    /** The archive hash is not the fixed one, or the caller tried another release. */
    PACKAGE_HASH_MISMATCH(2),
    /** Required file, header, record count or field value is not the fixed package content. */
    PACKAGE_CONTENT_INVALID(2),
    /** Same version name exists with a different hash, or the active pointer already names another dataset. */
    DATASET_HASH_CONFLICT(5),
    /** Migration 1 has not been applied to this database. */
    SCHEMA_NOT_READY(4),
    /** A previous attempt was interrupted before activation. */
    IMPORT_INTERRUPTED(5),
    /** Any other import or validation failure. */
    IMPORT_FAILED(5),
    /** Database or connection failure. */
    DATABASE_UNAVAILABLE(4);

    private final int exitCode;

    CliError(int exitCode) {
        this.exitCode = exitCode;
    }

    public int exitCode() {
        return exitCode;
    }
}
