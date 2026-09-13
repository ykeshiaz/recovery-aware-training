# recovery-aware-training API

Backend for the recovery-aware training app: daily subjective check-ins,
wearable biometric data, server-side readiness scoring, and trainer alerts.

Node.js + TypeScript + Express + Prisma (Postgres).

`reference/` holds the React prototype and `HealthProvider` mobile-app
files this backend was built to match (readiness math, data shapes,
Garmin/Terra flow) -- not part of the running service, just the
source-of-truth this code was ported from.

## Project structure

```
src/
  index.ts                      Boots the HTTP server
  app.ts                        Express app: middleware + route mounting
  config/env.ts                 Validates env vars at boot (fails fast if missing)
  lib/                          Shared: Prisma client singleton, JWT sign/verify, HttpError
  middleware/auth.ts            requireAuth, requireRole, requireClientAccess, requireSelf
  middleware/errorHandler.ts    Central error -> HTTP response mapping
  modules/
    auth/                       Register/login
    checkIns/                   POST /check-ins
    readiness/
      readinessScoring.ts       Pure port of the .jsx readiness math -- no I/O, unit-tested
      readiness.service.ts      Fetches data, calls readinessScoring.ts, caches the result
      readiness.routes.ts       GET /users/:id/readiness
    activity/                   GET /users/:id/daily-activity, GET /users/:id/workouts
    trainers/                   GET /trainers/:id/roster (rolling 7-day flag logic)
    integrations/terra/         POST /integrations/garmin/connect-url, POST /webhooks/terra
prisma/schema.prisma            Data model
prisma/migrations/              SQL migrations (generated, don't hand-edit)
```

## Local setup

1. **Postgres.** Point `DATABASE_URL` in `.env` (copy from `.env.example`) at
   a running Postgres instance -- local, Docker, or a free Railway/Supabase
   instance all work.
2. Install dependencies: `npm install` (this also runs `prisma generate`
   via the `postinstall` script).
3. Apply the schema: `npm run prisma:migrate` (creates the DB tables from
   `prisma/schema.prisma` and generates a migration file the first time).
4. Start the dev server: `npm run dev` (auto-restarts on file changes).
5. Sanity check: `curl http://localhost:3000/health` should return
   `{"ok":true}`.

Other useful scripts:

