package com.railflow.importer;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.springframework.stereotype.Component;

/**
 * Validates the fixed archive before anything is written: ZIP SHA-256 and byte size, exact file
 * inventory, exact header line and fixed record count of every one of the nine CSV files, plus
 * per-file uncompressed SHA-256 and byte size for the provenance table.
 */
@Component
public final class PackageScanner {

    public record FileStat(String fileName, String sha256, String header, long sourceRows, long uncompressedBytes) {
    }

    public record PackageManifest(List<FileStat> files, String zipSha256, long zipBytes) {

        public FileStat file(String name) {
            for (FileStat stat : files) {
                if (stat.fileName().equals(name)) {
                    return stat;
                }
            }
            throw new IllegalStateException("missing manifest entry " + name);
        }
    }

    public PackageManifest scan(Path zipPath) {
        if (zipPath == null || !Files.isRegularFile(zipPath)) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "导入包文件不存在或不是普通文件");
        }
        try {
            long zipBytes = Files.size(zipPath);
            String zipSha = sha256(zipPath);
            if (!FixedPackage.SHA256.equalsIgnoreCase(zipSha)) {
                throw new ImportFailure(CliError.PACKAGE_HASH_MISMATCH,
                        "ZIP SHA-256 与固定包不一致，拒绝导入");
            }
            if (zipBytes != FixedPackage.ZIP_BYTES) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "ZIP 字节数与固定包清单不一致");
            }
            Set<String> expectedNames = new LinkedHashSet<>();
            for (FixedPackage.FileSpec spec : FixedPackage.FILES) {
                expectedNames.add(spec.fileName());
            }
            List<FileStat> stats = new ArrayList<>();
            try (ZipFile zip = new ZipFile(zipPath.toFile(), StandardCharsets.UTF_8)) {
                for (Enumeration<? extends ZipEntry> en = zip.entries(); en.hasMoreElements(); ) {
                    ZipEntry entry = en.nextElement();
                    if (entry.isDirectory()) {
                        continue;
                    }
                    if (!expectedNames.contains(entry.getName())) {
                        throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                                "固定包清单之外的文件: " + entry.getName());
                    }
                }
                for (FixedPackage.FileSpec spec : FixedPackage.FILES) {
                    stats.add(scanFile(zip, spec));
                }
            }
            return new PackageManifest(stats, zipSha, zipBytes);
        } catch (IOException e) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "无法读取导入包: " + e.getClass().getSimpleName());
        }
    }

    private FileStat scanFile(ZipFile zip, FixedPackage.FileSpec spec) throws IOException {
        ZipEntry entry = zip.getEntry(spec.fileName());
        if (entry == null) {
            throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, "固定包缺少文件: " + spec.fileName());
        }
        MessageDigest digest = newDigest();
        CountingInputStream counting = new CountingInputStream(zip.getInputStream(entry));
        java.security.DigestInputStream digestStream = new java.security.DigestInputStream(counting, digest);
        try (CsvReader csv = new CsvReader(new java.io.BufferedReader(
                new java.io.InputStreamReader(digestStream, StandardCharsets.UTF_8), 1 << 20))) {
            String[] header = csv.nextRecord();
            if (header == null) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID, spec.fileName() + " 为空文件");
            }
            String headerLine = String.join(",", header);
            if (!spec.header().equals(headerLine)) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                        spec.fileName() + " 表头与固定包清单不一致");
            }
            long rows = 0;
            while (csv.nextRecord() != null) {
                rows++;
            }
            if (rows != spec.rows()) {
                throw new ImportFailure(CliError.PACKAGE_CONTENT_INVALID,
                        spec.fileName() + " 数据记录数为 " + rows + "，固定包清单为 " + spec.rows());
            }
            return new FileStat(spec.fileName(), hex(digest.digest()), headerLine, rows, counting.count());
        }
    }

    static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString().toUpperCase(java.util.Locale.ROOT);
    }

    static String sha256(Path path) throws IOException {
        MessageDigest digest = newDigest();
        try (InputStream in = Files.newInputStream(path)) {
            byte[] buffer = new byte[1 << 20];
            int read;
            while ((read = in.read(buffer)) > 0) {
                digest.update(buffer, 0, read);
            }
        }
        return hex(digest.digest());
    }
}
