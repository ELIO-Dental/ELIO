"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@elio/ui";
import { Download, Loader2, Upload } from "lucide-react";

type ImportType = "labs" | "suppliers" | "dentists" | "settings";
type ImportMode = "create" | "upsert" | "replace";

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  valid?: unknown[];
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}

const TYPE_LABELS: Record<ImportType, string> = {
  labs: "Saved labs",
  suppliers: "Saved suppliers",
  dentists: "Dentists",
  settings: "Pay settings",
};

export function SetupImportPanel({ type, count }: { type: ImportType; count?: number }) {
  const router = useRouter();
  const [csv, setCsv] = React.useState("");
  const [mode, setMode] = React.useState<ImportMode>("upsert");
  const [pending, setPending] = React.useState(false);
  const [preview, setPreview] = React.useState<ImportResult | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function runPreview() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/pay/api/setup/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, csv, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setPreview(null);
    } finally {
      setPending(false);
    }
  }

  async function runImport() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/pay/api/setup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, csv, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      setPreview(null);
      setCsv("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPending(false);
    }
  }

  async function onFile(file: File) {
    const text = await file.text();
    setCsv(text);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{TYPE_LABELS[type]}</CardTitle>
        {count != null && (
          <p className="text-body-sm text-(--color-text-secondary)">{count} records currently in database</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href={`/pay/api/setup/templates/${type}`} download>
              <Download className="mr-1 h-4 w-4" />
              Template
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/pay/api/setup/export?type=${type}`} download>
              <Download className="mr-1 h-4 w-4" />
              Export current
            </a>
          </Button>
          <label className="inline-flex cursor-pointer items-center">
            <Button size="sm" variant="outline" asChild>
              <span>
                <Upload className="mr-1 h-4 w-4" />
                Upload CSV
              </span>
            </Button>
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </label>
        </div>

        {type !== "dentists" && (
          <div className="max-w-xs">
            <Label>Import mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as ImportMode)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upsert">Upsert (update existing)</SelectItem>
                <SelectItem value="create">Create only (skip duplicates)</SelectItem>
                {type !== "settings" && <SelectItem value="replace">Replace all</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label>Paste CSV / TSV</Label>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            className="mt-1 w-full rounded-lg border border-(--color-border) p-3 font-mono text-sm"
            placeholder="Paste spreadsheet data here..."
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void runPreview()} disabled={!csv.trim() || pending}>
            Preview
          </Button>
          <Button size="sm" onClick={() => void runImport()} disabled={!csv.trim() || pending}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Import
          </Button>
        </div>

        {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}

        {preview && (
          <div className="rounded-lg border border-(--color-border) bg-(--color-bg-subtle) p-3 text-body-sm">
            <p className="font-medium">Preview</p>
            <p>{preview.valid?.length ?? 0} valid rows</p>
            {preview.errors?.length > 0 && <p className="text-(--color-danger)">{preview.errors.length} errors</p>}
            {preview.warnings?.length > 0 && <p className="text-(--color-warning)">{preview.warnings.length} warnings</p>}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-(--color-success)/40 bg-(--color-success-bg) p-3 text-body-sm text-(--color-text-primary)">
            <p className="font-medium">Import complete</p>
            <p>
              Created {result.created}, updated {result.updated}, skipped {result.skipped}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
