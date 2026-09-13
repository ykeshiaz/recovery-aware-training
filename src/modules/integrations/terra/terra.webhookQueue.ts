// A minimal in-process queue so the webhook route can verify the
// signature, enqueue the payload, and return 200 immediately -- Terra
// retries on any non-2xx response, so the handler must not block on
// (potentially slow) DB writes before responding.
//
// This is intentionally NOT durable: queued jobs live in memory and are
// lost on a restart or deploy. That's an acceptable tradeoff for a solo
// dev's first backend (per the prompt: "even an in-process queue is fine
// for now") -- Terra's own retry behavior covers most of the gap, since a
// dropped job just means the next retry (or the next scheduled sync)
// reprocesses the same data. If this becomes a reliability problem later,
// swap this file for a real queue (BullMQ + Redis is the common upgrade
// path) without touching the route or the mapper.
import { processTerraPayload, TerraWebhookPayload } from "./terra.mapper";

const queue: TerraWebhookPayload[] = [];
let processing = false;

export function enqueueTerraPayload(payload: TerraWebhookPayload): void {
  queue.push(payload);
  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (processing) return; // already draining -- the running loop will pick this job up
  processing = true;

  try {
    let job: TerraWebhookPayload | undefined;
    while ((job = queue.shift())) {
      try {
        await processTerraPayload(job);
      } catch (err) {
        // Swallow so one bad payload can't wedge the queue -- log loudly
        // instead. Since Terra also retries failed webhook deliveries,
        // isolated failures here are usually self-healing.
        console.error("Failed to process Terra webhook payload:", err);
      }
    }
  } finally {
    processing = false;
  }
}
