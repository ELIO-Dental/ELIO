"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
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
import { Users as UsersIcon } from "lucide-react";

type Role = "OWNER" | "ADMIN" | "FINANCE" | "STAFF" | "AUDITOR";

interface PracticeUser {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

const ROLES: Role[] = ["OWNER", "ADMIN", "FINANCE", "STAFF", "AUDITOR"];

async function fetchUsers(): Promise<PracticeUser[]> {
  const res = await fetch("/plans/api/users");
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  const data = await res.json();
  return data.users;
}

/** Practice-wide user list, re-skinned for the plans module per
 * MASTER_BUILD_GUIDE.md §1.7 — mirrors apps/shell/app/settings/team's
 * TeamClient table pattern (users are shell-owned data, not plans-specific,
 * so the same shape is reused rather than reinvented). Read/write access
 * gated by `canManage` (team:manage) — non-managers see a read-only table. */
export function UsersClient({ currentUserId, canManage }: { currentUserId: string; canManage: boolean }) {
  const router = useRouter();
  const [users, setUsers] = React.useState<PracticeUser[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<PracticeUser | null>(null);
  const showSkeleton = useSkeleton(loading);
  const usersRef = React.useRef(users);
  usersRef.current = users;

  // F.4 Final QA (2026-08-29): eslint(react-hooks/set-state-in-effect) flags
  // synchronous setState reachable from an effect's body, even through an
  // intermediate function call — see apps/shell/app/settings/team/
  // team-client.tsx's identical comment for the full rationale. `refetch`
  // (also used by the "Retry" button below) keeps the old eager behavior;
  // the effect instead only calls the plain async fetch directly.
  const refetch = React.useCallback((opts?: { soft?: boolean }) => {
    const soft = opts?.soft && usersRef.current !== null;
    if (!soft) setLoading(true);
    if (!soft) setError(null);
    // Returning this chain matters: TableToolbar's onRefresh awaits it to
    // know when the real fetch is actually done, and — just as
    // importantly — a FAILED soft refresh must never blow away an
    // already-good table: setting `error` here used to do exactly that,
    // since the component's top-level render checks `error` before it
    // checks whether `users` already holds good data (found in a
    // stability review, 2026-09-12).
    return fetchUsers()
      .then((u) => setUsers(u))
      .catch((e) => {
        if (soft) {
          toast.error("Couldn't refresh the team list", { description: e.message });
        } else {
          setError(e.message);
        }
      })
      .finally(() => {
        if (!soft) setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    fetchUsers()
      .then((u) => setUsers(u))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function updateUser(id: string, patch: { role?: Role; active?: boolean }) {
    const prev = users;
    setPendingId(id);
    setUsers((u) => u?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? u);
    try {
      const res = await fetch("/plans/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        setUsers(prev);
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to update user");
        return;
      }
      toast.success(patch.active === false ? "User deactivated" : patch.active === true ? "User reactivated" : "Role updated");
      router.refresh();
    } catch {
      setUsers(prev);
      toast.error("Failed to update user");
    } finally {
      setPendingId(null);
    }
  }

  if (error && !users) {
    return (
      <div className="rounded-(--radius-lg) border border-(--color-border)">
        <EmptyState icon={UsersIcon} title="Couldn't load users" description={error} action={{ label: "Retry", onClick: () => refetch() }} />
      </div>
    );
  }

  if (showSkeleton) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="rounded-(--radius-lg) border border-(--color-border)">
        <EmptyState icon={UsersIcon} title="No users yet" description="Team members will appear here." />
      </div>
    );
  }

  return (
    <>
      <PlansUsersTable
        users={users}
        canManage={canManage}
        currentUserId={currentUserId}
        pendingId={pendingId}
        onUpdate={(id, patch) => {
          if (patch.active === false) {
            const target = users.find((u) => u.id === id);
            if (target) setDeactivateTarget(target);
            return;
          }
          void updateUser(id, patch);
        }}
        onRefresh={() => refetch({ soft: true })}
      />
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        title={`Deactivate ${deactivateTarget?.email ?? "this user"}?`}
        description="This revokes their access immediately. You can reactivate them later."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={async () => {
          if (!deactivateTarget) return;
          await updateUser(deactivateTarget.id, { active: false });
          setDeactivateTarget(null);
        }}
      />
    </>
  );
}

function PlansUsersTable({
  users,
  canManage,
  currentUserId,
  pendingId,
  onUpdate,
  onRefresh,
}: {
  users: PracticeUser[];
  canManage: boolean;
  currentUserId: string;
  pendingId: string | null;
  onUpdate: (id: string, patch: { role?: Role; active?: boolean }) => void;
  onRefresh: () => void;
}) {
  const { items, page, pageSize, totalCount, setPage, showPagination } = useClientTablePagination(users, 25);

  return (
    <TablePanel
      toolbar={<TableToolbar title="Practice users" onRefresh={onRefresh} />}
      footer={
        showPagination ? (
          <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} />
        ) : undefined
      }
    >
      <Table data-testid="plans-users-table">
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>MFA</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                {canManage ? (
                  <Select
                    value={u.role}
                    disabled={pendingId === u.id}
                    onValueChange={(v) => onUpdate(u.id, { role: v as Role })}
                  >
                    <SelectTrigger className="h-8 w-32">
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
                  <Badge variant="neutral">{u.role}</Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={u.mfaEnabled ? "success" : "neutral"}>{u.mfaEnabled ? "Enabled" : "Not set up"}</Badge>
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
                    loading={pendingId === u.id}
                    onClick={() => onUpdate(u.id, { active: !u.active })}
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
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
