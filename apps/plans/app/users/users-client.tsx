"use client";

import * as React from "react";
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
  const [users, setUsers] = React.useState<PracticeUser[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const showSkeleton = useSkeleton(loading);

  // F.4 Final QA (2026-08-29): eslint(react-hooks/set-state-in-effect) flags
  // synchronous setState reachable from an effect's body, even through an
  // intermediate function call — see apps/shell/app/settings/team/
  // team-client.tsx's identical comment for the full rationale. `refetch`
  // (also used by the "Retry" button below) keeps the old eager behavior;
  // the effect instead only calls the plain async fetch directly.
  const refetch = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetchUsers()
      .then((u) => setUsers(u))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchUsers()
      .then((u) => setUsers(u))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function updateUser(id: string, patch: { role?: Role; active?: boolean }) {
    const prev = users;
    setUsers((u) => u?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? u);
    const res = await fetch("/plans/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) setUsers(prev); // roll back on failure
  }

  if (error) {
    return (
      <div className="rounded-(--radius-lg) border border-(--color-border)">
        <EmptyState icon={UsersIcon} title="Couldn't load users" description={error} action={{ label: "Retry", onClick: refetch }} />
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
    <div className="rounded-(--radius-lg) border border-(--color-border)">
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
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                {canManage ? (
                  <Select value={u.role} onValueChange={(v) => updateUser(u.id, { role: v as Role })}>
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
                    onClick={() => updateUser(u.id, { active: !u.active })}
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
