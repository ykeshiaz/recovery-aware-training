import { prisma } from "../../lib/prisma";
import { CONCERNING_QUADRANTS, FLAG_THRESHOLD_DAYS, FLAG_WINDOW_DAYS } from "../readiness/readinessScoring";

// Ported from TrainerDashboard in the .jsx: for each client, pull their
// last FLAG_WINDOW_DAYS (7) days of readiness and flag them once
// FLAG_THRESHOLD_DAYS (3) or more of those days landed in a "concerning"
// quadrant (mental_only or aligned_fatigued).
//
// EFFICIENCY NOTE vs. the prototype: the .jsx recomputes physical
// readiness from scratch for each of the last 7 days, with a growing
// history slice each time (O(n^2)-ish over the mock data). Here,
// readiness is computed once per day (via POST /check-ins, cached in
// readiness_computations -- see readiness.service.ts) and the roster just
// reads back the last 7 cached rows per client. Same threshold logic,
// much cheaper because we're not recomputing from raw biometrics on every
// roster load.
export async function getRoster(trainerId: string) {
  const clients = await prisma.user.findMany({
    where: { trainerId, role: "client" },
    orderBy: { name: "asc" },
  });

  return Promise.all(
    clients.map(async (client) => {
      const recentReadiness = await prisma.readinessComputation.findMany({
        where: { userId: client.id },
        orderBy: { date: "desc" },
        take: FLAG_WINDOW_DAYS,
      });

      const latest = recentReadiness[0] ?? null;
      const concerningDays = recentReadiness.filter((r) =>
        CONCERNING_QUADRANTS.includes(r.quadrant)
      ).length;
      const flagged = concerningDays >= FLAG_THRESHOLD_DAYS;

      if (flagged) {
        await raiseAlertIfNeeded(trainerId, client.id);
      }

      return {
        id: client.id,
        name: client.name,
        // null when a client has no readiness computed yet at all (e.g.
        // brand new, hasn't checked in) -- the prototype's mock data never
        // hits this since every client always has 14 days of history.
        physical: latest?.physicalReadinessScore ?? null,
        subjective: latest?.subjectiveReadinessScore ?? null,
        quadrant: latest?.quadrant ?? null,
        flagged,
        concerningDays,
      };
    })
  );
}

// Raises a coach_alerts row the first time a client crosses the flag
// threshold, and leaves it alone (doesn't spam a new alert) while an
// unresolved one already exists for the same trainer/client/trigger --
// the trainer (or a future "resolve" endpoint) clears it, at which point
// a fresh flag can raise a new one.
async function raiseAlertIfNeeded(trainerId: string, clientId: string) {
  const existing = await prisma.coachAlert.findFirst({
    where: { trainerId, clientId, triggerType: "rolling_7day_flag", resolved: false },
  });
  if (existing) return;

  await prisma.coachAlert.create({
    data: { trainerId, clientId, triggerType: "rolling_7day_flag" },
  });
}
