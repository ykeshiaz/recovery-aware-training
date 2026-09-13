import { RequestHandler } from "express";
import { verifyAuthToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

// Express types a route param as `string | string[]` to account for
// repeated wildcard segments (e.g. "/files/*"), which none of our routes
// use -- every :id/:userId param here is always a single segment.
function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? "");
}

// Parses "Authorization: Bearer <token>", verifies it, and attaches the
// decoded { sub, role } to req.user. Every route below this in the chain
// can assume req.user is present.
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  try {
    req.user = verifyAuthToken(header.slice("Bearer ".length));
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Restricts a route to one role, e.g. requireRole("trainer").
export function requireRole(role: "client" | "trainer"): RequestHandler {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: `This endpoint is for ${role}s only` });
      return;
    }
    next();
  };
}

// Guards any :userId-style route param: a client may only ever touch their
// own data; a trainer may only touch data for clients assigned to them
// (User.trainerId). Must run after requireAuth. `paramName` defaults to
// "id" to match routes like /users/:id/readiness.
export function requireClientAccess(paramName = "id"): RequestHandler {
  return async (req, res, next) => {
    const targetUserId = paramString(req.params[paramName]);
    const requester = req.user!;

    if (requester.role === "client") {
      if (requester.sub !== targetUserId) {
        res.status(403).json({ error: "Clients can only access their own data" });
        return;
      }
      next();
      return;
    }

    // Trainer: confirm the target user is actually one of theirs.
    const client = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { trainerId: true },
    });

    if (!client || client.trainerId !== requester.sub) {
      res.status(403).json({ error: "This client is not assigned to you" });
      return;
    }
    next();
  };
}

// Guards a :userId-style route param that must equal the requester's own
// id -- e.g. GET /trainers/:id/roster, where a trainer may only view their
// own roster (as opposed to requireClientAccess, which also allows a
// trainer through for clients assigned to them).
export function requireSelf(paramName = "id"): RequestHandler {
  return (req, res, next) => {
    if (paramString(req.params[paramName]) !== req.user?.sub) {
      res.status(403).json({ error: "You can only access your own resource" });
      return;
    }
    next();
  };
}
