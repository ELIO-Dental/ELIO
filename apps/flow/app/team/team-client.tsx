"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
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
  TablePanel,
  TablePagination,
  TableRow,
  TableToolbar,
  toast,
  useClientTablePagination,
  useSkeleton,
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
  const res = await fetch("/flow/api/team/users");
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  const data = await res.json();
  return data.users;
}

/** Old ElioFlow Users tab — ELIO theme; invites stay on Portal login/team. */
export function TeamClient({ currentUserId, canManage }: { currentUserId: string; canManage: boolean }) {
  const router = useRouter();
  const [users, setUsers] = React.useState<PracticeUser[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const showSkeleton = useSkeleton(loading);

  React.useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function updateUser(id: string, patch: { role?: Role; active?: boolean }) {
    const prev = users;
    setPendingId(id);
    setUsers((u) => u?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? u);
    try {
      const res = await fetch("/flow/api/team/users", {
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
      toast.success(
        patch.active === false ? "User deactivated" : patch.active === true ? "User reactivated" : "Role updated"
      );
      router.refresh();
    } catch {
      setUsers(prev);
      toast.error("Failed to update user");
    } finally {
      setPendingId(null);
    }
  }

  if (error) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="Couldn't load team"
        description={error}
        action={{
          label: "Retry",
          onClick: () => {
            setLoading(true);
            setError(null);
            fetchUsers()
              .then(setUsers)
              .catch((e) => setError(e.message))
              .finally(() => setLoading(false));
          },
        }}
      />
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

  if (!users?.length) {
    return <EmptyState icon={UsersIcon} title="No users yet" description="Invite colleagues from ELIO Portal → Team." />;
  }

  return <TeamTable users={users} canManage={canManage} currentUserId={currentUserId} pendingId={pendingId} onUpdate={updateUser} />;
}

function TeamTable({
  users,
  canManage,
  currentUserId,
  pendingId,
  onUpdate,
}: {
  users: PracticeUser[];
  canManage: boolean;
  currentUserId: string;
  pendingId: string | null;
  onUpdate: (id: string, patch: { role?: Role; active?: boolean }) => void;
}) {
  const { items, page, pageSize, totalCount, setPage, showPagination } = useClientTablePagination(users, 20);

  return (
    <TablePanel
      toolbar={
        <TableToolbar title="Practice team">
          <Button asChild variant="secondary">
            <a href="/settings/team">Open Portal Team</a>
          </Button>
        </TableToolbar>
      }
      footer={
        showPagination ? (
          <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} />
        ) : undefined
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            {canManage ? <TableHead>Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                {u.email}
                {u.id === currentUserId ? (
                  <Badge variant="neutral" className="ml-2">
                    You
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>
                {canManage && u.id !== currentUserId ? (
                  <Select
                    value={u.role}
                    disabled={pendingId === u.id}
                    onValueChange={(role) => onUpdate(u.id, { role: role as Role })}
                  >
                    <SelectTrigger className="w-36">
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
                  <span className="text-(--color-text-secondary)">{u.role}</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={u.active ? "success" : "neutral"}>{u.active ? "Active" : "Inactive"}</Badge>
              </TableCell>
              {canManage ? (
                <TableCell>
                  {u.id === currentUserId ? (
                    <span className="text-caption text-(--color-text-tertiary)">—</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pendingId === u.id}
                      onClick={() => onUpdate(u.id, { active: !u.active })}
                    >
                      {u.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TablePanel>
  );
}
