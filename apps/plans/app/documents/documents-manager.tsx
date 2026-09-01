"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Plus, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@elio/ui";

export type DocumentRow = {
  id: string;
  type: string;
  title: string;
  content: string;
  version: string;
  effectiveDate: string;
  isActive: boolean;
  acceptanceCount: number;
  signingCount: number;
  signedCount: number;
};

const DOCUMENT_TYPES = [
  { value: "TERMS_AND_CONDITIONS", label: "Terms & Conditions" },
  { value: "PRIVACY_POLICY", label: "Privacy Policy" },
  { value: "PLAN_AGREEMENT", label: "Plan Agreement" },
] as const;

const EMPTY_FORM = {
  type: "TERMS_AND_CONDITIONS",
  title: "",
  content: "",
  version: "",
  effectiveDate: new Date().toISOString().split("T")[0],
  isActive: true,
};

function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

/** Documents CRUD + seed T&amp;C (P4.3). */
export function DocumentsManager({
  documents,
  canEdit,
}: {
  documents: DocumentRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"terms" | "privacy" | "other">("terms");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [viewDoc, setViewDoc] = React.useState<DocumentRow | null>(null);
  const [editingDoc, setEditingDoc] = React.useState<DocumentRow | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);

  const termsDocs = documents.filter((d) => d.type === "TERMS_AND_CONDITIONS");
  const privacyDocs = documents.filter((d) => d.type === "PRIVACY_POLICY");
  const otherDocs = documents.filter((d) => d.type === "PLAN_AGREEMENT");

  const tabDocs =
    tab === "terms" ? termsDocs : tab === "privacy" ? privacyDocs : otherDocs;

  function openCreate() {
    setEditingDoc(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(doc: DocumentRow) {
    setEditingDoc(doc);
    setForm({
      type: doc.type,
      title: doc.title,
      content: doc.content,
      version: doc.version,
      effectiveDate: doc.effectiveDate.slice(0, 10),
      isActive: doc.isActive,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingDoc ? `/plans/api/documents/${editingDoc.id}` : "/plans/api/documents";
      const method = editingDoc ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save document");
        return;
      }
      toast.success(editingDoc ? "Document updated" : "Document created");
      setDialogOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleSeedTerms() {
    setSeeding(true);
    try {
      const res = await fetch("/plans/api/documents/seed-terms", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate T&C");
        return;
      }
      toast.success("Default Terms & Conditions created");
      router.refresh();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["terms", "Terms & Conditions"],
              ["privacy", "Privacy Policy"],
              ["other", "Other Documents"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}>
              <Badge variant={tab === id ? "primary" : "neutral"}>{label}</Badge>
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void handleSeedTerms()} loading={seeding}>
              <Sparkles className="mr-2 size-4" />
              Generate default T&amp;C
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              New document
            </Button>
          </div>
        )}
      </div>

      {tab === "terms" && canEdit && (termsDocs.length === 0 || termsDocs.every((d) => d.content.length < 500)) && (
        <Card className="mb-4">
          <CardContent className="py-6 text-center">
            <p className="text-body-sm text-(--color-text-secondary)">
              {termsDocs.length === 0
                ? "No Terms & Conditions documents created yet."
                : "Your current T&C is a basic placeholder. Generate a full professional version?"}
            </p>
          </CardContent>
        </Card>
      )}

      {tabDocs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-body-sm text-(--color-text-secondary)">
            No documents in this category yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tabDocs.map((doc) => (
            <Card key={doc.id} className={!doc.isActive ? "opacity-70" : undefined}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-body font-medium text-(--color-text-primary)">{doc.title}</h3>
                    <Badge variant={doc.isActive ? "success" : "neutral"}>{doc.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="mt-1 text-body-sm text-(--color-text-tertiary)">
                    {formatType(doc.type)} · v{doc.version} · Effective {doc.effectiveDate.slice(0, 10)}
                  </p>
                  <p className="mt-1 text-caption text-(--color-text-tertiary)">
                    {doc.acceptanceCount} acceptances · {doc.signedCount}/{doc.signingCount} signing requests signed
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setViewDoc(doc)}>
                    <Eye className="mr-1 size-4" />
                    View
                  </Button>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(doc)}>
                      <Pencil className="mr-1 size-4" />
                      Edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Edit document" : "Create document"}</DialogTitle>
            <DialogDescription>Active documents are shown to patients during signup.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Document type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="doc-version">Version</Label>
                <Input
                  id="doc-version"
                  value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="e.g. 1.0"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="doc-effective">Effective date</Label>
              <Input
                id="doc-effective"
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="doc-content">Content</Label>
              <Textarea
                id="doc-content"
                rows={12}
                className="font-mono text-body-sm"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <p className="mt-1 text-caption text-(--color-text-tertiary)">HTML formatting is supported.</p>
            </div>
            <label className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Set as active document for this type
            </label>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {editingDoc ? "Update document" : "Create document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewDoc} onOpenChange={() => setViewDoc(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewDoc?.title}</DialogTitle>
            <DialogDescription>
              Version {viewDoc?.version} · Effective {viewDoc?.effectiveDate.slice(0, 10)}
            </DialogDescription>
          </DialogHeader>
          <div
            className="prose prose-sm max-w-none py-4 text-(--color-text-primary)"
            dangerouslySetInnerHTML={{ __html: viewDoc?.content ?? "" }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
