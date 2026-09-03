// ONE Dentally API client, used by all modules (FR-9) — packages/dentally.
// See project-docs/APPLICATION_FLOW.md section 5 and
// project-docs/PERFORMANCE_SCALABILITY.md section 1 for the design decisions.

export { DentallyClient, DentallyApiError, getDentallyClient } from "./src/client";
export type { DentallyClientOptions } from "./src/client";

export { syncPracticeDentallyData, syncPracticeDentallyPhase, syncPracticeDentallyPhasePage, mergeSyncCounts, DENTALLY_SYNC_PHASES, EMPTY_SYNC_COUNTS } from "./src/sync";
export type { SyncResult, SyncError, SyncCounts, SyncPhaseResult, SyncPhasePageResult, DentallySyncPhase } from "./src/sync";

export {
  resolvePracticeDentallyApiKey,
  getDentallyClientForPractice,
  DentallySyncConfigError,
} from "./src/resolve-api-key";

export {
  createDentallySyncRun,
  finalizeDentallySyncRun,
  failDentallySyncRun,
  failStaleDentallySyncRuns,
  failLatestRunningDentallySyncRun,
  getLatestDentallySyncRun,
  hasActiveDentallySyncRun,
  resolveRunStatus,
  STALE_RUNNING_MS,
} from "./src/sync-run";

export { getPatient, getPatients, getAppointments, getTreatments, getInvoices, getPayments, getAllPaymentsForPatient, getAccounts, getPaymentPlans } from "./src/queries";

export { inngest, dentallySyncFunction, requestDentallySync, inngestConfigured } from "./src/inngest";

export {
  runDentallySyncJob,
  runDentallySyncJobWithSteps,
  markDentallySyncFailedFromInngest,
  setDentallyPostSyncHook,
} from "./src/sync-job";
export type { DentallySyncStepRunner } from "./src/sync-job";

export {
  DEFAULT_FLOW_SETTINGS,
  mergeFlowSettingsInput,
  parseFlowSettingsJson,
  type FlowSettings,
} from "./src/flow-settings";
export { getFlowSettings, getFlowBranding, saveFlowSettings } from "./src/flow-settings-service";
export {
  importCosmeticConsultsFromDentally,
  syncConsultFinancialsFromSyncedCore,
  syncAllConsultFinancialsFromSyncedCore,
  resolveConsultBookedBy,
  shouldUpdatePractitionerFromSync,
} from "./src/flow-consult-import";
export type { CosmeticConsultImportResult, SyncAllConsultFinancialsResult } from "./src/flow-consult-import";

export { fetchLivePatientPanel } from "./src/live-patient";

export {
  runPlansDentallySync,
  runPlansDentallyReassign,
  PlansDentallySyncConfigError,
  matchPaymentPlanIds,
  dedupePatientsByDentallyId,
} from "./src/plans-sync";
export type { PlansDentallySyncResult, PlansDentallyReassignResult } from "./src/plans-sync";

export { normalizeEmail, emailsMatch, findExistingPatient } from "./src/patient-matching";
export type { MatchableExisting, MatchCandidate, MatchResult } from "./src/patient-matching";

export {
  searchDentallyPatients,
  fetchDentallyPatient,
  mapDentallySearchPatient,
} from "./src/plans-patient-search";
export type { DentallySearchPatient } from "./src/plans-patient-search";

export {
  fetchLiveDentallyPaymentPlans,
  mapLiveDentallyPaymentPlan,
} from "./src/plans-payment-plans";
export type { LiveDentallyPaymentPlan } from "./src/plans-payment-plans";
export type {
  LivePatientPanel,
  LivePatientAppointment,
  LivePatientInvoice,
  LivePatientPayment,
  LivePatientAccount,
} from "./src/live-patient";

export * from "./src/types";
