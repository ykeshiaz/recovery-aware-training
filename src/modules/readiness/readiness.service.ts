import { BiometricSnapshot } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/httpError";
import {
  computePhysicalReadiness,
  computeSubjectiveReadiness,
  assignQuadrant,
  QUADRANT_META,
  BiometricDay,
} from "./readinessScoring";

// How many trailing days of biometric data feed the physical-readiness
// baseline. Matches generateHistory(seed, 14)'s default in the prototype.
const BASELINE_WINDOW_DAYS = 14;

// Looks up a cached readiness result for (userId, date); computes and
// caches one if it doesn't exist yet. This is what GET /readiness calls.
export async function getOrComputeReadiness(userId: string, dateStr: string) {
  const date = parseDateParam(dateStr);

  const cached = await prisma.readinessComputation.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (cached) return serializeReadiness(cached);

  const computed = await computeReadiness(userId, date);
  return serializeReadiness(computed);
}

// Computes today's readiness from the check-in + biometric data on file
// and upserts it into readiness_computations. Throws HttpError(404) if
// either input isn't available yet for that date.
export async function computeReadiness(userId: string, date: Date) {
  const checkIn = await prisma.dailyCheckIn.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (!checkIn) {
    throw new HttpError(404, "No check-in submitted for this date yet");
  }

  const history = await buildBiometricHistory(userId, date, BASELINE_WINDOW_DAYS);
  const todayKey = toDateKey(date);
  if (history[history.length - 1]?.date !== todayKey) {
    // No (complete) biometric snapshot for this exact date -- can't run
    // computePhysicalReadiness, which needs today's hrv + sleep directly.
    throw new HttpError(404, "No biometric data available for this date yet");
  }

  const physical = computePhysicalReadiness(history);
  const subjective = computeSubjectiveReadiness(checkIn);
  const quadrant = assignQuadrant(physical, subjective);
  const recommendation = QUADRANT_META[quadrant].recommendation;

  return prisma.readinessComputation.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      physicalReadinessScore: physical,
      subjectiveReadinessScore: subjective,
      quadrant,
      recommendation,
    },
    update: {
      physicalReadinessScore: physical,
      subjectiveReadinessScore: subjective,
      quadrant,
      recommendation,
    },
  });
}

// Best-effort variant used right after a check-in is submitted: computes
// and caches readiness if biometric data already happens to be in for
// today, but returns null instead of throwing if it isn't -- a missing
// wearable sync shouldn't fail the check-in submission itself.
export async function tryComputeReadiness(userId: string, date: Date) {
  try {
    return await computeReadiness(userId, date);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

// Builds the chronological BiometricDay[] that readinessScoring.ts expects,
// for the `windowDays` ending at (and including) endDate.
export async function buildBiometricHistory(
  userId: string,
  endDate: Date,
  windowDays: number
): Promise<BiometricDay[]> {
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (windowDays - 1));

  const snapshots = await prisma.biometricSnapshot.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    orderBy: { date: "asc" },
  });

  const byDate = new Map<string, BiometricSnapshot[]>();
  for (const snapshot of snapshots) {
    const key = toDateKey(snapshot.date);
    const rows = byDate.get(key) ?? [];
    rows.push(snapshot);
    byDate.set(key, rows);
  }

  const history: BiometricDay[] = [];
  for (const dateKey of Array.from(byDate.keys()).sort()) {
    const merged = mergeSnapshotsForDate(byDate.get(dateKey)!);
    // A day with no HRV or no sleep reading is incomplete -- skip it
    // rather than feeding a partial/zero value into the average, same
    // spirit as HealthProvider's "prefer whichever source is more
    // complete" but applied per-day instead of per-source.
    if (merged.hrvMs == null || merged.sleepDurationMin == null) continue;
    history.push({ date: dateKey, hrvMs: merged.hrvMs, sleepHours: merged.sleepDurationMin / 60 });
  }
  return history;
}

// Mirrors HealthProvider.ts's mergeDailyActivity: when a user has more
// than one source reporting for the same day (e.g. Apple Watch + Garmin
// both syncing), prefer whichever source recorded more non-null fields
// for that day rather than arbitrarily picking one.
function mergeSnapshotsForDate(rows: BiometricSnapshot[]): BiometricSnapshot {
  return rows.reduce((best, row) => (countNonNull(row) > countNonNull(best) ? row : best));
}

function countNonNull(row: BiometricSnapshot): number {
  return [row.hrvMs, row.restingHr, row.sleepDurationMin, row.sleepScore].filter((v) => v != null).length;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateParam(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new HttpError(400, "date must be in YYYY-MM-DD format");
  }
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "date must be a valid date");
  }
  return date;
}

function serializeReadiness(r: {
  userId: string;
  date: Date;
  physicalReadinessScore: number;
  subjectiveReadinessScore: number;
  quadrant: string;
  recommendation: string;
}) {
  return {
    userId: r.userId,
    date: toDateKey(r.date),
    physicalReadinessScore: r.physicalReadinessScore,
    subjectiveReadinessScore: r.subjectiveReadinessScore,
    quadrant: r.quadrant,
    recommendation: r.recommendation,
  };
}
