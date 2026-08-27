"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@elio/ui";

/**
 * Compass upload — THEME_GUIDELINE.md §5.14 spec (drag-over, determinate progress, success
 * delight-moment, error fallback). Uses XHR (not fetch) so real upload progress is available.
 */
export function CompassUploadForm({ payPeriodId }: { payPeriodId: string }) {
  const router = useRouter();
  const [dragOver, setDragOver] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function upload(file: File) {
    setStatus("uploading");
    setProgress(0);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("payPeriodId", payPeriodId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/pay/api/compass/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setStatus("success");
        const { result } = JSON.parse(xhr.responseText);
        setMessage(`Parsed ${result.linesCreated} line(s) — ${result.confidentCount} confident, ${result.needsReviewCount} need review.`);
        router.refresh();
      } else {
        setStatus("error");
        try {
          setMessage(JSON.parse(xhr.responseText).error ?? "Upload failed");
        } catch {
          setMessage("Upload failed");
        }
      }
    };
    xhr.onerror = () => {
      setStatus("error");
      setMessage("Network error — please retry.");
    };
    xhr.send(formData);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) upload(file);
      }}
      className="flex flex-col items-center justify-center gap-3 rounded-(--radius-lg) border-2 border-dashed px-6 py-10 text-center transition-colors"
      style={{ borderColor: dragOver ? "var(--color-primary-500)" : "var(--color-border)" }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <p className="text-body-sm text-(--color-text-secondary)">Drag a Compass statement PDF here, or</p>
      <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} loading={status === "uploading"}>
        Choose file
      </Button>
      {status === "uploading" && progress !== null && (
        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-(--color-bg-subtle)">
          <div className="h-full bg-(--color-primary-500) transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status === "success" && <p className="text-body-sm text-(--color-success)">{message}</p>}
      {status === "error" && (
        <div>
          <p className="text-body-sm text-(--color-danger)">{message}</p>
          <Button type="button" variant="secondary" className="mt-2" onClick={() => inputRef.current?.click()}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
