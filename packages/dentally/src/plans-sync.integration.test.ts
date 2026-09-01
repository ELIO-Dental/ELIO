import { beforeEach, describe, expect, it, vi } from "vitest";

const mappingFindMany = vi.fn();
const patientFindMany = vi.fn();
const patientFindFirst = vi.fn();
const patientCreate = vi.fn();
const patientUpdate = vi.fn();
const planPatientFindFirst = vi.fn();
const planPatientCreate = vi.fn();
const enrolmentCreate = vi.fn();
const mandateCount = vi.fn();

vi.mock("@elio/db", () => ({
  scopedDb: () => ({
    dentallyPlanMapping: { findMany: mappingFindMany },
    patient: {
      findMany: patientFindMany,
      findFirst: patientFindFirst,
      create: patientCreate,
      update: patientUpdate,
    },
    planPatient: {
      findFirst: planPatientFindFirst,
      create: planPatientCreate,
      update: vi.fn(),
    },
    patientPlanEnrolment: {
      findFirst: vi.fn(),
      create: enrolmentCreate,
      update: vi.fn(),
    },
    planMandate: { count: mandateCount },
  }),
}));

const paginate = vi.fn();
vi.mock("./resolve-api-key", () => ({
  getDentallyClientForPractice: vi.fn(async () => ({ paginate })),
}));

import { runPlansDentallySync } from "./plans-sync";
import { PlansDentallySyncConfigError } from "./plans-sync-errors";

describe("runPlansDentallySync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mappingFindMany.mockResolvedValue([{ dentallyPlanName: "AuraCare", planModelId: "plan-1" }]);
    patientFindMany.mockResolvedValue([]);
    patientFindFirst.mockResolvedValue(null);
    planPatientFindFirst.mockResolvedValue(null);
    mandateCount.mockResolvedValue(0);
    patientCreate.mockResolvedValue({ id: "new-patient-id" });
    planPatientCreate.mockResolvedValue({ id: "new-plan-patient-id" });
    enrolmentCreate.mockResolvedValue({ id: "new-enrolment-id" });
    paginate.mockImplementation(async (_path, listKey, _params, onPage) => {
      if (listKey === "payment_plans") {
        await onPage([{ id: 10, name: "AuraCare", active: true }]);
        return 1;
      }
      if (listKey === "patients") {
        await onPage([
          {
            id: 501,
            first_name: "New",
            last_name: "Member",
            email_address: "new@example.com",
            payment_plan_id: 10,
          },
        ]);
        return 1;
      }
      return 0;
    });
  });

  it("throws when no plan mappings exist", async () => {
    mappingFindMany.mockResolvedValue([]);
    await expect(runPlansDentallySync("practice-1")).rejects.toBeInstanceOf(PlansDentallySyncConfigError);
  });

  it("imports a new patient with plan enrolment", async () => {
    const result = await runPlansDentallySync("practice-1");

    expect(result).toMatchObject({
      imported: 1,
      updated: 0,
      skipped: 0,
      total: 1,
      plansMatched: 1,
      syncedPlanIds: [10],
    });
    expect(patientCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          practiceId: "practice-1",
          dentallyId: "501",
          email: "new@example.com",
        }),
      }),
    );
    expect(planPatientCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "INVITED",
          planModelId: "plan-1",
        }),
      }),
    );
    expect(enrolmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING", planId: "plan-1" }),
      }),
    );
  });

  it("updates an existing patient matched by dentally id", async () => {
    patientFindMany.mockResolvedValue([
      {
        id: "existing-id",
        dentallyId: "501",
        email: "old@example.com",
        phone: null,
        firstName: "Old",
        lastName: "Name",
        dateOfBirth: null,
      },
    ]);
    planPatientFindFirst.mockResolvedValue({ id: "pp-1", status: "INVITED", planModelId: "plan-1" });
    mandateCount.mockResolvedValue(0);

    const result = await runPlansDentallySync("practice-1");

    expect(result.updated).toBe(1);
    expect(patientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-id" },
        data: expect.objectContaining({ email: "new@example.com" }),
      }),
    );
    expect(patientCreate).not.toHaveBeenCalled();
  });

  it("skips enrolment updates for cancelled plan patients", async () => {
    patientFindMany.mockResolvedValue([
      {
        id: "existing-id",
        dentallyId: "501",
        email: "new@example.com",
        phone: null,
        firstName: "New",
        lastName: "Member",
        dateOfBirth: null,
      },
    ]);
    planPatientFindFirst.mockResolvedValue({ id: "pp-1", status: "CANCELLED", planModelId: "plan-1" });

    const result = await runPlansDentallySync("practice-1");

    expect(result.skipped).toBe(1);
    expect(enrolmentCreate).not.toHaveBeenCalled();
  });
});
