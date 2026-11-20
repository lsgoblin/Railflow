package com.railflow.importer;

import java.io.Closeable;
import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;

/**
 * Minimal streaming RFC 4180 CSV reader for the fixed GTFS package.
 *
 * <p>Supports quoted fields containing commas, doubled quotes and line breaks, CRLF or LF
 * record separators and an optional UTF-8 BOM. Returns one {@code String[]} per CSV record;
 * the header is a normal record.
 */
public final class CsvReader implements Closeable {

    private final Reader reader;
    private final char[] buffer = new char[1 << 16];
    private int position = 0;
    private int length = 0;
    private int pending = -2;
    private boolean firstRecord = true;

    public CsvReader(Reader reader) {
        this.reader = reader;
    }

    private int readChar() throws IOException {
        if (pending != -2) {
            int c = pending;
            pending = -2;
            return c;
        }
        if (position >= length) {
            length = reader.read(buffer, 0, buffer.length);
            position = 0;
            if (length <= 0) {
                length = 0;
                return -1;
            }
        }
        return buffer[position++];
    }

    private void pushBack(int c) {
        pending = c;
    }

    /** @return the next record, or {@code null} at end of input. */
    public String[] nextRecord() throws IOException {
        int c = readChar();
        if (c == -1) {
            return null;
        }
        if (firstRecord) {
            firstRecord = false;
            if (c == '\uFEFF') {
                c = readChar();
                if (c == -1) {
                    return null;
                }
            }
        }
        List<String> fields = new ArrayList<>(16);
        StringBuilder field = new StringBuilder(64);
        boolean inQuotes = false;
        while (true) {
            if (c == -1) {
                fields.add(field.toString());
                return fields.toArray(new String[0]);
            }
            char ch = (char) c;
            if (inQuotes) {
                if (ch == '"') {
                    int next = readChar();
                    if (next == '"') {
                        field.append('"');
                        c = readChar();
                    } else {
                        inQuotes = false;
                        c = next;
                    }
                    continue;
                }
                field.append(ch);
                c = readChar();
                continue;
            }
            if (ch == '"' && field.length() == 0) {
                inQuotes = true;
                c = readChar();
                continue;
            }
            if (ch == ',') {
                fields.add(field.toString());
                field.setLength(0);
                c = readChar();
                continue;
            }
            if (ch == '\n') {
                fields.add(field.toString());
                return fields.toArray(new String[0]);
            }
            if (ch == '\r') {
                int next = readChar();
                if (next != '\n' && next != -1) {
                    pushBack(next);
                }
                fields.add(field.toString());
                return fields.toArray(new String[0]);
            }
            field.append(ch);
            c = readChar();
        }
    }

    @Override
    public void close() throws IOException {
        reader.close();
    }
}
