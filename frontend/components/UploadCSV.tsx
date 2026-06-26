"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

export function UploadCSV({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length) onFile(accepted[0]);
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border border-dashed px-6 py-10 cursor-pointer transition-colors ${
          isDragActive
            ? "border-accent bg-accent-dim"
            : "border-line-strong hover:border-fg/40"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex items-center gap-4">
          <span className="font-mono text-2xl text-accent">{file ? "✓" : "↑"}</span>
          <div>
            {file ? (
              <>
                <div className="font-medium">{file.name}</div>
                <div className="text-sm text-muted">
                  {(file.size / 1024).toFixed(1)} KB · click to replace
                </div>
              </>
            ) : (
              <>
                <div className="font-medium">
                  {isDragActive ? "Drop the CSV here" : "Drop a CSV, or click to browse"}
                </div>
                <div className="text-sm text-muted">
                  Must match the West African loan schema · max 25 MB
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-sm">
        {file && (
          <button
            onClick={() => onFile(null)}
            className="text-muted hover:text-fail no-underline border-b border-line"
          >
            Clear
          </button>
        )}
        <span className="text-faint">
          No file? We&apos;ll use the bundled 10k-row loan book.
        </span>
      </div>
    </div>
  );
}
