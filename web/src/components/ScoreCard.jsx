import { COLORS } from "../colors";

export function ScoreCard({ icon, label, value, color = COLORS.ink }) {
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
