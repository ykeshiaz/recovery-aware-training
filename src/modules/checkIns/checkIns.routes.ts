import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { submitCheckIn } from "./checkIns.service";
import { tryComputeReadiness, parseDateParam, toDateKey } from "../readiness/readiness.service";

export const checkInsRouter = Router();

const scoreSchema = z.number().int().min(1).max(5);

const checkInSchema = z.object({
  mood: scoreSchema,
  motivation: scoreSchema,
  stress: scoreSchema,
  soreness: scoreSchema,
  note: z.string().max(2000).optional(),
  // Defaults to today (UTC) if omitted -- present mainly so a client can
  // backfill a missed day, not for routine use.
  date: z.string().optional(),
});

// Check-ins are always self-submitted by the client they belong to --
// requireRole("client") rather than requireClientAccess, since there's no
// :id param here to check against.
checkInsRouter.post("/", requireAuth, requireRole("client"), async (req, res) => {
  const input = checkInSchema.parse(req.body);
  const dateStr = input.date ?? toDateKey(new Date());
  const date = parseDateParam(dateStr);
  const userId = req.user!.sub;

  const checkIn = await submitCheckIn({
    userId,
    date,
    mood: input.mood,
    motivation: input.motivation,
    stress: input.stress,
    soreness: input.soreness,
    note: input.note,
  });

  // Best-effort: if today's wearable data is already in, the client gets
  // their readiness result immediately after checking in (matches the
  // prototype's CheckInFlow -> ReadinessResult transition). If not, this
  // is just null and the client sees a "pending" state until it syncs.
  const readiness = await tryComputeReadiness(userId, date);

  res.status(201).json({
    checkIn: {
      userId: checkIn.userId,
      date: dateStr,
      mood: checkIn.mood,
      motivation: checkIn.motivation,
      stress: checkIn.stress,
      soreness: checkIn.soreness,
      note: checkIn.note,
    },
    readiness: readiness
      ? {
          physicalReadinessScore: readiness.physicalReadinessScore,
          subjectiveReadinessScore: readiness.subjectiveReadinessScore,
          quadrant: readiness.quadrant,
          recommendation: readiness.recommendation,
        }
      : null,
  });
});
