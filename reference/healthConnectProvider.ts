// healthConnectProvider.ts
// Requires: expo install react-native-health-connect
// Android only. Health Connect is a separate app the user must have
// installed (bundled by default on Android 14+, optional download before
// that) -- worth an in-app prompt if it's missing, since there's no
// permission dialog to fall back to otherwise.

import {
  initialize,
  requestPermission,
  readRecords,
} from "react-native-health-connect";
import { HealthProvider, DailyActivity, Workout } from "./HealthProvider";

export class HealthConnectProvider implements HealthProvider {
  readonly name = "Health Connect";

  async requestAuthorization(): Promise<boolean> {
    const isInitialized = await initialize();
    if (!isInitialized) return false;

    const granted = await requestPermission([
      { accessType: "read", recordType: "Steps" },
      { accessType: "read", recordType: "HeartRateVariabilityRmssd" },
      { accessType: "read", recordType: "RestingHeartRate" },
      { accessType: "read", recordType: "SleepSession" },
      { accessType: "read", recordType: "ActiveCaloriesBurned" },
      { accessType: "read", recordType: "ExerciseSession" },
    ]);
    return granted.length > 0;
  }

  async getDailyActivity(startDate: string, endDate: string): Promise<DailyActivity[]> {
    const timeFilter = {
      operator: "between" as const,
      startTime: new Date(startDate).toISOString(),
      endTime: new Date(endDate).toISOString(),
    };

    const [steps, hrv, restingHr, sleep, calories] = await Promise.all([
      readRecords("Steps", { timeRangeFilter: timeFilter }),
      readRecords("HeartRateVariabilityRmssd", { timeRangeFilter: timeFilter }),
      readRecords("RestingHeartRate", { timeRangeFilter: timeFilter }),
      readRecords("SleepSession", { timeRangeFilter: timeFilter }),
      readRecords("ActiveCaloriesBurned", { timeRangeFilter: timeFilter }),
    ]);

    const dates = uniqueDates([
      ...steps.records,
      ...hrv.records,
      ...restingHr.records,
      ...sleep.records,
      ...calories.records,
    ]);

    return dates.map((date) => ({
      date,
      steps: sumForDate(steps.records, date, "count"),
      activeCalories: sumForDate(calories.records, date, "energy.inKilocalories") || null,
      restingHeartRate: avgForDate(restingHr.records, date, "beatsPerMinute"),
      hrvMs: avgForDate(hrv.records, date, "heartRateVariabilityMillis"),
      sleepMinutes: sumSleepMinutesForDate(sleep.records, date),
    }));
  }

  async getWorkouts(startDate: string, endDate: string): Promise<Workout[]> {
    const { records } = await readRecords("ExerciseSession", {
      timeRangeFilter: {
        operator: "between",
        startTime: new Date(startDate).toISOString(),
        endTime: new Date(endDate).toISOString(),
      },
    });

    return records.map((r: any) => ({
      id: r.metadata?.id ?? `${r.startTime}-${r.exerciseType}`,
      source: "health_connect" as const,
      type: (r.exerciseType ?? "unknown").toString().toLowerCase(),
      startedAt: r.startTime,
      durationMinutes: Math.round(
        (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000
      ),
      calories: null, // join with ActiveCaloriesBurned by time window if needed
      avgHeartRate: null,
      distanceMeters: null,
    }));
  }
}

// --- helpers -----------------------------------------------------------

function uniqueDates(records: any[]): string[] {
  const set = new Set(
    records.map((r) => (r.startTime ?? r.time ?? "").slice(0, 10))
  );
  set.delete("");
  return Array.from(set).sort();
}

function sumForDate(records: any[], date: string, path: string): number {
  return records
    .filter((r) => (r.startTime ?? r.time ?? "").startsWith(date))
    .reduce((sum, r) => sum + (getPath(r, path) ?? 0), 0);
}

function avgForDate(records: any[], date: string, path: string): number | null {
  const matches = records.filter((r) => (r.startTime ?? r.time ?? "").startsWith(date));
  if (matches.length === 0) return null;
  const total = matches.reduce((sum, r) => sum + (getPath(r, path) ?? 0), 0);
  return Math.round((total / matches.length) * 10) / 10;
}

function sumSleepMinutesForDate(records: any[], date: string): number | null {
  const matches = records.filter((r) => (r.startTime ?? "").startsWith(date));
  if (matches.length === 0) return null;
  return matches.reduce(
    (sum, r) => sum + (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000,
    0
  );
}

function getPath(obj: any, path: string) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
