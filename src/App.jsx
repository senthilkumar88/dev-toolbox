import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ==========================================================================
   Site configuration — replace the placeholders before going live.
   ========================================================================== */
const SITE_NAME = "DevStudio Tools";
const SITE_URL = "https://www.yourdomain.com";
const CONTACT_EMAIL = "privacy@yourdomain.com";
const POLICY_EFFECTIVE_DATE = "September 30, 2026";
const CURRENT_YEAR = new Date().getFullYear();
// Swap for your DigitalOcean referral/affiliate URL.
const PARTNER_URL = "https://www.digitalocean.com/";

const TABS = [
  {
    id: "cron",
    icon: "⏱️",
    label: "Advanced Cron Scheduler",
    title: "Cron Expression Generator — Custom Intervals & Next Run Times",
    description:
      "Free visual cron expression generator. Build crontab schedules for every minute, hourly, daily, weekly or custom intervals with a human-readable explanation and upcoming run times.",
  },
  {
    id: "csv-json",
    icon: "📊",
    label: "CSV to JSON Converter",
    title: "CSV to JSON Converter — Private, In-Browser, Downloadable",
    description:
      "Convert CSV or TSV data to a clean JSON array instantly. Handles quoted fields, headers and type detection. Runs 100% offline in your browser — no uploads.",
  },
  {
    id: "json-diff",
    icon: "🔍",
    label: "JSON Diff Checker",
    title: "JSON Diff Checker — Compare Two JSON Files Side by Side",
    description:
      "Compare two JSON documents and see every added, removed and changed key in a color-coded structural diff. Validates syntax and runs 100% in your browser.",
  },
  {
    id: "privacy",
    icon: "🛡️",
    label: "Privacy Policy & Terms",
    title: "Privacy Policy & Terms of Use",
    description: `Privacy Policy and Terms of Use for ${SITE_NAME}, including cookie usage, advertising partners and client-side data processing.`,
  },
];
const TAB_IDS = TABS.map((t) => t.id);
const tabFromHash = () => {
  const id = window.location.hash.replace("#", "");
  return TAB_IDS.includes(id) ? id : "cron";
};

/* ==========================================================================
   Design tokens & shared styles
   ========================================================================== */
// Colors resolve through CSS variables (defined per theme in index.css), so flipping
// <html data-theme> re-themes every inline style without re-rendering.
const C = {
  bg: "var(--bg)",
  panel: "var(--panel)",
  panelHi: "var(--panel-hi)",
  border: "var(--border)",
  borderHi: "var(--border-hi)",
  text: "var(--text)",
  textSoft: "var(--text-soft)",
  muted: "var(--muted)",
  faint: "var(--faint)",
  blue: "var(--blue)",
  green: "var(--green)",
  amber: "var(--amber)",
  violet: "var(--violet)",
  red: "var(--red)",
  onBlue: "var(--on-blue)",
  onGreen: "var(--on-green)",
};
/** Translucent wash of a token color, e.g. tint(C.green, 6) for a 6% green background. */
const tint = (color, pct) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const THEME_KEY = "devstudio-theme";
const getInitialTheme = () =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";
const MONO =
  "ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, 'Liberation Mono', monospace";

const S = {
  card: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 24,
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: C.muted,
    marginBottom: 8,
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    background: C.bg,
    border: `1px solid ${C.borderHi}`,
    color: C.text,
    cursor: "pointer",
    outline: "none",
  },
  h1: {
    fontSize: 28,
    fontWeight: 700,
    margin: "0 0 6px",
    color: C.text,
    letterSpacing: "-0.02em",
  },
  lead: { color: C.muted, margin: "0 0 28px", maxWidth: 640 },
  btn: (variant = "primary") => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
    ...(variant === "primary" && {
      background: C.blue,
      color: C.onBlue,
      border: `1px solid ${C.blue}`,
    }),
    ...(variant === "success" && {
      background: C.green,
      color: C.onGreen,
      border: `1px solid ${C.green}`,
    }),
    ...(variant === "ghost" && {
      background: "transparent",
      color: C.muted,
      border: `1px solid ${C.borderHi}`,
    }),
  }),
};

/* ==========================================================================
   Shared utilities & hooks
   ========================================================================== */
