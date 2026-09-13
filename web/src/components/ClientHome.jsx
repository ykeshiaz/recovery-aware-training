import { useEffect, useState } from "react";
import { COLORS } from "../colors";
import { CheckInFlow } from "./CheckInFlow";
import { ReadinessResult } from "./ReadinessResult";
import { submitCheckIn, getReadiness, ApiError } from "../api";

// This orchestration didn't exist in the original prototype -- there,
// `checkInDone` was just local component state with no persistence, so
// the app always opened on the check-in flow. Here, since check-ins and
// readiness are real and persisted, the client sees today's actual result
// on return visits instead of being asked to check in again.
export function ClientHome({ token, userId }) {
  const [status, setStatus] = useState("loading"); // loading | needs-checkin | pending | ready | error
  const [readiness, setReadiness] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getReadiness(token, userId)
      .then((data) => {
        if (cancelled) return;
        setReadiness(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setStatus("needs-checkin");
        } else {
          setErrorMessage(err.message);
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  async function handleCheckInComplete(answers) {
    try {
      const result = await submitCheckIn(token, answers);
      if (result.readiness) {
        setReadiness({ ...result.readiness, userId });
        setStatus("ready");
      } else {
        // Check-in saved, but there's no biometric data for today yet, so
        // computePhysicalReadiness has nothing to run against -- see
        // readiness.service.ts's tryComputeReadiness.
        setStatus("pending");
      }
    } catch (err) {
      setErrorMessage(err.message);
      setStatus("error");
    }
  }

  async function retryReadiness() {
    setStatus("loading");
    try {
      const data = await getReadiness(token, userId);
      setReadiness(data);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setStatus("pending");
      } else {
        setErrorMessage(err.message);
        setStatus("error");
      }
    }
  }

  if (status === "loading") {
    return <p style={{ textAlign: "center", color: COLORS.slateDark }}>Loading…</p>;
  }

  if (status === "error") {
    return <p style={{ textAlign: "center", color: COLORS.clay }}>Something went wrong: {errorMessage}</p>;
  }

  if (status === "needs-checkin") {
    return (
      <div style={{ paddingTop: 24 }}>
        <CheckInFlow onComplete={handleCheckInComplete} />
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        <p style={{ color: COLORS.slateDark, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          Check-in saved. Your readiness will show up here once today's wearable
          data (HRV + sleep) comes in — via Apple Health/Health Connect sync, or
          a Garmin/Terra webhook.
        </p>
        <button
          onClick={retryReadiness}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: `1px solid ${COLORS.ink}`,
            background: "transparent",
            color: COLORS.ink,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Check again
        </button>
      </div>
    );
  }

  return <ReadinessResult token={token} userId={userId} readiness={readiness} />;
}
