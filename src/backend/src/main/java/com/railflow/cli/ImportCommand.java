package com.railflow.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.railflow.importer.CliError;
import com.railflow.importer.ImportFailure;
import com.railflow.importer.ImportService;
import com.railflow.importer.ImportSummary;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * {@code --spring.profiles.active=import}: one-off import of the fixed GTFS release.
 *
 * <p>Required properties: {@code railflow.import.file}, {@code railflow.import.version},
 * {@code railflow.import.expected-sha256}. Exit codes follow docs/design/mvp-contract.md §4.
 */
@Component
@Profile("import")
public class ImportCommand implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ImportCommand.class);

    private final ImportService importService;
    private final ObjectMapper objectMapper;

    @Value("${railflow.import.file:}")
    private String file;

    @Value("${railflow.import.version:}")
    private String version;

    @Value("${railflow.import.expected-sha256:}")
    private String expectedSha256;

    public ImportCommand(ImportService importService, ObjectMapper objectMapper) {
        this.importService = importService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        long startedAt = System.currentTimeMillis();
        Map<String, Object> summary = new LinkedHashMap<>();
        int exitCode;
        try {
            if (isBlank(file) || isBlank(version) || isBlank(expectedSha256)) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                        "缺少 railflow.import.file / version / expected-sha256 参数");
            }
            ImportSummary result = importService.run(Path.of(file.trim()), version.trim(), expectedSha256.trim());
            summary.putAll(result.toJsonMap());
            exitCode = 0;
        } catch (ImportFailure failure) {
            log.error("import failed: {} {}", failure.error().name(), failure.getMessage());
            summary.put("result", "FAILED");
            summary.put("errorCode", failure.error().name());
            summary.put("message", failure.getMessage());
            summary.put("elapsedMs", System.currentTimeMillis() - startedAt);
            exitCode = failure.error().exitCode();
        } catch (RuntimeException e) {
            log.error("import failed unexpectedly: {}", e.getClass().getName());
            summary.put("result", "FAILED");
            summary.put("errorCode", CliError.IMPORT_FAILED.name());
            summary.put("message", "导入过程出现未预期故障");
            summary.put("elapsedMs", System.currentTimeMillis() - startedAt);
            exitCode = CliError.IMPORT_FAILED.exitCode();
        }
        CliOutput.emit(objectMapper, summary, exitCode);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
