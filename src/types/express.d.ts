import { AuthTokenPayload } from "../lib/jwt";

// Lets req.user be typed everywhere after requireAuth runs, instead of
// every route handler re-casting `req` to some ad-hoc type.
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export {};
