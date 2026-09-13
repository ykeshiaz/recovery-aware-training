import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireClientAccess } from "../../middleware/auth";
import { getDailyActivity, getWorkouts, parseRange } from "./activity.service";

// Mounted at /users in app.ts.
export const activityRouter = Router();

const rangeQuerySchema = z.object({
  start: z.string(),
  end: z.string(),
  source: z.enum(["apple_health", "health_connect", "garmin"]).optional(),
});

// Matches garminProvider.ts's getDailyActivity:
// GET /users/:id/daily-activity?source=garmin&start=...&end=...
activityRouter.get("/:id/daily-activity", requireAuth, requireClientAccess("id"), async (req, res) => {
  const { start, end, source } = rangeQuerySchema.parse(req.query);
  const activity = await getDailyActivity(String(req.params.id), parseRange(start, end), source);
  res.json(activity);
});

// Matches garminProvider.ts's getWorkouts:
// GET /users/:id/workouts?source=garmin&start=...&end=...
activityRouter.get("/:id/workouts", requireAuth, requireClientAccess("id"), async (req, res) => {
  const { start, end, source } = rangeQuerySchema.parse(req.query);
  const workouts = await getWorkouts(String(req.params.id), parseRange(start, end), source);
  res.json(workouts);
});
