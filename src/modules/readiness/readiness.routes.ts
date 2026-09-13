import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireClientAccess } from "../../middleware/auth";
import { getOrComputeReadiness, toDateKey } from "./readiness.service";

// Mounted at /users in app.ts, so this handles GET /users/:id/readiness.
export const readinessRouter = Router();

const querySchema = z.object({
  date: z.string().optional(),
});

readinessRouter.get("/:id/readiness", requireAuth, requireClientAccess("id"), async (req, res) => {
  const { date } = querySchema.parse(req.query);
  const targetDate = date ?? toDateKey(new Date());
  const readiness = await getOrComputeReadiness(String(req.params.id), targetDate);
  res.json(readiness);
});
