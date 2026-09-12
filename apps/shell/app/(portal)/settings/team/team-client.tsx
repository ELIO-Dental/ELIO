"use client";

import * as React from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
  useSkeleton,
  Badge,
  EmptyState,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  TablePanel,
  TableToolbar,
  TablePagination,
  useClientTablePagination,
  toast,
  ConfirmDialog,
} from "@elio/ui";
import { Users } from "lucide-react";

type Role = "OWNER" | "ADMIN" | "FINANCE" | "STAFF" | "AUDITOR";

interface TeamDentist {
  id: string;
  name: string;
  userId: string | null;
}

interface TeamUser {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  dentistId: string | null;
  dentistName: string | null;
}

const ROLES: Role[] = ["OWNER", "ADMIN", "FINANCE", "STAFF", "AUDITOR"];
const NONE_DENTIST = "__none__";

const ROLE_ACCESS: { role: Role; summary: string; can: string; cannot: string }[] = [
  {
    role: "OWNER",
    summary: "Full practice control",
    can: "Team invite & roles, Dentally, Pay, Plans, Flow, settings",
    cannot: "Platform Admin console",
  },
  {
    role: "ADMIN",
    summary: "Day-to-day manager",
    can: "Use Pay, Plans, Flow; view team; manage Dentally sync",
    cannot: "Invite/deactivate people or change roles",
  },
  {
    role: "FINANCE",
    summary: "Money & payroll",
    can: "Full Pay; Plans payments & mismatches; view Flow",
    cannot: "Team, practice settings, edit plan templates",
  },
  {
    role: "STAFF",
    summary: "Front desk",
    can: "Plans invites; Flow pipeline; read-only plan payments",
    cannot: "Pay, team, settings, plan templates",
  },
  {
    role: "AUDITOR",
    summary: "Read-only review",
    can: "View Pay, Plans payments, Flow, audit log",
    cannot: "Change anything (invite, pay run, edits)",
  },
];

