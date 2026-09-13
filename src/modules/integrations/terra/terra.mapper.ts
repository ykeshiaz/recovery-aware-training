// Maps a Terra webhook payload into upserts against daily_activity,
// biometric_snapshots, workouts, and garmin_connections.
//
// CALL-OUT FOR YOU: Terra's exact field names below (steps_data,
// heart_rate_data.summary.avg_hrv_rmssd, sleep_durations_data, etc.) are
// written from Terra's documented v2 payload shape, but I don't have a
// live payload sample to check against -- Terra's fields have shifted
// between API versions before. Treat every field path in this file as
// "probably right, verify against a real payload" once you have sandbox
// credentials: log a payload from Terra's dashboard test-webhook feature,
// diff it against the paths read here, and adjust. Everything AROUND the
// field-reading (idempotent upserts, partial-merge updates, user mapping
// via reference_id) is the part that matters architecturally and won't
// need to change.
import { ActivitySource } from "@prisma/client";
import { prisma } from "../../../lib/prisma";

// Deliberately loose -- this is untrusted, unverified external JSON. Every
// read below goes through optional chaining rather than assuming a shape.
export interface TerraWebhookPayload {
  type: string; // "auth" | "deauth" | "daily" | "sleep" | "activity" | ...
  user?: {
    user_id?: string; // Terra's own id for this connected account
    reference_id?: string | null; // the userId we passed to generateWidgetSession
    provider?: string;
  };
  data?: Record<string, any>[];
}

export async function processTerraPayload(payload: TerraWebhookPayload): Promise<void> {
  switch (payload.type) {
    case "auth":
      return handleAuth(payload);
    case "deauth":
      return handleDeauth(payload);
    case "daily":
      return handleDailyOrSleep(payload);
    case "sleep":
      return handleDailyOrSleep(payload);
    case "activity":
      return handleActivity(payload);
    default:
      console.warn(`Unhandled Terra webhook type: "${payload.type}" -- ignoring`);
  }
}

// Terra echoes back the `reference_id` we set at generateWidgetSession
// time (our internal userId) on every event for a connection, which is
// the primary way we map a payload back to our own user. Once a
// connection is confirmed (see handleAuth), events can also be resolved
// by Terra's own user_id as a fallback.
async function resolveInternalUserId(payload: TerraWebhookPayload): Promise<string | null> {
  const referenceId = payload.user?.reference_id;
  if (referenceId) {
    const connection = await prisma.garminConnection.findUnique({ where: { userId: referenceId } });
    if (connection) return connection.userId;
  }

  const terraUserId = payload.user?.user_id;
  if (terraUserId) {
    const connection = await prisma.garminConnection.findUnique({ where: { terraUserId } });
    if (connection) return connection.userId;
  }

  return null;
}

async function handleAuth(payload: TerraWebhookPayload): Promise<void> {
  const userId = payload.user?.reference_id;
  const terraUserId = payload.user?.user_id;
  if (!userId || !terraUserId) {
    console.warn("Terra auth webhook missing reference_id or user_id", payload.user);
    return;
  }

  await prisma.garminConnection
    .update({
      where: { userId },
      data: { terraUserId, status: "connected", connectedAt: new Date() },
    })
    .catch(() => {
      // No pending connection row for this reference_id -- e.g. it was
      // sent for a userId that never called POST /connect-url. Log and
      // move on; there's nothing in our DB to attach this to.
      console.warn(`Terra auth webhook for unknown reference_id "${userId}"`);
    });
}

async function handleDeauth(payload: TerraWebhookPayload): Promise<void> {
  const userId = await resolveInternalUserId(payload);
  if (!userId) return;
  await prisma.garminConnection.update({ where: { userId }, data: { status: "disconnected" } });
}

// "daily" and "sleep" events both ultimately feed the same two tables
// (daily_activity for the app's GET endpoints, biometric_snapshots for
// the readiness computation) -- they just carry a different subset of
// fields, so they share one handler.
async function handleDailyOrSleep(payload: TerraWebhookPayload): Promise<void> {
  const userId = await resolveInternalUserId(payload);
  if (!userId || !payload.data) return;

  for (const record of payload.data) {
    const dateKey = extractDateKey(record);
    if (!dateKey) continue;
    const date = new Date(`${dateKey}T00:00:00.000Z`);

    const steps: number | undefined = record.distance_data?.summary?.steps ?? undefined;
    const activeCalories: number | undefined =
      record.calories_data?.net_activity_calories ?? record.calories_data?.total_burned_calories ?? undefined;
    const restingHeartRate: number | undefined = record.heart_rate_data?.summary?.resting_hr_bpm ?? undefined;
    const hrvMs: number | undefined = record.heart_rate_data?.summary?.avg_hrv_rmssd ?? undefined;

    const asleepSeconds = record.sleep_durations_data?.asleep?.duration_asleep_state_seconds;
    const sleepMinutes: number | undefined =
      typeof asleepSeconds === "number" ? Math.round(asleepSeconds / 60) : undefined;

    const sleepEfficiency = record.sleep_durations_data?.other?.sleep_efficiency;
    const sleepScore: number | undefined =
      typeof sleepEfficiency === "number" ? Math.round(sleepEfficiency * 100) : undefined;

    await upsertBiometricSnapshot(userId, date, {
      hrvMs,
      restingHr: restingHeartRate,
      sleepDurationMin: sleepMinutes,
      sleepScore,
    });

    // Only touch daily_activity when we actually have a steps figure --
    // `steps` is a required (non-null) column, and a sleep-only event
    // shouldn't fabricate a zero-step row for a day that has no activity
    // data yet.
    if (steps !== undefined) {
      await upsertDailyActivity(userId, date, { steps, activeCalories, restingHeartRate, hrvMs, sleepMinutes });
    } else if (sleepMinutes !== undefined) {
      // A sleep-only event for a date that already has an activity row
      // (from an earlier "daily" event) should still attach sleep
      // minutes to it.
      await patchDailyActivitySleepIfExists(userId, date, sleepMinutes);
    }
  }
}

