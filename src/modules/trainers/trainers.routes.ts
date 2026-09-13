import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../middleware/auth";
import { getRoster } from "./trainers.service";

export const trainersRouter = Router();

trainersRouter.get(
  "/:id/roster",
  requireAuth,
  requireRole("trainer"),
  requireSelf("id"),
  async (req, res) => {
    const roster = await getRoster(String(req.params.id));
    res.json(roster);
  }
);
