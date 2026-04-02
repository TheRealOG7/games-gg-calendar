"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import type { GameRelease } from "@/lib/releases";
import { deduplicatePlatforms, gamesGgUrl } from "@/lib/releases";
import type { GamingEvent } from "@/lib/events";
import { getEventsForDate } from "@/lib/events";
import { useWishlist } from "@/lib/wishlist";

// ── Types ─────────────────────────────────────────────────────────────────────

// "events" key covers both showcase + awards event types
type FilterKey = "release" | "convention" | "esports" | "events";

const FILTERS: { key: FilterKey; color: string; label: string }[] = [
  { key: "release",    color: "#52d68a", label: "Releases"    },
  { key: "convention", color: "#4f9cf9", label: "Conventions" },
  { key: "esports",    color: "#e84855", label: "Esports"     },
  { key: "events",     color: "#b06ff5", label: "Events"      },
];

const ALL_FILTER_KEYS = new Set<FilterKey>(FILTERS.map((f) => f.key));

function eventMatchesFilter(event: GamingEvent, activeFilters: Set<FilterKey>): boolean {
  if (event.type === "convention") return activeFilters.has("convention");
  if (event.type === "esports")    return activeFilters.has("esports");
  if (event.type === "showcase" || event.type === "awards") return activeFilters.has("events");
  return true;
}

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
const DAY_ABBREVS = ["S","M","T","W","T","F","S"];

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

// Strip em/en dashes and clean up description text
function cleanDesc(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/[—–]/g, " - ").replace(/\s{2,}/g, " ").trim();
}

// Truncate description to N words
function truncate(text: string | null | undefined, words: number): string {
  const cleaned = cleanDesc(text);
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/);
  if (parts.length <= words) return cleaned;
  return parts.slice(0, words).join(" ") + "…";
}

// Fallback description when no summary is available
function gameDescFallback(game: GameRelease): string | null {
  const parts: string[] = [];
  if (game.genres.length > 0) parts.push(game.genres.slice(0, 3).join(", ") + " game");
  if (game.platforms.length > 0) parts.push("available on " + game.platforms.slice(0, 3).join(", "));
  return parts.length > 0 ? parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p).join(", ") + "." : null;
}

// ── Mobile detection ──────────────────────────────────────────────────────────

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 900);
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
    days: Math.floor(diff / 86400000), hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000), seconds: Math.floor((diff % 60000) / 1000),
    released: diff === 0,
  };
}

function GTA6Banner({ collapsed, onToggle, coverImage }: { collapsed: boolean; onToggle: () => void; coverImage?: string | null }) {
  const { days, hours, minutes, seconds, released } = useCountdown(GTA6_RELEASE);
  if (released) return null;
  return (
    <div style={{ position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 200, display: "flex", alignItems: "stretch" }}>
      {/* Expanded card */}
      {!collapsed && (
        <div style={{
          width: "220px",
          backgroundImage: coverImage
            ? `linear-gradient(to right, rgba(6,2,14,0.7) 0%, rgba(6,2,14,0.93) 100%), url(${coverImage})`
            : "linear-gradient(160deg, #0d0618, #1a0d2e)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: "12px 0 0 12px",
          padding: "18px 16px",
          borderTop: "1px solid rgba(168,85,247,0.4)",
          borderLeft: "1px solid rgba(168,85,247,0.4)",
          borderBottom: "1px solid rgba(168,85,247,0.25)",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.85), -2px 0 20px rgba(168,85,247,0.15)",
        }}>
          <div style={{ fontSize: "14px", fontWeight: 900, letterSpacing: "0.22em", textTransform: "uppercase", color: "#C084FC", marginBottom: "3px" }}>GTA VI</div>
          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginBottom: "16px" }}>Nov 19, 2026</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
            {([[ days,"DAYS"],[hours,"HRS"],[minutes,"MIN"],[seconds,"SEC"]] as [number,string][]).map(([v,l]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: l === "DAYS" ? "24px" : "22px", fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: "-0.03em", textShadow: "0 2px 10px rgba(168,85,247,0.5)" }}>{String(v).padStart(l==="DAYS"?3:2,"0")}</div>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em", marginTop: "5px", fontWeight: 600 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Toggle tab */}
      <button type="button" onClick={onToggle} style={{
        background: collapsed ? "linear-gradient(160deg, #0d0618, #1a0d2e)" : "rgba(6,2,14,0.7)",
        border: "1px solid rgba(168,85,247,0.45)",
        borderRight: "none",
        borderRadius: collapsed ? "10px 0 0 10px" : "0 0 0 10px",
        cursor: "pointer",
        padding: collapsed ? "14px 9px" : "7px 9px",
        writingMode: collapsed ? "vertical-rl" : undefined,
        textOrientation: collapsed ? "mixed" : undefined,
        fontSize: "9px",
        fontWeight: 800,
        color: "#C084FC",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: collapsed ? "-4px 0 24px rgba(0,0,0,0.8), -1px 0 12px rgba(168,85,247,0.2)" : "none",
        lineHeight: 1.4,
      }}>
        {collapsed ? "GTA VI" : "›"}
      </button>
    </div>
  );
}

