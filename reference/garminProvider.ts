// garminProvider.ts
//
// IMPORTANT: Garmin's own Connect Developer Program (the direct Health/
// Activity API) is currently paused for new applicants -- there's no
// self-service application path right now. This provider goes through
// Terra (tryterra.co) instead, an aggregator that already holds Garmin
// partner access and re-exposes it (plus Fitbit, Whoop, Oura, etc.)
// through one self-service OAuth2 API. Swap this file out for a direct
// Garmin integration later if/when their program reopens and you get
// approved -- the HealthProvider interface doesn't change either way.
//
// Unlike the on-device providers, this data does NOT arrive live. Garmin
// syncs to its own cloud on the user's schedule, Terra receives it, then
// pushes it to YOUR backend via webhook. This provider just reads what
// your backend already stored -- it does not call Terra directly from
// the app.

import { HealthProvider, DailyActivity, Workout } from "./HealthProvider";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL; // your own backend

export class GarminProvider implements HealthProvider {
  readonly name = "Garmin";

  constructor(private userId: string) {}

  // Kicks off Terra's hosted OAuth widget for Garmin. Your backend
  // generates a session token server-side (Terra requires your API key,
  // which must never ship in the app), then the app opens that URL in an
  // in-app browser / WebView.
  async requestAuthorization(): Promise<boolean> {
    const res = await fetch(`${API_BASE}/integrations/garmin/connect-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: this.userId }),
    });
    if (!res.ok) return false;
    const { widgetUrl } = await res.json();

    // In the real app: open widgetUrl in an in-app browser (expo-web-browser),
    // then poll your backend's connection-status endpoint, or use a deep
    // link back into the app once Terra redirects on completion.
    return openAuthSessionAndAwaitResult(widgetUrl);
  }

  async getDailyActivity(startDate: string, endDate: string): Promise<DailyActivity[]> {
    const res = await fetch(
      `${API_BASE}/users/${this.userId}/daily-activity?source=garmin&start=${startDate}&end=${endDate}`
    );
    if (!res.ok) return [];
    return res.json();
  }

  async getWorkouts(startDate: string, endDate: string): Promise<Workout[]> {
    const res = await fetch(
      `${API_BASE}/users/${this.userId}/workouts?source=garmin&start=${startDate}&end=${endDate}`
    );
    if (!res.ok) return [];
    return res.json();
  }
}

async function openAuthSessionAndAwaitResult(url: string): Promise<boolean> {
  // Placeholder -- real implementation uses expo-web-browser's
  // openAuthSessionAsync, which resolves when the WebView redirects back
  // to your app's registered URL scheme.
  throw new Error("Wire up expo-web-browser here");
}

/*
-------------------------------------------------------------------------
Backend webhook receiver (sketch, not runnable here -- goes in your API
service, e.g. Node/Express, not the mobile app):

app.post('/webhooks/terra', async (req, res) => {
  // 1. Verify the signature Terra sends (HMAC header) against your
  //    Terra webhook secret -- reject anything that doesn't match.
  // 2. Parse the payload: Terra sends a `type` field like
  //    "activity", "daily", or "sleep", plus the Garmin user's data.
  // 3. Upsert into your own DailyActivity / Workout tables, keyed by
  //    your internal userId (Terra gives you a reference_id you set
  //    during the connect-url step, so map it back to your user).
  // 4. Respond 200 quickly -- Terra retries on non-2xx, don't do slow
  //    work in the handler itself, queue it instead.

  res.sendStatus(200);
});
-------------------------------------------------------------------------
*/
