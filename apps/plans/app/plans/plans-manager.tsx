"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, TrendingUp, X } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableCellMoney,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  formatMoneyGBP,
  toast,
} from "@elio/ui";

type PlanInclusion = {
  name: string;
  quantity?: number | null;
  period?: string | null;
  description?: string | null;
  sortOrder: number;
};

type PlanDiscount = {
  name: string;
  percentage: number;
  applicableTo?: string | null;
  excludes?: string | null;
  description?: string | null;
  sortOrder: number;
};

type PlanEligibilityRule = {
  ruleType: string;
  ruleValue?: string | null;
  description?: string | null;
  active: boolean;
  sortOrder: number;
};

export type PlanRow = {
  id: string;
  name: string;
  monthlyPricePence: number;
  active: boolean;
  eligibilityDentalFit: boolean;
  requiresAdultMembership: boolean;
  description: string | null;
  publicDescription: string | null;
  gocardlessLink: string | null;
  inclusions: PlanInclusion[];
  discounts: PlanDiscount[];
  eligibilityRules: PlanEligibilityRule[];
  memberCount: number;
  activeMemberCount: number;
};

const EMPTY_FORM = {
  name: "",
  monthlyPrice: "",
  description: "",
  publicDescription: "",
  gocardlessLink: "",
  active: true,
  eligibilityDentalFit: false,
  requiresAdultMembership: false,
  inclusions: [] as PlanInclusion[],
  discounts: [] as PlanDiscount[],
  eligibilityRules: [] as PlanEligibilityRule[],
};

const RULE_TYPE_OPTIONS = [
  { value: "dental_fit_required", label: "Dental fit required" },
  { value: "exam_within_months", label: "Exam within months" },
  { value: "no_active_debt", label: "No active debt" },
];

function formatPlanPrice(plan: Pick<PlanRow, "monthlyPricePence" | "requiresAdultMembership">): string {
  if (plan.requiresAdultMembership && plan.monthlyPricePence === 0) {
    return "FREE (with adult)";
  }
  return `${formatMoneyGBP(plan.monthlyPricePence)}/mo`;
}

function planToForm(plan: PlanRow) {
  return {
    name: plan.name,
    monthlyPrice: (plan.monthlyPricePence / 100).toFixed(2),
    description: plan.description ?? "",
    publicDescription: plan.publicDescription ?? "",
    gocardlessLink: plan.gocardlessLink ?? "",
    active: plan.active,
    eligibilityDentalFit: plan.eligibilityDentalFit,
    requiresAdultMembership: plan.requiresAdultMembership,
    inclusions: plan.inclusions.map((inc, idx) => ({ ...inc, sortOrder: idx })),
    discounts: plan.discounts.map((disc, idx) => ({ ...disc, sortOrder: idx })),
    eligibilityRules: plan.eligibilityRules.map((rule, idx) => ({ ...rule, sortOrder: idx })),
  };
}

