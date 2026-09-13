// Reads and validates process.env once at boot. Anything missing throws
// immediately here rather than surfacing as a confusing runtime error the
// first time a route touches it -- fail fast, fail loud.
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET should be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Terra / Garmin integration. TERRA_MODE=mock (the default) lets you
  // develop the connect flow before you have real Terra credentials --
  // see modules/integrations/terra/terra.service.ts.
  TERRA_MODE: z.enum(["mock", "live"]).default("mock"),
  TERRA_API_KEY: z.string().optional(),
  TERRA_DEV_ID: z.string().optional(),
  TERRA_WEBHOOK_SECRET: z.string().optional(),
  TERRA_WIDGET_REDIRECT_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

// TERRA_MODE=live needs real credentials to actually call Terra and verify
// its webhook signatures -- catch that misconfiguration at boot instead of
// failing on the first request.
if (env.TERRA_MODE === "live" && (!env.TERRA_API_KEY || !env.TERRA_DEV_ID || !env.TERRA_WEBHOOK_SECRET)) {
  console.error(
    "TERRA_MODE=live requires TERRA_API_KEY, TERRA_DEV_ID, and TERRA_WEBHOOK_SECRET to be set."
  );
  process.exit(1);
}
