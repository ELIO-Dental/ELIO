export type PayslipAdjustment = {
  description: string;
  amount: number;
  type: "addition" | "deduction";
};

export type PayslipLabBill = {
  lab_name: string;
  amount: number;
  description?: string;
};

export function parsePayslipAdjustments(value: unknown): PayslipAdjustment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is PayslipAdjustment => Boolean(item && typeof item === "object" && "type" in item))
    .map((item) => ({
      description: String((item as PayslipAdjustment).description ?? ""),
      amount: Number((item as PayslipAdjustment).amount) || 0,
      type: (item as PayslipAdjustment).type === "addition" ? "addition" : "deduction",
    }));
}

export function parsePayslipLabBills(value: unknown): PayslipLabBill[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is PayslipLabBill => Boolean(item && typeof item === "object"))
    .map((item) => ({
      lab_name: String((item as PayslipLabBill).lab_name ?? ""),
      amount: Number((item as PayslipLabBill).amount) || 0,
      description: (item as PayslipLabBill).description,
    }));
}
