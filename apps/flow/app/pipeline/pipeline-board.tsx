"use client";

// Kanban pipeline board — THEME_GUIDELINE.md §6.3/§6.6/§8.2.
//
// No @dnd-kit in this app's/packages/ui's dependency tree (checked
// apps/flow/package.json and packages/ui/package.json) — framer-motion IS
// already a @elio/ui dependency, so drag is implemented with framer-motion's
// `drag` gesture: each card is a draggable motion.div, each column exposes a
// DOM ref, and onDragEnd resolves the drop target by testing the pointer's
// release point against every column's bounding rect. §6.3's lift-on-drag
// spec (shadow + rotate(2deg) + scale(1.02)) is applied via `whileDrag`, and
// the drop settle uses springSnappy (packages/ui/tokens/motion.ts).
import * as React from "react";
import { motion, type PanInfo } from "framer-motion";
import { toast, getModuleColor, easing, Button } from "@elio/ui";

type EnquiryCard = {
  id: string;
  kind: "enquiry";
  patientName: string;
  source: string | null;
  capturedAt: string;
};

type ConsultCard = {
  id: string;
  kind: "consult";
  patientName: string;
  patientId: string | null;
  quotePence: number | null;
  practitionerName: string | null;
  daysSinceConsult: number;
  outcome: string | null;
  planSignedUp: boolean;
};

type CardData = EnquiryCard | ConsultCard;

export interface PipelineData {
  capture: EnquiryCard[];
  consult_quote: ConsultCard[];
  thinking: ConsultCard[];
  reminders: ConsultCard[];
  closed: ConsultCard[];
}

type ColumnKey = keyof PipelineData;

const COLUMN_ORDER: { key: ColumnKey; label: string }[] = [
  { key: "capture", label: "Capture" },
  { key: "consult_quote", label: "Consult + Quote" },
  { key: "thinking", label: "Outcome: Thinking" },
  { key: "reminders", label: "Reminders" },
  { key: "closed", label: "Closed" },
];