// ── Calendar grid (left panel) ────────────────────────────────────────────────

function CalGrid({
  year, month, todayStr, selectedDate, releases, activeFilters,
  onSelectDate, onPrevMonth, onNextMonth,
}: {
  year: number; month: number; todayStr: string; selectedDate: string | null;
  releases: GameRelease[]; activeFilters: Set<FilterKey>;
  onSelectDate: (d: string) => void; onPrevMonth: () => void; onNextMonth: () => void;
}) {
  const cells = getMonthDays(year, month);

  // Build per-day content map for cell display
  const daysInMonth = new Date(year, month, 0).getDate();
  type CellItem = { label: string; color: string };
  const contentByDate = new Map<string, CellItem[]>();
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toDateStr(year, month, d);
    const items: CellItem[] = [];
    const dayEvents = getEventsForDate(ds).filter((e) => eventMatchesFilter(e, activeFilters));
    for (const e of dayEvents) items.push({ label: e.name, color: e.color });
    if (activeFilters.has("release")) {
      for (const r of releases) {
        if (r.released === ds) items.push({ label: r.name, color: "#52d68a" });
      }
    }
    if (items.length > 0) contentByDate.set(ds, items);
  }

  const atEnd = year === 2026 && month === 12;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 10px", flexShrink: 0 }}>
        <button type="button" onClick={onPrevMonth} style={{ background: "none", border: "none", color: "#bbb", cursor: "pointer", fontSize: "22px", lineHeight: 1, padding: "2px 10px" }}>‹</button>
        <span style={{ fontSize: "15px", fontWeight: 700, color: "#fff", letterSpacing: "0.03em" }}>
          {MONTH_NAMES[month-1]} {year}
        </span>
        <button type="button" onClick={onNextMonth} style={{ background: "none", border: "none", color: atEnd ? "#333" : "#bbb", cursor: atEnd ? "default" : "pointer", fontSize: "22px", lineHeight: 1, padding: "2px 10px" }}>›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px", flexShrink: 0 }}>
        {DAY_ABBREVS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: "11px", color: "#888", fontWeight: 600, padding: "4px 0", letterSpacing: "0.04em" }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridAutoRows: "minmax(62px, 1fr)", padding: "0 6px 10px", gap: "1px" }}>
        {cells.map(({ dateStr, day, thisMonth }) => {
          const isSelected  = dateStr === selectedDate;
          const isToday     = dateStr === todayStr;
          const cellContent = thisMonth ? (contentByDate.get(dateStr) ?? []) : [];
          const hasContent  = cellContent.length > 0;

          return (
            <div
              key={dateStr}
              onClick={() => thisMonth && onSelectDate(dateStr)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "stretch",
                borderRadius: "5px", cursor: thisMonth ? "pointer" : "default",
                opacity: thisMonth ? 1 : 0.1,
                background: isSelected ? "oklch(83% 0.22 158 / 0.1)" : "transparent",
                transition: "background 0.12s",
                padding: "4px 3px 3px",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => { if (thisMonth && !isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isSelected ? "oklch(83% 0.22 158 / 0.1)" : "transparent"; }}
            >
              {/* Day number */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "3px" }}>
                <div style={{
                  width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "13px", fontWeight: isToday ? 800 : hasContent ? 600 : 400,
                  background: isToday ? "var(--green)" : "transparent",
                  color: isToday ? "#060D17" : isSelected ? "oklch(83% 0.22 158)" : hasContent ? "#eee" : "#555",
                  flexShrink: 0,
                }}>{day}</div>
              </div>
              {/* Content items */}
              {thisMonth && cellContent.slice(0, 3).map((item, idx) => (
                <div key={idx} style={{ fontSize: "11px", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: item.color, padding: "0 3px", marginBottom: "1px" }}>
                  {item.label}
                </div>
              ))}
              {thisMonth && cellContent.length > 3 && (
                <div style={{ fontSize: "9px", color: "#666", padding: "0 3px" }}>+{cellContent.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Modals — centered via flex on backdrop (no transform needed → no flicker) ─

function ModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 290, backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "480px", maxHeight: "90vh", borderRadius: "16px", overflow: "hidden", display: "flex", flexDirection: "column", background: "oklch(15% 0.04 240)", border: "1px solid oklch(28% 0.06 240)", boxShadow: "0 32px 80px rgba(0,0,0,0.8)", animation: "popIn 0.15s ease" }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Game detail modal ─────────────────────────────────────────────────────────

function GameDetailModal({ game, inWatchlist, onWatchlistToggle, onClose, cmsSlug }: { game: GameRelease; inWatchlist: boolean; onWatchlistToggle: (slug: string) => void; onClose: () => void; cmsSlug: string | null }) {
  const platforms = deduplicatePlatforms(game.platforms);
  const calUrl    = googleCalUrl(`${game.name} — Release`, game.released, game.released, `${game.name} releases today.`);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <ModalBackdrop onClose={onClose}>
      {/* Cover */}
      <div style={{ position: "relative", height: "200px", flexShrink: 0, overflow: "hidden" }}>
        {game.background_image && !imgFailed ? (
          <>
            <Image src={game.background_image} alt={game.name} fill style={{ objectFit: "cover", objectPosition: "top" }} sizes="480px" onError={() => setImgFailed(true)} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 25%, oklch(15% 0.04 240) 100%)" }} />
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, oklch(22% 0.07 240), oklch(12% 0.04 240))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "56px", fontWeight: 800, color: "oklch(83% 0.22 158 / 0.12)", letterSpacing: "-0.04em" }}>{game.name.slice(0,2).toUpperCase()}</span>
          </div>
        )}
        <button type="button" onClick={onClose} style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(6,13,23,0.75)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", width: "30px", height: "30px", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>✕</button>
      </div>
      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--green)", padding: "2px 7px", background: "oklch(83% 0.22 158 / 0.12)", borderRadius: "4px", border: "1px solid oklch(83% 0.22 158 / 0.3)" }}>Game Release</span>
          {game.metacritic && <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "4px", background: "#f5c84222", color: "#f5c842", border: "1px solid #f5c84240" }}>MC {game.metacritic}</span>}
        </div>
        <h2 style={{ fontSize: "21px", fontWeight: 800, lineHeight: 1.15, marginBottom: "3px" }}>{game.name}</h2>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>{formatDateLong(game.released)}</p>
        {game.genres.length > 0 && <p style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "10px" }}>{game.genres.slice(0,4).join(" · ")}</p>}
        {(() => {
          const desc = cleanDesc(game.description) || gameDescFallback(game);
          return desc ? <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "14px" }}>{truncate(desc, 60)}</p> : null;
        })()}
        <button type="button" onClick={() => onWatchlistToggle(game.slug)} style={{ width: "100%", padding: "10px 14px", borderRadius: "9px", fontWeight: 700, fontSize: "13px", cursor: "pointer", border: "1px solid", background: inWatchlist ? "oklch(83% 0.22 158 / 0.15)" : "oklch(83% 0.22 158 / 0.08)", color: "var(--green)", borderColor: inWatchlist ? "oklch(83% 0.22 158 / 0.5)" : "oklch(83% 0.22 158 / 0.3)", marginBottom: "10px", transition: "all 0.15s" }}>
          {inWatchlist ? "✓ In Watchlist" : "+ Add to Watchlist"}
        </button>
        {platforms.length > 0 && (
          <>
            <div style={{ height: "1px", background: "oklch(22% 0.05 240)", margin: "4px 0 10px" }} />
            <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "7px" }}>Platforms</p>
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "14px" }}>
              {platforms.map((p) => <span key={p} style={{ fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "5px", background: "rgba(255,255,255,0.07)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.1)", textTransform: "uppercase" }}>{p}</span>)}
            </div>
          </>
        )}
        {cmsSlug && (
          <a href={gamesGgUrl(cmsSlug)} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: "var(--green)", color: "#060D17", fontWeight: 700, fontSize: "13px", padding: "10px 14px", borderRadius: "9px", textDecoration: "none", transition: "opacity 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.opacity="0.85")} onMouseLeave={(e) => (e.currentTarget.style.opacity="1")}>View on GAMES.GG</a>
        )}
        <a href={calUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid oklch(22% 0.05 240)", fontWeight: 600, fontSize: "12px", padding: "8px 14px", borderRadius: "9px", textDecoration: "none", marginTop: "7px" }}>+ Add to Google Calendar</a>
      </div>
    </ModalBackdrop>
  );
}

