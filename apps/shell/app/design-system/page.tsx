"use client";

import * as React from "react";
import {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableCellMoney,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Switch,
  StatCard,
  EmptyState,
  Skeleton,
  useSkeleton,
  toast,
  Avatar,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  Popover,
  PopoverTrigger,
  PopoverContent,
  CommandPalette,
  useCommandPaletteHotkey,
  listModuleColors,
  Sidebar,
  AppLauncher,
  type ModuleId,
} from "@elio/ui";
import { Moon, Sun, Plus, FileX, Search, Users, Home, CreditCard, Calendar, Grid3x3 } from "lucide-react";

const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: Home, href: "#" },
  { id: "patients", label: "Patients", icon: Users, href: "#" },
  { id: "payments", label: "Payments", icon: CreditCard, href: "#" },
  { id: "calendar", label: "Calendar", icon: Calendar, href: "#" },
];

function ThemeToggleRow() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="flex items-center gap-3">
      <Sun className="size-4 text-(--color-text-secondary)" />
      <Switch checked={dark} onCheckedChange={setDark} aria-label="Toggle dark mode" />
      <Moon className="size-4 text-(--color-text-secondary)" />
      <span className="text-body-sm text-(--color-text-secondary)">
        {dark ? "Dark mode" : "Light mode"}
      </span>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-6 border-b border-(--color-border-subtle) py-12">
      <h2 className="text-h2 text-(--color-text-primary)">{title}</h2>
      {children}
    </section>
  );
}

function SkeletonDemo() {
  const [loading, setLoading] = React.useState(true);
  const showSkeleton = useSkeleton(loading);
  return (
    <div className="flex flex-col gap-3">
      <Button size="sm" variant="secondary" onClick={() => setLoading((v) => !v)}>
        Toggle loading
      </Button>
      {showSkeleton ? (
        <Skeleton className="h-24 w-full max-w-sm" />
      ) : (
        <div className="flex h-24 w-full max-w-sm items-center justify-center rounded-(--radius-md) border border-(--color-border-subtle) text-body-sm text-(--color-text-secondary)">
          Loaded content
        </div>
      )}
    </div>
  );
}

const paletteItems = [
  { id: "home", label: "Go to Dashboard", group: "Navigation", icon: <Home className="size-4" />, onSelect: () => toast("Navigated to Dashboard") },
  { id: "patients", label: "Search Patients", group: "Navigation", icon: <Users className="size-4" />, onSelect: () => toast("Opened Patients") },
  { id: "new-plan", label: "New plan", group: "Quick actions", shortcut: "N", onSelect: () => toast.success("Created plan") },
  { id: "run-pay", label: "Run pay period", group: "Quick actions", onSelect: () => toast.success("Pay run started") },
];

