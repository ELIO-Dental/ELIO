"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  toast,
} from "@elio/ui";

interface ConsultOption {
  id: string;
  patientName: string;
}

export function ScheduleReminderForm({ consults }: { consults: ConsultOption[] }) {
  const router = useRouter();
  const [consultId, setConsultId] = React.useState<string>("");
  const [dueAt, setDueAt] = React.useState("");
  const [channel, setChannel] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consultId || !dueAt) {
      toast.error("Choose a consult and a due date");
      return;
    }
    setSubmitting(true);
    try {
      // basePath is "/flow" — fetch() is never auto-prefixed by Next.
      const res = await fetch("/flow/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultId, dueAt, channel: channel.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to schedule reminder");
      }
      setConsultId("");
      setDueAt("");
      setChannel("");
      toast.success("Reminder scheduled");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't schedule reminder", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (consults.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schedule a reminder</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-(--color-text-secondary)">No open consults to schedule a reminder for.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule a reminder</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
          <div>
            <Label htmlFor="consult">Consult</Label>
            <Select value={consultId} onValueChange={setConsultId}>
              <SelectTrigger id="consult">
                <SelectValue placeholder="Select consult" />
              </SelectTrigger>
              <SelectContent>
                {consults.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.patientName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="dueAt">Due</Label>
            <Input id="dueAt" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="channel">Channel (optional)</Label>
            <Input id="channel" placeholder="e.g. call, SMS, email" value={channel} onChange={(e) => setChannel(e.target.value)} />
          </div>
          <div>
            <Button type="submit" loading={submitting}>
              Schedule reminder
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