function money(pence: number | null) {
  if (pence === null || pence === undefined) return null;
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function PipelineBoard({ initialData }: { initialData: PipelineData }) {
  const [data, setData] = React.useState<PipelineData>(initialData);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [handingOffId, setHandingOffId] = React.useState<string | null>(null);
  const columnRefs = React.useRef<Partial<Record<ColumnKey, HTMLDivElement | null>>>({});
  const color = getModuleColor("flow");

  // Cross-module handoff (APPLICATION_FLOW.md §8/§12): a UI shortcut only —
  // pre-fills ElioPlans' own enrol-patient form via query params and
  // navigates there; never a direct write into ElioPlans' tables from here.
  async function startPlansHandoff(consult: ConsultCard) {
    setHandingOffId(consult.id);
    try {
      // basePath is "/flow" — fetch() is never auto-prefixed by Next.
      const res = await fetch(`/flow/api/consults/${consult.id}/handoff`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Handoff failed");
      setData((prev) => ({
        ...prev,
        closed: prev.closed.map((c) => (c.id === consult.id ? { ...c, planSignedUp: true } : c)),
      }));
      // Cross-ZONE navigation (multi-zone: /plans is a separate Next.js app
      // proxied by apps/shell's rewrites, per apps/shell/next.config.ts) —
      // this must be a hard navigation, not router.push(), since router.push
      // only works for routes within THIS app's own zone.
      const params = new URLSearchParams({ fromFlow: consult.id });
      if (consult.patientId) params.set("patientId", consult.patientId);
      window.location.href = `/plans/patients?${params.toString()}`;
    } catch (err) {
      toast.error("Couldn't start ElioPlans signup", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setHandingOffId(null);
    }
  }

  function findCard(id: string): { column: ColumnKey; card: CardData } | null {
    for (const { key } of COLUMN_ORDER) {
      const card = (data[key] as CardData[]).find((c) => c.id === id);
      if (card) return { column: key, card };
    }
    return null;
  }

  function resolveDropColumn(point: { x: number; y: number }): ColumnKey | null {
    for (const { key } of COLUMN_ORDER) {
      const el = columnRefs.current[key];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
        return key;
      }
    }
    return null;
  }

  async function handleDragEnd(cardId: string, info: PanInfo) {
    setDraggingId(null);
    const found = findCard(cardId);
    if (!found) return;
    const toColumn = resolveDropColumn({ x: info.point.x, y: info.point.y });
    if (!toColumn || toColumn === found.column) return;

    const fromColumn = found.column;
    const card = found.card;

    // Optimistic move (§6.6): update local state immediately.
    setData((prev) => ({
      ...prev,
      [fromColumn]: (prev[fromColumn] as CardData[]).filter((c) => c.id !== cardId),
      [toColumn]: [{ ...card, outcome: outcomeForColumn(toColumn, card) } as CardData, ...(prev[toColumn] as CardData[])],
    }));

    try {
      const res = await fetch("/flow/api/pipeline/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, toColumn }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Move failed");
    } catch (err) {
      // Roll back on failure (§6.6).
      setData((prev) => ({
        ...prev,
        [toColumn]: (prev[toColumn] as CardData[]).filter((c) => c.id !== cardId),
        [fromColumn]: [card, ...(prev[fromColumn] as CardData[])],
      }));
      toast.error("Couldn't move card", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      {COLUMN_ORDER.map(({ key, label }) => {
        const cards = data[key] as CardData[];
        return (
          <div
            key={key}
            ref={(el) => {
              columnRefs.current[key] = el;
            }}
            className="flex min-h-[16rem] flex-col rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-bg-subtle) p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-body-sm font-medium text-(--color-text-primary)">{label}</h2>
              <span className="rounded-(--radius-full) bg-(--color-surface) px-2 py-0.5 text-caption text-(--color-text-tertiary)">
                {cards.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {cards.map((card) => (
                <motion.div
                  key={card.id}
                  layout
                  layoutId={card.id}
                  drag
                  dragElastic={0.15}
                  dragMomentum={false}
                  onDragStart={() => setDraggingId(card.id)}
                  onDragEnd={(_e, info) => handleDragEnd(card.id, info)}
                  whileDrag={{ scale: 1.02, rotate: 2, boxShadow: "var(--shadow-lg)", zIndex: 50 }}
                  transition={easing.springSnappy}
                  className="cursor-grab rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) p-3 shadow-(--shadow-xs) active:cursor-grabbing"
                  style={draggingId === card.id ? { position: "relative" } : undefined}
                >
                  <p className="text-body-sm font-medium text-(--color-text-primary)">{card.patientName}</p>
                  {card.kind === "enquiry" ? (
                    <p className="mt-1 text-caption text-(--color-text-tertiary)">
                      {card.source ?? "Source unknown"} · {new Date(card.capturedAt).toLocaleDateString("en-GB")}
                    </p>
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-(--color-text-tertiary)">
                      {money(card.quotePence) && <span style={{ color: color.hex }}>{money(card.quotePence)}</span>}
                      {card.practitionerName && <span>{card.practitionerName}</span>}
                      <span>{card.daysSinceConsult}d since consult</span>
                    </div>
                  )}
                  {card.kind === "consult" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2" onPointerDownCapture={(e) => e.stopPropagation()}>
                      <a
                        href={`/flow/consults/${card.id}`}
                        className="text-caption font-medium underline-offset-2 hover:underline"
                        style={{ color: color.hex }}
                      >
                        View details
                      </a>
                      {card.outcome === "ACCEPTED" &&
                        (card.planSignedUp ? (
                          <span className="text-caption text-(--color-text-tertiary)">ElioPlans signup started</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={handingOffId === card.id}
                            onClick={() => startPlansHandoff(card)}
                          >
                            Start ElioPlans signup
                          </Button>
                        ))}
                    </div>
                  )}
                </motion.div>
              ))}
              {cards.length === 0 && (
                <p className="rounded-(--radius-md) border border-dashed border-(--color-border) p-3 text-center text-caption text-(--color-text-tertiary)">
                  Drop here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function outcomeForColumn(column: ColumnKey, card: CardData): string | null {
  if (column === "thinking" || column === "reminders") return "THINKING";
  if (column === "closed") return "ACCEPTED";
  if (column === "consult_quote") return null;
  return "outcome" in card ? card.outcome : null;
}