// ── Event detail modal ────────────────────────────────────────────────────────

function EventDetailModal({ event, onClose }: { event: GamingEvent; onClose: () => void }) {
  const isSameDay = event.startDate === event.endDate;
  const calUrl    = googleCalUrl(event.name, event.startDate, event.endDate, event.description, event.location);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!event.logoUrl && !imgFailed;

  return (
    <ModalBackdrop onClose={onClose}>
      {/* Cover */}
      <div style={{ position: "relative", height: "160px", flexShrink: 0, overflow: "hidden" }}>
        {showImg ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.logoUrl} alt={event.name} onError={() => setImgFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 25%, oklch(15% 0.04 240) 100%)" }} />
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${event.color}25, ${event.color}08)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: event.color, opacity: 0.6 }}>{EVENT_TYPE_LABEL[event.type]}</span>
          </div>
        )}
        <button type="button" onClick={onClose} style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(6,13,23,0.75)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", width: "30px", height: "30px", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
        <span style={{ display: "inline-block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: event.color, padding: "2px 7px", background: event.color+"22", borderRadius: "4px", border: `1px solid ${event.color}40`, marginBottom: "10px" }}>{EVENT_TYPE_LABEL[event.type]}</span>
        <h2 style={{ fontSize: "20px", fontWeight: 800, lineHeight: 1.2, marginBottom: "4px" }}>{event.name}</h2>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "2px" }}>
          {isSameDay ? formatDateLong(event.startDate) : `${formatDateShort(event.startDate)} – ${formatDateShort(event.endDate)}`}
        </p>
        {event.location && <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px" }}>{event.location}</p>}
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: "16px" }}>{event.description}</p>
        {event.url && <a href={event.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: event.color+"1a", color: event.color, border: `1px solid ${event.color}40`, fontWeight: 700, fontSize: "13px", padding: "10px 14px", borderRadius: "9px", textDecoration: "none", marginBottom: "7px" }} onMouseEnter={(e) => (e.currentTarget.style.opacity="0.75")} onMouseLeave={(e) => (e.currentTarget.style.opacity="1")}>Official Website ↗</a>}
        <a href={calUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid oklch(22% 0.05 240)", fontWeight: 600, fontSize: "12px", padding: "8px 14px", borderRadius: "9px", textDecoration: "none" }}>+ Add to Google Calendar</a>
      </div>
    </ModalBackdrop>
  );
}

