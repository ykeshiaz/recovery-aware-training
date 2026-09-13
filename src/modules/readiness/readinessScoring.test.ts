import { describe, expect, it } from "vitest";
import {
  computePhysicalReadiness,
  computeSubjectiveReadiness,
  assignQuadrant,
  BiometricDay,
} from "./readinessScoring";

// Sanity checks that this port produces the same numbers the .jsx formulas
// would for the same inputs. These are hand-computed from the formulas in
// recovery_aware_trainer_app.jsx, not copied from prototype output, so a
// failure here means the port has actually drifted.

describe("computePhysicalReadiness", () => {
  it("returns 50 (neutral) when today's HRV/sleep exactly match the baseline average", () => {
    const history: BiometricDay[] = [
      { date: "2024-01-01", hrvMs: 60, sleepHours: 7 },
      { date: "2024-01-02", hrvMs: 60, sleepHours: 7 },
      { date: "2024-01-03", hrvMs: 60, sleepHours: 7 }, // "today"
    ];
    expect(computePhysicalReadiness(history)).toBe(50);
  });

  it("scores above 50 when HRV and sleep are both above baseline", () => {
    const history: BiometricDay[] = [
      { date: "2024-01-01", hrvMs: 50, sleepHours: 7 },
      { date: "2024-01-02", hrvMs: 50, sleepHours: 7 },
      { date: "2024-01-03", hrvMs: 60, sleepHours: 8 }, // today: +20% hrv, ~+14% sleep
    ];
    // hrvDelta = 0.2, sleepDelta = 1/7 ≈ 0.142857
    // raw = 0.2*0.65 + 0.142857*0.35 ≈ 0.18
    // score = 50 + 0.18*140 ≈ 75.14 -> rounds to 75
    expect(computePhysicalReadiness(history)).toBe(75);
  });

  it("clamps to 0 for a severe HRV/sleep crash vs. baseline", () => {
    const history: BiometricDay[] = [
      { date: "2024-01-01", hrvMs: 80, sleepHours: 8 },
      { date: "2024-01-02", hrvMs: 80, sleepHours: 8 },
      { date: "2024-01-03", hrvMs: 10, sleepHours: 2 }, // today: way below baseline
    ];
    expect(computePhysicalReadiness(history)).toBe(0);
  });

  it("returns a neutral 50 for a brand-new user with no baseline history", () => {
    // DEVIATION FROM THE PROTOTYPE, documented in readinessScoring.ts:
    // the .jsx always has 14 mock days, so this case (day 1, nothing to
    // compare against) never comes up there.
    const history: BiometricDay[] = [{ date: "2024-01-01", hrvMs: 55, sleepHours: 7 }];
    expect(computePhysicalReadiness(history)).toBe(50);
  });
});

describe("computeSubjectiveReadiness", () => {
  it("returns 50 when positive and negative signals balance out", () => {
    // positive = (3+3)/2 = 3, negative = (3+3)/2 = 3, raw = 0
    expect(computeSubjectiveReadiness({ mood: 3, motivation: 3, stress: 3, soreness: 3 })).toBe(50);
  });

  it("scores high for great mood/motivation and low stress/soreness", () => {
    // positive = (5+5)/2 = 5, negative = (1+1)/2 = 1, raw = 4
    // score = 50 + 4*15 = 110 -> clamped to 100
    expect(computeSubjectiveReadiness({ mood: 5, motivation: 5, stress: 1, soreness: 1 })).toBe(100);
  });

  it("scores low for rough mood/motivation and high stress/soreness", () => {
    // positive = 1, negative = 5, raw = -4, score = 50 - 60 = -10 -> clamped to 0
    expect(computeSubjectiveReadiness({ mood: 1, motivation: 1, stress: 5, soreness: 5 })).toBe(0);
  });
});

describe("assignQuadrant", () => {
  it("is aligned_ready when both scores are >= 50", () => {
    expect(assignQuadrant(50, 50)).toBe("aligned_ready");
    expect(assignQuadrant(80, 60)).toBe("aligned_ready");
  });

  it("is aligned_fatigued when both scores are below 50", () => {
    expect(assignQuadrant(49, 49)).toBe("aligned_fatigued");
    expect(assignQuadrant(0, 0)).toBe("aligned_fatigued");
  });

  it("is physical_only when the body lags but the mind is ready (the overtraining trap)", () => {
    expect(assignQuadrant(20, 70)).toBe("physical_only");
  });

  it("is mental_only when the body's fine but something else is off", () => {
    expect(assignQuadrant(70, 20)).toBe("mental_only");
  });
});
