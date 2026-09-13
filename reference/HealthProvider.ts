// HealthProvider.ts
// One shared interface for every wearable data source. The app talks to this
// interface only -- it never imports HealthKit, Health Connect, or Garmin
// code directly, which is what lets you add/swap providers without touching
// the readiness logic or UI.

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  steps: number;
  activeCalories: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  sleepMinutes: number | null;
}

export interface Workout {
  id: string;
  source: "apple_health" | "health_connect" | "garmin";
  type: string; // "running", "cycling", "pickleball", etc.
  startedAt: string; // ISO timestamp
  durationMinutes: number;
  calories: number | null;
  avgHeartRate: number | null;
  distanceMeters: number | null;
}

export interface HealthProvider {
  // Human-readable name for settings UI ("Apple Health", "Garmin")
  readonly name: string;

  // Kicks off the OS permission dialog (Apple/Health Connect) or OAuth
  // flow (Garmin). Returns whether the user granted access.
  requestAuthorization(): Promise<boolean>;

  // Pull activity summaries for a date range. On-device providers fetch
  // live; the Garmin provider reads from your own DB (see garminProvider.ts).
  getDailyActivity(startDate: string, endDate: string): Promise<DailyActivity[]>;

  getWorkouts(startDate: string, endDate: string): Promise<Workout[]>;
}

// A registry so the app can query "whichever providers this user has
// connected" rather than hardcoding which platform it's running on.
export class HealthProviderRegistry {
  private providers: HealthProvider[] = [];

  register(provider: HealthProvider) {
    this.providers.push(provider);
  }

  async getAllDailyActivity(start: string, end: string): Promise<DailyActivity[]> {
    const results = await Promise.all(
      this.providers.map((p) => p.getDailyActivity(start, end))
    );
    // If a user has both an Apple Watch and connects Garmin (common), you'll
    // get overlapping days from two sources -- merge by date, preferring
    // whichever source has more complete data (e.g. HRV present).
    return mergeDailyActivity(results.flat());
  }

  async getAllWorkouts(start: string, end: string): Promise<Workout[]> {
    const results = await Promise.all(
      this.providers.map((p) => p.getWorkouts(start, end))
    );
    return results.flat().sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }
}

function mergeDailyActivity(records: DailyActivity[]): DailyActivity[] {
  const byDate = new Map<string, DailyActivity>();
  for (const r of records) {
    const existing = byDate.get(r.date);
    if (!existing) {
      byDate.set(r.date, r);
      continue;
    }
    // Prefer the record with more non-null fields (more complete source)
    const existingFields = Object.values(existing).filter((v) => v !== null).length;
    const newFields = Object.values(r).filter((v) => v !== null).length;
    if (newFields > existingFields) byDate.set(r.date, r);
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date > b.date ? 1 : -1));
}
