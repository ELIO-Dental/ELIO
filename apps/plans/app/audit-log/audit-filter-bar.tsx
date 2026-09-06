"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@elio/ui";

const TARGET_TYPE_OPTIONS = [
  { value: "ALL", label: "All entity types" },
  { value: "PlanPatient", label: "PlanPatient" },
  { value: "PlanModel", label: "PlanModel" },
  { value: "PlanRedeem", label: "PlanRedeem" },
  { value: "PlanRedeemRule", label: "PlanRedeemRule" },
  { value: "PlanDocument", label: "PlanDocument" },
  { value: "PlanMandate", label: "PlanMandate" },
  { value: "PlanPracticeSetting", label: "PlanPracticeSetting" },
  { value: "PlanGuideArticle", label: "PlanGuideArticle" },
  { value: "DentallyPlanMapping", label: "DentallyPlanMapping" },
  { value: "Practice", label: "Practice" },
] as const;

/** Entity-type filter for Audit Log — URL-driven via searchParams.targetType. */
export function AuditFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const targetType = searchParams.get("targetType") ?? "ALL";

  function setTargetType(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next || next === "ALL") params.delete("targetType");
    else params.set("targetType", next);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={TARGET_TYPE_OPTIONS.some((o) => o.value === targetType) ? targetType : "ALL"}
        onValueChange={setTargetType}
      >
        <SelectTrigger className="w-[220px]" aria-label="Filter by entity type">
          <SelectValue placeholder="Entity type" />
        </SelectTrigger>
        <SelectContent>
          {TARGET_TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
