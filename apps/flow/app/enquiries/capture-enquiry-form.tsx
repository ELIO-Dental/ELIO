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

interface CorePatient {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

const UNLINKED = "__unlinked__";

export function CaptureEnquiryForm({ patients }: { patients: CorePatient[] }) {
  const router = useRouter();
  const [patientId, setPatientId] = React.useState<string>(UNLINKED);
  const [source, setSource] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // basePath is "/flow" — raw fetch() calls are NOT auto-prefixed by Next,
      // only Link/router navigation is (this exact bug was found twice before).
      const res = await fetch("/flow/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patientId === UNLINKED ? undefined : patientId,
          source: source.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to capture enquiry");
      }
      setPatientId(UNLINKED);
      setSource("");
      toast.success("Enquiry captured");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't capture enquiry", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capture a new enquiry</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <div>
            <Label htmlFor="patient">Patient (optional)</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger id="patient">
                <SelectValue placeholder="Unlinked lead" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNLINKED}>Unlinked lead</SelectItem>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {[p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="source">Source</Label>
            <Input
              id="source"
              placeholder="e.g. phone, website form, walk-in"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" loading={submitting}>
              Capture enquiry
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
