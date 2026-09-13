// Generates trailing biometric/activity data for a user, for local
// testing without a real Apple Watch, Health Connect device, or Garmin
// connected. Not part of the deployed service -- a dev-only convenience.
//
// There's no API endpoint for the mobile app to push Apple Health /
// Health Connect data yet (that's future React Native work, out of scope
// for this backend build) -- Garmin is the one wearable source that
// arrives through a real endpoint, the Terra webhook. So this script is
// the only way to get "Apple Watch"-shaped data in locally; for
// "Garmin"-shaped data you may prefer to actually hit
// POST /webhooks/terra with a fake payload instead, since that exercises
// the real ingestion pipeline (see README's "Seeding test data" section
// for an example).
//
// Usage:
//   npm run seed -- <userId> [days=14] [source=apple_health]
//
// Find a userId either from the web app (visible in the trainer signup
// confirmation, or via `localStorage.getItem("recovery-aware-auth")` in
// the browser console while logged in) or via `npm run prisma:studio`.
import { PrismaClient, ActivitySource } from "@prisma/client";

const prisma = new PrismaClient();

const VALID_SOURCES: ActivitySource[] = ["apple_health", "health_connect", "garmin"];

async function main() {
  const [userId, daysArg, sourceArg] = process.argv.slice(2);
  if (!userId) {
    console.error("Usage: npm run seed -- <userId> [days=14] [source=apple_health]");
    process.exit(1);
  }

  const days = daysArg ? parseInt(daysArg, 10) : 14;
  const source = (sourceArg ?? "apple_health") as ActivitySource;
  if (!VALID_SOURCES.includes(source)) {
    console.error(`source must be one of: ${VALID_SOURCES.join(", ")}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`No user found with id "${userId}"`);
    process.exit(1);
  }

  // Same spirit as generateHistory() in the original .jsx prototype (a
  // wandering HRV baseline with day-to-day noise) so the fake data feels
  // similarly "real" -- just not seeded/reproducible, since we only need
  // plausible test data here, not a fixed scenario.
  const hrvBaseline = 55 + Math.random() * 20;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - i);
    date.setUTCHours(0, 0, 0, 0);

    const hrvMs = Math.max(20, Math.round(hrvBaseline + (Math.random() - 0.5) * 18));
    const restingHr = Math.round(58 + (Math.random() - 0.5) * 10);
    const sleepDurationMin = Math.round(300 + Math.random() * 210);
    const sleepScore = Math.round(60 + Math.random() * 35);
    const steps = Math.round(3000 + Math.random() * 9000);
    const activeCalories = Math.round(200 + Math.random() * 500);

    await prisma.biometricSnapshot.upsert({
      where: { userId_date_source: { userId, date, source } },
      create: { userId, date, source, hrvMs, restingHr, sleepDurationMin, sleepScore },
      update: { hrvMs, restingHr, sleepDurationMin, sleepScore },
    });

    await prisma.dailyActivity.upsert({
      where: { userId_date_source: { userId, date, source } },
      create: {
        userId,
        date,
        source,
        steps,
        activeCalories,
        restingHeartRate: restingHr,
        hrvMs,
        sleepMinutes: sleepDurationMin,
      },
      update: { steps, activeCalories, restingHeartRate: restingHr, hrvMs, sleepMinutes: sleepDurationMin },
    });
  }

  // One sample workout yesterday, so "Last workout" in the UI has
  // something to show instead of "None logged".
  const workoutDate = new Date();
  workoutDate.setUTCDate(workoutDate.getUTCDate() - 1);
  workoutDate.setUTCHours(17, 30, 0, 0);
  const externalId = `seed-${workoutDate.toISOString()}`;

  await prisma.workout.upsert({
    where: { userId_source_externalId: { userId, source, externalId } },
    create: {
      userId,
      source,
      type: "strength",
      startedAt: workoutDate,
      durationMinutes: 45,
      calories: 320,
      avgHeartRate: 132,
      distanceMeters: null,
      externalId,
    },
    update: {},
  });

  console.log(`Seeded ${days} days of ${source} data (+ one workout) for ${user.name} (${user.email}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