/** Plans list with create/edit dialog (P4.1). */
export function PlansManager({
  plans,
  canEdit,
  canPriceIncrease,
}: {
  plans: PlanRow[];
  canEdit: boolean;
  canPriceIncrease: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingPlan, setEditingPlan] = React.useState<PlanRow | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = React.useState(false);
  const [pricePlan, setPricePlan] = React.useState<PlanRow | null>(null);
  const [newPrice, setNewPrice] = React.useState("");
  const [effectiveDate, setEffectiveDate] = React.useState("");
  const [priceProcessing, setPriceProcessing] = React.useState(false);
  const [priceResult, setPriceResult] = React.useState<{
    message: string;
    totalPatients: number;
    emailsSent: number;
    errors: string[];
  } | null>(null);

  function openCreate() {
    setEditingPlan(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(plan: PlanRow) {
    setEditingPlan(plan);
    setForm(planToForm(plan));
    setDialogOpen(true);
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      monthlyPricePence: Math.round(parseFloat(form.monthlyPrice || "0") * 100),
      description: form.description || null,
      publicDescription: form.publicDescription || null,
      gocardlessLink: form.gocardlessLink.trim() || null,
      active: form.active,
      eligibilityDentalFit: form.eligibilityDentalFit,
      requiresAdultMembership: form.requiresAdultMembership,
      inclusions: form.inclusions.map((inc, idx) => ({ ...inc, sortOrder: idx })),
      discounts: form.discounts.map((disc, idx) => ({ ...disc, sortOrder: idx })),
      eligibilityRules: form.eligibilityRules.map((rule, idx) => ({ ...rule, sortOrder: idx })),
    };
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Plan name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const url = editingPlan ? `/plans/api/plans/${editingPlan.id}` : "/plans/api/plans";
      const method = editingPlan ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save plan");
        return;
      }
      toast.success(editingPlan ? "Plan updated" : "Plan created");
      setDialogOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plan: PlanRow) {
    if (plan.memberCount > 0) return;
    if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/plans/api/plans/${plan.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Failed to delete plan");
      return;
    }
    toast.success("Plan deleted");
    router.refresh();
  }

  function openPriceIncrease(plan: PlanRow) {
    setPricePlan(plan);
    setNewPrice((plan.monthlyPricePence / 100).toFixed(2));
    setEffectiveDate("");
    setPriceResult(null);
    setPriceDialogOpen(true);
  }

  async function handlePriceIncrease() {
    if (!pricePlan || !newPrice) return;
    const priceNum = parseFloat(newPrice);
    if (Number.isNaN(priceNum) || priceNum <= 0) {
      toast.error("Please enter a valid price");
      return;
    }
    if (
      !confirm(
        `Update ${pricePlan.name} to ${formatMoneyGBP(Math.round(priceNum * 100))}/month and email all active members?`,
      )
    ) {
      return;
    }
    setPriceProcessing(true);
    try {
      const res = await fetch(`/plans/api/plans/${pricePlan.id}/price-increase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newMonthlyPricePence: Math.round(priceNum * 100),
          effectiveDate: effectiveDate || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to process price increase");
        return;
      }
      setPriceResult({
        message: data.message,
        totalPatients: data.totalPatients,
        emailsSent: data.emailsSent,
        errors: data.errors ?? [],
      });
      router.refresh();
    } finally {
      setPriceProcessing(false);
    }
  }

  return (
    <>
      {canEdit && (
        <div className="mb-6">
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            New plan
          </Button>
        </div>
      )}

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-body-sm text-(--color-text-secondary)">No plans created yet.</p>
            {canEdit && (
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="mr-2 size-4" />
                Create your first plan
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Monthly price</TableHead>
              <TableHead>Inclusions</TableHead>
              <TableHead>Discounts</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Status</TableHead>
              {(canEdit || canPriceIncrease) && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id} className={!plan.active ? "opacity-60" : undefined}>
                <TableCell>
                  <div>
                    <span className="font-medium">{plan.name}</span>
                    {plan.requiresAdultMembership && (
                      <Badge variant="neutral" className="ml-2">
                        Requires adult
                      </Badge>
                    )}
                  </div>
                  <p className="text-caption text-(--color-text-tertiary)">{formatPlanPrice(plan)}</p>
                </TableCell>
                <TableCellMoney>{formatMoneyGBP(plan.monthlyPricePence)}</TableCellMoney>
                <TableCell>{plan.inclusions.length}</TableCell>
                <TableCell>{plan.discounts.length}</TableCell>
                <TableCell>{plan.memberCount}</TableCell>
                <TableCell>
                  <Badge variant={plan.active ? "success" : "neutral"}>{plan.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                {(canEdit || canPriceIncrease) && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(plan)} aria-label={`Edit ${plan.name}`}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {canPriceIncrease && plan.active && plan.activeMemberCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPriceIncrease(plan)}
                          aria-label={`Price change ${plan.name}`}
                        >
                          <TrendingUp className="size-4" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(plan)}
                          disabled={plan.memberCount > 0}
                          aria-label={`Delete ${plan.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="plans-edit-dialog">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit plan" : "Create plan"}</DialogTitle>
            <DialogDescription>
              {editingPlan ? "Update plan details, inclusions, and discounts." : "Create a new membership plan template."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="plan-name">Plan name</Label>
                <Input
                  id="plan-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Premium Plan"
                />
              </div>
              <div>
                <Label htmlFor="plan-price">Monthly price (£)</Label>
                <Input
                  id="plan-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.monthlyPrice}
                  onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="plan-description">Internal description</Label>
              <Textarea
                id="plan-description"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="plan-public-description">Public description</Label>
              <Textarea
                id="plan-public-description"
                rows={3}
                value={form.publicDescription}
                onChange={(e) => setForm({ ...form, publicDescription: e.target.value })}
                placeholder="What patients see during signup…"
              />
            </div>

            <div>
              <Label htmlFor="plan-gc-link">GoCardless payment link</Label>
              <Input
                id="plan-gc-link"
                value={form.gocardlessLink}
                onChange={(e) => setForm({ ...form, gocardlessLink: e.target.value })}
                placeholder="https://pay.gocardless.com/BRT…"
              />
              <p className="mt-1 text-caption text-(--color-text-tertiary)">
                Pre-configured GoCardless payment page URL for in-person DD setup.
              </p>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={form.eligibilityDentalFit}
                  onChange={(e) => setForm({ ...form, eligibilityDentalFit: e.target.checked })}
                />
                Requires Dentally fit
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={form.requiresAdultMembership}
                  onChange={(e) => setForm({ ...form, requiresAdultMembership: e.target.checked })}
                />
                Requires adult membership (child plan)
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Inclusions</Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      inclusions: [
                        ...form.inclusions,
                        { name: "", quantity: null, period: null, description: null, sortOrder: form.inclusions.length },
                      ],
                    })
                  }
                >
                  <Plus className="mr-1 size-3" />
                  Add
                </Button>
              </div>
              {form.inclusions.map((inc, idx) => (
                <div key={idx} className="flex flex-wrap items-start gap-2">
                  <Input
                    placeholder="Name"
                    value={inc.name}
                    onChange={(e) => {
                      const inclusions = [...form.inclusions];
                      inclusions[idx] = { ...inc, name: e.target.value };
                      setForm({ ...form, inclusions });
                    }}
                    className="min-w-[140px] flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={inc.quantity ?? ""}
                    onChange={(e) => {
                      const inclusions = [...form.inclusions];
                      inclusions[idx] = {
                        ...inc,
                        quantity: e.target.value ? parseInt(e.target.value, 10) : null,
                      };
                      setForm({ ...form, inclusions });
                    }}
                    className="w-20"
                  />
                  <Input
                    placeholder="Period"
                    value={inc.period ?? ""}
                    onChange={(e) => {
                      const inclusions = [...form.inclusions];
                      inclusions[idx] = { ...inc, period: e.target.value || null };
                      setForm({ ...form, inclusions });
                    }}
                    className="w-28"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm({ ...form, inclusions: form.inclusions.filter((_, i) => i !== idx) })}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Discounts</Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      discounts: [
                        ...form.discounts,
                        {
                          name: "",
                          percentage: 0,
                          applicableTo: "",
                          excludes: null,
                          description: null,
                          sortOrder: form.discounts.length,
                        },
                      ],
                    })
                  }
                >
                  <Plus className="mr-1 size-3" />
                  Add
                </Button>
              </div>
              {form.discounts.map((disc, idx) => (
                <div key={idx} className="flex flex-wrap items-start gap-2">
                  <Input
                    placeholder="Name"
                    value={disc.name}
                    onChange={(e) => {
                      const discounts = [...form.discounts];
                      discounts[idx] = { ...disc, name: e.target.value };
                      setForm({ ...form, discounts });
                    }}
                    className="min-w-[140px] flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="%"
                    value={disc.percentage || ""}
                    onChange={(e) => {
                      const discounts = [...form.discounts];
                      discounts[idx] = { ...disc, percentage: parseFloat(e.target.value) || 0 };
                      setForm({ ...form, discounts });
                    }}
                    className="w-20"
                  />
                  <Input
                    placeholder="Applies to"
                    value={disc.applicableTo ?? ""}
                    onChange={(e) => {
                      const discounts = [...form.discounts];
                      discounts[idx] = { ...disc, applicableTo: e.target.value };
                      setForm({ ...form, discounts });
                    }}
                    className="w-32"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm({ ...form, discounts: form.discounts.filter((_, i) => i !== idx) })}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Eligibility rules</Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      eligibilityRules: [
                        ...form.eligibilityRules,
                        {
                          ruleType: "dental_fit_required",
                          ruleValue: null,
                          description: null,
                          active: true,
                          sortOrder: form.eligibilityRules.length,
                        },
                      ],
                    })
                  }
                >
                  <Plus className="mr-1 size-3" />
                  Add
                </Button>
              </div>
              {form.eligibilityRules.map((rule, idx) => (
                <div key={idx} className="flex flex-wrap items-start gap-2 rounded-(--radius-md) border border-(--color-border-subtle) p-3">
                  <select
                    className="h-9 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 text-body-sm"
                    value={rule.ruleType}
                    onChange={(e) => {
                      const eligibilityRules = [...form.eligibilityRules];
                      eligibilityRules[idx] = { ...rule, ruleType: e.target.value };
                      setForm({ ...form, eligibilityRules });
                    }}
                  >
                    {RULE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Value (e.g. months)"
                    value={rule.ruleValue ?? ""}
                    onChange={(e) => {
                      const eligibilityRules = [...form.eligibilityRules];
                      eligibilityRules[idx] = { ...rule, ruleValue: e.target.value || null };
                      setForm({ ...form, eligibilityRules });
                    }}
                    className="w-36"
                  />
                  <Input
                    placeholder="Description"
                    value={rule.description ?? ""}
                    onChange={(e) => {
                      const eligibilityRules = [...form.eligibilityRules];
                      eligibilityRules[idx] = { ...rule, description: e.target.value || null };
                      setForm({ ...form, eligibilityRules });
                    }}
                    className="min-w-[120px] flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({ ...form, eligibilityRules: form.eligibilityRules.filter((_, i) => i !== idx) })
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {editingPlan ? "Update plan" : "Create plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
          <DialogContent data-testid="plans-edit-dialog">
          <DialogHeader>
            <DialogTitle>Adjust plan price</DialogTitle>
            <DialogDescription>
              Change the monthly fee for {pricePlan?.name}. Active members will be emailed and future charges will use
              the new price.
            </DialogDescription>
          </DialogHeader>
          {priceResult ? (
            <div className="space-y-4">
              <p className="text-body-sm text-(--color-text-primary)">{priceResult.message}</p>
              <ul className="text-body-sm text-(--color-text-secondary)">
                <li>Patients affected: {priceResult.totalPatients}</li>
                <li>Emails sent: {priceResult.emailsSent}</li>
              </ul>
              {priceResult.errors.length > 0 && (
                <ul className="text-caption text-(--color-danger)">
                  {priceResult.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
              <DialogFooter>
                <Button onClick={() => setPriceDialogOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="new-price">New monthly price (£)</Label>
                  <Input
                    id="new-price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="effective-date">Effective date (optional)</Label>
                  <Input
                    id="effective-date"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setPriceDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void handlePriceIncrease()} loading={priceProcessing}>
                  Apply price change
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
