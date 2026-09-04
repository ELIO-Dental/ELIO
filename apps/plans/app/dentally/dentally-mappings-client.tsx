"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TablePanel,
  TablePagination,
  useClientTablePagination,
  formatMoneyGBP,
  toast,
} from "@elio/ui";
import { Link2, Plus, RefreshCw, Trash2 } from "lucide-react";

type PlanMapping = {
  id: string;
  dentallyPlanName: string;
  planModelId: string;
  planModel: {
    id: string;
    name: string;
    monthlyPricePence: number;
    requiresAdultMembership: boolean;
  };
};

type PlanOption = {
  id: string;
  name: string;
  monthlyPricePence: number;
  requiresAdultMembership?: boolean;
};

type LiveDentallyPlan = {
  id: number;
  name: string;
  patientFriendlyName?: string;
  active: boolean;
};

function formatPlanPrice(plan: { monthlyPricePence: number; requiresAdultMembership?: boolean }): string {
  if (plan.requiresAdultMembership && plan.monthlyPricePence === 0) {
    return "FREE (with adult)";
  }
  return `${formatMoneyGBP(plan.monthlyPricePence)}/mo`;
}

export function DentallyMappingsClient({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [mappings, setMappings] = React.useState<PlanMapping[]>([]);
  const [plans, setPlans] = React.useState<PlanOption[]>([]);
  const [livePlans, setLivePlans] = React.useState<LiveDentallyPlan[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [reassigning, setReassigning] = React.useState(false);

  const [dentallyPlanName, setDentallyPlanName] = React.useState("");
  const [planModelId, setPlanModelId] = React.useState("");

  const load = React.useCallback(async (opts?: { soft?: boolean }) => {
    // Soft refresh keeps the table mounted; only the first load shows skeletons.
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    try {
      const [mappingsRes, plansRes, liveRes] = await Promise.all([
        fetch("/plans/api/dentally/mappings"),
        fetch("/plans/api/plans"),
        canManage ? fetch("/plans/api/dentally/plans") : Promise.resolve(null),
      ]);
      if (mappingsRes.ok) setMappings(await mappingsRes.json());
      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans ?? []);
      }
      if (liveRes?.ok) {
        const data = await liveRes.json();
        setLivePlans(data.plans ?? []);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load Dentally mappings");
    } finally {
      if (opts?.soft) setRefreshing(false);
      else setLoading(false);
    }
  }, [canManage]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!dentallyPlanName || !planModelId) return;
    setSaving(true);
    try {
      const res = await fetch("/plans/api/dentally/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dentallyPlanName, planModelId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create mapping");
        return;
      }
      toast.success("Mapping created");
      setDialogOpen(false);
      setDentallyPlanName("");
      setPlanModelId("");
      await load({ soft: true });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this mapping?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/plans/api/dentally/mappings/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete mapping");
        return;
      }
      toast.success("Mapping deleted");
      await load({ soft: true });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReassign() {
    setReassigning(true);
    try {
      const res = await fetch("/plans/api/dentally/reassign-plans", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Reassign failed");
        return;
      }
      toast.success(
        `Reassign complete: ${data.assigned} assigned, ${data.corrected} corrected, ${data.skipped} skipped`,
      );
      router.refresh();
    } finally {
      setReassigning(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-(--radius-lg)" />
        <Skeleton className="h-64 w-full rounded-(--radius-lg)" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-(--color-info)/30 bg-(--color-info-subtle)">
        <CardContent className="pt-6">
          <p className="text-body-sm text-(--color-text-primary)">
            <span className="font-medium">How it works:</span> When a patient in Dentally is on a payment plan whose
            name matches a mapping below, the nightly sync (and manual sync on Patients) imports them onto the mapped
            ELIO plan.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => void load({ soft: true })}
          disabled={loading || refreshing}
          data-testid="mappings-refresh"
        >
          <RefreshCw className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {canManage && (
          <>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 size-4" />
                  Add mapping
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New plan mapping</DialogTitle>
                  <DialogDescription>
                    Map a Dentally payment plan name to an ELIO membership plan. Names must match exactly (case
                    insensitive) when syncing.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {livePlans.length > 0 && (
                    <div>
                      <Label htmlFor="live-plan-pick">Pick from Dentally (optional)</Label>
                      <Select
                        value=""
                        onValueChange={(value) => {
                          const picked = livePlans.find((p) => String(p.id) === value);
                          if (picked) setDentallyPlanName(picked.name);
                        }}
                      >
                        <SelectTrigger id="live-plan-pick">
                          <SelectValue placeholder="Select a live Dentally plan…" />
                        </SelectTrigger>
                        <SelectContent>
                          {livePlans.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name}
                              {!p.active ? " (inactive)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="dentally-plan-name">Dentally plan name</Label>
                    <Input
                      id="dentally-plan-name"
                      value={dentallyPlanName}
                      onChange={(e) => setDentallyPlanName(e.target.value)}
                      placeholder="e.g. AuraCare Gold"
                    />
                  </div>
                  <div>
                    <Label htmlFor="plan-model">ELIO plan</Label>
                    <Select value={planModelId} onValueChange={setPlanModelId}>
                      <SelectTrigger id="plan-model">
                        <SelectValue placeholder="Select plan…" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — {formatPlanPrice(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} loading={saving} disabled={!dentallyPlanName || !planModelId}>
                    <Link2 className="mr-2 size-4" />
                    Create mapping
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="secondary" onClick={handleReassign} loading={reassigning}>
              <RefreshCw className="mr-2 size-4" />
              Reassign plans from Dentally
            </Button>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Plan mappings
            <span className="ml-2 text-body font-normal text-(--color-text-secondary)">
              ({mappings.length} mapping{mappings.length === 1 ? "" : "s"} configured)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mappings.length === 0 ? (
            <EmptyState
              title="No mappings yet"
              description="Add a mapping so patients on matching Dentally payment plans can be imported automatically."
              className="py-12"
            />
          ) : (
            <MappingsTable
              mappings={mappings}
              canManage={canManage}
              deletingId={deletingId}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MappingsTable({
  mappings,
  canManage,
  deletingId,
  onDelete,
}: {
  mappings: PlanMapping[];
  canManage: boolean;
  deletingId: string | null;
  onDelete: (id: string) => void;
}) {
  const { items, page, pageSize, totalCount, setPage, showPagination } = useClientTablePagination(mappings, 25);

  return (
    <TablePanel
      footer={
        showPagination ? (
          <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} />
        ) : undefined
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dentally plan name</TableHead>
            <TableHead>ELIO plan</TableHead>
            {canManage && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.dentallyPlanName}</TableCell>
              <TableCell>
                <div className="flex items-center justify-center gap-2">
                  <Badge variant="neutral">{m.planModel.name}</Badge>
                  <span className="text-caption text-(--color-text-tertiary)">{formatPlanPrice(m.planModel)}</span>
                </div>
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deletingId === m.id}
                    onClick={() => onDelete(m.id)}
                    aria-label="Delete mapping"
                  >
                    <Trash2 className="size-4 text-(--color-danger)" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TablePanel>
  );
}
