// Server-side port of the readiness math from recovery_aware_trainer_app.jsx
// (computePhysicalReadiness, computeSubjectiveReadiness, assignQuadrant).
//
// This file has NO database or HTTP imports on purpose -- it's pure
// functions in, numbers out, so it's trivially unit-testable and you can
// diff it against the original .jsx to confirm nothing drifted. All I/O
// (fetching biometric history, persisting the result) lives in
// readiness.service.ts, which calls into this file.
//
// Physical and subjective readiness are computed independently and only
// combined at the very last step (assignQuadrant) -- per the product
// decision in the prompt, they are never averaged into one blended score.

export type Quadrant = "aligned_ready" | "aligned_fatigued" | "physical_only" | "mental_only";

export interface BiometricDay {
  date: string; // YYYY-MM-DD
  hrvMs: number;
  sleepHours: number;
}

export interface SubjectiveCheckIn {
  mood: number; // 1-5
  motivation: number; // 1-5
  stress: number; // 1-5
  soreness: number; // 1-5
}

// `history` mirrors the .jsx's `history` array: chronological, with the
// most recent day (today) as the LAST element. Everything before it is
// the trailing baseline window today gets compared against.
export function computePhysicalReadiness(history: BiometricDay[]): number {
  if (history.length === 0) {
    throw new Error("computePhysicalReadiness requires at least one day of data");
  }

  const today = history[history.length - 1];
  const baselineWindow = history.slice(0, -1);

  // DEVIATION FROM THE PROTOTYPE: the .jsx always seeds 14 mock days, so
  // baselineWindow is never empty there. A real brand-new user's first-ever
  // day has no trailing history to compare against, which would divide by
  // zero (0/0 = NaN) in the original formula. There's no "correct" physical
  // score with zero baseline, so this returns a neutral 50 (exactly on the
  // aligned/not-aligned boundary) rather than propagating NaN into the
  // quadrant logic.
  if (baselineWindow.length === 0) {
    return 50;
  }

  const avgHrv = average(baselineWindow.map((d) => d.hrvMs));
  const avgSleep = average(baselineWindow.map((d) => d.sleepHours));

  // Guard against a zero baseline average (e.g. all-zero placeholder data)
  // producing a division-by-zero delta; the prototype's mock data never
  // hits this since hrv/sleepHours are always positive there.
  const hrvDelta = avgHrv === 0 ? 0 : (today.hrvMs - avgHrv) / avgHrv;
  const sleepDelta = avgSleep === 0 ? 0 : (today.sleepHours - avgSleep) / avgSleep;

  // Weighted composite, normalized roughly to 0-100 -- identical formula
  // and weights to the .jsx.
  const raw = hrvDelta * 0.65 + sleepDelta * 0.35;
  const score = clamp(50 + raw * 140, 0, 100);
  return Math.round(score);
}

export function computeSubjectiveReadiness(checkIn: SubjectiveCheckIn): number {
  // mood + motivation are positive signals, stress + soreness are inverted.
  const positive = (checkIn.mood + checkIn.motivation) / 2; // 1-5
  const negative = (checkIn.stress + checkIn.soreness) / 2; // 1-5
  const raw = positive - negative; // -4..4
  const score = clamp(50 + raw * 15, 0, 100);
  return Math.round(score);
}

export function assignQuadrant(physical: number, subjective: number): Quadrant {
  const physicalOk = physical >= 50;
  const subjectiveOk = subjective >= 50;
  if (physicalOk && subjectiveOk) return "aligned_ready";
  if (!physicalOk && !subjectiveOk) return "aligned_fatigued";
  if (!physicalOk && subjectiveOk) return "physical_only";
  return "mental_only";
}

// Copied verbatim (minus the `color` field, which is a UI concern) from
// QUADRANT_META in the .jsx, so the API's `recommendation` text matches
// exactly what the prototype already shows.
export const QUADRANT_META: Record<Quadrant, { label: string; recommendation: string }> = {
  aligned_ready: {
    label: "Ready",
    recommendation:
      "Body and mind agree — go ahead with today's planned intensity, or push a bit if it's calling for it.",
  },
  aligned_fatigued: {
    label: "Rest",
    recommendation:
      "Body and mind agree this isn't a push day. Take the deload — no argument needed today.",
  },
  physical_only: {
    label: "Go easy",
    recommendation:
      "You feel good, but your body's signaling fatigue. This is the classic overtraining trap — dial back the intensity even though you don't feel like you need to.",
  },
  mental_only: {
    label: "Flagged",
    recommendation:
      "Your body's fine, but something else is going on today. The workout can proceed as planned — this one's worth a check-in with your trainer, not a training change.",
  },
};

// Rolling 7-day trainer-alert threshold, ported from TrainerDashboard: a
// client is "flagged" once 3 or more of their last 7 days landed in
// mental_only or aligned_fatigued.
export const CONCERNING_QUADRANTS: readonly Quadrant[] = ["mental_only", "aligned_fatigued"];
export const FLAG_THRESHOLD_DAYS = 3;
export const FLAG_WINDOW_DAYS = 7;

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
