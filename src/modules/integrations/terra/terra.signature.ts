import crypto from "node:crypto";
import { env } from "../../../config/env";

// Terra signs webhooks with a header of the form:
//   terra-signature: t=<unix timestamp>,v1=<hex HMAC-SHA256>
// where the HMAC is computed over "<timestamp>.<raw request body>" using
// your webhook secret. This mirrors the same pattern Stripe/GitHub use.
//
// In TERRA_MODE=mock there's no real secret to check against (you don't
// have Terra credentials yet), so verification is skipped -- this is
// clearly gated behind the env var so it can never accidentally apply to
// a production/live deployment.
export function verifyTerraSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (env.TERRA_MODE === "mock") {
    return true;
  }

  if (!signatureHeader || !env.TERRA_WEBHOOK_SECRET) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => part.split("=") as [string, string])
  );
  const timestamp = parts.t;
  const providedSignature = parts.v1;
  if (!timestamp || !providedSignature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", env.TERRA_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");

  // Constant-time comparison -- a plain `===` here would leak timing
  // information an attacker could use to forge a valid signature byte by
  // byte.
  const expected = Buffer.from(expectedSignature, "hex");
  const provided = Buffer.from(providedSignature, "hex");
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}