// ── Watchlist modal ───────────────────────────────────────────────────────────

function WatchlistModal({ slugs, releases, onClose, onRemove }: { slugs: string[]; releases: GameRelease[]; onClose: () => void; onRemove: (slug: string) => void }) {
  const releaseMap = new Map(releases.map((r) => [r.slug, r]));
  const saved = slugs.map((s) => releaseMap.get(s)).filter((r): r is GameRelease => !!r).sort((a, b) => a.released.localeCompare(b.released));
  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ padding: "18px 20px", borderBottom: "1px solid oklch(20% 0.04 240)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: "17px" }}>My Watchlist{saved.length > 0 && <span style={{ color: "var(--text-dim)", fontWeight: 400, marginLeft: "7px" }}>({saved.length})</span>}</span>
        <button type="button" onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid oklch(22% 0.05 240)", borderRadius: "50%", width: "30px", height: "30px", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
        {saved.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--text-dim)", textAlign: "center", margin: "40px 0", lineHeight: 1.6 }}>No games saved yet.<br /><span style={{ fontSize: "12px" }}>Tap + on any game to add it.</span></p>
        ) : saved.map((r) => (
          <div key={r.slug} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 8px", borderBottom: "1px solid oklch(20% 0.04 240)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "14px", fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</p>
              <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "3px 0 0" }}>{formatDateShort(r.released)}</p>
            </div>
            <button type="button" onClick={() => onRemove(r.slug)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "20px", padding: "4px", flexShrink: 0, lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
    </ModalBackdrop>
  );
}

