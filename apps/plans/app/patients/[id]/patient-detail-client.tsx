"use client";

import * as React from "react";
import Link from "next/link";
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
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableCellMoney,
  TableHead,
  TableHeader,
  TableRow,
  formatMoneyGBP,
  toast,
} from "@elio/ui";
import { itemTypeFromAppointmentReason, isRedeemableAppointmentState } from "@/lib/redeems-utils";

type PlanPatientDetail = {
  id: string;
  status: string;
  createdAt: string;
  patient: {
    id: string;
    dentallyId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
  planModel: {
    id: string;
    name: string;
    monthlyPricePence: number;
    requiresAdultMembership: boolean;
  } | null;
  parentPatient: {
    id: string;
    status: string;
    patient: { firstName: string | null; lastName: string | null };
  } | null;
  childPatients: Array<{
    id: string;
    status: string;
    patient: { firstName: string | null; lastName: string | null };
  }>;
  mandates: Array<{ id: string; status: string; gocardlessMandateId: string; createdAt: string }>;
  payments: Array<{
    id: string;
    amountPence: number;
    status: string;
    billingPeriod: string | null;
    createdAt: string;
    gocardlessPaymentId: string | null;
  }>;
  redeems: Array<{
    id: string;
    itemName: string;
    status: string;
    createdAt: string;
    appointmentDate: string | null;
    dentallyAppointmentId: string | null;
  }>;
  patientPlans: Array<{ id: string; status: string; plan: { name: string } }>;
  signingRequests: Array<{
    id: string;
    token: string;
    expiresAt: string;
    signedAt: string | null;
    createdAt: string;
    document: { title: string; type: string; version: string };
  }>;
  documentAcceptances: Array<{
    id: string;
    acceptedAt: string;
    document: { title: string; type: string; version: string };
  }>;
};

const TABS = ["Overview", "Payments", "Appointments", "Redeems", "Documents", "Notes", "Correspondence"] as const;
type TabId = (typeof TABS)[number];

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  INVITED: "neutral",
  SIGNED: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  CANCELLED: "danger",
  PENDING: "warning",
  CONFIRMED: "info",
  PAID_OUT: "success",
  FAILED: "danger",
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function PatientDetailClient({
  detail,
  canInvite,
  canEdit,
  pendingDd,
}: {
  detail: PlanPatientDetail;
  canInvite: boolean;
  canEdit: boolean;
  pendingDd: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabId>("Overview");
  const [loading, setLoading] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelDd, setCancelDd] = React.useState(true);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [mandateIdInput, setMandateIdInput] = React.useState("");
  const [redeemOpen, setRedeemOpen] = React.useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = React.useState("");
  const [redeeming, setRedeeming] = React.useState(false);
  const [appointments, setAppointments] = React.useState<Array<{
    id: string;
    startsAt: string | null;
    reason: string | null;
    state: string | null;
    durationMinutes?: number | null;
  }> | null>(null);
  const [paymentTrail, setPaymentTrail] = React.useState<{
    trail: Array<{
      id: string;
      source: "gocardless" | "dentally";
      paidAt: string | null;
      amountPence: number;
      status?: string;
      billingPeriod?: string | null;
      method?: string | null;
      description?: string;
    }>;
    dentallyConfigured: boolean;
  } | null>(null);

  const name =
    [detail.patient.firstName, detail.patient.lastName].filter(Boolean).join(" ") || "Unknown patient";
  const activeMandate = detail.mandates.find((m) => m.status === "ACTIVE") ?? detail.mandates[0];
  const activeEnrolment = detail.patientPlans.find((pp) => pp.status === "ACTIVE") ?? detail.patientPlans[0];

  async function loadAppointments() {
    if (appointments !== null) return appointments;
    const res = await fetch(`/plans/api/patients/${detail.id}/appointments`);
    const data = await res.json().catch(() => ({}));
    const list = (data.appointments ?? []) as NonNullable<typeof appointments>;
    setAppointments(list);
    return list;
  }

  async function openRedeemDialog() {
    setRedeemOpen(true);
    setSelectedAppointmentId("");
    await loadAppointments();
  }

  async function handleCreateRedeem() {
    if (!selectedAppointmentId || !activeEnrolment) return;
    const apptList = appointments ?? (await loadAppointments());
    const appt = apptList?.find((a) => a.id === selectedAppointmentId);
    if (!appt) return;

    const { itemType, itemName } = itemTypeFromAppointmentReason(appt.reason);
    setRedeeming(true);
    try {
      const res = await fetch("/plans/api/redeems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planPatientId: detail.id,
          patientPlanEnrolmentId: activeEnrolment.id,
          itemType,
          itemName,
          appointmentDate: appt.startsAt,
          appointmentRef: appt.id,
          dentallyAppointmentId: appt.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create redeem");
        return;
      }
      toast.success(data.redeem?.status === "APPROVED" ? "Redeem approved" : "Redeem submitted for approval");
      setRedeemOpen(false);
      setSelectedAppointmentId("");
      router.refresh();
    } finally {
      setRedeeming(false);
    }
  }

  const redeemedAppointmentIds = new Set(
    detail.redeems
      .filter((r) => r.dentallyAppointmentId && r.status !== "REJECTED")
      .map((r) => r.dentallyAppointmentId as string),
  );

  const redeemableAppointments = (appointments ?? []).filter((a) => isRedeemableAppointmentState(a.state));

  async function runAction(path: string, successMessage: string, body?: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch(`/plans/api/patients/${detail.id}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Action failed");
        return;
      }
      if (path === "invite" && data.signupUrl) {
        toast.success(data.emailed ? "Invite emailed to patient" : successMessage, {
          description: data.signupUrl,
          duration: 10000,
        });
      } else if (path === "check-gc" && data.discovery) {
        const linked = data.discovery.linked ?? 0;
        toast.success(linked > 0 ? `Linked ${linked} mandate(s) from GoCardless` : "GoCardless checked", {
          description: data.discovery.errors?.length ? data.discovery.errors.join("; ") : undefined,
          duration: 8000,
        });
      } else if (path === "cancel" && data.gcErrors?.length) {
        toast.warning("Membership cancelled with GoCardless warnings", {
          description: data.gcErrors.join("; "),
          duration: 8000,
        });
      } else {
        toast.success(successMessage);
      }
      router.refresh();
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupDd() {
    const origin = window.location.origin;
    const data = await runAction("setup-dd", "Direct Debit setup started", {
      redirectUri: `${origin}/plans/patients/${detail.id}`,
      exitUri: `${origin}/plans/patients/${detail.id}`,
      email: detail.patient.email ?? "",
      givenName: detail.patient.firstName ?? "",
      familyName: detail.patient.lastName ?? "",
    });
    if (data?.authorisationUrl) {
      window.open(data.authorisationUrl as string, "_blank", "noopener,noreferrer");
    }
  }

  async function handleLinkMandate() {
    if (!mandateIdInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/plans/api/patients/${detail.id}/link-mandate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gocardlessMandateId: mandateIdInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to link mandate");
        return;
      }
      toast.success("Mandate linked");
      setLinkOpen(false);
      setMandateIdInput("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (tab === "Appointments" && appointments === null) {
      void fetch(`/plans/api/patients/${detail.id}/appointments`)
        .then((r) => r.json())
        .then((data) => setAppointments(data.appointments ?? []))
        .catch(() => setAppointments([]));
    }
    if (tab === "Payments" && paymentTrail === null) {
      void fetch(`/plans/api/patients/${detail.id}/payment-trail`)
        .then((r) => r.json())
        .then((data) =>
          setPaymentTrail({
            trail: data.trail ?? [],
            dentallyConfigured: data.dentallyConfigured !== false,
          }),
        )
        .catch(() => setPaymentTrail({ trail: [], dentallyConfigured: false }));
    }
  }, [tab, detail.id, appointments, paymentTrail]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/patients" className="text-body-sm text-(--color-text-tertiary) hover:text-(--color-text-primary)">
            ← Back to patients
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-h2 text-(--color-text-primary)">{name}</h2>
            <Badge variant={STATUS_VARIANT[detail.status] ?? "neutral"}>{detail.status}</Badge>
            {pendingDd && <Badge variant="warning">PENDING DD</Badge>}
            {detail.parentPatient && (
              <Link href={`/patients/${detail.parentPatient.id}`}>
                <Badge variant="neutral">
                  Child of{" "}
                  {[detail.parentPatient.patient.firstName, detail.parentPatient.patient.lastName]
                    .filter(Boolean)
                    .join(" ")}
                </Badge>
              </Link>
            )}
          </div>
          <p className="mt-1 text-body-sm text-(--color-text-secondary)">
            {detail.patient.email ?? "No email"} · Dentally ID {detail.patient.dentallyId}
          </p>
        </div>

        {(canInvite || canEdit) && (
          <div className="flex flex-wrap gap-2">
            {canInvite && (
              <Button
                variant="secondary"
                size="sm"
                loading={loading}
                onClick={() => runAction("invite", "Invite link created", { sendEmail: true })}
              >
                Send invite
              </Button>
            )}
            {canEdit && (
              <>
                <Button variant="secondary" size="sm" loading={loading} onClick={() => void handleSetupDd()}>
                  Setup DD
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setLinkOpen(true)}>
                  Link mandate
                </Button>
                <Button variant="secondary" size="sm" loading={loading} onClick={() => runAction("check-gc", "GoCardless checked")}>
                  Check GC
                </Button>
                {detail.status === "PAUSED" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={loading}
                    onClick={() => runAction("pause", "Membership resumed", { action: "resume" })}
                  >
                    Resume
                  </Button>
                )}
                {detail.status !== "PAUSED" && detail.status !== "CANCELLED" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={loading}
                    onClick={() => runAction("pause", "Membership paused", { action: "pause" })}
                  >
                    Pause
                  </Button>
                )}
                {detail.status !== "CANCELLED" && (
                  <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
                    Cancel
                  </Button>
                )}
                {detail.status === "ACTIVE" && activeEnrolment && (
                  <Button size="sm" loading={redeeming} onClick={() => void openRedeemDialog()}>
                    New redeem
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel membership</DialogTitle>
            <DialogDescription>
              This will mark the patient as cancelled in ELIO. You can optionally cancel their Direct Debit in GoCardless too.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-body-sm">
            <input type="checkbox" checked={cancelDd} onChange={(e) => setCancelDd(e.target.checked)} />
            Cancel Direct Debit in GoCardless
          </label>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep membership
            </Button>
            <Button
              variant="destructive"
              loading={loading}
              onClick={async () => {
                await runAction("cancel", "Membership cancelled", { cancelDirectDebit: cancelDd });
                setCancelOpen(false);
              }}
            >
              Cancel membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link GoCardless mandate</DialogTitle>
            <DialogDescription>Paste the mandate ID from GoCardless (starts with MD).</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="mandate-id">Mandate ID</Label>
            <Input id="mandate-id" value={mandateIdInput} onChange={(e) => setMandateIdInput(e.target.value)} placeholder="MD00..." />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleLinkMandate()} loading={loading} disabled={!mandateIdInput.trim()}>
              Link mandate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={redeemOpen}
        onOpenChange={(open) => {
          setRedeemOpen(open);
          if (!open) setSelectedAppointmentId("");
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New redeem</DialogTitle>
            <DialogDescription>Select a completed Dentally appointment to redeem against this plan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!detail.patient.dentallyId ? (
              <p className="rounded-(--radius-lg) border border-amber-200 bg-amber-50 p-3 text-body-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                This patient is not linked to Dentally. Redeems can only be created from Dentally appointments.
              </p>
            ) : appointments === null ? (
              <p className="text-body-sm text-(--color-text-secondary)">Loading appointments…</p>
            ) : redeemableAppointments.length === 0 ? (
              <p className="text-body-sm text-(--color-text-secondary)">
                No completed appointments found in Dentally. Record and complete the appointment in Dentally first.
              </p>
            ) : (
              <>
                <div>
                  <Label>Select appointment</Label>
                  <Select value={selectedAppointmentId} onValueChange={setSelectedAppointmentId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Choose an appointment…" />
                    </SelectTrigger>
                    <SelectContent>
                      {redeemableAppointments.map((a) => {
                        const alreadyRedeemed = redeemedAppointmentIds.has(a.id);
                        return (
                          <SelectItem key={a.id} value={a.id} disabled={alreadyRedeemed}>
                            {formatWhen(a.startsAt)} — {a.reason || "Appointment"} ({a.state})
                            {alreadyRedeemed ? " (already redeemed)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {selectedAppointmentId && (() => {
                  const appt = redeemableAppointments.find((a) => a.id === selectedAppointmentId);
                  if (!appt) return null;
                  const mapped = itemTypeFromAppointmentReason(appt.reason);
                  return (
                    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg-subtle) p-3 text-body-sm">
                      <p>
                        <span className="text-(--color-text-secondary)">Redeem as:</span> {mapped.itemName} ({mapped.itemType})
                      </p>
                      <p>
                        <span className="text-(--color-text-secondary)">Reason:</span> {appt.reason ?? "—"}
                      </p>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRedeemOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateRedeem()}
              loading={redeeming}
              disabled={!selectedAppointmentId || !detail.patient.dentallyId}
            >
              Create redeem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-1.5 border-b border-(--color-border-subtle) pb-3">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}>
            <Badge variant={tab === t ? "primary" : "neutral"}>{t}</Badge>
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Membership</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-body-sm">
              <p>
                <span className="text-(--color-text-secondary)">Plan:</span>{" "}
                {detail.planModel?.name ?? "—"}
                {detail.planModel && (
                  <span className="text-(--color-text-tertiary)">
                    {" "}
                    ({formatMoneyGBP(detail.planModel.monthlyPricePence)}/mo)
                  </span>
                )}
              </p>
              <p>
                <span className="text-(--color-text-secondary)">Enrolled:</span> {formatWhen(detail.createdAt)}
              </p>
              <p>
                <span className="text-(--color-text-secondary)">Mandate:</span>{" "}
                {activeMandate ? `${activeMandate.status} (${activeMandate.gocardlessMandateId})` : "None"}
              </p>
              <p>
                <span className="text-(--color-text-secondary)">Phone:</span> {detail.patient.phone ?? "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent payments</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.payments.length === 0 ? (
                <p className="text-body-sm text-(--color-text-secondary)">No GoCardless payments yet.</p>
              ) : (
                <ul className="space-y-2 text-body-sm">
                  {detail.payments.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span>{p.billingPeriod ?? formatWhen(p.createdAt)}</span>
                      <span>
                        {formatMoneyGBP(p.amountPence)} · {p.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {(detail.parentPatient || detail.childPatients.length > 0) && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Family</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-body-sm">
                {detail.parentPatient && (
                  <div>
                    <p className="mb-2 text-(--color-text-secondary)">Parent/guardian</p>
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/patients/${detail.parentPatient.id}`}>
                        {[detail.parentPatient.patient.firstName, detail.parentPatient.patient.lastName]
                          .filter(Boolean)
                          .join(" ") || "View parent"}
                      </Link>
                    </Button>
                  </div>
                )}
                {detail.childPatients.length > 0 && (
                  <div>
                    <p className="mb-2 text-(--color-text-secondary)">Linked children</p>
                    <ul className="space-y-2">
                      {detail.childPatients.map((child) => {
                        const childName =
                          [child.patient.firstName, child.patient.lastName].filter(Boolean).join(" ") || "Child";
                        return (
                          <li key={child.id} className="flex items-center justify-between gap-2">
                            <Button variant="secondary" size="sm" asChild>
                              <Link href={`/patients/${child.id}`}>{childName}</Link>
                            </Button>
                            <Badge variant={STATUS_VARIANT[child.status] ?? "neutral"}>{child.status}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "Payments" && (
        <Card>
          <CardHeader>
            <CardTitle>Payment trail</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentTrail === null ? (
              <p className="text-body-sm text-(--color-text-secondary)">Loading payments…</p>
            ) : paymentTrail.trail.length === 0 ? (
              <EmptyState title="No payments" description="No GoCardless or Dentally payments found." className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentTrail.trail.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatWhen(p.paidAt)}</TableCell>
                      <TableCell>
                        <Badge variant={p.source === "gocardless" ? "primary" : "neutral"}>{p.source}</Badge>
                      </TableCell>
                      <TableCell>{p.description ?? p.method ?? p.billingPeriod ?? "—"}</TableCell>
                      <TableCell>
                        {p.status ? <Badge variant={STATUS_VARIANT[p.status] ?? "neutral"}>{p.status}</Badge> : "—"}
                      </TableCell>
                      <TableCellMoney>{formatMoneyGBP(p.amountPence)}</TableCellMoney>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "Appointments" && (
        <Card>
          <CardHeader>
            <CardTitle>Appointments (Dentally)</CardTitle>
          </CardHeader>
          <CardContent>
            {appointments === null ? (
              <p className="text-body-sm text-(--color-text-secondary)">Loading appointments…</p>
            ) : appointments.length === 0 ? (
              <EmptyState title="No appointments" description="No upcoming or past appointments found in Dentally." className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{formatWhen(a.startsAt)}</TableCell>
                      <TableCell>{a.durationMinutes ? `${a.durationMinutes} min` : "—"}</TableCell>
                      <TableCell>{a.reason ?? "—"}</TableCell>
                      <TableCell>{a.state ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "Redeems" && (
        <Card>
          <CardHeader>
            <CardTitle>Redeems</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.redeems.length === 0 ? (
              <EmptyState title="No redeems" description="Benefit redemption requests will appear here." className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.redeems.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.itemName}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell>{formatWhen(r.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "Documents" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Signing requests</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.signingRequests.length === 0 ? (
                <p className="text-body-sm text-(--color-text-secondary)">No signing requests.</p>
              ) : (
                <ul className="space-y-3 text-body-sm">
                  {detail.signingRequests.map((s) => (
                    <li key={s.id}>
                      <p className="font-medium">{s.document.title}</p>
                      <p className="text-(--color-text-secondary)">
                        {s.signedAt ? `Signed ${formatWhen(s.signedAt)}` : `Expires ${formatWhen(s.expiresAt)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Acceptances</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.documentAcceptances.length === 0 ? (
                <p className="text-body-sm text-(--color-text-secondary)">No document acceptances.</p>
              ) : (
                <ul className="space-y-3 text-body-sm">
                  {detail.documentAcceptances.map((a) => (
                    <li key={a.id}>
                      <p className="font-medium">{a.document.title}</p>
                      <p className="text-(--color-text-secondary)">Accepted {formatWhen(a.acceptedAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "Notes" && (
        <EmptyState
          title="Notes not available"
          description="Patient notes are planned for a future schema migration (legacy PatientNote model)."
          className="py-12"
        />
      )}

      {tab === "Correspondence" && (
        <EmptyState
          title="Correspondence not available"
          description="Email history was not migrated from legacy ElioPlans. Check the audit log for staff actions on this patient."
          className="py-12"
        />
      )}
    </div>
  );
}
