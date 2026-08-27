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
  Switch,
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
import { Users } from "lucide-react";

type Role = "OWNER" | "ADMIN" | "FINANCE" | "STAFF" | "AUDITOR";

interface TeamUser {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

const ROLES: Role[] = ["OWNER", "ADMIN", "FINANCE", "STAFF", "AUDITOR"];

async function fetchUsers(): Promise<TeamUser[]> {
  const res = await fetch("/api/team/users");
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  const data = await res.json();
  return data.users;
}

export function TeamClient({
  initialRequireMfaForAllStaff,
  currentUserId,
}: {
  initialRequireMfaForAllStaff: boolean;
  currentUserId: string;
}) {
  const [users, setUsers] = React.useState<TeamUser[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const showSkeleton = useSkeleton(loading);

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>("STAFF");
  const [inviting, setInviting] = React.useState(false);
  const [inviteMsg, setInviteMsg] = React.useState<string | null>(null);

  const [mfaToggle, setMfaToggle] = React.useState(initialRequireMfaForAllStaff);
  const [mfaPending, setMfaPending] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetchUsers()
      .then((u) => setUsers(u))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await fetch("/api/team/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteMsg(data?.error?.code === "EMAIL_IN_USE" ? "That email is already in another practice." : "Could not send invite.");
        return;
      }
      setInviteMsg(`Invite sent to ${inviteEmail}.`);
      setInviteEmail("");
      load();
    } catch {
      setInviteMsg("Could not send invite.");
    } finally {
      setInviting(false);
    }
  }

  async function updateUser(id: string, patch: { role?: Role; active?: boolean }) {
    const prev = users;
    setUsers((u) => u?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? u);
    const res = await fetch(`/api/team/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setUsers(prev); // roll back on failure
    }
  }

  async function toggleMfa(enabled: boolean) {
    setMfaPending(true);
    const prev = mfaToggle;
    setMfaToggle(enabled);
    const res = await fetch("/api/team/mfa-toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) setMfaToggle(prev);
    setMfaPending(false);
  }

  return (
    <div className="mt-8 space-y-6">
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
          {inviteMsg && <p className="mt-2 text-body-sm text-[--color-text-secondary]">{inviteMsg}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-body font-medium text-[--color-text-primary]">Require MFA for all staff</p>
              <p className="text-body-sm text-[--color-text-secondary]">
                Enforced on next login for anyone without MFA configured.
              </p>
            </div>
            <Switch
              checked={mfaToggle}
              pending={mfaPending}
              onCheckedChange={toggleMfa}
              data-testid="mfa-toggle"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <EmptyState
              icon={Users}
              title="Couldn't load users"
              description={error}
              action={{ label: "Retry", onClick: load }}
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
            <Table data-testid="team-users-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deactivate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} data-testid={`team-row-${u.email}`}>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={(v) => updateUser(u.id, { role: v as Role })}>
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
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.mfaEnabled ? "success" : "neutral"}>{u.mfaEnabled ? "Enabled" : "Not set up"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active ? "success" : "danger"}>{u.active ? "Active" : "Deactivated"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={u.id === currentUserId}
                        onClick={() => updateUser(u.id, { active: !u.active })}
                        data-testid={`deactivate-${u.email}`}
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