const pad = (n) => String(n).padStart(2, "0");
const range = (start, end, step = 1) => {
  const out = [];
  for (let i = start; i <= end; i += step) out.push(i);
  return out;
};

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  // Fallback for non-HTTPS origins and older browsers.
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** A boolean that switches on and turns itself off after `ms`; timer is cleared on unmount. */
function useFlash(ms = 1800) {
  const [on, setOn] = useState(false);
  const timer = useRef(null);
  const trigger = useCallback(() => {
    clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [on, trigger];
}

/** App-wide toast notifications. */
function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const notify = useCallback((message, kind = "success") => {
    clearTimeout(timer.current);
    setToast({ message, kind, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, notify];
}

function Toast({ toast }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      {toast && (
        <div
          key={toast.key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderRadius: 10,
            background: C.panel,
            border: `1px solid ${toast.kind === "error" ? C.red : C.green}`,
            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            color: C.text,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <span style={{ color: toast.kind === "error" ? C.red : C.green }}>
            {toast.kind === "error" ? "✕" : "✓"}
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function Segmented({ value, onChange, options, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        padding: 3,
        gap: 3,
        borderRadius: 8,
        background: C.bg,
        border: `1px solid ${C.borderHi}`,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            style={{
              padding: "7px 14px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              background: active ? C.border : "transparent",
              color: active ? C.blue : C.muted,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Checkbox({ checked, onChange, children }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontSize: 14,
        color: C.textSoft,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 16,
          height: 16,
          accentColor: C.blue,
          cursor: "pointer",
          margin: 0,
        }}
      />
      {children}
    </label>
  );
}

/* ==========================================================================
   Ad placements
   ========================================================================== */
function AdLeaderboard() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginBottom: 32,
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: C.faint,
          marginBottom: 4,
        }}
      >
        Advertisement
      </span>
      {/* Replace the inner text with your AdSense unit, e.g.
          <ins className="adsbygoogle" style={{ display: "inline-block", width: 728, height: 90 }}
               data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" data-ad-slot="XXXXXXXXXX" />
          and call (window.adsbygoogle = window.adsbygoogle || []).push({}) in an effect. */}
      <div
        aria-label="Advertisement"
        style={{
          width: 728,
          height: 90,
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px dashed ${C.borderHi}`,
          borderRadius: 8,
          background: tint(C.panel, 50),
          color: C.faint,
          fontFamily: MONO,
          fontSize: 13,
          textAlign: "center",
          padding: "0 12px",
        }}
      >
        {"<!-- AdSense Leaderboard Slot: 728x90 -->"}
      </div>
    </div>
  );
}

function SidebarAd() {
  return (
    <div
      className="sidebar-ad"
      style={{
        width: 240,
        height: 200,
        marginTop: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: C.faint,
          marginBottom: 6,
          textAlign: "center",
        }}
      >
        {"<!-- Sponsored Partner Ad Slot -->"}
      </span>
      {/* <a
        className="sponsor-card"
        href={PARTNER_URL}
        target="_blank"
        rel="sponsored noopener noreferrer"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 16,
          borderRadius: 12,
          border: `1px solid ${C.borderHi}`,
          background:
            "radial-gradient(120% 90% at 100% 0%, rgba(56,189,248,0.28) 0%, rgba(56,189,248,0) 60%), linear-gradient(160deg, #0b1f3a 0%, #111827 55%, #18181b 100%)",
          textDecoration: "none",
          // The banner is a fixed dark creative, so its colors don't follow the theme.
          color: "#f4f4f5",
          transition: "border-color 0.15s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#7dd3fc" }}>
            <span
              aria-hidden="true"
              style={{ width: 16, height: 16, borderRadius: "50%", border: "3px solid #0080ff", display: "inline-block" }}
            />
            DigitalOcean
          </span>
          <span style={{ fontSize: 9, letterSpacing: "0.1em", color: "#a1a1aa", textTransform: "uppercase" }}>Sponsored</span>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, marginBottom: 4 }}>Need Cloud Infrastructure?</div>
          <div style={{ fontSize: 12.5, color: "#a1a1aa", lineHeight: 1.35 }}>
            Get <strong style={{ color: "#4ade80" }}>$200 free credits</strong> at DigitalOcean
          </div>
        </div>
        <span
          style={{
            alignSelf: "flex-start",
            fontSize: 12,
            fontWeight: 700,
            padding: "6px 10px",
            borderRadius: 6,
            background: "#38bdf8",
            color: "#082f49",
          }}
        >
          [Partner Link] →
        </span>
      </a> */}
    </div>
  );
}

/* ==========================================================================
   Tool 1 — Advanced Cron Scheduler
   ========================================================================== */
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const HOUR_STEPS = [2, 3, 4, 6, 8, 12];
const MINUTE_STEPS = [5, 10, 15, 20, 30];
const CRON_FIELDS = [
  { name: "Minute", range: "0–59" },
  { name: "Hour", range: "0–23" },
  { name: "Day of month", range: "1–31" },
  { name: "Month", range: "1–12" },
  { name: "Day of week", range: "0–6 (Sun=0)" },
];

function summarizeList(items, max = 6) {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max - 2).join(", ")}, …, ${items[items.length - 1]}`;
}

function buildCron({
  preset,
  minute,
  hour,
  dow,
  customUnit,
  hourStep,
  minuteStep,
  customMinute,
}) {
  switch (preset) {
    case "hourly":
      return {
        expression: `${minute} * * * *`,
        description: `Triggered once every hour at minute ${minute} (00:${pad(minute)}, 01:${pad(minute)}, 02:${pad(minute)} …) — 24 runs per day.`,
      };
    case "daily":
      return {
        expression: `${minute} ${hour} * * *`,
        description: `Triggered once every day at exactly ${pad(hour)}:${pad(minute)}.`,
      };
    case "weekly":
      return {
        expression: `${minute} ${hour} * * ${dow}`,
        description: `Triggered once every week on ${DAYS[dow]} at exactly ${pad(hour)}:${pad(minute)}.`,
      };
    case "custom": {
      if (customUnit === "hours") {
        // Every option divides 24 evenly, so the step never drifts across midnight.
        const times = range(0, 23, hourStep).map(
          (h) => `${pad(h)}:${pad(customMinute)}`,
        );
        return {
          expression: `${customMinute} */${hourStep} * * *`,
          description: `Triggered exactly every ${hourStep} hours at minute ${customMinute} — ${times.length} runs per day at ${summarizeList(times)}.`,
        };
      }
      // Every option divides 60 evenly, so the gap stays constant across the hour boundary.
      const mins = range(0, 59, minuteStep);
      return {
        expression: `*/${minuteStep} * * * *`,
        description: `Triggered exactly every ${minuteStep} minutes — at minute ${summarizeList(mins)} of every hour (${1440 / minuteStep} runs per day).`,
      };
    }
    default:
      return {
        expression: "* * * * *",
        description:
          "Triggered every single minute of every hour, every day — 1,440 runs per day.",
      };
  }
}

/** Matches one cron field supporting the subset this generator emits: `*`, `*\/n` and plain numbers. */
function fieldMatches(spec, value) {
  if (spec === "*") return true;
  if (spec.startsWith("*/")) return value % Number(spec.slice(2)) === 0;
  return Number(spec) === value;
}

function nextRuns(expression, count = 5) {
  const [mi, ho, dom, mon, dow] = expression.split(" ");
  const t = new Date();
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  const runs = [];
  // A weekly schedule is the sparsest we generate; 8 days of minutes always covers it.
  for (let i = 0; i < 8 * 24 * 60 && runs.length < count; i++) {
    if (
      fieldMatches(mi, t.getMinutes()) &&
      fieldMatches(ho, t.getHours()) &&
      fieldMatches(dom, t.getDate()) &&
      fieldMatches(mon, t.getMonth() + 1) &&
      fieldMatches(dow, t.getDay())
    ) {
      runs.push(new Date(t));
    }
    t.setMinutes(t.getMinutes() + 1);
  }
  return runs;
}

function CronScheduler({ notify }) {
  const [preset, setPreset] = useState("every-minute");
  const [minute, setMinute] = useState(0);
  const [hour, setHour] = useState(9);
  const [dow, setDow] = useState(1);
  const [customUnit, setCustomUnit] = useState("hours");
  const [hourStep, setHourStep] = useState(3);
  const [minuteStep, setMinuteStep] = useState(15);
  const [customMinute, setCustomMinute] = useState(0);
  const [copied, flashCopied] = useFlash();

  const { expression, description } = useMemo(
    () =>
      buildCron({
        preset,
        minute,
        hour,
        dow,
        customUnit,
        hourStep,
        minuteStep,
        customMinute,
      }),
    [preset, minute, hour, dow, customUnit, hourStep, minuteStep, customMinute],
  );
  const upcoming = useMemo(() => nextRuns(expression), [expression]);
  const parts = expression.split(" ");

  const handleCopy = async () => {
    const ok = await copyText(expression);
    if (ok) {
      flashCopied();
      notify(`Copied "${expression}" to clipboard`);
    } else {
      notify(
        "Clipboard blocked — select the expression and copy manually",
        "error",
      );
    }
  };

  const numSelect = (value, setter, options, fmt = (v) => v, label) => (
    <select
      value={value}
      onChange={(e) => setter(Number(e.target.value))}
      style={S.select}
      aria-label={label}
    >
      {options.map((v) => (
        <option key={v} value={v}>
          {fmt(v)}
        </option>
      ))}
    </select>
  );

  const showMinute =
    preset === "hourly" || preset === "daily" || preset === "weekly";
  const showHour = preset === "daily" || preset === "weekly";

  return (
    <section aria-labelledby="cron-title">
      <h1 id="cron-title" style={S.h1}>
        Advanced Cron Scheduler
      </h1>
      <p style={S.lead}>
        Build production-ready crontab expressions visually — including custom
        step intervals — and preview exactly when they will fire.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* Configuration */}
        <div style={S.card}>
          <label htmlFor="cron-preset" style={S.label}>
            Schedule frequency
          </label>
          <select
            id="cron-preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            style={S.select}
          >
            <option value="every-minute">Every Minute</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Custom Interval</option>
          </select>

          {(showMinute || showHour) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                gap: 12,
                marginTop: 20,
              }}
            >
              {preset === "weekly" && (
                <div>
                  <span style={S.label}>Day</span>
                  {numSelect(
                    dow,
                    setDow,
                    range(0, 6),
                    (d) => DAYS[d],
                    "Day of week",
                  )}
                </div>
              )}
              {showHour && (
                <div>
                  <span style={S.label}>Hour</span>
                  {numSelect(hour, setHour, range(0, 23), pad, "Hour")}
                </div>
              )}
              <div>
                <span style={S.label}>Minute</span>
                {numSelect(minute, setMinute, range(0, 59), pad, "Minute")}
              </div>
            </div>
          )}

          {preset === "custom" && (
            <div
              style={{
                marginTop: 20,
                padding: 18,
                borderRadius: 10,
                background: tint(C.blue, 5),
                border: `1px solid ${tint(C.blue, 25)}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <span style={{ ...S.label, marginBottom: 0, color: C.blue }}>
                  Custom interval
                </span>
                <Segmented
                  ariaLabel="Interval unit"
                  value={customUnit}
                  onChange={setCustomUnit}
                  options={[
                    { value: "hours", label: "Hours" },
                    { value: "minutes", label: "Minutes" },
                  ]}
                />
              </div>

              {customUnit === "hours" ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <span style={S.label}>Run every</span>
                    {numSelect(
                      hourStep,
                      setHourStep,
                      HOUR_STEPS,
                      (v) => `${v} hours`,
                      "Run every X hours",
                    )}
                  </div>
                  <div>
                    <span style={S.label}>At minute</span>
                    {numSelect(
                      customMinute,
                      setCustomMinute,
                      range(0, 59),
                      pad,
                      "At minute",
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <span style={S.label}>Run every</span>
                  {numSelect(
                    minuteStep,
                    setMinuteStep,
                    MINUTE_STEPS,
                    (v) => `${v} minutes`,
                    "Run every X minutes",
                  )}
                </div>
              )}
              <p style={{ margin: "12px 0 0", fontSize: 12.5, color: C.faint }}>
                Step values are limited to divisors of{" "}
                {customUnit === "hours" ? "24" : "60"} so the gap between runs
                is always identical — no uneven jump at the{" "}
                {customUnit === "hours" ? "day" : "hour"} boundary.
              </p>
            </div>
          )}
        </div>

        {/* Output */}
        <div style={S.card}>
          <label htmlFor="cron-output" style={S.label}>
            Generated cron expression
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              id="cron-output"
              readOnly
              value={expression}
              onFocus={(e) => e.target.select()}
              style={{
                flex: "1 1 180px",
                minWidth: 0,
                padding: "12px 14px",
                borderRadius: 8,
                background: C.bg,
                border: `1px solid ${C.borderHi}`,
                color: C.green,
                fontFamily: MONO,
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "0.06em",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleCopy}
              className={copied ? "btn-success" : "btn-primary"}
              style={S.btn(copied ? "success" : "primary")}
            >
              {copied ? "✓ Copied!" : "📋 Copy to Clipboard"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
              marginTop: 14,
            }}
          >
            {CRON_FIELDS.map((f, i) => (
              <div
                key={f.name}
                title={`${f.name}: ${f.range}`}
                style={{
                  textAlign: "center",
                  padding: "8px 4px",
                  borderRadius: 6,
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 15,
                    color: parts[i] === "*" ? C.faint : C.blue,
                    fontWeight: 600,
                  }}
                >
                  {parts[i]}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.faint,
                    marginTop: 2,
                    lineHeight: 1.2,
                  }}
                >
                  {f.name}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <span style={S.label}>Human-readable interpretation</span>
            <p
              aria-live="polite"
              style={{
                margin: 0,
                padding: "12px 14px",
                borderRadius: 8,
                borderLeft: `3px solid ${C.green}`,
                background: tint(C.green, 6),
                color: C.textSoft,
                fontSize: 14,
              }}
            >
              {description}
            </p>
          </div>

          <div style={{ marginTop: 20 }}>
            <span style={S.label}>
              Next {upcoming.length} runs (your local time)
            </span>
            <ol
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {upcoming.map((d, i) => (
                <li
                  key={d.getTime()}
                  style={{
                    display: "flex",
                    gap: 10,
                    fontFamily: MONO,
                    fontSize: 13,
                    color: i === 0 ? C.text : C.muted,
                  }}
                >
                  <span style={{ color: C.faint, width: 18 }}>{i + 1}.</span>
                  {d.toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </li>
              ))}
            </ol>
            <p style={{ margin: "10px 0 0", fontSize: 12, color: C.faint }}>
              Cron daemons evaluate schedules in the server's time zone —
              confirm it matches before deploying.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Tool 2 — CSV to JSON Converter
   ========================================================================== */
const DELIMITERS = { ",": "Comma", "\t": "Tab", ";": "Semicolon" };
const SAMPLE_CSV = `id,name,email,role,active,salary
1,Ada Lovelace,ada@example.com,Engineer,true,125000
2,"Hopper, Grace",grace@example.com,"Rear Admiral ""Amazing Grace""",true,98000.50
3,Linus Torvalds,linus@example.com,Maintainer,false,
4,Zip Code Test,zip@example.com,QA,true,00742`;

function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  let best = ",";
  let bestCount = 0;
  for (const d of Object.keys(DELIMITERS)) {
    let count = 0;
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 parser: quoted fields, escaped quotes (""), delimiters and line breaks inside quotes, CRLF/LF/CR endings. */
function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      if (text[i + 1] !== "\n") endRow(); // bare CR (classic Mac); CRLF is handled by the \n
    } else {
      field += ch;
      if (ch !== " ") fieldStarted = true;
    }
  }
  if (field !== "" || row.length > 0) endRow();

  // Drop blank lines (a row consisting of a single empty/whitespace field).
  return {
    rows: rows.filter((r) => !(r.length === 1 && r[0].trim() === "")),
    unterminated: inQuotes,
  };
}

const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;
function coerce(value, autoType) {
  if (!autoType) return value;
  if (value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  // Leading-zero values (ZIP codes, IDs) fail the regex and stay strings; so do integers beyond 2^53.
  if (NUMERIC.test(value)) {
    const n = Number(value);
    if (
      Number.isFinite(n) &&
      (value.includes(".") || /e/i.test(value) || Number.isSafeInteger(n))
    )
      return n;
  }
  return value;
}

function uniqueHeaders(raw) {
  const seen = new Map();
  return raw.map((h, i) => {
    const base = h.trim() || `column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

function convertCsv(text, { hasHeaders, autoType, trim, delimiterMode }) {
  if (!text.trim())
    return { json: "", records: 0, columns: 0, delimiter: null, warnings: [] };

  const delimiter =
    delimiterMode === "auto" ? detectDelimiter(text) : delimiterMode;
  const { rows, unterminated } = parseCsv(text, delimiter);
  const clean = (v) => coerce(trim ? v.trim() : v, autoType);
  const warnings = [];
  if (unterminated)
    warnings.push(
      "Unterminated quoted field — the last value runs to the end of the input.",
    );

  let data;
  let columns;
  if (hasHeaders) {
    const headers = uniqueHeaders(rows[0] ?? []);
    const body = rows.slice(1);
    columns = headers.length;
    const ragged = body.filter((r) => r.length !== headers.length).length;
    if (ragged)
      warnings.push(
        `${ragged} row(s) have a different column count than the header — missing cells set to null, extras keyed column_N.`,
      );
    data = body.map((r) => {
      const obj = {};
      const width = Math.max(headers.length, r.length);
      for (let i = 0; i < width; i++) {
        const key = headers[i] ?? `column_${i + 1}`;
        obj[key] = i < r.length ? clean(r[i]) : null;
      }
      return obj;
    });
  } else {
    columns = rows.reduce((m, r) => Math.max(m, r.length), 0);
    data = rows.map((r) => r.map(clean));
  }

  return {
    json: JSON.stringify(data, null, 2),
    records: data.length,
    columns,
    delimiter,
    warnings,
  };
}

const JSON_TOKEN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
const HIGHLIGHT_LIMIT = 200_000; // chars; above this render plain text to keep the DOM light

function JsonView({ json }) {
  const nodes = useMemo(() => {
    if (!json || json.length > HIGHLIGHT_LIMIT) return json;
    const out = [];
    let last = 0;
    let k = 0;
    for (const m of json.matchAll(JSON_TOKEN)) {
      if (m.index > last) out.push(json.slice(last, m.index));
      const [token, str, colon, literal, num] = m;
      if (str !== undefined && colon !== undefined) {
        out.push(
          <span key={k++} style={{ color: C.blue }}>
            {str}
          </span>,
          colon,
        );
      } else if (str !== undefined) {
        out.push(
          <span key={k++} style={{ color: C.green }}>
            {token}
          </span>,
        );
      } else if (literal !== undefined) {
        out.push(
          <span key={k++} style={{ color: C.violet }}>
            {token}
          </span>,
        );
      } else if (num !== undefined) {
        out.push(
          <span key={k++} style={{ color: C.amber }}>
            {token}
          </span>,
        );
      }
      last = m.index + token.length;
    }
    if (last < json.length) out.push(json.slice(last));
    return out;
  }, [json]);

  return (
    <pre
      tabIndex={0}
      aria-label="JSON output"
      style={{
        margin: 0,
        height: 380,
        overflow: "auto",
        padding: 16,
        borderRadius: 8,
        background: C.bg,
        border: `1px solid ${C.borderHi}`,
        color: C.faint,
        fontFamily: MONO,
        fontSize: 13,
        lineHeight: 1.55,
        whiteSpace: "pre",
        tabSize: 2,
      }}
    >
      {json ? (
        nodes
      ) : (
        <span style={{ color: C.faint }}>
          {"// JSON output will appear here as you type"}
        </span>
      )}
    </pre>
  );
}

function CsvToJson({ notify }) {
  const [input, setInput] = useState("");
  const [hasHeaders, setHasHeaders] = useState(true);
  const [autoType, setAutoType] = useState(true);
  const [trim, setTrim] = useState(true);
  const [delimiterMode, setDelimiterMode] = useState("auto");
  const [fileName, setFileName] = useState("data");
  const [copied, flashCopied] = useFlash();
  const fileInput = useRef(null);

  // Keeps typing responsive on large pastes: conversion runs against a deferred copy of the input.
  const deferredInput = useDeferredValue(input);
  const result = useMemo(
    () =>
      convertCsv(deferredInput, { hasHeaders, autoType, trim, delimiterMode }),
    [deferredInput, hasHeaders, autoType, trim, delimiterMode],
  );
  const stale = deferredInput !== input;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInput(String(reader.result));
      setFileName(file.name.replace(/\.[^.]+$/, "") || "data");
      notify(`Loaded ${file.name} locally — nothing was uploaded`);
    };
    reader.onerror = () => notify("Could not read that file", "error");
    reader.readAsText(file);
  };

  const handleDownload = () => {
    if (!result.json) return;
    const safe = (fileName.trim() || "data")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\.json$/i, "");
    const blob = new Blob([result.json], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after the click has been dispatched; revoking synchronously can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Downloaded ${safe}.json`);
  };

  const handleCopy = async () => {
    if (!result.json) return;
    if (await copyText(result.json)) {
      flashCopied();
      notify("JSON copied to clipboard");
    } else {
      notify("Clipboard blocked by the browser", "error");
    }
  };

  return (
    <section aria-labelledby="csv-title">
      <h1 id="csv-title" style={S.h1}>
        CSV to JSON Converter
      </h1>
      <p style={S.lead}>
        Paste CSV or TSV data and get a structured JSON array instantly. Parsing
        runs entirely in your browser — your data never leaves this device.
      </p>

      <div
        style={{
          ...S.card,
          marginBottom: 20,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "14px 24px",
        }}
      >
        <Checkbox checked={hasHeaders} onChange={setHasHeaders}>
          First row contains headers
        </Checkbox>
        <Checkbox checked={autoType} onChange={setAutoType}>
          Detect numbers &amp; booleans
        </Checkbox>
        <Checkbox checked={trim} onChange={setTrim}>
          Trim whitespace
        </Checkbox>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginLeft: "auto",
          }}
        >
          <span style={{ ...S.label, marginBottom: 0 }}>Delimiter</span>
          <select
            value={delimiterMode}
            onChange={(e) => setDelimiterMode(e.target.value)}
            style={{ ...S.select, width: "auto" }}
            aria-label="Delimiter"
          >
            <option value="auto">Auto-detect</option>
            <option value=",">Comma ( , )</option>
            <option value={"\t"}>Tab ( ⇥ )</option>
            <option value=";">Semicolon ( ; )</option>
          </select>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 20,
        }}
      >
        {/* Input */}
        <div style={S.card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <label htmlFor="csv-input" style={{ ...S.label, marginBottom: 0 }}>
              CSV input
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="btn-ghost"
                style={{ ...S.btn("ghost"), padding: "5px 10px", fontSize: 12 }}
                onClick={() => fileInput.current?.click()}
              >
                Open file
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ ...S.btn("ghost"), padding: "5px 10px", fontSize: 12 }}
                onClick={() => {
                  setInput(SAMPLE_CSV);
                  setFileName("sample");
                }}
              >
                Load sample
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ ...S.btn("ghost"), padding: "5px 10px", fontSize: 12 }}
                onClick={() => setInput("")}
                disabled={!input}
              >
                Clear
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              onChange={handleFile}
              hidden
            />
          </div>
          <textarea
            id="csv-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={
              "name,email,age\nAda,ada@example.com,36\nGrace,grace@example.com,45"
            }
            style={{
              width: "100%",
              height: 380,
              resize: "vertical",
              padding: 16,
              borderRadius: 8,
              background: C.bg,
              border: `1px solid ${C.borderHi}`,
              color: C.textSoft,
              fontFamily: MONO,
              fontSize: 13,
              lineHeight: 1.55,
              outline: "none",
              whiteSpace: "pre",
              overflowWrap: "normal",
              overflow: "auto",
            }}
          />
        </div>

        {/* Output */}
        <div style={S.card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ ...S.label, marginBottom: 0 }}>JSON output</span>
            <span
              style={{
                fontSize: 12,
                color: stale ? C.amber : C.faint,
                fontFamily: MONO,
              }}
            >
              {stale
                ? "converting…"
                : result.delimiter
                  ? `${result.records} records · ${result.columns} cols · ${DELIMITERS[result.delimiter]}`
                  : "idle"}
            </span>
          </div>
          <div
            style={{ opacity: stale ? 0.6 : 1, transition: "opacity 0.15s" }}
          >
            <JsonView json={result.json} />
          </div>

          {result.warnings.map((w) => (
            <p
              key={w}
              style={{ margin: "10px 0 0", fontSize: 12.5, color: C.amber }}
            >
              ⚠ {w}
            </p>
          ))}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 14,
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flex: "1 1 160px",
                minWidth: 0,
                borderRadius: 8,
                border: `1px solid ${C.borderHi}`,
                background: C.bg,
                overflow: "hidden",
              }}
            >
              <input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                aria-label="Download file name"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "10px 0 10px 12px",
                  background: "transparent",
                  border: "none",
                  color: C.text,
                  outline: "none",
                  fontFamily: MONO,
                  fontSize: 13,
                }}
              />
              <span
                style={{
                  padding: "0 12px",
                  color: C.faint,
                  fontFamily: MONO,
                  fontSize: 13,
                }}
              >
                .json
              </span>
            </div>
            <button
              type="button"
              className="btn-ghost"
              style={S.btn("ghost")}
              onClick={handleCopy}
              disabled={!result.json}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="btn-success"
              style={S.btn("success")}
              onClick={handleDownload}
              disabled={!result.json}
            >
              ⬇ Download .json File
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Tool 3 — JSON Diff Checker
   ========================================================================== */
const DIFF_RED = "#ef4444";
const DIFF_GREEN = "#22c55e";
const MAX_DIFF_LINES = 5000; // rendering cap; the summary still counts every change
const ARRAY_LCS_LIMIT = 4_000_000; // max cells in the array-alignment table before falling back to positional matching

const SAMPLE_A = `{
  "name": "dev-toolbox",
  "version": "1.2.0",
  "private": true,
  "author": { "name": "Ada", "email": "ada@example.com" },
  "features": ["cron", "csv-json"],
  "limits": { "maxRows": 10000, "timeoutMs": 3000 },
  "deprecated": "use v2 endpoints"
}`;
const SAMPLE_B = `{
  "name": "dev-toolbox",
  "version": "1.3.0",
  "private": true,
  "author": { "name": "Ada", "email": "ada@devstudio.io" },
  "features": ["cron", "csv-json", "json-diff"],
  "limits": { "maxRows": 50000, "timeoutMs": 3000, "retries": 2 },
  "license": "MIT"
}`;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const containerKind = (v) => (Array.isArray(v) ? "array" : isPlainObject(v) ? "object" : null);

/** Key-order-independent serialization, used to test array elements for deep equality. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isPlainObject(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * Aligns two arrays with a longest-common-subsequence pass so an insertion near the
 * start shows up as one "+" line instead of shifting every following element.
 * Returns ops: ["eq", i, j] | ["del", i] | ["add", j].
 */
function alignArrays(a, b) {
  const ha = a.map(canonical);
  const hb = b.map(canonical);
  let start = 0;
  while (start < a.length && start < b.length && ha[start] === hb[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && ha[endA - 1] === hb[endB - 1]) {
    endA--;
    endB--;
  }

  const ops = [];
  for (let i = 0; i < start; i++) ops.push(["eq", i, i]);

  const n = endA - start;
  const m = endB - start;
  if (n > 0 && m > 0 && n * m <= ARRAY_LCS_LIMIT) {
    const w = m + 1;
    const t = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        t[i * w + j] =
          ha[start + i] === hb[start + j]
            ? t[(i + 1) * w + j + 1] + 1
            : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (ha[start + i] === hb[start + j]) {
        ops.push(["eq", start + i++, start + j++]);
      } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) {
        ops.push(["del", start + i++]);
      } else {
        ops.push(["add", start + j++]);
      }
    }
    while (i < n) ops.push(["del", start + i++]);
    while (j < m) ops.push(["add", start + j++]);
  } else {
    // Too large for the table (or one side empty): treat the middle as one changed block.
    for (let i = 0; i < n; i++) ops.push(["del", start + i]);
    for (let j = 0; j < m; j++) ops.push(["add", start + j]);
  }

  for (let k = 0; k < a.length - endA; k++) ops.push(["eq", endA + k, endB + k]);
  return ops;
}

/** Pushes a whole value as pretty-printed lines of one type ("same" | "add" | "del"). */
function emitValue(out, type, value, prefix, indent, comma) {
  const rows = JSON.stringify(value, null, 2).split("\n");
  const lead = "  ".repeat(indent);
  rows.forEach((row, i) => {
    const text = (i === 0 ? prefix : "") + row + (i === rows.length - 1 && comma ? "," : "");
    out.push({ type, text: lead + text });
  });
}

/**
 * Recursive structural diff. Objects are matched by key (key order is ignored),
 * arrays by LCS alignment. Output mirrors a pretty-printed merge of A and B,
 * with commas computed per side so each side's lines stay valid JSON.
 */
function diffNode(a, b, key, indent, commaA, commaB, out, stats) {
  const prefix = key === null ? "" : `${JSON.stringify(key)}: `;
  const lead = "  ".repeat(indent);
  const kind = containerKind(a);

  if (kind && kind === containerKind(b) && canonical(a) !== canonical(b)) {
    const [open, close] = kind === "array" ? ["[", "]"] : ["{", "}"];
    out.push({ type: "same", text: `${lead}${prefix}${open}` });

    if (kind === "object") {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      const lastA = keysA[keysA.length - 1];
      const lastB = keysB[keysB.length - 1];
      const union = [...keysA, ...keysB.filter((k) => !Object.hasOwn(a, k))];
      for (const k of union) {
        const inA = Object.hasOwn(a, k);
        const inB = Object.hasOwn(b, k);
        if (inA && inB) {
          diffNode(a[k], b[k], k, indent + 1, k !== lastA, k !== lastB, out, stats);
        } else if (inA) {
          stats.removed++;
          emitValue(out, "del", a[k], `${JSON.stringify(k)}: `, indent + 1, k !== lastA);
        } else {
          stats.added++;
          emitValue(out, "add", b[k], `${JSON.stringify(k)}: `, indent + 1, k !== lastB);
        }
      }
    } else {
      const ops = alignArrays(a, b);
      let dels = [];
      let adds = [];
      const flush = () => {
        for (const i of dels) {
          stats.removed++;
          emitValue(out, "del", a[i], "", indent + 1, i < a.length - 1);
        }
        for (const j of adds) {
          stats.added++;
          emitValue(out, "add", b[j], "", indent + 1, j < b.length - 1);
        }
        dels = [];
        adds = [];
      };
      const flushHunk = (hunkDels, hunkAdds) => {
        // Pair same-kind containers positionally so a modified object inside an
        // array shows its inner changes rather than a full remove + re-add.
        const pairs = Math.min(hunkDels.length, hunkAdds.length);
        for (let p = 0; p < Math.max(hunkDels.length, hunkAdds.length); p++) {
          const i = hunkDels[p];
          const j = hunkAdds[p];
          if (p < pairs && containerKind(a[i]) && containerKind(a[i]) === containerKind(b[j])) {
            flush();
            diffNode(a[i], b[j], null, indent + 1, i < a.length - 1, j < b.length - 1, out, stats);
          } else {
            if (i !== undefined) dels.push(i);
            if (j !== undefined) adds.push(j);
          }
        }
        flush();
      };

      let hunkDels = [];
      let hunkAdds = [];
      for (const [op, x, y] of ops) {
        if (op === "eq") {
          flushHunk(hunkDels, hunkAdds);
          hunkDels = [];
          hunkAdds = [];
          emitValue(out, "same", b[y], "", indent + 1, y < b.length - 1);
        } else if (op === "del") {
          hunkDels.push(x);
        } else {
          hunkAdds.push(x);
        }
      }
      flushHunk(hunkDels, hunkAdds);
    }

    out.push({ type: "same", text: `${lead}${close}${commaB ? "," : ""}` });
    return;
  }

  if (canonical(a) === canonical(b)) {
    emitValue(out, "same", b, prefix, indent, commaB);
    return;
  }

  // Different primitive values, or the type changed (e.g. object -> array).
  stats.changed++;
  emitValue(out, "del", a, prefix, indent, commaA);
  emitValue(out, "add", b, prefix, indent, commaB);
}

/** Appends A/B line numbers the way a unified diff gutter shows them. */
function numberLines(lines) {
  let aNo = 0;
  let bNo = 0;
  for (const l of lines) {
    if (l.type !== "add") l.aNo = ++aNo;
    if (l.type !== "del") l.bNo = ++bNo;
  }
  return lines;
}

function describeJsonError(err, text) {
  const msg = err.message;
  // Firefox and newer Chrome already include line/column; older V8 only gives a character position.
  const m = /position (\d+)/.exec(msg);
  if (!m || /line \d+/.test(msg)) return msg;
  const before = text.slice(0, Number(m[1])).split("\n");
  return `${msg} (line ${before.length}, column ${before[before.length - 1].length + 1})`;
}

function parsePanel(text, panel) {
  if (!text.trim()) return { error: `Panel ${panel} is empty — paste a JSON document to compare.` };
  try {
    // JSON.parse is a pure data parser (no code execution), so untrusted input is safe here.
    return { value: JSON.parse(text) };
  } catch (err) {
    return { error: `Invalid JSON format syntax detected in Panel ${panel}: ${describeJsonError(err, text)}` };
  }
}

function compareJson(textA, textB) {
  const pa = parsePanel(textA, "A");
  const pb = parsePanel(textB, "B");
  if (pa.error || pb.error) return { errors: { A: pa.error, B: pb.error } };

  const stats = { added: 0, removed: 0, changed: 0 };
  const lines = [];
  try {
    diffNode(pa.value, pb.value, null, 0, false, false, lines, stats);
  } catch (err) {
    if (err instanceof RangeError) {
      return { errors: { A: "These documents are nested too deeply to compare in the browser." } };
    }
    throw err;
  }
  return { lines: numberLines(lines), stats, identical: stats.added + stats.removed + stats.changed === 0 };
}

function JsonDiffChecker({ notify }) {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [result, setResult] = useState(null);
  const [compared, setCompared] = useState(null);
  const outputRef = useRef(null);

  const stale = result && compared && (compared.a !== left || compared.b !== right);
  const errors = result?.errors;

  const handleCompare = () => {
    setResult(compareJson(left, right));
    setCompared({ a: left, b: right });
  };

  // Bring the banner or diff into view after each comparison.
  useEffect(() => {
    if (result) outputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCompare();
    }
  };

  const handleFormat = () => {
    let failed = false;
    const format = (text, setter) => {
      if (!text.trim()) return;
      try {
        setter(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        failed = true;
      }
    };
    format(left, setLeft);
    format(right, setRight);
    if (failed) notify("Couldn't format — fix the JSON syntax first", "error");
  };

  const handleClear = () => {
    setLeft("");
    setRight("");
    setResult(null);
    setCompared(null);
  };

  const inputStyle = (hasError) => ({
    width: "100%",
    height: 320,
    resize: "vertical",
    padding: 16,
    borderRadius: 8,
    background: C.bg,
    border: `1px solid ${hasError ? DIFF_RED : C.borderHi}`,
    boxShadow: hasError ? `0 0 0 3px ${tint(DIFF_RED, 20)}` : "none",
    color: C.textSoft,
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 1.55,
    outline: "none",
    whiteSpace: "pre",
    overflowWrap: "normal",
    overflow: "auto",
  });

  const smallBtn = { ...S.btn("ghost"), padding: "5px 10px", fontSize: 12 };
  const shownLines = result?.lines ? result.lines.slice(0, MAX_DIFF_LINES) : [];
  const rowBg = { add: tint(DIFF_GREEN, 14), del: tint(DIFF_RED, 14), same: "transparent" };
  const signColor = { add: DIFF_GREEN, del: DIFF_RED, same: C.faint };
  const sign = { add: "+", del: "-", same: " " };

  return (
    <section aria-labelledby="diff-title">
      <h1 id="diff-title" style={S.h1}>JSON Diff Checker</h1>
      <p style={S.lead}>
        Paste two JSON documents to see every added, removed and changed key in a structural diff. Key order is
        ignored; everything runs locally in your browser.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        {[
          { id: "json-a", label: "Original JSON (A)", value: left, set: setLeft, error: errors?.A },
          { id: "json-b", label: "Modified JSON (B)", value: right, set: setRight, error: errors?.B },
        ].map((p) => (
          <div key={p.id} style={{ ...S.card, minWidth: 0 }}>
            <label htmlFor={p.id} style={{ ...S.label, color: p.error ? DIFF_RED : C.muted }}>
              {p.label}
            </label>
            <textarea
              id={p.id}
              value={p.value}
              onChange={(e) => p.set(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              aria-invalid={Boolean(p.error)}
              placeholder={'{\n  "key": "value"\n}'}
              style={inputStyle(Boolean(p.error))}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 20 }}>
        <button type="button" className="btn-primary" style={{ ...S.btn("primary"), padding: "12px 22px", fontSize: 15 }} onClick={handleCompare}>
          🔍 Compare JSON Files
        </button>
        <button type="button" className="btn-ghost" style={smallBtn} onClick={() => { setLeft(SAMPLE_A); setRight(SAMPLE_B); }}>
          Load sample
        </button>
        <button type="button" className="btn-ghost" style={smallBtn} onClick={() => { setLeft(right); setRight(left); }} disabled={!left && !right}>
          Swap A ⇄ B
        </button>
        <button type="button" className="btn-ghost" style={smallBtn} onClick={handleFormat} disabled={!left && !right}>
          Format both
        </button>
        <button type="button" className="btn-ghost" style={smallBtn} onClick={handleClear} disabled={!left && !right && !result}>
          Clear
        </button>
        <span style={{ fontSize: 12, color: C.faint, marginLeft: "auto" }}>Tip: Ctrl + Enter compares</span>
      </div>

      <div ref={outputRef} style={{ marginTop: 20, scrollMarginTop: 20 }}>
        {errors && (
          <div
            role="alert"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "14px 18px",
              borderRadius: 10,
              border: `1px solid ${DIFF_RED}`,
              borderLeft: `4px solid ${DIFF_RED}`,
              background: tint(DIFF_RED, 12),
              color: C.text,
              fontSize: 14,
            }}
          >
            {[errors.A, errors.B].filter(Boolean).map((msg) => (
              <div key={msg} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span aria-hidden="true" style={{ color: DIFF_RED, fontWeight: 700 }}>⛔</span>
                <span style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{msg}</span>
              </div>
            ))}
          </div>
        )}

        {result?.lines && (
          <div style={{ ...S.card, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <span style={{ ...S.label, marginBottom: 0 }}>Diff output</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>
                {stale && <span style={{ color: C.amber }}>inputs changed — compare again</span>}
                {result.identical ? (
                  <span style={{ color: DIFF_GREEN }}>✓ No differences — documents are identical</span>
                ) : (
                  <>
                    <span style={{ padding: "2px 8px", borderRadius: 6, background: tint(DIFF_GREEN, 14), color: DIFF_GREEN }}>+{result.stats.added} added</span>
                    <span style={{ padding: "2px 8px", borderRadius: 6, background: tint(DIFF_RED, 14), color: DIFF_RED }}>-{result.stats.removed} removed</span>
                    <span style={{ padding: "2px 8px", borderRadius: 6, background: tint(C.amber, 14), color: C.amber }}>~{result.stats.changed} changed</span>
                  </>
                )}
              </div>
            </div>

            {/* Rows are width: max-content so long lines scroll horizontally inside this box instead of wrapping or widening the page. */}
            <div
              role="region"
              aria-label="JSON diff output"
              tabIndex={0}
              style={{
                maxHeight: 560,
                overflow: "auto",
                borderRadius: 8,
                background: C.bg,
                border: `1px solid ${C.borderHi}`,
                fontFamily: `${MONO}, monospace`,
                fontSize: 13,
                lineHeight: 1.6,
                opacity: stale ? 0.65 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <div style={{ width: "max-content", minWidth: "100%", padding: "8px 0" }}>
                {shownLines.map((l, i) => (
                  <div key={i} style={{ display: "flex", background: rowBg[l.type] }}>
                    <span
                      aria-hidden="true"
                      style={{
                        position: "sticky",
                        left: 0,
                        display: "flex",
                        flexShrink: 0,
                        background: C.panel,
                        borderRight: `1px solid ${C.border}`,
                        color: C.faint,
                        userSelect: "none",
                      }}
                    >
                      <span style={{ width: 44, textAlign: "right", paddingRight: 8 }}>{l.aNo ?? ""}</span>
                      <span style={{ width: 44, textAlign: "right", paddingRight: 8 }}>{l.bNo ?? ""}</span>
                    </span>
                    <span style={{ width: 24, flexShrink: 0, textAlign: "center", color: signColor[l.type], fontWeight: 700, userSelect: "none" }}>
                      {sign[l.type]}
                    </span>
                    <span style={{ whiteSpace: "pre", paddingRight: 16, color: l.type === "same" ? C.muted : C.text }}>{l.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {result.lines.length > MAX_DIFF_LINES && (
              <p style={{ margin: "10px 0 0", fontSize: 12.5, color: C.amber }}>
                ⚠ Showing the first {MAX_DIFF_LINES.toLocaleString()} of {result.lines.length.toLocaleString()} lines. The change counts above cover the whole document.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ==========================================================================
   Privacy Policy & Terms of Use
   ========================================================================== */
function PolicySection({ title, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 650,
          color: C.text,
          margin: "0 0 10px",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          color: C.muted,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {children}
      </div>
    </section>
  );
}

const linkStyle = { color: C.blue, textUnderlineOffset: 3 };
const ExtLink = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
    {children}
  </a>
);

function PrivacyTerms() {
  const p = { margin: 0, lineHeight: 1.7 };
  const ul = {
    margin: 0,
    paddingLeft: 20,
    lineHeight: 1.7,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };
  return (
    <article aria-labelledby="privacy-title" style={{ maxWidth: 780 }}>
      <h1 id="privacy-title" style={S.h1}>
        Privacy Policy &amp; Terms of Use
      </h1>
      <p style={{ ...S.lead, marginBottom: 32 }}>
        Effective date: {POLICY_EFFECTIVE_DATE}
      </p>

      <div
        style={{
          ...S.card,
          marginBottom: 32,
          borderColor: tint(C.green, 35),
          background: tint(C.green, 5),
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: 22 }} aria-hidden="true">
          🔒
        </span>
        <p style={{ ...p, color: C.textSoft }}>
          <strong style={{ color: C.green }}>
            Your tool data never leaves your browser.
          </strong>{" "}
          Every utility on {SITE_NAME} — including the Cron Scheduler, the CSV to
          JSON Converter and the JSON Diff Checker — runs entirely client-side in JavaScript. The
          text, files and settings you enter are processed locally on your
          device and are never uploaded, transmitted, logged or stored on our
          servers.
        </p>
      </div>

      <h2 style={{ fontSize: 22, color: C.blue, margin: "0 0 20px" }}>
        Privacy Policy
      </h2>

      <PolicySection title="1. Introduction">
        <p style={p}>
          This Privacy Policy explains how {SITE_NAME} ("we", "us", "our"),
          accessible at {SITE_URL}, handles information when you visit our
          website. By using the site you agree to the practices described here.
          If you do not agree, please discontinue use of the site.
        </p>
      </PolicySection>

      <PolicySection title="2. Information We Process">
        <p style={p}>
          <strong style={{ color: C.textSoft }}>
            Tool input (client-side only).
          </strong>{" "}
          Data you paste, type or open in our tools is processed exclusively
          within your browser's memory. We have no technical means to view it,
          and it is discarded when you close or reload the page.
        </p>
        <p style={p}>
          <strong style={{ color: C.textSoft }}>Log files.</strong> Like most
          websites, our hosting provider may automatically record standard
          server log data such as your IP address, browser type, referring page,
          pages visited and the date and time of the request. This information
          is used for security, troubleshooting and aggregate traffic analysis
          and is not linked to any personally identifiable information.
        </p>
        <p style={p}>
          We do not require accounts, and we do not knowingly collect names,
          email addresses or other personal information unless you choose to
          contact us directly.
        </p>
      </PolicySection>

      <PolicySection title="3. Cookies and Web Beacons">
        <p style={p}>
          Cookies are small text files stored on your device by your web
          browser. {SITE_NAME} itself does not set cookies to operate its tools.
          However, our advertising and analytics partners may place cookies, web
          beacons and similar technologies on your device to store preferences,
          measure ad performance, limit how often you see an ad and deliver
          advertising relevant to your interests.
        </p>
        <p style={p}>
          You can instruct your browser to refuse all or some cookies, or to
          alert you when cookies are being set, through your browser settings.
          If you disable cookies, the tools on this site will continue to work
          normally, though some advertising may be less relevant.
        </p>
      </PolicySection>

      <PolicySection title="4. Google AdSense and the DoubleClick DART Cookie">
        <p style={p}>
          We use Google AdSense to display advertisements. Google is a
          third-party vendor that uses cookies to serve ads on our site.
          Google's use of advertising cookies, including the DoubleClick DART
          cookie, enables Google and its partners to serve ads to you based on
          your visit to this site and/or other sites on the Internet.
        </p>
        <ul style={ul}>
          <li>
            Third-party vendors, including Google, use cookies to serve ads
            based on a user's prior visits to this website or other websites.
          </li>
          <li>
            Google's use of advertising cookies enables it and its partners to
            serve ads to users based on their visits to this and/or other sites
            on the Internet.
          </li>
          <li>
            You may opt out of personalized advertising by visiting{" "}
            <ExtLink href="https://adssettings.google.com">
              Google Ads Settings
            </ExtLink>
            . Alternatively, you can opt out of some third-party vendors' use of
            cookies for personalized advertising by visiting{" "}
            <ExtLink href="https://www.aboutads.info/choices/">
              www.aboutads.info
            </ExtLink>
            .
          </li>
          <li>
            Learn more about how Google uses data at{" "}
            <ExtLink href="https://policies.google.com/technologies/partner-sites">
              How Google uses information from sites that use its services
            </ExtLink>
            .
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="5. Third-Party Vendors and Advertising Partners">
        <p style={p}>
          In addition to Google, we may work with other third-party ad networks,
          affiliate programs and sponsors (for example, cloud hosting partners
          featured in our "Sponsored" placements). These third parties may use
          cookies, JavaScript or web beacons in their advertisements and links,
          which are sent directly to your browser. They automatically receive
          your IP address when this occurs.
        </p>
        <p style={p}>
          {SITE_NAME} has no access to or control over cookies used by
          third-party advertisers. Please consult the respective privacy
          policies of these third-party ad servers for detailed information on
          their practices and for instructions on opting out. Some links on this
          site are affiliate or sponsored links, which means we may earn a
          commission if you make a purchase — at no additional cost to you.
        </p>
        <p style={p}>
          Users in the European Economic Area, the United Kingdom and
          Switzerland can manage additional preferences at{" "}
          <ExtLink href="https://www.youronlinechoices.eu/">
            www.youronlinechoices.eu
          </ExtLink>
          . Where required by law, we request your consent through a
          consent-management banner before personalized advertising cookies are
          set.
        </p>
      </PolicySection>

      <PolicySection title="6. Your Data Protection Rights (GDPR & CCPA/CPRA)">
        <p style={p}>
          Depending on where you live, you may have the right to access,
          correct, delete or restrict processing of personal data held about
          you, to object to processing, to data portability and to withdraw
          consent at any time. California residents may request disclosure of
          the categories of personal information collected and may opt out of
          the "sale" or "sharing" of personal information for cross-context
          behavioral advertising. We do not sell personal information. Because
          tool data is processed only on your device, we hold no such data to
          disclose or delete. To exercise any other right, contact us at the
          address below; we will respond within the time required by law.
        </p>
      </PolicySection>

      <PolicySection title="7. Children's Privacy">
        <p style={p}>
          This website is not directed at children under the age of 13 (or 16 in
          the EEA), and we do not knowingly collect personal information from
          children. If you believe a child has provided personal information
          through our site, please contact us and we will promptly remove it.
        </p>
      </PolicySection>

      <PolicySection title="8. Changes to This Policy">
        <p style={p}>
          We may update this Privacy Policy from time to time. Changes take
          effect when posted on this page with a revised effective date. We
          encourage you to review this page periodically.
        </p>
      </PolicySection>

      <h2 style={{ fontSize: 22, color: C.blue, margin: "40px 0 20px" }}>
        Terms of Use
      </h2>

      <PolicySection title="1. Acceptance of Terms">
        <p style={p}>
          By accessing {SITE_NAME} you agree to be bound by these Terms of Use
          and all applicable laws and regulations. If you do not agree with any
          part of these terms, you are prohibited from using the site.
        </p>
      </PolicySection>

      <PolicySection title="2. Use License">
        <p style={p}>
          You may use the tools on this site free of charge for personal and
          commercial purposes. You may not attempt to disrupt the site, scrape
          it in a way that degrades service for others, remove proprietary
          notices, or use the site for any unlawful purpose.
        </p>
      </PolicySection>

      <PolicySection title="3. Disclaimer of Warranties">
        <p style={p}>
          All tools and content are provided "as is" and "as available", without
          warranties of any kind, express or implied, including warranties of
          merchantability, fitness for a particular purpose or non-infringement.
          You are solely responsible for verifying generated output (such as
          cron expressions and converted data) before relying on it in
          production systems.
        </p>
      </PolicySection>

      <PolicySection title="4. Limitation of Liability">
        <p style={p}>
          In no event shall {SITE_NAME} or its operators be liable for any
          damages — including loss of data, profit or business interruption —
          arising from the use of or inability to use the site, even if we have
          been advised of the possibility of such damage.
        </p>
      </PolicySection>

      <PolicySection title="5. Third-Party Links and Advertising">
        <p style={p}>
          The site contains advertisements and links to third-party websites
          that are not operated by us. We are not responsible for the content,
          products, services or privacy practices of those sites, and inclusion
          of a link does not imply endorsement.
        </p>
      </PolicySection>

      <PolicySection title="6. Modifications">
        <p style={p}>
          We may revise these Terms of Use at any time without notice. By
          continuing to use the site you agree to be bound by the then-current
          version.
        </p>
      </PolicySection>

      <PolicySection title="Contact Us">
        <p style={p}>
          Questions about this Privacy Policy or Terms of Use can be sent to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </PolicySection>
    </article>
  );
}

/* ==========================================================================
   App shell
   ========================================================================== */
function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  return (
    <div className="theme-toggle" style={{ padding: "0 4px" }}>
      <span
        style={{
          ...S.label,
          fontSize: 11,
          padding: "0 8px",
          marginBottom: 8,
          color: C.faint,
        }}
      >
        Appearance
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Dark mode"
        onClick={onToggle}
        className="nav-btn"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderRadius: 8,
          border: `1px solid ${C.border}`,
          background: C.bg,
          color: C.muted,
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true">{isDark ? "🌙" : "☀️"}</span>
          {isDark ? "Dark theme" : "Light theme"}
        </span>
        {/* Switch track + knob */}
        <span
          aria-hidden="true"
          style={{
            position: "relative",
            width: 36,
            height: 20,
            borderRadius: 999,
            background: isDark ? C.blue : C.borderHi,
            transition: "background-color 0.2s ease",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: isDark ? 18 : 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              transition: "left 0.2s ease",
            }}
          />
        </span>
      </button>
    </div>
  );
}

function Sidebar({ activeTab, onSelect, theme, onToggleTheme }) {
  return (
    <aside
      className="app-sidebar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 260,
        height: "100vh",
        overflowY: "auto",
        background: C.panel,
        borderRight: `1px solid ${C.border}`,
        padding: "24px 10px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        zIndex: 10,
      }}
    >
      <a
        href="#cron"
        onClick={(e) => {
          e.preventDefault();
          onSelect("cron");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 8px",
          textDecoration: "none",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #38bdf8, #4ade80)",
            color: "#09090b",
            fontWeight: 800,
            fontFamily: MONO,
            fontSize: 14,
          }}
        >
          {"</>"}
        </span>
        <span
          style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}
        >
          <span style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>
            {SITE_NAME}
          </span>
          <span style={{ fontSize: 11, color: C.green }}>
            ● 100% client-side
          </span>
        </span>
      </a>

      <nav
        aria-label="Tools"
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
      >
        <span
          style={{
            ...S.label,
            fontSize: 11,
            padding: "0 12px",
            marginBottom: 4,
            color: C.faint,
          }}
        >
          Workspace
        </span>
        {TABS.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              className={active ? undefined : "nav-btn"}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(t.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 8,
                border: "none",
                borderLeft: `2px solid ${active ? C.blue : "transparent"}`,
                cursor: "pointer",
                background: active ? C.border : "transparent",
                color: active ? C.blue : C.muted,
                fontWeight: active ? 600 : 500,
                fontSize: 14,
              }}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </nav>

      <ThemeToggle theme={theme} onToggle={onToggleTheme} />

      <SidebarAd />
    </aside>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState(tabFromHash);
  const [toast, notify] = useToast();
  const [theme, setTheme] = useState(getInitialTheme);

  // Apply the theme to <html> (CSS variables + native form controls) and remember the choice.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#09090b" : "#fafafa");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage unavailable (private mode / blocked) — theme still applies for this visit
    }
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  // Keep the URL hash in sync so each tool has a shareable, bookmarkable address.
  useEffect(() => {
    const onHash = () => setActiveTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Per-tool <title> and meta description for SEO and social previews.
  useEffect(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    document.title = `${tab.title} | ${SITE_NAME}`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", tab.description);
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute("href", `${SITE_URL}/#${tab.id}`);
  }, [activeTab]);

  const selectTab = useCallback((id) => {
    setActiveTab(id);
    if (window.location.hash !== `#${id}`)
      window.history.pushState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
  }, []);

  // popstate covers back/forward after pushState (hashchange doesn't fire for pushState entries).
  useEffect(() => {
    const onPop = () => setActiveTab(tabFromHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.textSoft }}>
      <Sidebar
        activeTab={activeTab}
        onSelect={selectTab}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Full-height flex column: the content area grows, so the footer always lands at the bottom of the page. */}
      <main
        className="app-main"
        style={{
          marginLeft: 260,
          padding: "28px 40px 0",
          minWidth: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <AdLeaderboard />

        <div
          style={{
            flex: 1,
            width: "100%",
            maxWidth: 1100,
            margin: "0 auto",
            paddingBottom: 56,
          }}
        >
          {/* Panels stay mounted (just hidden) so work in progress survives tab switches. */}
          <div hidden={activeTab !== "cron"}>
            <CronScheduler notify={notify} />
          </div>
          <div hidden={activeTab !== "csv-json"}>
            <CsvToJson notify={notify} />
          </div>
          <div hidden={activeTab !== "json-diff"}>
            <JsonDiffChecker notify={notify} />
          </div>
          <div hidden={activeTab !== "privacy"}>
            <PrivacyTerms />
          </div>
        </div>

        {/* Negative inline margins cancel main's side padding so the footer bar spans the full workspace width. */}
        <footer
          className="app-footer"
          style={{
            margin: "0 -40px",
            padding: "18px 40px",
            background: C.panel,
            borderTop: `1px solid ${C.border}`,
            fontSize: 13,
            color: C.faint,
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>
              © {CURRENT_YEAR} {SITE_NAME}. All processing happens locally in
              your browser.
            </span>
            <a
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                selectTab("privacy");
              }}
              style={{ color: C.muted, textUnderlineOffset: 3 }}
            >
              Privacy Policy &amp; Terms
            </a>
          </div>
        </footer>
      </main>

      <Toast toast={toast} />
    </div>
  );
}
