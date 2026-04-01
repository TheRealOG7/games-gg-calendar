"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import type { GameRelease } from "@/lib/releases";
import { deduplicatePlatforms, gamesGgUrl } from "@/lib/releases";
import type { GamingEvent } from "@/lib/events";
import { GAMING_EVENTS, getEventsForDate } from "@/lib/events";
import { useWishlist } from "@/lib/wishlist";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterKey = "release" | "convention" | "showcase" | "awards" | "esports";

const FILTERS: { key: FilterKey; color: string; label: string }[] = [
  { key: "release",    color: "#52d68a", label: "Releases"    },
  { key: "convention", color: "#4f9cf9", label: "Conventions" },
  { key: "esports",    color: "#e84855", label: "Esports"     },
  { key: "showcase",   color: "#b06ff5", label: "Showcases"   },
  { key: "awards",     color: "#f5c842", label: "Awards"      },
];

const ALL_FILTER_KEYS = new Set<FilterKey>(FILTERS.map((f) => f.key));

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getMonthDays(year: number, month: number) {
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrev  = new Date(year, month - 1, 0).getDate();
  const cells: { dateStr: string; day: number; thisMonth: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const mm = month === 1 ? 12 : month - 1;
    const yy = month === 1 ? year - 1 : year;
    cells.push({ dateStr: toDateStr(yy, mm, d), day: d, thisMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: toDateStr(year, month, d), day: d, thisMonth: true });
  }
  const remaining = Math.ceil(cells.length / 7) * 7 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const mm = month === 12 ? 1 : month + 1;
    const yy = month === 12 ? year + 1 : year;
    cells.push({ dateStr: toDateStr(yy, mm, d), day: d, thisMonth: false });
  }
  return cells;
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const EVENT_TYPE_LABEL: Record<string, string> = {
  convention: "Convention",
  showcase:   "Showcase",
  awards:     "Awards",
  esports:    "Esports",
  sale:       "Sale",
};

