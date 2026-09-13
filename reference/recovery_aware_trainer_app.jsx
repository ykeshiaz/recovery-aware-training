import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Moon, Activity, Flag, Footprints, Dumbbell, Users, User } from "lucide-react";

// ---------- Design tokens ----------
const COLORS = {
  ink: "#132A3A",
  paper: "#EDE9DF",
  paperLight: "#F5F3ED",
  clay: "#C97B4A",
  sage: "#7A9B76",
  slate: "#8A93A6",
  slateDark: "#5B6472",
};

// ---------- Mock data generation ----------
// Simulates 14 days of wearable + check-in history for a handful of clients.
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const WORKOUT_TYPES = ["Strength", "Running", "Pickleball", "Cycling", "Mobility"];

function generateHistory(seed, days = 14) {
  const rand = seededRandom(seed);
  const history = [];
  let hrvBaseline = 55 + rand() * 20;
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const hrv = Math.max(20, hrvBaseline + (rand() - 0.5) * 18);
    const restingHr = Math.round(58 + (rand() - 0.5) * 10);
    const sleepHours = Math.max(3.5, 5 + rand() * 3.5);
    const mood = Math.round(1 + rand() * 4);
    const motivation = Math.round(1 + rand() * 4);
    const stress = Math.round(1 + rand() * 4);
    const soreness = Math.round(1 + rand() * 4);
    const steps = Math.round(3000 + rand() * 9000);
    const hasWorkout = rand() > 0.35;
    history.push({
      date: date.toISOString().slice(5, 10),
      hrv: Math.round(hrv),
      restingHr,
      sleepHours: Math.round(sleepHours * 10) / 10,
      mood,
      motivation,
      stress,
      soreness,
      steps,
      workout: hasWorkout
        ? {
            type: WORKOUT_TYPES[Math.floor(rand() * WORKOUT_TYPES.length)],
            durationMinutes: Math.round(20 + rand() * 70),
            avgHeartRate: Math.round(110 + rand() * 45),
            source: rand() > 0.5 ? "Apple Watch" : "Garmin",
          }
        : null,
    });
  }
  return history;
}

// ---------- Readiness logic (the actual product IP) ----------
// Physical and subjective scores are computed SEPARATELY against each
// person's own trailing baseline, then combined only at the end into a
// quadrant -- never averaged into one blended number.

function computePhysicalReadiness(history) {
  const today = history[history.length - 1];
  const baselineWindow = history.slice(0, -1);
  const avgHrv =
    baselineWindow.reduce((a, d) => a + d.hrv, 0) / baselineWindow.length;
  const avgSleep =
    baselineWindow.reduce((a, d) => a + d.sleepHours, 0) /
    baselineWindow.length;

  const hrvDelta = (today.hrv - avgHrv) / avgHrv; // % vs personal baseline
  const sleepDelta = (today.sleepHours - avgSleep) / avgSleep;

  // Weighted composite, normalized roughly to 0-100
  const raw = hrvDelta * 0.65 + sleepDelta * 0.35;
  const score = Math.max(0, Math.min(100, 50 + raw * 140));
  return Math.round(score);
}

function computeSubjectiveReadiness(today) {
  // mood + motivation are positive signals, stress + soreness are inverted
  const positive = (today.mood + today.motivation) / 2; // 1-5
  const negative = (today.stress + today.soreness) / 2; // 1-5
  const raw = positive - negative; // -4..4
  const score = Math.max(0, Math.min(100, 50 + raw * 15));
  return Math.round(score);
}

function assignQuadrant(physical, subjective) {
  const physicalOk = physical >= 50;
  const subjectiveOk = subjective >= 50;
  if (physicalOk && subjectiveOk) return "aligned_ready";
  if (!physicalOk && !subjectiveOk) return "aligned_fatigued";
  if (!physicalOk && subjectiveOk) return "physical_only";
  return "mental_only";
}

const QUADRANT_META = {
  aligned_ready: {
    label: "Ready",
    color: COLORS.sage,
    recommendation:
      "Body and mind agree — go ahead with today's planned intensity, or push a bit if it's calling for it.",
  },
  aligned_fatigued: {
    label: "Rest",
    color: COLORS.slateDark,
    recommendation:
      "Body and mind agree this isn't a push day. Take the deload — no argument needed today.",
  },
  physical_only: {
    label: "Go easy",
    color: COLORS.clay,
    recommendation:
      "You feel good, but your body's signaling fatigue. This is the classic overtraining trap — dial back the intensity even though you don't feel like you need to.",
  },
  mental_only: {
    label: "Flagged",
    color: COLORS.clay,
    recommendation:
      "Your body's fine, but something else is going on today. The workout can proceed as planned — this one's worth a check-in with your trainer, not a training change.",
  },
};

