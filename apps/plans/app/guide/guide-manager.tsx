"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
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
import { slugifyTitle } from "@/lib/guides-utils";

export type GuideArticleRow = {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  sortOrder: number;
  published: boolean;
};

const CATEGORIES = [
  { value: "getting-started", label: "Getting Started" },
  { value: "patients", label: "Managing Patients" },
  { value: "plans", label: "Plans & Pricing" },
  { value: "payments", label: "Payments & Direct Debit" },
  { value: "redeems", label: "Redeems & Appointments" },
  { value: "reports", label: "Reports & Analytics" },
  { value: "settings", label: "Settings & Configuration" },
  { value: "general", label: "General" },
] as const;

const EMPTY_FORM = { title: "", content: "", category: "general" };

/** Guide help articles browser + CRUD (P4.5). */
export function GuideManager({
  articles,
  canEdit,
}: {
  articles: GuideArticleRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(articles[0]?.id ?? null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<GuideArticleRow | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);

  const selected = articles.find((a) => a.id === selectedId) ?? null;

  React.useEffect(() => {
    if (articles.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !articles.some((a) => a.id === selectedId)) {
      setSelectedId(articles[0]!.id);
    }
  }, [articles, selectedId]);

  const filtered = articles.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    articles: filtered.filter((a) => a.category === cat.value),
  })).filter((g) => g.articles.length > 0);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(article: GuideArticleRow) {
    setEditing(article);
    setForm({ title: article.title, content: article.content, category: article.category });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const slug = editing?.slug ?? slugifyTitle(form.title);
      const url = editing ? `/plans/api/guides/${editing.id}` : "/plans/api/guides";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save article");
        return;
      }
      toast.success(editing ? "Article updated" : "Article created");
      setDialogOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this guide article?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/plans/api/guides/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete article");
        return;
      }
      toast.success("Article deleted");
      if (selectedId === id) setSelectedId(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch("/plans/api/guides/seed", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load default guides");
        return;
      }
      toast.success(data.message ?? "Guides loaded");
      router.refresh();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-(--color-text-secondary)">Learn how to use the Plans module</p>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Add article
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(240px,300px)_1fr]">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-text-tertiary)" />
            <Input className="pl-9" placeholder="Search guides…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-3">
            {grouped.map((group) => (
              <div key={group.value}>
                <p className="mb-1 px-2 text-caption font-semibold uppercase tracking-wide text-(--color-text-tertiary)">
                  {group.label}
                </p>
                {group.articles.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => setSelectedId(article.id)}
                    className={`w-full rounded-(--radius-md) px-3 py-2 text-left text-body-sm transition-colors ${
                      selectedId === article.id
                        ? "bg-(--color-primary-50) font-medium text-(--color-primary-fg)"
                        : "text-(--color-text-secondary) hover:bg-(--color-bg-subtle)"
                    }`}
                  >
                    <BookOpen className="mr-2 inline-block size-3.5" />
                    {article.title}
                  </button>
                ))}
              </div>
            ))}
            {grouped.length === 0 && (
              <div className="space-y-3 py-8 text-center">
                <p className="text-body-sm text-(--color-text-tertiary)">No articles yet</p>
                {canEdit && articles.length === 0 && (
                  <Button variant="secondary" size="sm" onClick={() => void handleSeed()} loading={seeding}>
                    Load default guides
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <Card>
          {selected ? (
            <>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge variant="neutral" className="mb-2">
                      {CATEGORIES.find((c) => c.value === selected.category)?.label ?? selected.category}
                    </Badge>
                    <CardTitle>{selected.title}</CardTitle>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(selected)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={deleting}
                        onClick={() => void handleDelete(selected.id)}
                      >
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-(--color-text-primary)">
                  {selected.content}
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="py-16 text-center text-(--color-text-tertiary)">
              <BookOpen className="mx-auto mb-4 size-12 opacity-50" />
              <p>Select an article to read</p>
            </CardContent>
          )}
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit article" : "New article"}</DialogTitle>
            <DialogDescription>Markdown-style plain text is supported.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="guide-title">Title</Label>
              <Input id="guide-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="guide-content">Content</Label>
              <Textarea
                id="guide-content"
                rows={12}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
