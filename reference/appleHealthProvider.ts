// appleHealthProvider.ts
// Requires: expo install react-native-health  (or the bare RN equivalent)
// iOS only. Must run inside a real device build -- HealthKit is unavailable
// in the iOS Simulator for most data types, so test on a physical iPhone.
//
// Add to app.json / Info.plist:
//   "NSHealthShareUsageDescription": "We use your health data to personalize
//   your training recommendations."

import AppleHealthKit, {
  HealthKitPermissions,
  HealthValue,
  HealthActivity,
} from "react-native-health";
import { HealthProvider, DailyActivity, Workout } from "./HealthProvider";

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.StepCount,
      AppleHealthKit.Constants.Permissions.HeartRateVariability,
      AppleHealthKit.Constants.Permissions.RestingHeartRate,
      AppleHealthKit.Constants.Permissions.SleepAnalysis,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      AppleHealthKit.Constants.Permissions.Workout,
    ],
    write: [],
  },
};

export class AppleHealthProvider implements HealthProvider {
  readonly name = "Apple Health";

  requestAuthorization(): Promise<boolean> {
    return new Promise((resolve) => {
      AppleHealthKit.initHealthKit(PERMISSIONS, (error: string) => {
        resolve(!error);
      });
    });
  }

  async getDailyActivity(startDate: string, endDate: string): Promise<DailyActivity[]> {
    const options = { startDate, endDate };

    const [steps, hrv, restingHr, sleep, calories] = await Promise.all([
      queryDaily(AppleHealthKit.getDailyStepCountSamples, options),
      queryDaily(AppleHealthKit.getHeartRateVariabilitySamples, options),
      queryDaily(AppleHealthKit.getRestingHeartRateSamples, options),
      queryDaily(AppleHealthKit.getSleepSamples, options),
      queryDaily(AppleHealthKit.getActiveEnergyBurned, options),
    ]);

    // Group everything by day. HealthKit returns raw samples, not daily
    // summaries, so this collapses them -- steps get summed, HRV/RHR get
    // averaged, sleep gets summed into total minutes for the night.
    const dates = uniqueDates([...steps, ...hrv, ...restingHr, ...sleep, ...calories]);

    return dates.map((date) => ({
      date,
      steps: sumForDate(steps, date, "value"),
      activeCalories: sumForDate(calories, date, "value") || null,
      restingHeartRate: avgForDate(restingHr, date, "value"),
      hrvMs: avgForDate(hrv, date, "value"),
      sleepMinutes: sumForDate(sleep, date, "value") || null,
    }));
  }

  async getWorkouts(startDate: string, endDate: string): Promise<Workout[]> {
    const samples: HealthActivity[] = await new Promise((resolve, reject) => {
      AppleHealthKit.getSamples(
        { startDate, endDate, type: "Workout" } as any,
        (err: string, results: HealthActivity[]) => (err ? reject(err) : resolve(results))
      );
    });

    return samples.map((w: any) => ({
      id: w.id ?? `${w.start}-${w.activityName}`,
      source: "apple_health" as const,
      type: w.activityName?.toLowerCase() ?? "unknown",
      startedAt: w.start,
      durationMinutes: Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 60000),
      calories: w.calories ?? null,
      avgHeartRate: null, // requires a separate quantity-sample query keyed to the workout window
      distanceMeters: w.distance ?? null,
    }));
  }
}

// --- helpers -----------------------------------------------------------

function queryDaily(fn: any, options: any): Promise<HealthValue[]> {
  return new Promise((resolve, reject) => {
    fn(options, (err: string, results: HealthValue[]) => (err ? reject(err) : resolve(results ?? [])));
  });
}

function uniqueDates(samples: HealthValue[]): string[] {
  const set = new Set(samples.map((s: any) => (s.startDate ?? s.date ?? "").slice(0, 10)));
  set.delete("");
  return Array.from(set).sort();
}

function sumForDate(samples: HealthValue[], date: string, key: string): number {
  return samples
    .filter((s: any) => (s.startDate ?? s.date ?? "").startsWith(date))
    .reduce((sum, s: any) => sum + (s[key] ?? 0), 0);
}

function avgForDate(samples: HealthValue[], date: string, key: string): number | null {
  const matches = samples.filter((s: any) => (s.startDate ?? s.date ?? "").startsWith(date));
  if (matches.length === 0) return null;
  const total = matches.reduce((sum, s: any) => sum + (s[key] ?? 0), 0);
  return Math.round((total / matches.length) * 10) / 10;
}
