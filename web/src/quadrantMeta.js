import { COLORS } from "./colors";

// The backend returns `quadrant` (a key) and `recommendation` (real copy)
// per readinessScoring.ts -- `label` and `color` are UI-only concerns that
// never left the frontend even in the original prototype, so this is the
// client-side half of QUADRANT_META from recovery_aware_trainer_app.jsx.
export const QUADRANT_META = {
  aligned_ready: { label: "Ready", color: COLORS.sage },
  aligned_fatigued: { label: "Rest", color: COLORS.slateDark },
  physical_only: { label: "Go easy", color: COLORS.clay },
  mental_only: { label: "Flagged", color: COLORS.clay },
};

export function quadrantMeta(quadrant) {
  return QUADRANT_META[quadrant] ?? { label: "No data", color: COLORS.slate };
}