- `npm test` — runs the unit tests (currently: `readinessScoring.test.ts`,
  which checks the ported readiness math against hand-computed expected
  values).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run prisma:studio` — a GUI for browsing/editing the local database.
- `npm run build` / `npm start` — compiles to `dist/` and runs the compiled
  output, the same way production does.

## Auth

Simple JWT + email/password, per the prompt (no OAuth/password-reset yet).

- `POST /auth/register` — `{ email, password, name, role: "client"|"trainer", timezone?, trainerId? }`.
  `trainerId` only matters for `role: "client"` and assigns them to that
  trainer at signup.
- `POST /auth/login` — `{ email, password }` -> `{ token, user }`.
- Every other route requires `Authorization: Bearer <token>`.
- A client can only ever read/write their own data. A trainer can only
  read data for clients whose `trainerId` points at them (checked against
  the DB on every request, not just trusted from the JWT).

**Design simplification worth knowing:** a client belongs to at most one
trainer (`User.trainerId`, a self-relation), not a many-to-many join table.
If you need a client to have multiple trainers later, that's a schema
migration, not just a code change.

## Readiness scoring

`readinessScoring.ts` is a direct, dependency-free port of
`computePhysicalReadiness`, `computeSubjectiveReadiness`, and
`assignQuadrant` from `recovery_aware_trainer_app.jsx`. Physical and
subjective readiness are computed independently and combined only at the
final `assignQuadrant` step -- they are never averaged into one score, per
the product decision in the prompt.

One deviation from the prototype, called out in comments where it happens:
the `.jsx` always seeds 14 days of mock history, so it never has to handle
a brand-new user with zero baseline data. Real usage does hit that case
(a client's very first day), so `computePhysicalReadiness` returns a
neutral 50 instead of dividing by zero when there's no trailing history to
compare against.

Readiness is computed once per (user, date) and cached in
`readiness_computations` -- `POST /check-ins` triggers the computation
automatically if biometric data for the day is already in; otherwise
`GET /users/:id/readiness` computes and caches it on first request.

## Trainer roster & alerts

`GET /trainers/:id/roster` ports the rolling-7-day flag logic from the
`.jsx`'s `TrainerDashboard`: a client is flagged once 3 or more of their
last 7 days landed in the `mental_only` or `aligned_fatigued` quadrant.
The first time a client crosses that threshold, a `coach_alerts` row is
created (and left alone on subsequent roster loads until it's resolved,
so a trainer doesn't get the same alert re-raised every page load).

**Efficiency note vs. the prototype:** the `.jsx` recomputes physical
readiness from scratch for each of the last 7 days on every roster render.
Here, readiness is computed once (via `POST /check-ins`) and cached, so
the roster endpoint just reads back the last 7 cached rows per client --
same threshold logic, no recomputation from raw biometrics on every load.

## Garmin via Terra

Garmin's own developer program is currently closed to new applicants, so
Garmin data comes in through [Terra](https://tryterra.co), an aggregator,
via webhook rather than on-device sync (see `garminProvider.ts` in the
mobile app repo for the client-side half of this).

- `POST /integrations/garmin/connect-url` generates a Terra widget session
  URL for the authenticated client to open in an in-app browser.
- `POST /webhooks/terra` receives Terra's data pushes (Garmin, and anything
  else Terra aggregates), verifies the HMAC signature, and upserts into
  `daily_activity` / `biometric_snapshots` / `workouts`, mapped back to
  your internal `user_id` via the `garmin_connections` table.

**You don't have live Terra credentials yet**, so `TERRA_MODE=mock` (the
default) makes `connect-url` return a fake `https://mock.terra.local/...`
URL instead of calling Terra's API -- enough to build and test the app's
connect flow end to end. Flip `TERRA_MODE=live` and set `TERRA_API_KEY`,
`TERRA_DEV_ID`, and `TERRA_WEBHOOK_SECRET` once you have real credentials;
the app refuses to boot in live mode without all three.

**Field-mapping caveat, called out in `terra.mapper.ts`:** the exact field
paths read out of Terra's webhook JSON (`heart_rate_data.summary.avg_hrv_rmssd`
and similar) are written from Terra's documented v2 payload shape, but
untested against a real payload since there's no live account to test
against yet. Once you have sandbox access, send a test webhook from
Terra's dashboard, log the raw payload, and diff it against the paths in
`terra.mapper.ts` -- the surrounding logic (idempotent upserts, partial-field
merging, mapping `reference_id` back to your internal user) is the part
that shouldn't need to change.

The webhook handler verifies the signature and responds `200` immediately,
then processes the payload on an in-process queue
(`terra.webhookQueue.ts`) -- Terra retries on any non-2xx response, so the
handler can't block on DB writes. This queue is in-memory only (jobs are
lost on restart); that's an intentional simplification for now, with a
comment in that file about upgrading to a real queue (e.g. BullMQ + Redis)
if it becomes a reliability problem later.

## Deployment (Railway)

`railway.json` is included and configures:

- Build: Nixpacks auto-detects Node, runs `npm install` (which generates
  the Prisma client via `postinstall`) then `npm run build`.
- Deploy: `npx prisma migrate deploy && node dist/index.js` -- applies any
  pending migrations before starting the server on every deploy.

Steps:

1. Create a Railway project, add a Postgres plugin (Railway injects
   `DATABASE_URL` into your service automatically once you attach it).
2. Add this repo as a service; Railway picks up `railway.json`
   automatically.
3. Set the remaining environment variables from `.env.example`
   (`JWT_SECRET` at minimum; the `TERRA_*` ones once you have Terra
   credentials) in the Railway service's Variables tab.
4. Deploy. Migrations run automatically on every deploy via the start
   command above.

Render works too (a Web Service + a managed Postgres instance, with the
same build/start commands) if you'd rather use that -- Railway's Postgres
plugin auto-injecting `DATABASE_URL` is the only reason it's the default
recommendation here.
