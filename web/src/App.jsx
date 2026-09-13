import { useState } from "react";
import { User, Users, LogOut } from "lucide-react";
import { COLORS } from "./colors";
import { AuthScreen } from "./components/AuthScreen";
import { ClientHome } from "./components/ClientHome";
import { TrainerDashboard } from "./components/TrainerDashboard";

const STORAGE_KEY = "recovery-aware-auth";

function loadStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Root shell. The original App in recovery_aware_trainer_app.jsx had a
// manual client/trainer TOGGLE, since both views ran off the same local
// mock data with no real identity behind them. That toggle doesn't make
// sense once there's real auth -- a logged-in user IS a client or a
// trainer, not both -- so the view here is driven by the authenticated
// user's actual role instead.
export default function App() {
  const [auth, setAuth] = useState(loadStoredAuth);

  function handleAuth(result) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    setAuth(result);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
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
      {auth && (
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.ink, fontSize: 13, fontWeight: 600 }}>
            {auth.user.role === "trainer" ? <Users size={16} /> : <User size={16} />}
            {auth.user.name} <span style={{ color: COLORS.slateDark, fontWeight: 400 }}>({auth.user.role})</span>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${COLORS.slate}66`,
              background: "transparent",
              color: COLORS.slateDark,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <LogOut size={13} />
            Log out
          </button>
        </div>
      )}

      {!auth ? (
        <AuthScreen onAuth={handleAuth} />
      ) : auth.user.role === "trainer" ? (
        <TrainerDashboard token={auth.token} trainerId={auth.user.id} />
      ) : (
        <ClientHome token={auth.token} userId={auth.user.id} />
      )}
    </div>
  );
}