// ── Game feed tile ────────────────────────────────────────────────────────────

function GameFeedTile({ game, isSelected, inWatchlist, onSelect, onWatchlistToggle }: { game: GameRelease; isSelected: boolean; inWatchlist: boolean; onSelect: () => void; onWatchlistToggle: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  // Show max 2 platforms; if more, show count
  const allPlatforms = deduplicatePlatforms(game.platforms);
  const shown   = allPlatforms.slice(0, 2);
  const extra   = allPlatforms.length - shown.length;

  return (
    <div
      onClick={onSelect}
      style={{ cursor: "pointer", borderRadius: "10px", overflow: "hidden", border: isSelected ? "1px solid oklch(83% 0.22 158 / 0.55)" : "1px solid oklch(20% 0.04 240)", transition: "transform 0.15s, border-color 0.15s", background: "oklch(13% 0.03 240)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      <div style={{ position: "relative", aspectRatio: "2/3", overflow: "hidden" }}>
        {game.background_image && !imgFailed ? (
          <Image src={game.background_image} alt={game.name} fill style={{ objectFit: "cover", objectPosition: "top" }} sizes="(max-width: 640px) 45vw, 200px" onError={() => setImgFailed(true)} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, oklch(22% 0.08 240), oklch(12% 0.04 240))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "28px", fontWeight: 800, color: "oklch(83% 0.22 158 / 0.15)", letterSpacing: "-0.04em" }}>{game.name.slice(0,2).toUpperCase()}</span>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 40%, rgba(4,8,16,0.96) 100%)" }} />

        {/* Platform tags — horizontal row, max 2, small */}
        {shown.length > 0 && (
          <div style={{ position: "absolute", top: "6px", left: "6px", display: "flex", gap: "3px", flexWrap: "wrap" }}>
            {shown.map((p) => (
              <span key={p} style={{ fontSize: "7px", fontWeight: 700, padding: "2px 5px", borderRadius: "3px", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", color: "#ccc", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{p}</span>
            ))}
            {extra > 0 && <span style={{ fontSize: "7px", fontWeight: 700, padding: "2px 5px", borderRadius: "3px", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", color: "#888" }}>+{extra}</span>}
          </div>
        )}

        {/* Name overlay */}
        <div style={{ position: "absolute", bottom: "28px", left: "8px", right: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff", lineHeight: 1.25, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>{game.name}</span>
        </div>

        {/* Description preview under name */}
        {game.description && (
          <div style={{ position: "absolute", bottom: "30px", left: "8px", right: "8px", transform: "translateY(-14px)" }}>
            {/* placeholder — description shown in modal only */}
          </div>
        )}

        {/* Watchlist */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onWatchlistToggle(); }} style={{ position: "absolute", bottom: "7px", right: "7px", width: "22px", height: "22px", borderRadius: "50%", background: inWatchlist ? "oklch(83% 0.22 158 / 0.3)" : "rgba(4,8,16,0.78)", border: inWatchlist ? "1px solid oklch(83% 0.22 158 / 0.6)" : "1px solid rgba(255,255,255,0.2)", color: inWatchlist ? "var(--green)" : "#777", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", transition: "all 0.15s" }}>{inWatchlist ? "✓" : "+"}</button>
      </div>
    </div>
  );
}

// ── Event feed row ────────────────────────────────────────────────────────────

function EventFeedRow({ event, onSelect }: { event: GamingEvent; onSelect: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg   = !!event.logoUrl && !imgFailed;
  const isSameDay = event.startDate === event.endDate;

  return (
    <div onClick={onSelect} style={{ display: "flex", cursor: "pointer", borderRadius: "10px", overflow: "hidden", border: "1px solid oklch(20% 0.04 240)", background: "oklch(13% 0.03 240)", marginBottom: "8px", transition: "border-color 0.15s, transform 0.15s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "oklch(28% 0.06 240)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "oklch(20% 0.04 240)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}>
      <div style={{ width: "4px", background: event.color, flexShrink: 0 }} />
      <div style={{ width: "62px", height: "62px", flexShrink: 0, background: showImg ? "oklch(11% 0.03 240)" : `${event.color}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.logoUrl} alt={event.name} onError={() => setImgFailed(true)} style={{ width: "100%", height: "100%", objectFit: "contain", padding: "8px" }} />
        ) : (
          <span style={{ fontSize: "8px", fontWeight: 700, color: event.color, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", padding: "4px" }}>{EVENT_TYPE_LABEL[event.type]}</span>
        )}
      </div>
      <div style={{ padding: "10px 14px", flex: 1, minWidth: 0 }}>
        <span style={{ display: "inline-block", fontSize: "8px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: event.color, padding: "1px 6px", background: event.color+"1a", borderRadius: "3px", border: `1px solid ${event.color}35`, marginBottom: "3px" }}>{EVENT_TYPE_LABEL[event.type]}</span>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "2px" }}>{event.name}</div>
        <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
          {isSameDay ? formatDateShort(event.startDate) : `${formatDateShort(event.startDate)} – ${formatDateShort(event.endDate)}`}
          {event.location && ` · ${event.location}`}
        </div>
        {event.description && (
          <div style={{ fontSize: "11px", color: "#3a3a3a", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{truncate(event.description, 12)}</div>
        )}
      </div>
    </div>
  );
}

// ── Main calendar ─────────────────────────────────────────────────────────────

interface CalendarClientProps {
  releases: GameRelease[];
  initialYear: number;
  initialMonth: number;
  featuredSlugMap: Record<string, string>;
}

export function CalendarClient({ releases, initialYear, initialMonth, featuredSlugMap }: CalendarClientProps) {
  // Returns the canonical CMS slug if this game is featured, or null if not
  function getCmsSlug(game: GameRelease): string | null {
    return featuredSlugMap[game.slug]
      ?? featuredSlugMap[game.name.toLowerCase().replace(/[^a-z0-9]/g, "")]
      ?? null;
  }
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
  const [watchlistOpen,   setWatchlistOpen]   = useState(false);
  const [countdownHidden, setCountdownHidden] = useState(false);
  const [filtersOpen,     setFiltersOpen]     = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(() => new Set(ALL_FILTER_KEYS));

  const { slugs: watchlistSlugs, toggle: watchlistToggle, has: watchlistHas, remove: watchlistRemove } = useWishlist();

  // Find GTA VI cover for the countdown widget
  const gta6Cover = releases.find(
    (r) => r.slug === "grand-theft-auto-vi" || r.name.toLowerCase().replace(/\s/g,"").includes("grandtheftautovi")
  )?.background_image;

  const feedRef  = useRef<HTMLDivElement>(null);
  const dayRefs  = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      if (next.size === 0) return prev;
      return next;
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (selectedItem)  { setSelectedItem(null);  return; }
      if (watchlistOpen) { setWatchlistOpen(false); return; }
      if (filtersOpen)   { setFiltersOpen(false);   return; }
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

  // Scroll feed to top on month change
  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [year, month]);

  // Scroll feed to selected date
  useEffect(() => {
    if (selectedDate && dayRefs.current[selectedDate]) {
      dayRefs.current[selectedDate]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedDate]);

  // Build feed days
  const daysInMonth = new Date(year, month, 0).getDate();
  type DayData = { dateStr: string; day: number; releases: GameRelease[]; events: GamingEvent[] };
  const feedDays: DayData[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(year, month, d);
    const dayRels = activeFilters.has("release") ? releases.filter((r) => r.released === dateStr) : [];
    const dayEvts = getEventsForDate(dateStr).filter((e) => eventMatchesFilter(e, activeFilters));
    if (dayRels.length > 0 || dayEvts.length > 0) feedDays.push({ dateStr, day: d, releases: dayRels, events: dayEvts });
  }

  const atMonthEnd = year === 2026 && month === 12;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Top bar — filters + watchlist on one line ── */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid oklch(17% 0.04 240)", background: "oklch(10% 0.025 240)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", overflowX: "auto", scrollbarWidth: "none" }}>
          {/* Mobile: month nav */}
          {isMobile && (
            <>
              <button type="button" onClick={prevMonth} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: "22px", padding: "2px 8px", lineHeight: 1 }}>‹</button>
              <span style={{ fontSize: "17px", fontWeight: 700, color: "#fff" }}>{MONTH_NAMES[month-1]} <span style={{ fontWeight: 300, color: "#666" }}>{year}</span></span>
              <button type="button" onClick={nextMonth} style={{ background: "none", border: "none", color: atMonthEnd ? "#333" : "#aaa", cursor: atMonthEnd ? "default" : "pointer", fontSize: "22px", padding: "2px 8px", lineHeight: 1 }}>›</button>
            </>
          )}
          {/* Filter pills */}
          {FILTERS.map((f) => {
            const on = activeFilters.has(f.key);
            return (
              <button key={f.key} type="button" onClick={() => toggleFilter(f.key)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "20px", border: `1px solid ${on ? f.color+"55" : "oklch(20% 0.04 240)"}`, background: on ? f.color+"14" : "transparent", cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: on ? f.color : "#444", transition: "background 0.15s" }} />
                <span style={{ fontSize: "13px", fontWeight: on ? 600 : 400, color: on ? "#fff" : "#777", transition: "color 0.15s", whiteSpace: "nowrap" }}>{f.label}</span>
              </button>
            );
          })}
          <div style={{ flex: 1, minWidth: "8px" }} />
          {/* Watchlist */}
          <button type="button" onClick={() => setWatchlistOpen(true)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", background: watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.1)" : "oklch(13% 0.03 240)", border: `1px solid ${watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.3)" : "oklch(20% 0.04 240)"}`, color: watchlistSlugs.length > 0 ? "var(--green)" : "#888", cursor: "pointer", fontSize: "13px", fontWeight: 600, flexShrink: 0 }}>
            Watchlist{watchlistSlugs.length > 0 && <span style={{ fontSize: "11px", fontWeight: 700, background: "oklch(83% 0.22 158 / 0.2)", borderRadius: "10px", padding: "1px 7px" }}>{watchlistSlugs.length}</span>}
          </button>
        </div>
      </div>

      {/* ── GTA VI countdown (fixed right-side widget) ── */}
      <GTA6Banner collapsed={countdownHidden} onToggle={() => setCountdownHidden((v) => !v)} coverImage={gta6Cover} />

      {/* ── Main content: calendar grid + feed ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

        {/* Left: calendar grid (desktop only, 50% width) */}
        {!isMobile && (
          <div style={{ width: "50%", flexShrink: 0, borderRight: "1px solid oklch(17% 0.04 240)", background: "oklch(10% 0.025 240)", overflow: "hidden" }}>
            <CalGrid
              year={year} month={month} todayStr={todayStr} selectedDate={selectedDate}
              releases={releases} activeFilters={activeFilters}
              onSelectDate={(d) => { setSelectedDate(d); setSelectedItem(null); }}
              onPrevMonth={prevMonth} onNextMonth={nextMonth}
            />
          </div>
        )}

        {/* Right: scrollable day feed */}
        <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px 40px" : "24px 28px 48px" }}>
          {feedDays.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-dim)" }}>
              <p style={{ fontSize: "16px", fontWeight: 600 }}>Nothing scheduled for {MONTH_NAMES[month-1]} {year}</p>
              <p style={{ fontSize: "13px", marginTop: "6px" }}>Try toggling filters or browsing another month.</p>
            </div>
          ) : feedDays.map(({ dateStr, day, releases: dayRels, events: dayEvts }) => {
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const weekday = getWeekday(dateStr);

            return (
              <div key={dateStr} ref={(el) => { dayRefs.current[dateStr] = el; }} style={{ marginBottom: "48px" }}>
                {/* Day header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px", paddingBottom: "12px", borderBottom: `1px solid ${isSelected ? "oklch(83% 0.22 158 / 0.2)" : "oklch(17% 0.04 240)"}` }}>
                  <span style={{ fontSize: "54px", fontWeight: 900, lineHeight: 1, color: isSelected ? "oklch(83% 0.22 158)" : isToday ? "oklch(83% 0.22 158)" : "#fff" }}>{day}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", paddingTop: "4px" }}>
                    <span style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: isToday || isSelected ? "oklch(83% 0.22 158)" : "#fff" }}>{weekday}</span>
                    <span style={{ fontSize: "12px", color: "#666" }}>{MONTH_NAMES[month-1]} {year}</span>
                  </div>
                  {isToday && <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--green)", background: "oklch(83% 0.22 158 / 0.1)", padding: "3px 10px", borderRadius: "4px", border: "1px solid oklch(83% 0.22 158 / 0.2)" }}>TODAY</span>}
                </div>

                {/* Events */}
                {dayEvts.length > 0 && (
                  <div style={{ marginBottom: dayRels.length > 0 ? "14px" : "0", maxWidth: "700px" }}>
                    {dayEvts.map((event) => (
                      <EventFeedRow key={event.id} event={event} onSelect={() => setSelectedItem({ kind: "event", data: event })} />
                    ))}
                  </div>
                )}

                {/* Game releases */}
                {dayRels.length > 0 && (
                  <>
                    {dayEvts.length > 0 && (
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#333", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>Game Releases · {dayRels.length}</p>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "10px" }}>
                      {dayRels.map((game) => (
                        <GameFeedTile
                          key={game.slug} game={game}
                          isSelected={selectedItem?.kind === "game" && selectedItem.data.slug === game.slug}
                          inWatchlist={watchlistHas(game.slug)}
                          onSelect={() => setSelectedItem({ kind: "game", data: game })}
                          onWatchlistToggle={() => watchlistToggle(game.slug)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Modals ── */}
      {selectedItem?.kind === "game" && (
        <GameDetailModal
          game={selectedItem.data}
          inWatchlist={watchlistHas(selectedItem.data.slug)}
          onWatchlistToggle={watchlistToggle}
          onClose={() => setSelectedItem(null)}
          cmsSlug={getCmsSlug(selectedItem.data)}
        />
      )}
      {selectedItem?.kind === "event" && (
        <EventDetailModal event={selectedItem.data} onClose={() => setSelectedItem(null)} />
      )}
      {watchlistOpen && (
        <WatchlistModal slugs={watchlistSlugs} releases={releases} onClose={() => setWatchlistOpen(false)} onRemove={watchlistRemove} />
      )}

      {/* Mobile filters bottom sheet */}
      {isMobile && filtersOpen && (
        <>
          <div onClick={() => setFiltersOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 280 }} />
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "oklch(15% 0.04 240)", borderTop: "1px solid oklch(28% 0.06 240)", borderRadius: "16px 16px 0 0", zIndex: 290, padding: "14px 18px 36px", animation: "slideUp 0.2s ease" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.15)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {FILTERS.map((f) => (
                <button key={f.key} type="button" onClick={() => toggleFilter(f.key)} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "10px", background: activeFilters.has(f.key) ? `${f.color}10` : "oklch(13% 0.03 240)", border: `1px solid ${activeFilters.has(f.key) ? f.color+"38" : "oklch(20% 0.04 240)"}`, cursor: "pointer" }}>
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
