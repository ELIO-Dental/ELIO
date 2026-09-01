export class PlansDentallySyncConfigError extends Error {
  details: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PlansDentallySyncConfigError";
    this.details = details;
  }
}