// ---------- Client check-in flow ----------
function CheckInFlow({ onComplete }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    mood: null,
    motivation: null,
    stress: null,
    soreness: null,
  });

  const questions = [
    {
      key: "mood",
      prompt: "How's your mood today?",
      low: "Rough",
      high: "Great",
    },
    {
      key: "motivation",
      prompt: "How motivated do you feel to train?",
      low: "Not at all",
      high: "Very",
    },
    {
      key: "stress",
      prompt: "How stressed are you feeling?",
      low: "Calm",
      high: "Very stressed",
    },
    {
      key: "soreness",
      prompt: "How sore are you?",
      low: "None",
      high: "Very sore",
    },
  ];

  const current = questions[step];

  function selectValue(v) {
    const next = { ...answers, [current.key]: v };
    setAnswers(next);
    if (step < questions.length - 1) {
      setTimeout(() => setStep(step + 1), 150);
    } else {
      setTimeout(() => onComplete(next), 200);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", textAlign: "center" }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          justifyContent: "center",
          marginBottom: 32,
        }}
      >
        {questions.map((q, i) => (
          <div
            key={q.key}
            style={{
              width: 28,
              height: 4,
              borderRadius: 2,
              background: i <= step ? COLORS.ink : COLORS.slate,
              opacity: i <= step ? 1 : 0.3,
            }}
          />
        ))}
      </div>
      <p
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: COLORS.ink,
          marginBottom: 40,
          lineHeight: 1.35,
        }}
      >
        {current.prompt}
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            onClick={() => selectValue(v)}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              border: `1.5px solid ${COLORS.ink}`,
              background: answers[current.key] === v ? COLORS.ink : "transparent",
              color: answers[current.key] === v ? COLORS.paperLight : COLORS.ink,
              fontSize: 17,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {v}
          </button>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          color: COLORS.slateDark,
        }}
      >
        <span>{current.low}</span>
        <span>{current.high}</span>
      </div>
    </div>
  );
}

