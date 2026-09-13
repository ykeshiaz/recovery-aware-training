import { Router, raw } from "express";
import { requireAuth, requireRole } from "../../../middleware/auth";
import { createConnectUrl } from "./terra.service";
import { verifyTerraSignature } from "./terra.signature";
import { enqueueTerraPayload } from "./terra.webhookQueue";
import { TerraWebhookPayload } from "./terra.mapper";

// Mounted at /integrations/garmin in app.ts.
export const terraIntegrationRouter = Router();

// Matches garminProvider.ts's requestAuthorization(), which POSTs
// { userId } and expects { widgetUrl } back. We deliberately ignore the
// userId in the request body and use the authenticated JWT subject
// instead -- the app sketch didn't attach an Authorization header, but a
// real deployment shouldn't let a caller request a connect URL for
// somebody else's account just by naming their id in the body. Once the
// mobile app adds the Bearer token to this fetch call, this endpoint is
// ready for it.
terraIntegrationRouter.post("/connect-url", requireAuth, requireRole("client"), async (req, res) => {
  const { widgetUrl } = await createConnectUrl(req.user!.sub);
  res.json({ widgetUrl });
});

// Mounted at /webhooks/terra in app.ts, AHEAD of the app-wide
// express.json() middleware -- this router supplies its own raw-body
// parser because signature verification needs the exact bytes Terra
// signed, not a re-serialized JSON object.
export const terraWebhookRouter = Router();

terraWebhookRouter.post("/", raw({ type: "application/json" }), (req, res) => {
  const signatureHeader = req.headers["terra-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const rawBody = req.body as Buffer;

  if (!verifyTerraSignature(rawBody, signature)) {
    res.status(401).json({ error: "Invalid Terra webhook signature" });
    return;
  }

  let payload: TerraWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }

  // Respond immediately -- Terra retries on any non-2xx response, so the
  // actual DB work must not block this response. The real processing
  // happens off-request via the in-process queue (terra.webhookQueue.ts).
  res.sendStatus(200);
  enqueueTerraPayload(payload);
});
