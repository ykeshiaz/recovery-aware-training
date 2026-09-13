import { ActivitySource } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { parseDateParam, toDateKey } from "../readiness/readiness.service";

export interface DateRange {
  start: Date;
  end: Date;
}

export function parseRange(startStr: string, endStr: string): DateRange {
  return { start: parseDateParam(startStr), end: parseDateParam(endStr) };
}

// Returns rows shaped exactly like HealthProvider.ts's DailyActivity --
// no `source` field, since (per that interface) each provider only ever
// returns its own source's data; garminProvider.ts calls this endpoint
// with source=garmin and expects DailyActivity[] back directly.
export async function getDailyActivity(userId: string, range: DateRange, source?: ActivitySource) {
  const rows = await prisma.dailyActivity.findMany({
    where: { userId, date: { gte: range.start, lte: range.end }, source },
    orderBy: { date: "asc" },
  });

  return rows.map((r) => ({
    date: toDateKey(r.date),
    steps: r.steps,
    activeCalories: r.activeCalories,
    restingHeartRate: r.restingHeartRate,
    hrvMs: r.hrvMs,
    sleepMinutes: r.sleepMinutes,
  }));
}

// Shaped like HealthProvider.ts's Workout.
export async function getWorkouts(userId: string, range: DateRange, source?: ActivitySource) {
  const rows = await prisma.workout.findMany({
    where: {
      userId,
      source,
      startedAt: {
        gte: range.start,
        // end is a calendar date (YYYY-MM-DD) with an implicit 00:00 UTC
        // time; add a day so workouts started anytime ON that end date
        // are included, not just ones before midnight at its start.
        lt: addDays(range.end, 1),
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return rows.map((w) => ({
    id: w.id,
    source: w.source,
    type: w.type,
    startedAt: w.startedAt.toISOString(),
    durationMinutes: w.durationMinutes,
    calories: w.calories,
    avgHeartRate: w.avgHeartRate,
    distanceMeters: w.distanceMeters,
  }));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