// ---------- Client readiness result view ----------
function ReadinessResult({ history }) {
  const physical = computePhysicalReadiness(history);
  const subjective = computeSubjectiveReadiness(history.slice(-1)[0]);
  const quadrant = assignQuadrant(physical, subjective);
  const meta = QUADRANT_META[quadrant];

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
          {meta.recommendation}
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <ScoreCard icon={<Activity size={16} />} label="Physical" value={physical} color={COLORS.ink} />
        <ScoreCard icon={<Moon size={16} />} label="Subjective" value={subjective} color={COLORS.ink} />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, padding: "14px 16px", borderRadius: 12, background: COLORS.paperLight, border: `1px solid ${COLORS.slate}33` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.slateDark, fontSize: 12, marginBottom: 6 }}>
            <Footprints size={16} />
            <span>Steps today</span>
          </div>
          <p style={{ fontSize: 22, fontWeight: 600, color: COLORS.ink, margin: 0 }}>
            {history[history.length - 1].steps.toLocaleString()}
          </p>
        </div>
        <div style={{ flex: 1, padding: "14px 16px", borderRadius: 12, background: COLORS.paperLight, border: `1px solid ${COLORS.slate}33` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.slateDark, fontSize: 12, marginBottom: 6 }}>
            <Dumbbell size={16} />
            <span>Last workout</span>
          </div>
          {(() => {
            const lastWorkoutDay = [...history].reverse().find((d) => d.workout);
            return lastWorkoutDay ? (
              <p style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, margin: 0 }}>
                {lastWorkoutDay.workout.type} &middot; {lastWorkoutDay.workout.durationMinutes}min
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: COLORS.slateDark, marginTop: 2 }}>
                  via {lastWorkoutDay.workout.source}
                </span>
              </p>
            ) : (
              <p style={{ fontSize: 13, color: COLORS.slateDark, margin: 0 }}>None logged</p>
            );
          })()}
        </div>
      </div>

      <p
        style={{
          fontSize: 12,
          textTransform: "none",
          color: COLORS.slateDark,
          marginBottom: 8,
        }}
      >
        14-day trend
      </p>
      <div style={{ width: "100%", height: 160, background: COLORS.paperLight, borderRadius: 12, padding: "8px 8px 0" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid stroke={COLORS.slate} strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: COLORS.slateDark }} axisLine={false} tickLine={false} />
            <YAxis hide domain={[0, 100]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "none" }}
            />
            <Line type="monotone" dataKey="hrv" stroke={COLORS.ink} strokeWidth={2} dot={false} name="HRV" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          marginTop: 20,
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px dashed ${COLORS.slate}66`,
          fontSize: 12,
          color: COLORS.slateDark,
          textAlign: "center",
        }}
      >
        Connected: Apple Watch &middot; Garmin data source mocked for this prototype
      </div>
    </div>
  );
}

function ScoreCard({ icon, label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "14px 16px",
        borderRadius: 12,
        background: COLORS.paperLight,
        border: `1px solid ${COLORS.slate}33`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.slateDark, fontSize: 12, marginBottom: 6 }}>
        {icon}
        <span>{label}</span>
      </div>
      <p style={{ fontSize: 26, fontWeight: 600, color, margin: 0 }}>{value}</p>
    </div>
  );
}

// ---------- Trainer dashboard ----------
function TrainerDashboard({ clients }) {
  const rows = clients.map((c) => {
    const physical = computePhysicalReadiness(c.history);
    const subjective = computeSubjectiveReadiness(c.history.slice(-1)[0]);
    const quadrant = assignQuadrant(physical, subjective);

    // Rolling 7-day alert: 3+ mental_only or aligned_fatigued days
    const last7 = c.history.slice(-7);
    const concerningDays = last7.filter((d) => {
      const p = computePhysicalReadiness(c.history.slice(0, c.history.indexOf(d) + 1));
      const s = computeSubjectiveReadiness(d);
      const q = assignQuadrant(p, s);
      return q === "mental_only" || q === "aligned_fatigued";
    }).length;

    return {
      ...c,
      physical,
      subjective,
      quadrant,
      flagged: concerningDays >= 3,
      concerningDays,
    };
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Users size={18} color={COLORS.ink} />
        <p style={{ fontSize: 16, fontWeight: 600, color: COLORS.ink, margin: 0 }}>
          Your roster today
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div
            key={r.name}
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
              <p style={{ margin: 0, fontWeight: 600, color: COLORS.ink, fontSize: 14 }}>
                {r.name}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: COLORS.slateDark }}>
                Physical {r.physical} &middot; Subjective {r.subjective}
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
                color: QUADRANT_META[r.quadrant].color,
                padding: "5px 10px",
                borderRadius: 6,
                background: `${QUADRANT_META[r.quadrant].color}1A`,
                whiteSpace: "nowrap",
              }}
            >
              {QUADRANT_META[r.quadrant].label}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: COLORS.slateDark, marginTop: 16, lineHeight: 1.5 }}>
        Flags trigger on 3+ "rest" or "flagged" days within a rolling 7-day window —
        a single off day is normal and stays quiet.
      </p>
    </div>
  );
}

// ---------- Root app ----------
export default function App() {
  const [view, setView] = useState("client"); // "client" | "trainer"
  const [checkInDone, setCheckInDone] = useState(false);
  const [clientHistory, setClientHistory] = useState(() => generateHistory(7));

  const mockClients = useMemo(
    () => [
      { name: "Jordan Lee", history: generateHistory(11) },
      { name: "Priya Nair", history: generateHistory(23) },
      { name: "Sam Ortiz", history: generateHistory(41) },
      { name: "Casey Kim", history: generateHistory(58) },
    ],
    []
  );

  function handleCheckInComplete(answers) {
    setClientHistory((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], ...answers };
      return updated;
    });
    setCheckInDone(true);
  }

  return (
    <div
      style={{
        fontFamily: "'Inter', -apple-system, sans-serif",
        background: COLORS.paper,
        minHeight: "100%",
        padding: "32px 20px 48px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto 28px", display: "flex", justifyContent: "center", gap: 8 }}>
        <ToggleButton
          active={view === "client"}
          onClick={() => setView("client")}
          icon={<User size={14} />}
          label="Client"
        />
        <ToggleButton
          active={view === "trainer"}
          onClick={() => setView("trainer")}
          icon={<Users size={14} />}
          label="Trainer"
        />
      </div>

      {view === "client" ? (
        checkInDone ? (
          <ReadinessResult history={clientHistory} />
        ) : (
          <div style={{ paddingTop: 24 }}>
            <CheckInFlow onComplete={handleCheckInComplete} />
          </div>
        )
      ) : (
        <TrainerDashboard clients={mockClients} />
      )}
    </div>
  );
}

function ToggleButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        borderRadius: 8,
        border: `1px solid ${COLORS.ink}`,
        background: active ? COLORS.ink : "transparent",
        color: active ? COLORS.paperLight : COLORS.ink,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
