import { useState } from "react";
import { COLORS } from "../colors";

// Identical to CheckInFlow in reference/recovery_aware_trainer_app.jsx --
// same 4-question flow, same visuals. Only difference: onComplete's
// answers get POSTed to the real API by the caller (App.jsx) instead of
// being merged into local mock state.
const QUESTIONS = [
  { key: "mood", prompt: "How's your mood today?", low: "Rough", high: "Great" },
  { key: "motivation", prompt: "How motivated do you feel to train?", low: "Not at all", high: "Very" },
  { key: "stress", prompt: "How stressed are you feeling?", low: "Calm", high: "Very stressed" },
  { key: "soreness", prompt: "How sore are you?", low: "None", high: "Very sore" },
];

export function CheckInFlow({ onComplete }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ mood: null, motivation: null, stress: null, soreness: null });

  const current = QUESTIONS[step];

  function selectValue(v) {
    const next = { ...answers, [current.key]: v };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) {
      setTimeout(() => setStep(step + 1), 150);
    } else {
      setTimeout(() => onComplete(next), 200);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", textAlign: "center" }}>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 32 }}>
        {QUESTIONS.map((q, i) => (
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
      <p style={{ fontSize: 22, fontWeight: 600, color: COLORS.ink, marginBottom: 40, lineHeight: 1.35 }}>
        {current.prompt}
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
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
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.slateDark }}>
        <span>{current.low}</span>
        <span>{current.high}</span>
      </div>
    </div>
  );
}
