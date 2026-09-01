export type FlowDentallySyncMode = "full" | "payments";

export function parseFlowDentallySyncMode(value: unknown): FlowDentallySyncMode {
  return value === "payments" ? "payments" : "full";
}
