import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRouter } from "./modules/auth/auth.routes";
import { checkInsRouter } from "./modules/checkIns/checkIns.routes";
import { readinessRouter } from "./modules/readiness/readiness.routes";
import { activityRouter } from "./modules/activity/activity.routes";
import { trainersRouter } from "./modules/trainers/trainers.routes";
import { terraWebhookRouter, terraIntegrationRouter } from "./modules/integrations/terra/terra.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());

  // The Terra webhook needs the raw request body to verify its HMAC
  // signature, so it mounts its own express.raw() body parser ahead of
  // this one -- see terra.routes.ts. Everything else gets normal JSON
  // parsing.
  app.use("/webhooks/terra", terraWebhookRouter);
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/auth", authRouter);
  app.use("/check-ins", checkInsRouter);
  app.use("/users", readinessRouter);
  app.use("/users", activityRouter);
  app.use("/trainers", trainersRouter);
  app.use("/integrations/garmin", terraIntegrationRouter);

  // Must be registered last -- Express only treats a 4-arg function as an
  // error handler, and only routes/middleware after this point.
  app.use(errorHandler);

  return app;
}
