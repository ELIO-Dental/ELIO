// ONE Dentally API client, used by all modules (FR-9) — packages/dentally.
// See project-docs/APPLICATION_FLOW.md section 5 and
// project-docs/PERFORMANCE_SCALABILITY.md section 1 for the design decisions.

export { DentallyClient, DentallyApiError, getDentallyClient } from "./src/client";
export type { DentallyClientOptions } from "./src/client";

export { syncPracticeDentallyData } from "./src/sync";
export type { SyncResult, SyncError } from "./src/sync";

export {
  resolvePracticeDentallyApiKey,
  getDentallyClientForPractice,
  DentallySyncConfigError,
} from "./src/resolve-api-key";

export {
  createDentallySyncRun,
  finalizeDentallySyncRun,
  failDentallySyncRun,
  getLatestDentallySyncRun,
  resolveRunStatus,
} from "./src/sync-run";

export { getPatient, getPatients, getAppointments, getTreatments, getInvoices, getPayments, getAccounts } from "./src/queries";

export { inngest, dentallySyncFunction, requestDentallySync, inngestConfigured } from "./src/inngest";

export { runDentallySyncJob, setDentallyPostSyncHook } from "./src/sync-job";

export {
  importCosmeticConsultsFromDentally,
  syncConsultFinancialsFromSyncedCore,
} from "./src/flow-consult-import";
export type { CosmeticConsultImportResult } from "./src/flow-consult-import";

export * from "./src/types";
