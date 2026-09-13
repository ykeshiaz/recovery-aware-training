import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Moon, Activity, Footprints, Dumbbell } from "lucide-react";
import { COLORS } from "../colors";
import { quadrantMeta } from "../quadrantMeta";
import { ScoreCard } from "./ScoreCard";
import { getDailyActivity, getWorkouts } from "../api";

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

// Same "prefer whichever record has more non-null fields" merge as
// HealthProvider.ts's mergeDailyActivity, applied here just for display
// when a client has more than one source reporting for the same day.
function mergeByDate(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, row);
      continue;
    }
    const count = (r) => Object.values(r).filter((v) => v !== null).length;
    if (count(row) > count(existing)) byDate.set(row.date, row);
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date > b.date ? 1 : -1));
}

// Adapted from ReadinessResult in recovery_aware_trainer_app.jsx. The
// biggest structural difference from the original: that component derived
// EVERYTHING (physical/subjective scores, steps, trend, last workout)
// from one local mock `history` array. Here, the readiness scores come
// from the API response directly (already computed server-side), and
// steps/trend/last-workout are separately fetched from the real
// daily-activity and workouts endpoints -- there's no single object that
// holds all of it anymore, since it's now backed by real, independently
// updated tables.
export function ReadinessResult({ token, userId, readiness }) {
  const [activity, setActivity] = useState(null);
  const [lastWorkout, setLastWorkout] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 13);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);

    Promise.all([
      getDailyActivity(token, userId, startKey, endKey),
      getWorkouts(token, userId, startKey, endKey),
    ])
      .then(([activityRows, workoutRows]) => {
        if (cancelled) return;
        setActivity(mergeByDate(activityRows));
        setLastWorkout(workoutRows[0] ?? null); // already sorted newest-first by the API
      })
      .catch((err) => !cancelled && setLoadError(err.message));

    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  const meta = quadrantMeta(readiness.quadrant);
  const today = activity?.find((d) => d.date === toDateKey(new Date()));

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div
        style={{
          textAlign: "center",
          padding: "32px 24px",
          borderRadius: 16,
          background: COLORS.paperLight,
          border: `1px solid ${COLORS.slate}33`,
          marginBottom: 24,
        }}
      >
        <p
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 40,
            fontWeight: 500,
            color: meta.color,
            margin: "0 0 12px 0",
          }}
        >
          {meta.label}
        </p>
        <p style={{ color: COLORS.slateDark, fontSize: 15, lineHeight: 1.5, margin: 0 }}>
          {readiness.recommendation}
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <ScoreCard icon={<Activity size={16} />} label="Physical" value={readiness.physicalReadinessScore} />
        <ScoreCard icon={<Moon size={16} />} label="Subjective" value={readiness.subjectiveReadinessScore} />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, padding: "14px 16px", borderRadius: 12, background: COLORS.paperLight, border: `1px solid ${COLORS.slate}33` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.slateDark, fontSize: 12, marginBottom: 6 }}>
            <Footprints size={16} />
            <span>Steps today</span>
          </div>
          <p style={{ fontSize: 22, fontWeight: 600, color: COLORS.ink, margin: 0 }}>
            {today ? today.steps.toLocaleString() : "—"}
          </p>
        </div>
        <div style={{ flex: 1, padding: "14px 16px", borderRadius: 12, background: COLORS.paperLight, border: `1px solid ${COLORS.slate}33` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.slateDark, fontSize: 12, marginBottom: 6 }}>
            <Dumbbell size={16} />
            <span>Last workout</span>
          </div>
          {lastWorkout ? (
            <p style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, margin: 0 }}>
              {lastWorkout.type} &middot; {lastWorkout.durationMinutes}min
              <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: COLORS.slateDark, marginTop: 2 }}>
                via {lastWorkout.source}
              </span>
            </p>
          ) : (
            <p style={{ fontSize: 13, color: COLORS.slateDark, margin: 0 }}>None logged</p>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: COLORS.slateDark, marginBottom: 8 }}>14-day trend</p>
      <div style={{ width: "100%", height: 160, background: COLORS.paperLight, borderRadius: 12, padding: "8px 8px 0" }}>
        {activity && activity.some((d) => d.hrvMs != null) ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activity}>
              <CartesianGrid stroke={COLORS.slate} strokeOpacity={0.15} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: COLORS.slateDark }} axisLine={false} tickLine={false} />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "none" }} />
              <Line type="monotone" dataKey="hrvMs" stroke={COLORS.ink} strokeWidth={2} dot={false} name="HRV" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: COLORS.slateDark }}>
            {loadError ? `Couldn't load trend: ${loadError}` : "No HRV data yet for this range"}
          </div>
        )}
      </div>
    </div>
  );
}
