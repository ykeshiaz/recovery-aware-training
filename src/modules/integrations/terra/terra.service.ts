import { env } from "../../../config/env";
import { prisma } from "../../../lib/prisma";

const TERRA_API_BASE = "https://api.tryterra.co/v2";

// Kicks off a Garmin connection for a user: creates a Terra widget session
// (or a mock one, until you have real credentials) and records a pending
// garmin_connections row so the eventual "auth" webhook (see
// terra.mapper.ts) has somewhere to attach the resulting terra_user_id.
export async function createConnectUrl(userId: string): Promise<{ widgetUrl: string }> {
  await prisma.garminConnection.upsert({
    where: { userId },
    create: { userId, status: "pending" },
    // Re-requesting a connect URL (e.g. the user backed out of the widget
    // and tries again) just resets status to pending rather than erroring.
    update: { status: "pending", terraUserId: null, connectedAt: null },
  });

  if (env.TERRA_MODE === "mock") {
    return { widgetUrl: buildMockWidgetUrl(userId) };
  }

  return requestLiveWidgetSession(userId);
}

// A structurally plausible but fake URL -- lets you build and test the
// app's "open this in a WebView" flow before you have real Terra API
// access. It's obviously not a real Terra domain, so it can't be mistaken
// for one or accidentally used in production.
function buildMockWidgetUrl(userId: string): string {
  const params = new URLSearchParams({ reference_id: userId, mock: "true" });
  return `https://mock.terra.local/widget-session?${params.toString()}`;
}

// The real call: Terra's generateWidgetSession endpoint. `reference_id` is
// how we tell our own userId apart from Terra's own user_id -- Terra
// echoes it back on every webhook event for this connection, which is how
// terra.mapper.ts maps a payload back to our internal user.
async function requestLiveWidgetSession(userId: string): Promise<{ widgetUrl: string }> {
  const res = await fetch(`${TERRA_API_BASE}/auth/generateWidgetSession`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "dev-id": env.TERRA_DEV_ID!,
      "x-api-key": env.TERRA_API_KEY!,
    },
    body: JSON.stringify({
      reference_id: userId,
      providers: "GARMIN",
      language: "en",
      auth_success_redirect_url: env.TERRA_WIDGET_REDIRECT_URL,
      auth_failure_redirect_url: env.TERRA_WIDGET_REDIRECT_URL,
    }),
  });

  if (!res.ok) {
    throw new Error(`Terra generateWidgetSession failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { url: string };
  return { widgetUrl: body.url };
}