export default function DesignSystemPage() {
  const [paletteOpen, setPaletteOpen] = useCommandPaletteHotkey();
  const [sidebarActive, setSidebarActive] = React.useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const modules = listModuleColors();

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />

      <header className="sticky top-0 z-(--z-index-sticky) -mx-4 flex flex-wrap items-center justify-between gap-4 border-b border-(--color-border-subtle) bg-(--color-bg)/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div>
          <h1 className="text-h1 text-(--color-text-primary)">ELIO Design System</h1>
          <p className="text-body-sm text-(--color-text-secondary)">
            Dev-only visual QA page — every component, every state, light + dark. Press{" "}
            <kbd className="rounded-(--radius-sm) border border-(--color-border) px-1.5 py-0.5 text-caption">Ctrl/⌘+K</kbd>{" "}
            for the command palette.
          </p>
        </div>
        <ThemeToggleRow />
      </header>

      <Section title="Buttons (§5.1)" id="buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <Button magnetic variant="primary" size="lg">
            <Plus className="size-4" /> Magnetic CTA
          </Button>
        </div>
      </Section>

      <Section title="Inputs (§5.2)" id="inputs">
        <div className="grid max-w-2xl gap-6 sm:grid-cols-2">
          <div>
            <Label>Practice name</Label>
            <Input placeholder="e.g. Riverside Dental" />
          </div>
          <div>
            <Label>Email (error state)</Label>
            <Input defaultValue="not-an-email" error="Enter a valid email address" />
          </div>
          <div>
            <Label>Email (success state)</Label>
            <Input defaultValue="hello@elio.dental" success />
          </div>
          <div>
            <Label>Disabled</Label>
            <Input disabled placeholder="Disabled input" />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea placeholder="Add a note..." />
          </div>
          <div>
            <Label>Module</Label>
            <Select defaultValue="flow">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flow">ElioFlow</SelectItem>
                <SelectItem value="pay">ElioPay</SelectItem>
                <SelectItem value="plans">ElioPlans</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Cards & Stat Cards (§5.3, §5.11)" id="cards">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Static card</CardTitle>
            </CardHeader>
            <CardContent>Default, non-interactive surface.</CardContent>
          </Card>
          <Card interactive>
            <CardHeader>
              <CardTitle>Interactive card</CardTitle>
            </CardHeader>
            <CardContent>Hover to see lift + shadow.</CardContent>
          </Card>
          <Card accentColor="var(--color-module-pay)">
            <CardHeader>
              <CardTitle>Module-accented</CardTitle>
            </CardHeader>
            <CardContent>Top border uses a module color (§8.3).</CardContent>
          </Card>
          <StatCard
            label="Collected this month"
            value={48210}
            format={(v) => `£${v.toLocaleString()}`}
            trend={{ direction: "up", percent: 12 }}
            sparklineData={[4, 8, 6, 10, 9, 14, 12, 18]}
          />
          <StatCard
            label="Overdue balance"
            value={2140}
            format={(v) => `£${v.toLocaleString()}`}
            trend={{ direction: "down", percent: 4 }}
            sparklineData={[10, 9, 8, 7, 6, 5, 5, 4]}
          />
          <StatCard label="Active plans" value={312} trend={{ direction: "up", percent: 6 }} />
        </div>
      </Section>

      <Section title="Badges (§5.6)" id="badges">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="success">Paid</Badge>
          <Badge variant="warning">Pending</Badge>
          <Badge variant="danger">Overdue</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="primary">Primary</Badge>
          <Badge variant="success" pulse>
            Syncing with Dentally
          </Badge>
        </div>
      </Section>

      <Section title="Table (§5.4)" id="table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { name: "A. Whitfield", status: "success", amount: "£420.00" },
              { name: "R. Okafor", status: "warning", amount: "£128.50" },
              { name: "M. Chen", status: "danger", amount: "£85.00" },
            ].map((row) => (
              <TableRow key={row.name}>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  <Badge variant={row.status as "success" | "warning" | "danger"}>
                    {row.status === "success" ? "Paid" : row.status === "warning" ? "Pending" : "Overdue"}
                  </Badge>
                </TableCell>
                <TableCellMoney
                  className={
                    row.status === "success"
                      ? "text-(--color-success)"
                      : row.status === "warning"
                        ? "text-(--color-warning)"
                        : "text-(--color-danger)"
                  }
                >
                  {row.amount}
                </TableCellMoney>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Dialog (§5.7)" id="dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm action</DialogTitle>
              <DialogDescription>This is a themed Radix dialog with glass overlay and scale entrance.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="primary">Confirm</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Toasts (§5.8)" id="toasts">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success("Payment reconciled")}>
            Success toast
          </Button>
          <Button variant="secondary" onClick={() => toast.error("Sync failed", { duration: 8000 })}>
            Error toast
          </Button>
          <Button variant="secondary" onClick={() => toast("Reminder sent")}>
            Neutral toast
          </Button>
        </div>
      </Section>

      <Section title="Command Palette (§5.9)" id="command-palette">
        <Button variant="secondary" onClick={() => setPaletteOpen(true)}>
          <Search className="size-4" /> Open command palette
        </Button>
      </Section>

      <Section title="Empty States (§5.10)" id="empty-states">
        <EmptyState
          icon={FileX}
          title="No plans yet"
          description="Create your first payment plan to start collecting for this practice."
          action={{ label: "New plan", onClick: () => toast("Create plan flow") }}
        />
      </Section>

      <Section title="Skeleton (§6.6)" id="skeleton">
        <SkeletonDemo />
      </Section>

      <Section title="Toggle / Switch (§5.13)" id="switch">
        <div className="flex flex-wrap items-center gap-6">
          <Switch defaultChecked={false} aria-label="Off" />
          <Switch defaultChecked aria-label="On" />
          <Switch disabled aria-label="Disabled" />
          <Switch pending defaultChecked aria-label="Pending" />
        </div>
      </Section>

      <Section title="Avatar & Dropdown (§5.17)" id="avatar-dropdown">
        <div className="flex flex-wrap items-center gap-6">
          <Avatar initials="JD" size="sm" />
          <Avatar initials="AW" size="md" />
          <Avatar initials="MC" size="lg" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Account menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Riverside Dental</DropdownMenuLabel>
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuItem destructive separatorBefore>
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost">Popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-body-sm">A themed Radix popover surface.</p>
            </PopoverContent>
          </Popover>
        </div>
      </Section>

      <Section title="Sidebar & App Launcher (§5.5)" id="sidebar">
        <div className="flex h-96 w-full max-w-2xl overflow-hidden rounded-(--radius-lg) border border-(--color-border)">
          <Sidebar
            items={SIDEBAR_ITEMS}
            activeId={sidebarActive}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
            activeModuleId="pay"
            onNavigate={(item) => setSidebarActive(item.id)}
            launcher={
              <AppLauncher
                trigger={
                  <button className="flex size-8 items-center justify-center rounded-(--radius-sm) text-(--color-text-secondary) hover:bg-(--color-border-subtle)">
                    <Grid3x3 className="size-4" />
                  </button>
                }
                tiles={modules.slice(0, 6).map((m) => ({
                  moduleId: m.id,
                  name: m.name,
                  description: m.status === "built" ? "Open the module" : "Coming soon",
                  href: "#",
                  licensed: m.status === "built",
                }))}
              />
            }
          />
          <div className="flex flex-1 items-center justify-center bg-(--color-bg) text-body-sm text-(--color-text-tertiary)">
            Module content area
          </div>
        </div>
      </Section>

      <Section title="Module Color System (§8)" id="module-colors">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {modules.map((m) => (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-(--radius-lg) border border-(--color-border-subtle) p-4"
              style={{ borderTop: `2px solid ${m.accentBorder}` }}
            >
              <span
                className="flex size-9 items-center justify-center rounded-(--radius-md) text-body-sm font-semibold"
                style={{ backgroundColor: m.badgeLight.bg, color: m.badgeLight.fg }}
              >
                {m.name.replace("Elio", "").slice(0, 1)}
              </span>
              <span className="text-body-sm font-medium text-(--color-text-primary)">{m.name}</span>
              <span className="text-caption text-(--color-text-tertiary)">{m.status}</span>
              <span className="text-caption text-(--color-text-tertiary)">{m.hex}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-6 rounded-(--radius-lg) border border-(--color-border-subtle) p-4">
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-(--radius-sm)" style={{ background: "var(--color-primary-500)" }} />
            <span className="text-body-sm">Primary action (#7c5cfc)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-(--radius-sm)" style={{ background: "var(--color-module-plans)" }} />
            <span className="text-body-sm">ElioPlans module color (#6366f1)</span>
          </div>
          <span className="text-caption text-(--color-text-tertiary)">
            Side-by-side check per §8.1's note — the two remain visually distinguishable.
          </span>
        </div>
      </Section>

      <Section title="Typography (§3)" id="typography">
        <div className="flex flex-col gap-3">
          <p className="text-display-lg text-(--color-text-primary)">Display LG</p>
          <p className="text-display text-(--color-text-primary)">Display</p>
          <p className="text-h1 text-(--color-text-primary)">Heading 1</p>
          <p className="text-h2 text-(--color-text-primary)">Heading 2</p>
          <p className="text-h3 text-(--color-text-primary)">Heading 3</p>
          <p className="text-body-lg text-(--color-text-primary)">Body large</p>
          <p className="text-body text-(--color-text-primary)">Body</p>
          <p className="text-body-sm text-(--color-text-secondary)">Body small</p>
          <p className="text-caption text-(--color-text-tertiary)">Caption</p>
          <p className="text-money-hero tabular-nums text-(--color-text-primary)">£12,480.00</p>
        </div>
      </Section>
    </main>
  );
}
