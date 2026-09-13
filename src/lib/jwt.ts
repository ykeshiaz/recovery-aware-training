import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type Role = "client" | "trainer";

export interface AuthTokenPayload {
  sub: string; // user id
  role: Role;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  // jwt.verify throws on an expired/invalid/tampered token -- callers
  // (the auth middleware) are expected to catch that and respond 401.
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