function formatDateShort(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function formatDateLong(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function getWeekday(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
}

function googleCalUrl(name: string, start: string, end: string, description = "", location = "") {
  const s = start.replace(/-/g, "");
  const eDate = new Date(end + "T00:00:00Z");
  eDate.setUTCDate(eDate.getUTCDate() + 1);
  const e = eDate.toISOString().slice(0, 10).replace(/-/g, "");
  return (
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(name)}&dates=${s}/${e}` +
    (description ? `&details=${encodeURIComponent(description)}` : "") +
    (location    ? `&location=${encodeURIComponent(location)}`    : "")
  );
}

// ── Mobile detection ──────────────────────────────────────────────────────────

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

// ── GTA VI Countdown ──────────────────────────────────────────────────────────

const GTA6_RELEASE = new Date("2026-11-19T00:00:00");

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(() => Math.max(0, target.getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setDiff(Math.max(0, target.getTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000)  / 60000),
    seconds: Math.floor((diff % 60000)    / 1000),
    released: diff === 0,
  };
}

function GTA6Countdown() {
  const { days, hours, minutes, seconds, released } = useCountdown(GTA6_RELEASE);
  const [collapsed, setCollapsed] = useState(false);

  if (released) {
    return (
      <div style={{ padding: "8px 10px", borderRadius: "8px", background: "oklch(14% 0.03 240)", border: "1px solid oklch(26% 0.04 240)", fontSize: "11px", fontWeight: 700, color: "var(--text)", textAlign: "center" }}>
        GTA VI IS OUT
      </div>
    );
  }

  return (
    <div style={{ borderRadius: "8px", background: "oklch(14% 0.03 240)", border: "1px solid oklch(26% 0.04 240)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", gap: "6px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "10px", fontWeight: 800, color: "#777", letterSpacing: "0.08em" }}>GTA VI</span>
          <span style={{ fontSize: "9px", color: "#444" }}>Nov 19</span>
        </div>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: "3px", marginLeft: "auto" }}>
            <span style={{ fontSize: "13px", fontWeight: 800, color: "#ccc" }}>{String(days).padStart(3, "0")}</span>
            <span style={{ fontSize: "8px", color: "#444" }}>d</span>
            <span style={{ fontSize: "13px", fontWeight: 800, color: "#ccc" }}>{String(hours).padStart(2, "0")}</span>
            <span style={{ fontSize: "8px", color: "#444" }}>h</span>
          </div>
        )}
        <span style={{ fontSize: "9px", color: "#444", flexShrink: 0 }}>{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <div style={{ display: "flex", justifyContent: "center", gap: "10px", padding: "0 10px 9px" }}>
          {([
            [days,    "DAYS"],
            [hours,   "HRS"],
            [minutes, "MIN"],
            [seconds, "SEC"],
          ] as [number, string][]).map(([val, lbl]) => (
            <div key={lbl} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>
                {String(val).padStart(lbl === "DAYS" ? 3 : 2, "0")}
              </span>
              <span style={{ fontSize: "7px", color: "#444", letterSpacing: "0.06em", marginTop: "2px" }}>{lbl}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mini calendar (sidebar) ───────────────────────────────────────────────────

function MiniCalendar({
  year, month, todayStr, selectedDate, releases, activeFilters,
  onSelectDate, onPrevMonth, onNextMonth,
}: {
  year: number; month: number; todayStr: string; selectedDate: string | null;
  releases: GameRelease[]; activeFilters: Set<FilterKey>;
  onSelectDate: (d: string) => void; onPrevMonth: () => void; onNextMonth: () => void;
}) {
  const cells = getMonthDays(year, month);

  // Build set of dates that have content (for the dot indicator)
  const contentDates = new Set<string>();
  if (activeFilters.has("release")) {
    for (const r of releases) contentDates.add(r.released);
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toDateStr(year, month, d);
    const evs = getEventsForDate(ds).filter((e) => activeFilters.has(e.type as FilterKey));
    if (evs.length > 0) contentDates.add(ds);
  }

  const atEnd = year === 2026 && month === 12;

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <button
          type="button"
          onClick={onPrevMonth}
          style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "16px", padding: "2px 8px", lineHeight: 1 }}
        >‹</button>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#bbb", letterSpacing: "0.04em" }}>
          {MONTH_NAMES[month - 1].slice(0, 3).toUpperCase()} {year}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          style={{ background: "none", border: "none", color: atEnd ? "#2a2a2a" : "#555", cursor: atEnd ? "default" : "pointer", fontSize: "16px", padding: "2px 8px", lineHeight: 1 }}
        >›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: "2px" }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: "9px", color: "#3a3a3a", fontWeight: 700, padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "1px" }}>
        {cells.map(({ dateStr, day, thisMonth }) => {
          const isSelected = dateStr === selectedDate;
          const isToday    = dateStr === todayStr;
          const hasContent = thisMonth && contentDates.has(dateStr);
          return (
            <div
              key={dateStr}
              onClick={() => thisMonth && onSelectDate(dateStr)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", padding: "2px 0",
                cursor: thisMonth ? "pointer" : "default",
                opacity: thisMonth ? 1 : 0.15,
                borderRadius: "4px",
                background: isSelected ? "oklch(83% 0.22 158 / 0.12)" : "transparent",
              }}
            >
              <div style={{
                width: "18px", height: "18px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", fontWeight: isToday ? 800 : 500,
                background: isToday ? "var(--green)" : "transparent",
                color: isToday ? "#060D17" : isSelected ? "oklch(83% 0.22 158)" : hasContent ? "#ccc" : "#3a3a3a",
              }}>{day}</div>
              {hasContent && !isToday && (
                <div style={{ width: "3px", height: "3px", borderRadius: "50%", background: isSelected ? "oklch(83% 0.22 158)" : "#52d68a55", marginTop: "1px" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Watchlist modal (centered popup) ─────────────────────────────────────────

function WatchlistModal({
  slugs, releases, onClose, onRemove,
}: {
  slugs: string[]; releases: GameRelease[]; onClose: () => void; onRemove: (slug: string) => void;
}) {
  const releaseMap = new Map(releases.map((r) => [r.slug, r]));
  const saved = slugs
    .map((s) => releaseMap.get(s))
    .filter((r): r is GameRelease => !!r)
    .sort((a, b) => a.released.localeCompare(b.released));

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 280, backdropFilter: "blur(3px)" }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "calc(100vw - 32px)", maxWidth: "420px", maxHeight: "80vh",
        background: "oklch(15% 0.04 240)", border: "1px solid oklch(28% 0.06 240)",
        borderRadius: "16px", zIndex: 290, overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.75)",
        animation: "popIn 0.15s ease",
      }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid oklch(20% 0.04 240)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: "15px" }}>
            My Watchlist
            {saved.length > 0 && <span style={{ color: "var(--text-dim)", fontWeight: 400, marginLeft: "6px" }}>({saved.length})</span>}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid oklch(22% 0.05 240)", borderRadius: "50%", width: "28px", height: "28px", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}
          >✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {saved.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--text-dim)", textAlign: "center", margin: "40px 0", lineHeight: 1.6 }}>
              No games saved yet.<br />
              <span style={{ fontSize: "11px" }}>Tap + on any game to add it.</span>
            </p>
          ) : saved.map((r) => (
            <div key={r.slug} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px", borderRadius: "8px", borderBottom: "1px solid oklch(20% 0.04 240)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "13px", fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
                <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: "2px 0 0" }}>{formatDateShort(r.released)}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(r.slug)}
                style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "18px", padding: "4px", flexShrink: 0, lineHeight: 1 }}
              >×</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Game detail panel ─────────────────────────────────────────────────────────

function GameDetailPanel({
  game, inWatchlist, onWatchlistToggle, onClose, asModal,
}: {
  game: GameRelease; inWatchlist: boolean;
  onWatchlistToggle: (slug: string) => void;
  onClose: () => void; asModal?: boolean;
}) {
  const platforms = deduplicatePlatforms(game.platforms);
  const calUrl    = googleCalUrl(
    `${game.name} — Release`, game.released, game.released,
    `${game.name} releases today. View on GAMES.GG: ${gamesGgUrl(game.slug)}`,
  );
  const [imgFailed, setImgFailed] = useState(false);

  const panelStyle: React.CSSProperties = asModal
    ? { width: "100%", background: "oklch(15% 0.04 240)", display: "flex", flexDirection: "column", maxHeight: "90vh" }
    : { width: "260px", flexShrink: 0, background: "oklch(12% 0.03 240)", borderLeft: "1px solid oklch(20% 0.04 240)", display: "flex", flexDirection: "column", overflow: "hidden" };

  return (
    <div style={panelStyle}>
      {/* Cover */}
      <div style={{ position: "relative", height: asModal ? "180px" : "220px", flexShrink: 0, overflow: "hidden" }}>
        {game.background_image && !imgFailed ? (
          <>
            <Image
              src={game.background_image} alt={game.name} fill
              style={{ objectFit: "cover", objectPosition: "top" }} sizes="280px"
              onError={() => setImgFailed(true)}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, oklch(15% 0.04 240) 100%)" }} />
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, oklch(22% 0.07 240), oklch(12% 0.04 240))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "48px", fontWeight: 800, color: "oklch(83% 0.22 158 / 0.15)", letterSpacing: "-0.04em" }}>
              {game.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <button
          type="button" onClick={onClose}
          style={{ position: "absolute", top: "10px", right: "10px", background: "rgba(6,13,23,0.7)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", width: "28px", height: "28px", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}
        >✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--green)", padding: "2px 6px", background: "oklch(83% 0.22 158 / 0.12)", borderRadius: "4px", border: "1px solid oklch(83% 0.22 158 / 0.3)" }}>
            Game Release
          </span>
          {game.metacritic && (
            <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: "#f5c84222", color: "#f5c842", border: "1px solid #f5c84240" }}>
              MC {game.metacritic}
            </span>
          )}
        </div>
        <h3 style={{ fontSize: "17px", fontWeight: 800, lineHeight: 1.2, marginBottom: "3px" }}>{game.name}</h3>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px" }}>{formatDateLong(game.released)}</p>
        {game.genres.length > 0 && (
          <p style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "12px" }}>{game.genres.slice(0, 4).join(" · ")}</p>
        )}
        <button
          type="button"
          onClick={() => onWatchlistToggle(game.slug)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer", border: "1px solid", background: inWatchlist ? "oklch(83% 0.22 158 / 0.15)" : "oklch(83% 0.22 158 / 0.08)", color: "var(--green)", borderColor: inWatchlist ? "oklch(83% 0.22 158 / 0.5)" : "oklch(83% 0.22 158 / 0.3)", marginBottom: "10px", transition: "all 0.15s" }}
        >
          {inWatchlist ? "✓ In Watchlist" : "+ Add to Watchlist"}
        </button>
        {platforms.length > 0 && (
          <>
            <div style={{ height: "1px", background: "oklch(20% 0.04 240)", margin: "2px 0 10px" }} />
            <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "8px" }}>Platforms</p>
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "12px" }}>
              {platforms.map((p) => (
                <span key={p} style={{ fontSize: "10px", fontWeight: 600, padding: "3px 7px", borderRadius: "4px", background: "rgba(255,255,255,0.07)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.1)", textTransform: "uppercase" }}>{p}</span>
              ))}
            </div>
          </>
        )}
        <a
          href={gamesGgUrl(game.slug)} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", background: "var(--green)", color: "#060D17", fontWeight: 700, fontSize: "13px", padding: "9px 14px", borderRadius: "8px", textDecoration: "none", transition: "opacity 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >View on GAMES.GG</a>
        <a
          href={calUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid oklch(22% 0.05 240)", fontWeight: 600, fontSize: "12px", padding: "7px 14px", borderRadius: "8px", textDecoration: "none", marginTop: "6px" }}
        >+ Add to Google Calendar</a>
      </div>
    </div>
  );
}

// ── Event detail panel ────────────────────────────────────────────────────────

function EventDetailPanel({
  event, onClose, asModal,
}: {
  event: GamingEvent; onClose: () => void; asModal?: boolean;
}) {
  const isSameDay = event.startDate === event.endDate;
  const calUrl    = googleCalUrl(event.name, event.startDate, event.endDate, event.description, event.location);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!event.logoUrl && !imgFailed;

  const panelStyle: React.CSSProperties = asModal
    ? { width: "100%", background: "oklch(15% 0.04 240)", display: "flex", flexDirection: "column", maxHeight: "90vh" }
    : { width: "260px", flexShrink: 0, background: "oklch(12% 0.03 240)", borderLeft: "1px solid oklch(20% 0.04 240)", display: "flex", flexDirection: "column", overflow: "hidden" };

  return (
    <div style={panelStyle}>
      {/* Cover */}
      <div style={{ position: "relative", height: asModal ? "130px" : "160px", flexShrink: 0, overflow: "hidden" }}>
        {showImg ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.logoUrl} alt={event.name}
              onError={() => setImgFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, oklch(15% 0.04 240) 100%)" }} />
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${event.color}20, ${event.color}06)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: event.color, opacity: 0.7 }}>
              {EVENT_TYPE_LABEL[event.type]}
            </span>
          </div>
        )}
        <button
          type="button" onClick={onClose}
          style={{ position: "absolute", top: "10px", right: "10px", background: "rgba(6,13,23,0.7)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", width: "28px", height: "28px", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}
        >✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px" }}>
        <span style={{ display: "inline-block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: event.color, padding: "2px 6px", background: event.color + "22", borderRadius: "4px", border: `1px solid ${event.color}40`, marginBottom: "10px" }}>
          {EVENT_TYPE_LABEL[event.type]}
        </span>
        <h3 style={{ fontSize: "16px", fontWeight: 800, lineHeight: 1.2, marginBottom: "4px" }}>{event.name}</h3>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "2px" }}>
          {isSameDay ? formatDateLong(event.startDate) : `${formatDateShort(event.startDate)} – ${formatDateShort(event.endDate)}`}
        </p>
        {event.location && (
          <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px" }}>{event.location}</p>
        )}
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "14px" }}>{event.description}</p>
        {event.url && (
          <a href={event.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: event.color + "1a", color: event.color, border: `1px solid ${event.color}40`, fontWeight: 700, fontSize: "12px", padding: "9px 14px", borderRadius: "8px", textDecoration: "none", marginBottom: "6px", transition: "opacity 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >Official Website ↗</a>
        )}
        <a
          href={calUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid oklch(22% 0.05 240)", fontWeight: 600, fontSize: "12px", padding: "7px 14px", borderRadius: "8px", textDecoration: "none" }}
        >+ Add to Google Calendar</a>
      </div>
    </div>
  );
}

// ── Game feed tile ────────────────────────────────────────────────────────────

function GameFeedTile({
  game, isSelected, inWatchlist, onSelect, onWatchlistToggle,
}: {
  game: GameRelease; isSelected: boolean; inWatchlist: boolean;
  onSelect: () => void; onWatchlistToggle: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const platforms = deduplicatePlatforms(game.platforms).slice(0, 3);

  return (
    <div
      onClick={onSelect}
      style={{ cursor: "pointer", borderRadius: "10px", overflow: "hidden", border: isSelected ? "1px solid oklch(83% 0.22 158 / 0.55)" : "1px solid oklch(20% 0.04 240)", transition: "transform 0.15s, border-color 0.15s", background: "oklch(13% 0.03 240)", position: "relative" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      {/* Portrait art — 2:3 aspect */}
      <div style={{ position: "relative", aspectRatio: "2/3", overflow: "hidden" }}>
        {game.background_image && !imgFailed ? (
          <Image
            src={game.background_image} alt={game.name} fill
            style={{ objectFit: "cover", objectPosition: "top" }}
            sizes="(max-width: 768px) 33vw, 160px"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, oklch(22% 0.08 240), oklch(12% 0.04 240))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "24px", fontWeight: 800, color: "oklch(83% 0.22 158 / 0.18)", letterSpacing: "-0.04em" }}>
              {game.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}

        {/* Dark gradient overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 40%, rgba(6,10,18,0.95) 100%)" }} />

        {/* Platform tags — top left */}
        {platforms.length > 0 && (
          <div style={{ position: "absolute", top: "6px", left: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {platforms.map((p) => (
              <span key={p} style={{ fontSize: "7px", fontWeight: 700, padding: "2px 5px", borderRadius: "3px", background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", color: "#ccc", letterSpacing: "0.04em", textTransform: "uppercase" }}>{p}</span>
            ))}
          </div>
        )}

        {/* Game name — bottom */}
        <div style={{ position: "absolute", bottom: "28px", left: "7px", right: "7px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", lineHeight: 1.2, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{game.name}</span>
        </div>

        {/* Watchlist button — bottom right */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onWatchlistToggle(); }}
          style={{ position: "absolute", bottom: "6px", right: "6px", width: "22px", height: "22px", borderRadius: "50%", background: inWatchlist ? "oklch(83% 0.22 158 / 0.3)" : "rgba(6,10,18,0.75)", border: inWatchlist ? "1px solid oklch(83% 0.22 158 / 0.6)" : "1px solid rgba(255,255,255,0.2)", color: inWatchlist ? "var(--green)" : "#777", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", transition: "all 0.15s" }}
        >{inWatchlist ? "✓" : "+"}</button>
      </div>
    </div>
  );
}

// ── Event feed row ────────────────────────────────────────────────────────────

function EventFeedRow({
  event, isSelected, onSelect,
}: {
  event: GamingEvent; isSelected: boolean; onSelect: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg    = !!event.logoUrl && !imgFailed;
  const isSameDay  = event.startDate === event.endDate;

  return (
    <div
      onClick={onSelect}
      style={{ display: "flex", cursor: "pointer", borderRadius: "10px", overflow: "hidden", border: isSelected ? `1px solid ${event.color}55` : "1px solid oklch(20% 0.04 240)", background: "oklch(13% 0.03 240)", marginBottom: "8px", transition: "border-color 0.15s" }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = "oklch(28% 0.06 240)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = isSelected ? `${event.color}55` : "oklch(20% 0.04 240)"; }}
    >
      {/* Color bar */}
      <div style={{ width: "3px", background: event.color, flexShrink: 0 }} />
      {/* Logo */}
      <div style={{ width: "60px", height: "60px", flexShrink: 0, background: showImg ? "oklch(11% 0.03 240)" : `${event.color}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.logoUrl} alt={event.name} onError={() => setImgFailed(true)} style={{ width: "100%", height: "100%", objectFit: "contain", padding: "6px" }} />
        ) : (
          <span style={{ fontSize: "8px", fontWeight: 700, color: event.color, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", padding: "4px" }}>
            {EVENT_TYPE_LABEL[event.type]}
          </span>
        )}
      </div>
      {/* Text */}
      <div style={{ padding: "10px 12px", flex: 1, minWidth: 0 }}>
        <span style={{ display: "inline-block", fontSize: "8px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: event.color, padding: "1px 5px", background: event.color + "1a", borderRadius: "3px", border: `1px solid ${event.color}35`, marginBottom: "3px" }}>
          {EVENT_TYPE_LABEL[event.type]}
        </span>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "2px" }}>
          {event.name}
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>
          {isSameDay
            ? formatDateShort(event.startDate)
            : `${formatDateShort(event.startDate)} – ${formatDateShort(event.endDate)}`}
          {event.location && ` · ${event.location}`}
        </div>
      </div>
    </div>
  );
}