function RoleAccessBanner() {
  return (
    <div
      className="rounded-(--radius-lg) border border-(--color-primary-500)/25 bg-(--color-primary-50) px-4 py-4 text-(--color-text-primary)"
      data-testid="role-access-banner"
    >
      <p className="text-body-sm font-semibold">Who can do what</p>
      <p className="mt-1 text-caption text-(--color-text-secondary)">
        Pick a role when you invite someone. Access is enforced on every page, not only this list.
      </p>
      <ul className="mt-3 space-y-2">
        {ROLE_ACCESS.map((row) => (
          <li key={row.role} className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
            <span className="text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)">
              {row.role}
            </span>
            <span className="text-body-sm">
              <span className="font-medium">{row.summary}.</span> {row.can}.{" "}
              <span className="text-(--color-text-secondary)">Cannot: {row.cannot}.</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function fetchTeam(): Promise<{ users: TeamUser[]; dentists: TeamDentist[] }> {
  const res = await fetch("/api/team/users");
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  const data = await res.json();
  return { users: data.users, dentists: data.dentists ?? [] };
}

export function TeamClient({
  initialRequireMfaForAllStaff,
  currentUserId,
  canManage,
}: {
  initialRequireMfaForAllStaff: boolean;
  currentUserId: string;
  /** ADMIN gets view-only access (PERMISSIONS_MATRIX.md §2) — hides the
   * invite form, MFA toggle, and per-user role/deactivate controls, but
   * still shows the real user list. The API routes enforce this
   * server-side regardless (requireOwnerSession() on every mutation), so
   * this is UX only, not the actual security boundary. */
  canManage: boolean;
}) {
  void initialRequireMfaForAllStaff;

  const [users, setUsers] = React.useState<TeamUser[] | null>(null);
  const [dentists, setDentists] = React.useState<TeamDentist[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const showSkeleton = useSkeleton(loading);
  const usersRef = React.useRef(users);
  // Syncing a ref directly in the render body (rather than an effect) is a
  // real react-hooks/refs violation ("Cannot access refs during render") —
  // caught by this project's own eslint config during a 2026-09-12 review.
  React.useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>("STAFF");
  const [inviting, setInviting] = React.useState(false);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const refetch = React.useCallback(() => {
    const hadUsersAlready = usersRef.current !== null;
    setLoading(true);
    setError(null);
    // Returning this chain matters: TableRefreshButton/TableToolbar's
    // onRefresh awaits whatever it's given to know when the real fetch is
    // actually done — a refetch that didn't return anything let the
    // button's spinner stop on an arbitrary timer while the real request
    // was still in flight (found in a stability review, 2026-09-12).
    return fetchTeam()
      .then(({ users: u, dentists: d }) => {
        setUsers(u);
        setDentists(d);
      })
      .catch((e) => {
        // A refresh failure must never blow away an already-good table —
        // only fall back to the full-page error state when there was
        // nothing on screen yet; otherwise just surface a toast and keep
        // showing the last good data (same reasoning as apps/plans'
        // identical fix, 2026-09-12).
        if (hadUsersAlready) {
          toast.error("Couldn't refresh the team list", { description: e.message });
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchTeam()
      .then(({ users: u, dentists: d }) => {
        setUsers(u);
        setDentists(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/team/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          data?.error?.code === "EMAIL_IN_USE"
            ? "That email is already in another practice."
            : "Could not send invite."
        );
        return;
      }
      toast.success(`Invite sent to ${inviteEmail}.`);
      setInviteEmail("");
      refetch();
    } catch {
      toast.error("Could not send invite.");
    } finally {
      setInviting(false);
    }
  }

  async function updateUser(id: string, patch: { role?: Role; active?: boolean; dentistId?: string | null }) {
    const prevUsers = users;
    const prevDentists = dentists;
    setUpdatingId(id);

    if (patch.role !== undefined || patch.active !== undefined) {
      setUsers((u) => u?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? u);
    }
    if ("dentistId" in patch) {
      const nextId = patch.dentistId ?? null;
      const nextName = nextId ? dentists.find((d) => d.id === nextId)?.name ?? null : null;
      setUsers((u) => u?.map((x) => (x.id === id ? { ...x, dentistId: nextId, dentistName: nextName } : x)) ?? u);
      setDentists((ds) =>
        ds.map((d) => {
          if (d.userId === id) return { ...d, userId: null };
          if (nextId && d.id === nextId) return { ...d, userId: id };
          return d;
        })
      );
    }

    try {
      const res = await fetch(`/api/team/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setUsers(prevUsers);
        setDentists(prevDentists);
        const data = await res.json().catch(() => ({}));
        const msg =
          data?.error?.code === "DENTIST_ALREADY_LINKED"
            ? "That dentist is already linked to another user."
            : data?.error?.code === "LAST_OWNER"
              ? "This practice needs at least one active Owner — promote someone else first."
              : patch.active === false
              ? "Could not deactivate user."
              : patch.active === true
                ? "Could not reactivate user."
                : "dentistId" in patch
                  ? "Could not link dentist."
                  : "Could not update role.";
        toast.error(msg);
        return;
      }
      toast.success(
        patch.role
          ? "Role updated."
          : patch.active === false
            ? "User deactivated."
            : patch.active === true
              ? "User reactivated."
              : "dentistId" in patch
                ? "Dentist link updated."
                : "User updated."
      );
    } catch {
      setUsers(prevUsers);
      setDentists(prevDentists);
      toast.error("Could not update user.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <RoleAccessBanner />
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a user</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3" data-testid="invite-form">
              <div className="min-w-[220px] flex-1">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="w-40">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                  <SelectTrigger data-testid="invite-role-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" loading={inviting} data-testid="invite-submit">
                Send invite
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          {error && !users ? (
            <EmptyState
              icon={Users}
              title="Couldn't load users"
              description={error}
              action={{ label: "Retry", onClick: refetch }}
            />
          ) : showSkeleton ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !users || users.length === 0 ? (
            <EmptyState icon={Users} title="No users yet" description="Invite your first team member above." />
          ) : (
            <TeamUsersTable
              users={users}
              dentists={dentists}
              canManage={canManage}
              currentUserId={currentUserId}
              updatingId={updatingId}
              onUpdate={updateUser}
              onRefresh={refetch}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamUsersTable({
  users,
  dentists,
  canManage,
  currentUserId,
  updatingId,
  onUpdate,
  onRefresh,
}: {
  users: TeamUser[];
  dentists: TeamDentist[];
  canManage: boolean;
  currentUserId: string;
  updatingId: string | null;
  onUpdate: (id: string, patch: { role?: Role; active?: boolean; dentistId?: string | null }) => void;
  onRefresh: () => void;
}) {
  const { items, page, pageSize, totalCount, setPage, showPagination } = useClientTablePagination(users, 25);
  // Deactivating a colleague is easy to misclick (a small button in a dense table
  // row) and immediately locks them out — confirm before it happens. Reactivating is
  // low-risk/reversible and stays a direct one-click action.
  const [deactivateTarget, setDeactivateTarget] = React.useState<TeamUser | null>(null);

  function dentistOptionsFor(user: TeamUser): TeamDentist[] {
    return dentists.filter((d) => !d.userId || d.userId === user.id);
  }

  return (
    <TablePanel
      toolbar={<TableToolbar title="Team members" onRefresh={onRefresh} />}
      footer={
        showPagination ? (
          <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} />
        ) : undefined
      }
    >
      <Table data-testid="team-users-table">
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Dentist</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead>Deactivate</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((u) => (
            <TableRow key={u.id} data-testid={`team-row-${u.email}`}>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                {canManage ? (
                  <Select
                    value={u.role}
                    onValueChange={(v) => onUpdate(u.id, { role: v as Role })}
                    disabled={updatingId === u.id}
                  >
                    <SelectTrigger className="h-8 w-32" data-testid={`role-select-${u.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  u.role
                )}
              </TableCell>
              <TableCell>
                {canManage ? (
                  <Select
                    value={u.dentistId ?? NONE_DENTIST}
                    onValueChange={(v) => onUpdate(u.id, { dentistId: v === NONE_DENTIST ? null : v })}
                    disabled={updatingId === u.id}
                  >
                    <SelectTrigger className="h-8 w-44" data-testid={`dentist-select-${u.email}`}>
                      <SelectValue placeholder="Not linked" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_DENTIST}>Not linked</SelectItem>
                      {dentistOptionsFor(u).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  u.dentistName ?? "—"
                )}
              </TableCell>
              <TableCell>
                <Badge variant={u.active ? "success" : "danger"}>{u.active ? "Active" : "Deactivated"}</Badge>
              </TableCell>
              {canManage && (
                <TableCell>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={u.id === currentUserId}
                    loading={updatingId === u.id}
                    onClick={() => (u.active ? setDeactivateTarget(u) : onUpdate(u.id, { active: true }))}
                    data-testid={`deactivate-${u.email}`}
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        title="Deactivate this team member?"
        description={
          deactivateTarget
            ? `${deactivateTarget.email} will immediately lose access to this practice. You can reactivate them at any time.`
            : undefined
        }
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={() => {
          if (deactivateTarget) onUpdate(deactivateTarget.id, { active: false });
        }}
      />
    </TablePanel>
  );
}
