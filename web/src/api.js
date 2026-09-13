// Thin fetch wrapper around the backend API. Every function here maps to
// one endpoint in the recovery-aware-training backend (see ../../src on
// the repo root) -- nothing here is mock data, unlike the original
// recovery_aware_trainer_app.jsx prototype this app was adapted from.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, data);
  }
  return data;
}

export function register(input) {
  return request("/auth/register", { method: "POST", body: input });
}

export function login(email, password) {
  return request("/auth/login", { method: "POST", body: { email, password } });
}

export function submitCheckIn(token, answers) {
  return request("/check-ins", { method: "POST", token, body: answers });
}

export function getReadiness(token, userId, date) {
  const query = date ? `?date=${date}` : "";
  return request(`/users/${userId}/readiness${query}`, { token });
}

export function getDailyActivity(token, userId, start, end, source) {
  const params = new URLSearchParams({ start, end, ...(source ? { source } : {}) });
  return request(`/users/${userId}/daily-activity?${params}`, { token });
}

export function getWorkouts(token, userId, start, end, source) {
  const params = new URLSearchParams({ start, end, ...(source ? { source } : {}) });
  return request(`/users/${userId}/workouts?${params}`, { token });
}

export function getRoster(token, trainerId) {
  return request(`/trainers/${trainerId}/roster`, { token });
}

export function getGarminConnectUrl(token) {
  return request("/integrations/garmin/connect-url", { method: "POST", token });
}

export { ApiError };