// ── Main calendar ─────────────────────────────────────────────────────────────

interface CalendarClientProps {
  releases: GameRelease[];
  initialYear: number;
  initialMonth: number;
}

export function CalendarClient({ releases, initialYear, initialMonth }: CalendarClientProps) {
  const today    = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const isMobile = useIsMobile();

  const [year,  setYear]  = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<
    | { kind: "game";  data: GameRelease }
    | { kind: "event"; data: GamingEvent }
    | null
  >(null);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [filtersOpen,   setFiltersOpen]   = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(
    () => new Set(ALL_FILTER_KEYS)
  );

  const { slugs: watchlistSlugs, toggle: watchlistToggle, has: watchlistHas, remove: watchlistRemove } = useWishlist();

  const feedRef    = useRef<HTMLDivElement>(null);
  const dayRefs    = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      if (next.size === 0) return prev; // keep at least one active
      return next;
    });
  }, []);

  // Keyboard escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (selectedItem) setSelectedItem(null);
      else if (watchlistOpen) setWatchlistOpen(false);
      else if (filtersOpen)   setFiltersOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedItem, watchlistOpen, filtersOpen]);

  const prevMonth = useCallback(() => {
    setSelectedDate(null); setSelectedItem(null);
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    if (year === 2026 && month === 12) return;
    setSelectedDate(null); setSelectedItem(null);
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }, [month, year]);

  // Scroll feed to selected date
  useEffect(() => {
    if (selectedDate && dayRefs.current[selectedDate]) {
      dayRefs.current[selectedDate]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedDate]);

  // Build day feed — only days with content in this month
  const daysInMonth = new Date(year, month, 0).getDate();

  type DayData = { dateStr: string; day: number; releases: GameRelease[]; events: GamingEvent[] };
  const feedDays: DayData[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr    = toDateStr(year, month, d);
    const dayRels    = activeFilters.has("release") ? releases.filter((r) => r.released === dateStr) : [];
    const dayEvts    = getEventsForDate(dateStr).filter((e) => activeFilters.has(e.type as FilterKey));
    if (dayRels.length > 0 || dayEvts.length > 0) {
      feedDays.push({ dateStr, day: d, releases: dayRels, events: dayEvts });
    }
  }

  const selectedItemKey = selectedItem
    ? selectedItem.kind === "game"
      ? `game-${selectedItem.data.slug}`
      : `event-${(selectedItem.data as GamingEvent).id}`
    : null;

  const atMonthEnd = year === 2026 && month === 12;

  // ── Sidebar (desktop only) ──────────────────────────────────────────────────
  const Sidebar = (
    <aside style={{
      width: "200px", flexShrink: 0,
      background: "oklch(10% 0.025 240)",
      borderRight: "1px solid oklch(17% 0.04 240)",
      display: "flex", flexDirection: "column", gap: "18px",
      padding: "20px 14px 16px",
      overflowY: "auto",
    }}>
      <MiniCalendar
        year={year} month={month} todayStr={todayStr} selectedDate={selectedDate}
        releases={releases} activeFilters={activeFilters}
        onSelectDate={(d) => { setSelectedDate(d); setSelectedItem(null); }}
        onPrevMonth={prevMonth} onNextMonth={nextMonth}
      />

      <GTA6Countdown />

      {/* Filters */}
      <div>
        <p style={{ fontSize: "9px", fontWeight: 700, color: "#333", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Showing</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => toggleFilter(f.key)}
              style={{ display: "flex", alignItems: "center", gap: "9px", padding: "6px 7px", borderRadius: "6px", background: "transparent", border: "none", cursor: "pointer", width: "100%", textAlign: "left", transition: "background 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget.style.background = "rgba(255,255,255,0.04)"); }}
              onMouseLeave={(e) => { (e.currentTarget.style.background = "transparent"); }}
            >
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: activeFilters.has(f.key) ? f.color : "#2a2a2a", flexShrink: 0, transition: "background 0.15s" }} />
              <span style={{ fontSize: "12px", color: activeFilters.has(f.key) ? "#ccc" : "#3a3a3a", fontWeight: activeFilters.has(f.key) ? 600 : 400, transition: "color 0.15s" }}>
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Watchlist */}
      <button
        type="button"
        onClick={() => setWatchlistOpen(true)}
        style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "8px", cursor: "pointer", background: watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.08)" : "oklch(13% 0.03 240)", border: `1px solid ${watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.25)" : "oklch(20% 0.04 240)"}`, color: watchlistSlugs.length > 0 ? "var(--green)" : "var(--text-secondary)", transition: "all 0.15s" }}
        onMouseEnter={(e) => { (e.currentTarget.style.borderColor = watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.45)" : "oklch(28% 0.06 240)"); }}
        onMouseLeave={(e) => { (e.currentTarget.style.borderColor = watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.25)" : "oklch(20% 0.04 240)"); }}
      >
        <span style={{ fontSize: "12px", fontWeight: 600 }}>My Watchlist</span>
        {watchlistSlugs.length > 0 && (
          <span style={{ fontSize: "10px", fontWeight: 700, background: "oklch(83% 0.22 158 / 0.18)", borderRadius: "10px", padding: "1px 7px" }}>
            {watchlistSlugs.length}
          </span>
        )}
      </button>
    </aside>
  );

  // ── Mobile top bar ──────────────────────────────────────────────────────────
  const MobileTopBar = (
    <div style={{ display: "flex", alignItems: "center", padding: "12px 14px 8px", flexShrink: 0, gap: "6px", borderBottom: "1px solid oklch(17% 0.04 240)" }}>
      <button
        type="button" onClick={prevMonth}
        style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "22px", padding: "2px 8px", lineHeight: 1 }}
      >‹</button>
      <span style={{ flex: 1, textAlign: "center", fontSize: "16px", fontWeight: 700 }}>
        {MONTH_NAMES[month - 1]} <span style={{ fontWeight: 300, color: "#555" }}>{year}</span>
      </span>
      <button
        type="button" onClick={nextMonth}
        style={{ background: "none", border: "none", color: atMonthEnd ? "#2a2a2a" : "#555", cursor: atMonthEnd ? "default" : "pointer", fontSize: "22px", padding: "2px 8px", lineHeight: 1 }}
      >›</button>
      <button
        type="button" onClick={() => setFiltersOpen(true)}
        style={{ background: "oklch(13% 0.03 240)", border: "1px solid oklch(20% 0.04 240)", borderRadius: "7px", padding: "6px 10px", color: "#888", cursor: "pointer", fontSize: "11px", fontWeight: 600, flexShrink: 0 }}
      >Filters</button>
      <button
        type="button" onClick={() => setWatchlistOpen(true)}
        style={{ background: watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.1)" : "oklch(13% 0.03 240)", border: `1px solid ${watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.3)" : "oklch(20% 0.04 240)"}`, borderRadius: "7px", padding: "6px 10px", color: watchlistSlugs.length > 0 ? "var(--green)" : "#888", cursor: "pointer", fontSize: "11px", fontWeight: 600, flexShrink: 0 }}
      >
        {watchlistSlugs.length > 0 ? `Watch (${watchlistSlugs.length})` : "Watch"}
      </button>
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

      {/* Desktop sidebar */}
      {!isMobile && Sidebar}

      {/* Main column */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Mobile top bar */}
        {isMobile && MobileTopBar}

        {/* Scrollable day feed */}
        <div
          ref={feedRef}
          style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 14px 32px" : "20px 24px 32px" }}
        >
          {feedDays.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-dim)" }}>
              <p style={{ fontSize: "15px", fontWeight: 600 }}>Nothing scheduled for {MONTH_NAMES[month - 1]} {year}</p>
              <p style={{ fontSize: "12px", marginTop: "6px" }}>Try toggling filters or browsing another month.</p>
            </div>
          ) : feedDays.map(({ dateStr, day, releases: dayRels, events: dayEvts }) => {
            const isSelected = dateStr === selectedDate;
            const isToday    = dateStr === todayStr;
            const weekday    = getWeekday(dateStr);

            return (
              <div
                key={dateStr}
                ref={(el) => { dayRefs.current[dateStr] = el; }}
                style={{ marginBottom: "36px" }}
              >
                {/* Day header */}
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "14px", paddingBottom: "10px", borderBottom: `1px solid ${isSelected ? "oklch(83% 0.22 158 / 0.25)" : "oklch(17% 0.04 240)"}` }}>
                  <span style={{ fontSize: "34px", fontWeight: 900, lineHeight: 1, color: isSelected ? "oklch(83% 0.22 158)" : isToday ? "#fff" : "#3a3a3a" }}>{day}</span>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: isSelected ? "oklch(83% 0.22 158 / 0.7)" : isToday ? "oklch(83% 0.22 158)" : "#404040" }}>{weekday}</span>
                    <span style={{ fontSize: "10px", color: "#2e2e2e" }}>{MONTH_NAMES[month - 1]} {year}</span>
                  </div>
                  {isToday && (
                    <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--green)", background: "oklch(83% 0.22 158 / 0.1)", padding: "2px 8px", borderRadius: "4px", border: "1px solid oklch(83% 0.22 158 / 0.2)" }}>TODAY</span>
                  )}
                </div>

                {/* Events */}
                {dayEvts.length > 0 && (
                  <div style={{ marginBottom: dayRels.length > 0 ? "12px" : "0" }}>
                    {dayEvts.map((event) => (
                      <EventFeedRow
                        key={event.id} event={event}
                        isSelected={selectedItemKey === `event-${event.id}`}
                        onSelect={() => {
                          setSelectedDate(dateStr);
                          setSelectedItem({ kind: "event", data: event });
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Game releases */}
                {dayRels.length > 0 && (
                  <div>
                    {dayEvts.length > 0 && (
                      <p style={{ fontSize: "9px", fontWeight: 700, color: "#333", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
                        Game Releases · {dayRels.length}
                      </p>
                    )}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "repeat(auto-fill, minmax(95px, 1fr))"
                        : "repeat(auto-fill, minmax(120px, 1fr))",
                      gap: "8px",
                    }}>
                      {dayRels.map((game) => (
                        <GameFeedTile
                          key={game.slug} game={game}
                          isSelected={selectedItemKey === `game-${game.slug}`}
                          inWatchlist={watchlistHas(game.slug)}
                          onSelect={() => {
                            setSelectedDate(dateStr);
                            setSelectedItem({ kind: "game", data: game });
                          }}
                          onWatchlistToggle={() => watchlistToggle(game.slug)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop detail panel */}
      {!isMobile && selectedItem && (
        selectedItem.kind === "game" ? (
          <GameDetailPanel
            game={selectedItem.data}
            inWatchlist={watchlistHas(selectedItem.data.slug)}
            onWatchlistToggle={watchlistToggle}
            onClose={() => setSelectedItem(null)}
          />
        ) : (
          <EventDetailPanel
            event={selectedItem.data}
            onClose={() => setSelectedItem(null)}
          />
        )
      )}

      {/* ── Modals ── */}

      {/* Watchlist modal */}
      {watchlistOpen && (
        <WatchlistModal
          slugs={watchlistSlugs} releases={releases}
          onClose={() => setWatchlistOpen(false)}
          onRemove={watchlistRemove}
        />
      )}

      {/* Mobile: detail modal */}
      {isMobile && selectedItem && (
        <>
          <div
            onClick={() => setSelectedItem(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 290, backdropFilter: "blur(3px)" }}
          />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "calc(100vw - 24px)", maxWidth: "400px", maxHeight: "92vh", zIndex: 300, borderRadius: "16px", overflow: "hidden", animation: "popIn 0.15s ease", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.8)" }}>
            {selectedItem.kind === "game" ? (
              <GameDetailPanel
                game={selectedItem.data}
                inWatchlist={watchlistHas(selectedItem.data.slug)}
                onWatchlistToggle={watchlistToggle}
                onClose={() => setSelectedItem(null)}
                asModal
              />
            ) : (
              <EventDetailPanel
                event={selectedItem.data}
                onClose={() => setSelectedItem(null)}
                asModal
              />
            )}
          </div>
        </>
      )}

      {/* Mobile: filters bottom sheet */}
      {isMobile && filtersOpen && (
        <>
          <div
            onClick={() => setFiltersOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 280 }}
          />
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "oklch(15% 0.04 240)", borderTop: "1px solid oklch(28% 0.06 240)", borderRadius: "16px 16px 0 0", zIndex: 290, padding: "14px 18px 36px", animation: "slideUp 0.2s ease" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.15)" }} />
            </div>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#444", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Showing</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {FILTERS.map((f) => (
                <button
                  key={f.key} type="button"
                  onClick={() => toggleFilter(f.key)}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "10px", background: activeFilters.has(f.key) ? `${f.color}10` : "oklch(13% 0.03 240)", border: `1px solid ${activeFilters.has(f.key) ? f.color + "38" : "oklch(20% 0.04 240)"}`, cursor: "pointer", transition: "all 0.15s" }}
                >
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: activeFilters.has(f.key) ? f.color : "#2a2a2a", flexShrink: 0 }} />
                  <span style={{ fontSize: "14px", fontWeight: 600, color: activeFilters.has(f.key) ? "#ddd" : "#444", flex: 1, textAlign: "left" }}>{f.label}</span>
                  {activeFilters.has(f.key) && <span style={{ color: f.color, fontSize: "12px" }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
