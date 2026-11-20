package com.railflow.importer;

/** Import/schema failure with the CLI error code and process exit code. */
public class ImportFailure extends RuntimeException {

    private final CliError error;

    public ImportFailure(CliError error, String message) {
        super(message);
        this.error = error;
    }

    public ImportFailure(CliError error, String message, Throwable cause) {
        super(message, cause);
        this.error = error;
    }

    public CliError error() {
        return error;
    }
}
