import { useEffect, useState } from "react";
import { Users, Flag } from "lucide-react";
import { COLORS } from "../colors";
import { quadrantMeta } from "../quadrantMeta";
import { getRoster } from "../api";

// Adapted from TrainerDashboard in recovery_aware_trainer_app.jsx. The
// original recomputed physical/subjective/quadrant/flagged client-side
// from a local mock `history` array on every render; here all of that
// (including the rolling-7-day flag logic) is computed server-side by
// GET /trainers/:id/roster, so this component just renders what comes
// back.
export function TrainerDashboard({ token, trainerId }) {
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getRoster(token, trainerId)
      .then((rows) => !cancelled && setRoster(rows))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [token, trainerId]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Users size={18} color={COLORS.ink} />
        <p style={{ fontSize: 16, fontWeight: 600, color: COLORS.ink, margin: 0 }}>Your roster today</p>
      </div>

      {error && <p style={{ color: COLORS.clay, fontSize: 13 }}>Couldn't load roster: {error}</p>}
      {!roster && !error && <p style={{ color: COLORS.slateDark, fontSize: 13 }}>Loading…</p>}
      {roster && roster.length === 0 && (
        <p style={{ color: COLORS.slateDark, fontSize: 13 }}>
          No clients assigned to you yet. Have a client sign up with your Trainer ID.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {roster?.map((r) => {
          const meta = quadrantMeta(r.quadrant);
          return (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 16px",
                borderRadius: 10,
                background: COLORS.paperLight,
                border: r.flagged ? `1.5px solid ${COLORS.clay}` : `1px solid ${COLORS.slate}33`,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: COLORS.ink,
                  color: COLORS.paperLight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {r.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, color: COLORS.ink, fontSize: 14 }}>{r.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: COLORS.slateDark }}>
                  {r.physical != null ? `Physical ${r.physical} · Subjective ${r.subjective}` : "No readiness data yet"}
                </p>
              </div>
              {r.flagged && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: COLORS.clay,
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: `${COLORS.clay}1A`,
                  }}
                >
                  <Flag size={12} />
                  {r.concerningDays}/7 rough days
                </div>
              )}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: meta.color,
                  padding: "5px 10px",
                  borderRadius: 6,
                  background: `${meta.color}1A`,
                  whiteSpace: "nowrap",
                }}
              >
                {meta.label}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: COLORS.slateDark, marginTop: 16, lineHeight: 1.5 }}>
        Flags trigger on 3+ "rest" or "flagged" days within a rolling 7-day window — a
        single off day is normal and stays quiet.
      </p>
    </div>
  );
}
