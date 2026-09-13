import { useState } from "react";
import { COLORS } from "../colors";
import { login, register, ApiError } from "../api";

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${COLORS.slate}66`,
  fontSize: 14,
  marginBottom: 12,
  boxSizing: "border-box",
};

const buttonStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: 8,
  border: "none",
  background: COLORS.ink,
  color: COLORS.paperLight,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

// This screen doesn't exist in the original .jsx prototype -- that one
// had no backend, so there was nothing to authenticate against. This is
// real email/password auth against POST /auth/register and /auth/login.
export function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRegisteredTrainer, setLastRegisteredTrainer] = useState(null);

  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "client",
    trainerId: "",
  });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Switching tabs (e.g. a trainer who just registered switching back to
  // "Sign up" to also create a test client account) should start from a
  // clean form -- otherwise `role` and other fields silently carry over
  // from whatever was last submitted.
  function switchMode(nextMode) {
    setError(null);
    setForm({ email: "", password: "", name: "", role: "client", trainerId: "" });
    setMode(nextMode);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result =
        mode === "login"
          ? await login(form.email, form.password)
          : await register({
              email: form.email,
              password: form.password,
              name: form.name,
              role: form.role,
              trainerId: form.role === "client" && form.trainerId ? form.trainerId : undefined,
            });

      // A freshly-registered trainer's id is what a client needs to paste
      // into "Trainer ID" below to get assigned to them -- there's no
      // directory/search endpoint, so surface it here rather than making
      // you go dig it out of a JWT or the database.
      if (mode === "register" && result.user.role === "trainer") {
        setLastRegisteredTrainer(result.user);
        setMode("login");
        setLoading(false);
        return;
      }

      onAuth(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto 0" }}>
      <p
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: 28,
          fontWeight: 500,
          color: COLORS.ink,
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        Recovery Aware
      </p>

      {lastRegisteredTrainer && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: COLORS.paperLight,
            border: `1px solid ${COLORS.sage}`,
            fontSize: 12,
            color: COLORS.slateDark,
            marginBottom: 16,
          }}
        >
          Trainer account created. Give clients this Trainer ID so they can
          assign themselves to you at signup:
          <div style={{ marginTop: 6, fontWeight: 600, color: COLORS.ink, wordBreak: "break-all" }}>
            {lastRegisteredTrainer.id}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <TabButton active={mode === "login"} onClick={() => switchMode("login")} label="Log in" />
        <TabButton active={mode === "register"} onClick={() => switchMode("register")} label="Sign up" />
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          style={inputStyle}
          required
          minLength={8}
        />

        {mode === "register" && (
          <>
            <input
              type="text"
              placeholder="Name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              style={inputStyle}
              required
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <RoleButton
                active={form.role === "client"}
                onClick={() => update("role", "client")}
                label="I'm a client"
              />
              <RoleButton
                active={form.role === "trainer"}
                onClick={() => update("role", "trainer")}
                label="I'm a trainer"
              />
            </div>
            {form.role === "client" && (
              <input
                type="text"
                placeholder="Trainer ID (optional)"
                value={form.trainerId}
                onChange={(e) => update("trainerId", e.target.value)}
                style={inputStyle}
              />
            )}
          </>
        )}

        {error && (
          <p style={{ color: COLORS.clay, fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button type="submit" style={buttonStyle} disabled={loading}>
          {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 0",
        borderRadius: 8,
        border: `1px solid ${COLORS.ink}`,
        background: active ? COLORS.ink : "transparent",
        color: active ? COLORS.paperLight : COLORS.ink,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function RoleButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 0",
        borderRadius: 8,
        border: `1px solid ${COLORS.slate}66`,
        background: active ? COLORS.sage : "transparent",
        color: active ? COLORS.paperLight : COLORS.slateDark,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
