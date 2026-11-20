package com.railflow.web.model;

/** Row of {@code dataset_file}. */
public class DatasetFileRow {

    public String fileName;
    public String sha256;
    public String header;
    public long sourceRows;
    public long importedRows;
    public long uncompressedBytes;
}
