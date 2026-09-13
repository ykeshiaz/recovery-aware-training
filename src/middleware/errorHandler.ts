import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/httpError";

// Centralized so route handlers can just `throw` (or pass to `next(err)`)
// instead of wrapping every handler body in its own try/catch + res.status.
// Express 5 automatically forwards a rejected promise from an async route
// handler to this middleware, so a plain `throw` inside an async handler
// is all a route needs to do.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