async function handleActivity(payload: TerraWebhookPayload): Promise<void> {
  const userId = await resolveInternalUserId(payload);
  if (!userId || !payload.data) return;

  for (const record of payload.data) {
    const startTime: string | undefined = record.metadata?.start_time;
    if (!startTime) continue;

    const endTime: string | undefined = record.metadata?.end_time;
    const externalId: string =
      record.metadata?.summary_id ?? `${startTime}-${record.metadata?.type ?? record.metadata?.name ?? "workout"}`;

    const durationMinutes = endTime
      ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
      : typeof record.active_durations_data?.activity_seconds === "number"
        ? Math.round(record.active_durations_data.activity_seconds / 60)
        : 0;

    const calories: number | null = record.calories_data?.total_burned_calories ?? null;
    const avgHeartRate: number | null = record.heart_rate_data?.summary?.avg_hr_bpm ?? null;
    const distanceMeters: number | null = record.distance_data?.summary?.distance_meters ?? null;
    const type = String(record.metadata?.name ?? record.metadata?.type ?? "workout").toLowerCase();

    await prisma.workout.upsert({
      where: { userId_source_externalId: { userId, source: "garmin", externalId } },
      create: {
        userId,
        source: "garmin",
        type,
        startedAt: new Date(startTime),
        durationMinutes,
        calories,
        avgHeartRate,
        distanceMeters,
        externalId,
      },
      // A retried webhook delivery for the same workout updates the
      // numbers (in case Terra later sends a more complete summary)
      // rather than erroring on the unique constraint.
      update: { durationMinutes, calories, avgHeartRate, distanceMeters },
    });
  }
}

async function upsertBiometricSnapshot(
  userId: string,
  date: Date,
  fields: { hrvMs?: number; restingHr?: number; sleepDurationMin?: number; sleepScore?: number }
): Promise<void> {
  const source: ActivitySource = "garmin";
  await prisma.biometricSnapshot.upsert({
    where: { userId_date_source: { userId, date, source } },
    create: {
      userId,
      date,
      source,
      hrvMs: fields.hrvMs ?? null,
      restingHr: fields.restingHr ?? null,
      sleepDurationMin: fields.sleepDurationMin ?? null,
      sleepScore: fields.sleepScore ?? null,
    },
    // Fields left `undefined` here are left untouched by Prisma rather
    // than nulled out -- this is how a "sleep" event that has no HRV
    // reading avoids wiping out HRV a "daily" event already recorded for
    // the same day, and vice versa.
    update: {
      hrvMs: fields.hrvMs,
      restingHr: fields.restingHr,
      sleepDurationMin: fields.sleepDurationMin,
      sleepScore: fields.sleepScore,
    },
  });
}

async function upsertDailyActivity(
  userId: string,
  date: Date,
  fields: {
    steps: number;
    activeCalories?: number;
    restingHeartRate?: number;
    hrvMs?: number;
    sleepMinutes?: number;
  }
): Promise<void> {
  const source: ActivitySource = "garmin";
  await prisma.dailyActivity.upsert({
    where: { userId_date_source: { userId, date, source } },
    create: {
      userId,
      date,
      source,
      steps: fields.steps,
      activeCalories: fields.activeCalories ?? null,
      restingHeartRate: fields.restingHeartRate ?? null,
      hrvMs: fields.hrvMs ?? null,
      sleepMinutes: fields.sleepMinutes ?? null,
    },
    update: {
      steps: fields.steps,
      activeCalories: fields.activeCalories,
      restingHeartRate: fields.restingHeartRate,
      hrvMs: fields.hrvMs,
      sleepMinutes: fields.sleepMinutes,
    },
  });
}

async function patchDailyActivitySleepIfExists(userId: string, date: Date, sleepMinutes: number): Promise<void> {
  const source: ActivitySource = "garmin";
  await prisma.dailyActivity
    .update({
      where: { userId_date_source: { userId, date, source } },
      data: { sleepMinutes },
    })
    .catch(() => {
      // No daily_activity row yet for this date -- nothing to patch. The
      // sleep data is still safely recorded in biometric_snapshots above,
      // which is all the readiness computation actually needs.
    });
}

function extractDateKey(record: Record<string, any>): string | null {
  const raw = record.metadata?.summary_date ?? record.metadata?.start_time;
  return raw ? String(raw).slice(0, 10) : null;
}
