import { describe, expect, it } from "vitest";
import {
  calculateDiaryMetrics,
  generateDefaultWorkingHours,
  isAttendedAppointmentState,
  type OccupancyAppointment,
} from "./dentally-occupancy";

describe("isAttendedAppointmentState", () => {
  it("excludes cancelled/dna/failed states", () => {
    expect(isAttendedAppointmentState("cancelled")).toBe(false);
    expect(isAttendedAppointmentState("DNA")).toBe(false);
    expect(isAttendedAppointmentState("failed")).toBe(false);
    expect(isAttendedAppointmentState("completed")).toBe(true);
    expect(isAttendedAppointmentState(null)).toBe(true);
  });
});

describe("generateDefaultWorkingHours", () => {
  it("produces one 8h block per weekday, skipping weekends", () => {
    // Mon 2026-03-02 .. Sun 2026-03-08 (exclusive end)
    const blocks = generateDefaultWorkingHours("2026-03-02", "2026-03-09");
    expect(blocks).toHaveLength(5);
    expect(blocks.every((b) => b.availableMins === 480)).toBe(true);
    expect(blocks.map((b) => b.date)).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
    ]);
  });

  it("scales daily minutes from a custom weekly-hours figure", () => {
    const blocks = generateDefaultWorkingHours("2026-03-02", "2026-03-03", 20);
    expect(blocks[0]?.availableMins).toBe(240);
  });
});

describe("calculateDiaryMetrics", () => {
  const blocks = generateDefaultWorkingHours("2026-03-02", "2026-03-04"); // Mon+Tue, 480 mins each

  function apt(date: string, startHour: number, durationMins: number, state: string | null = "completed"): OccupancyAppointment {
    const startsAt = new Date(`${date}T${String(startHour).padStart(2, "0")}:00:00Z`);
    const endsAt = new Date(startsAt.getTime() + durationMins * 60000);
    return { practitionerId: "p1", startsAt, endsAt, dentallyState: state };
  }

  it("computes booked minutes, white space, and occupancy per day and overall", () => {
    const appointments = [apt("2026-03-02", 9, 120), apt("2026-03-02", 13, 60)];
    const metrics = calculateDiaryMetrics(appointments, blocks);

    expect(metrics.dailyBreakdown).toEqual([
      { date: "2026-03-02", availableMins: 480, bookedMins: 180, whiteSpaceMins: 300, occupancyPercent: 37.5 },
      { date: "2026-03-03", availableMins: 480, bookedMins: 0, whiteSpaceMins: 480, occupancyPercent: 0 },
    ]);
    expect(metrics.totalAvailableMins).toBe(960);
    expect(metrics.totalBookedMins).toBe(180);
    expect(metrics.totalWhiteSpaceMins).toBe(780);
    expect(metrics.occupancyPercent).toBe(18.8);
    expect(metrics.whiteSpacePercent).toBe(81.3);
  });

  it("ignores cancelled/DNA appointments entirely", () => {
    const appointments = [apt("2026-03-02", 9, 120, "cancelled"), apt("2026-03-02", 13, 60, "DNA")];
    const metrics = calculateDiaryMetrics(appointments, blocks);
    expect(metrics.totalBookedMins).toBe(0);
  });

  it("ignores appointments with no availability block for their date", () => {
    const appointments = [apt("2026-03-09", 9, 60)]; // outside the two-day range
    const metrics = calculateDiaryMetrics(appointments, blocks);
    expect(metrics.totalBookedMins).toBe(0);
  });

  it("discards a bad sync row spanning more than 8 hours", () => {
    const appointments = [apt("2026-03-02", 8, 600)];
    const metrics = calculateDiaryMetrics(appointments, blocks);
    expect(metrics.totalBookedMins).toBe(0);
  });

  it("returns all-zero metrics for an empty availability window", () => {
    const metrics = calculateDiaryMetrics([], []);
    expect(metrics.totalAvailableMins).toBe(0);
    expect(metrics.occupancyPercent).toBe(0);
    expect(metrics.whiteSpacePercent).toBe(0);
    expect(metrics.dailyBreakdown).toEqual([]);
  });
});
