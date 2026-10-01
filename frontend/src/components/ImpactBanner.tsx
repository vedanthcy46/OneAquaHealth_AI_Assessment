import React, { useEffect, useState } from "react";
import { Droplets, Globe2, Users, ShieldCheck, TrendingUp, Sparkles, Fish, Leaf } from "lucide-react";

const CITY_FLAGS: Record<string, string> = {
  Benevento: "🇮🇹",
  Coimbra: "🇵🇹",
  Ghent: "🇧🇪",
  Oslo: "🇳🇴",
  Toulouse: "🇫🇷",
};

function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / 40;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(timer); }
      else { setVal(Math.floor(start)); }
    }, 30);
    return () => clearInterval(timer);
  }, [target]);
  return <span>{val.toLocaleString()}{suffix}</span>;
}

export const ImpactBanner: React.FC = () => {
  const stats = [
    { icon: Globe2, label: "Research Cities", value: 5, suffix: "", color: "#00f0ff" },
    { icon: Droplets, label: "Waterbodies Monitored", value: 5, suffix: "", color: "#38bdf8" },
    { icon: Users, label: "Citizen Observations", value: 279, suffix: "+", color: "#34d399" },
    { icon: ShieldCheck, label: "AI Validation Layers", value: 4, suffix: "", color: "#a78bfa" },
    { icon: TrendingUp, label: "Anomalies Detected", value: 6, suffix: "", color: "#fbbf24" },
  ];
  const cities = Object.entries(CITY_FLAGS);

  return (
    <div style={{
      marginBottom: "28px", borderRadius: "var(--radius-lg)", overflow: "hidden",
      background: "linear-gradient(135deg, rgba(7,13,24,0.97) 0%, rgba(12,24,46,0.97) 50%, rgba(7,18,36,0.97) 100%)",
      border: "1px solid rgba(0,240,255,0.18)",
      boxShadow: "0 0 40px -10px rgba(0,240,255,0.15), 0 16px 36px -6px rgba(0,0,0,0.5)",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(circle at 20% 50%, rgba(2,132,199,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 30%, rgba(16,185,129,0.08) 0%, transparent 40%)",
      }} />
      <div style={{ position: "relative", padding: "28px 32px 24px 32px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "24px", flexWrap: "wrap", marginBottom: "24px" }}>
          <div style={{ maxWidth: "640px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div style={{ padding: "6px", borderRadius: "10px", background: "rgba(0,240,255,0.12)", border: "1px solid rgba(0,240,255,0.3)" }}>
                <Sparkles size={18} color="#00f0ff" />
              </div>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-cyan)" }}>
                OneAquaHealth IEEE Hackathon 2026 · Track 3: AI-Supported Assessment
              </span>
            </div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, lineHeight: 1.2, marginBottom: "10px", fontFamily: "var(--font-display)" }}>
              Bridging Citizen Science &amp;{" "}
              <span className="text-gradient">AI-Powered Stream Intelligence</span>
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.6", maxWidth: "580px" }}>
              AquaGuard AI empowers everyday citizens to collect scientifically valid freshwater health data — using a
              4-layer AI pipeline that validates photo quality, detects ecological indicators, resolves answer conflicts
              and scores data reliability before contributing to the{" "}
              <strong style={{ color: "var(--text-accent)" }}>OneAquaHealth</strong> monitoring network across 5 European research cities.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Active Research Sites</span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {cities.map(([city, flag]) => (
                <div key={city} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-subtle)", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: "16px" }}>{flag}</span>
                  <span>{city}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "20px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "16px" }}>
          {stats.map((stat, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", textAlign: "center", padding: "12px 8px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}>
              <stat.icon size={18} color={stat.color} />
              <span style={{ fontSize: "22px", fontWeight: 800, color: stat.color, fontFamily: "var(--font-display)", lineHeight: 1 }}>
                <AnimatedNumber target={stat.value} suffix={stat.suffix} />
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>{stat.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "20px" }}>
          {[
            { icon: Fish, label: "Aquatic Biodiversity" },
            { icon: Leaf, label: "Riparian Corridor Health" },
            { icon: Droplets, label: "Turbidity & Pollution Alerts" },
            { icon: ShieldCheck, label: "FHIR R4 Data Provenance" },
            { icon: Globe2, label: "One Health Framework" },
          ].map((pill, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px", borderRadius: "var(--radius-full)", background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.18)", fontSize: "11px", color: "var(--text-accent)", fontWeight: 600 }}>
              <pill.icon size={12} />
              {pill.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
