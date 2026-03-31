"use client";

import { useState, useCallback, useEffect } from "react";
import type { GameRelease } from "@/lib/releases";
import { getReleasesForDate, deduplicatePlatforms, gamesGgUrl } from "@/lib/releases";
import type { GamingEvent } from "@/lib/events";
import { getEventsForDate } from "@/lib/events";
import { useWishlist } from "@/lib/wishlist";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterKey = "release" | "convention" | "showcase" | "awards" | "esports";

// ── Filter config ─────────────────────────────────────────────────────────────

const FILTERS: { key: FilterKey; color: string; label: string }[] = [
  { key: "release",    color: "#52d68a", label: "Release"    },
  { key: "convention", color: "#4f9cf9", label: "Convention" },
  { key: "esports",    color: "#e84855", label: "Esports"    },
  { key: "showcase",   color: "#b06ff5", label: "Showcase"   },
  { key: "awards",     color: "#f5c842", label: "Awards"     },
];

const ALL_FILTER_KEYS = new Set<FilterKey>(FILTERS.map((f) => f.key));

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrev  = new Date(year, month - 1, 0).getDate();
  const cells: { dateStr: string; day: number; thisMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const m = month === 1  ? 12 : month - 1;
    const y = month === 1  ? year - 1 : year;
    cells.push({ dateStr: toDateStr(y, m, d), day: d, thisMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: toDateStr(year, month, d), day: d, thisMonth: true });
  }
  const numRows = Math.ceil(cells.length / 7);
  const remaining = numRows * 7 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 12 ? 1  : month + 1;
    const y = month === 12 ? year + 1 : year;
    cells.push({ dateStr: toDateStr(y, m, d), day: d, thisMonth: false });
  }
  return { cells, numRows };
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const EVENT_TYPE_LABEL: Record<string, string> = {
  convention: "Convention",
  showcase:   "Showcase",
  awards:     "Awards",
  esports:    "Esports",
  sale:       "Sale",
};

function formatDateLong(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}
function formatDateShort(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function googleCalUrl(name: string, start: string, end: string, description = "", location = ""): string {
  const s = start.replace(/-/g, "");
  const eDate = new Date(end + "T00:00:00Z");
  eDate.setUTCDate(eDate.getUTCDate() + 1);
  const e = eDate.toISOString().slice(0, 10).replace(/-/g, "");
  return (
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(name)}` +
    `&dates=${s}/${e}` +
    (description ? `&details=${encodeURIComponent(description)}` : "") +
    (location    ? `&location=${encodeURIComponent(location)}`    : "")
  );
}

// ── Mobile detection ──────────────────────────────────────────────────────────

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

function PlatformTag({ name }: { name: string }) {
  return (
    <span style={{
      fontSize: "10px", fontWeight: 600, letterSpacing: "0.03em",
      padding: "2px 5px", borderRadius: "4px",
      background: "rgba(255,255,255,0.07)", color: "var(--text-secondary)",
      border: "1px solid rgba(255,255,255,0.1)", textTransform: "uppercase", flexShrink: 0,
    }}>
      {name}
    </span>
  );
}

// ── Calendar cell ─────────────────────────────────────────────────────────────

const GAME_COLOR_HEX = "#52d68a";

function CalendarCell({
  dateStr, day, thisMonth, isToday, isSelected, releases, events, onSelectDate,
}: {
  dateStr: string; day: number; thisMonth: boolean; isToday: boolean; isSelected: boolean;
  releases: GameRelease[]; events: GamingEvent[];
  onSelectDate: (dateStr: string) => void;
}) {
  const items = [
    ...events.map((e) => ({ color: e.color })),
    ...releases.map(()  => ({ color: GAME_COLOR_HEX })),
  ];
  const hasItems = items.length > 0;
  const dotsToShow = items.slice(0, 3);
  const overflow  = items.length - dotsToShow.length;

  return (
    <div
      onClick={() => { if (thisMonth) onSelectDate(dateStr); }}
      style={{
        background: isSelected ? "oklch(83% 0.22 158 / 0.06)" : "var(--bg)",
        padding: "5px 5px 4px",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: isSelected
          ? "2px solid oklch(83% 0.22 158 / 0.6)"
          : thisMonth && events.length > 0
            ? `2px solid ${events[0].color}55`
            : "none",
        overflow: "hidden",
        opacity: thisMonth ? 1 : 0.3,
        minHeight: 0,
        cursor: thisMonth ? "pointer" : "default",
      }}
    >
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: "20px", height: "20px", borderRadius: "50%", fontSize: "11px",
        fontWeight: isToday ? 700 : 500,
        color: isToday ? "#060D17" : hasItems ? "var(--text)" : "var(--text-secondary)",
        background: isToday ? "var(--green)" : "transparent",
        animation: isToday ? "pulseRing 2s ease-out infinite" : "none",
        marginBottom: "3px", flexShrink: 0,
      }}>{day}</div>
      {thisMonth && hasItems && (
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", paddingLeft: "1px" }}>
          {dotsToShow.map((item, i) => (
            <div key={i} style={{
              width: "5px", height: "5px", borderRadius: "50%",
              background: item.color, flexShrink: 0,
            }} />
          ))}
          {overflow > 0 && (
            <span style={{ fontSize: "7px", color: "var(--text-dim)", lineHeight: "5px" }}>
              +{overflow}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── GTA VI Countdown ──────────────────────────────────────────────────────────

const GTA6_RELEASE = new Date("2026-11-19T00:00:00");

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(() => Math.max(0, target.getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setDiff(Math.max(0, target.getTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);
  const days    = Math.floor(diff / 86400000);
  const hours   = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000)  / 60000);
  const seconds = Math.floor((diff % 60000)    / 1000);
  return { days, hours, minutes, seconds, released: diff === 0 };
}

function GTA6Countdown() {
  const { days, hours, minutes, seconds, released } = useCountdown(GTA6_RELEASE);
  const [collapsed, setCollapsed] = useState(false);

  const border = "1px solid oklch(28% 0.04 240)";
  const bg     = "oklch(14% 0.03 240)";

  if (released) {
    return (
      <div style={{
        background: bg, border, borderRadius: "8px",
        padding: "9px 14px", marginBottom: "10px",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
          GTA VI IS OUT NOW 🎮
        </span>
      </div>
    );
  }

  const unit = (val: number, label: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "34px" }}>
      <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>
        {String(val).padStart(2, "0")}
      </span>
      <span style={{ fontSize: "8px", fontWeight: 600, color: "var(--text-dim)",
        textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>
        {label}
      </span>
    </div>
  );

  return (
    <div style={{ background: bg, border, borderRadius: "8px", marginBottom: "10px", flexShrink: 0 }}>
      {/* Header row — always visible */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: collapsed ? "7px 12px" : "7px 12px 0",
      }}>
        <span style={{ fontSize: "10px", fontWeight: 800, color: "var(--text-secondary)",
          textTransform: "uppercase", letterSpacing: "0.1em" }}>GTA VI</span>
        <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>· Nov 19, 2026</span>
        <button onClick={() => setCollapsed((c) => !c)} style={{
          marginLeft: "auto", background: "none", border: "none",
          color: "var(--text-dim)", cursor: "pointer", fontSize: "11px",
          padding: "2px 4px", transition: "color 0.15s",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
        >{collapsed ? "▸ show" : "▾ hide"}</button>
      </div>
      {/* Countdown — collapsible */}
      {!collapsed && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px 8px" }}>
          {unit(days,    "days")}
          <span style={{ color: "var(--border-hover)", fontWeight: 700, marginBottom: "10px" }}>:</span>
          {unit(hours,   "hrs")}
          <span style={{ color: "var(--border-hover)", fontWeight: 700, marginBottom: "10px" }}>:</span>
          {unit(minutes, "min")}
          <span style={{ color: "var(--border-hover)", fontWeight: 700, marginBottom: "10px" }}>:</span>
          {unit(seconds, "sec")}
          <span style={{ marginLeft: "auto", fontSize: "9px", color: "var(--text-dim)",
            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Rockstar Games
          </span>
        </div>
      )}
    </div>
  );
}

// ── Filter legend ─────────────────────────────────────────────────────────────

function FilterLegendItem({
  color, label, active, onToggle, isMobile,
}: {
  color: string; label: string; active: boolean;
  onToggle: () => void; isMobile: boolean;
}) {
  return (
    <button onClick={onToggle} style={{
      display: "flex", alignItems: "center", gap: isMobile ? "6px" : "5px",
      background: active ? "rgba(255,255,255,0.06)" : "transparent",
      border: active ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
      borderRadius: "6px", padding: isMobile ? "6px 10px" : "3px 7px",
      cursor: "pointer", transition: "all 0.15s",
      opacity: active ? 1 : 0.38, flexShrink: 0,
    }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.opacity = "0.6"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.opacity = "0.38"; }}
    >
      <div style={{ width: "8px", height: "8px", borderRadius: "2px",
        background: color, flexShrink: 0 }} />
      <span style={{ fontSize: isMobile ? "12px" : "11px", color: "var(--text-dim)",
        fontWeight: active ? 600 : 400 }}>{label}</span>
    </button>
  );
}

// ── Watchlist panel ───────────────────────────────────────────────────────────

function WatchlistPanel({
  slugs, releases, onClose, onRemove,
}: {
  slugs: string[]; releases: GameRelease[];
  onClose: () => void; onRemove: (slug: string) => void;
}) {
  const releaseMap = new Map(releases.map((r) => [r.slug, r]));
  const saved = slugs
    .map((s) => releaseMap.get(s))
    .filter((r): r is GameRelease => !!r)
    .sort((a, b) => a.released.localeCompare(b.released));

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 250,
      }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "300px",
        background: "var(--card)", borderLeft: "1px solid var(--border-hover)",
        zIndex: 260, display: "flex", flexDirection: "column",
        boxShadow: "-12px 0 40px rgba(0,0,0,0.6)",
        animation: "slideInRight 0.2s ease",
      }}>
        <div style={{
          padding: "16px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: "14px" }}>
            My Watchlist{saved.length > 0 && (
              <span style={{ color: "var(--text-dim)", fontWeight: 400 }}> ({saved.length})</span>
            )}
          </span>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)",
            borderRadius: "50%", width: "28px", height: "28px",
            color: "var(--text-secondary)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px",
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {saved.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--text-dim)", textAlign: "center",
              marginTop: "40px", lineHeight: 1.6 }}>
              No games saved yet.<br />
              <span style={{ fontSize: "11px" }}>Click + on any game to add it.</span>
            </p>
          ) : saved.map((r) => (
            <div key={r.slug} style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 8px", borderRadius: "8px",
              borderBottom: "1px solid var(--border)", marginBottom: "2px",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "13px", fontWeight: 600, margin: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.name}
                </p>
                <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: "2px 0 0" }}>
                  {formatDateShort(r.released)}
                </p>
              </div>
              <button onClick={() => onRemove(r.slug)} style={{
                background: "none", border: "none", color: "var(--text-dim)",
                cursor: "pointer", fontSize: "14px", padding: "4px", flexShrink: 0,
              }}>×</button>
            </div>
          ))}
        </div>
      </div>
    </>
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
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [gridKey, setGridKey]   = useState(0);
  const { slugs: watchlistSlugs, toggle: watchlistToggle, has: watchlistHas, remove: watchlistRemove } = useWishlist();

  // Filter state — all active by default
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(
    () => new Set(ALL_FILTER_KEYS)
  );
  const allActive = activeFilters.size === ALL_FILTER_KEYS.size;

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      if (prev.has(key) && prev.size === 1) return prev; // keep at least one
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setActiveFilters(new Set(ALL_FILTER_KEYS));
  }, []);

  const { cells, numRows } = getMonthDays(year, month);

  const prevMonth = useCallback(() => {
    setSelectedDate(null); setSelectedItem(null);
    setSlideDir("right"); setGridKey((k) => k + 1);
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    setSelectedDate(null); setSelectedItem(null);
    if (year === 2026 && month === 12) return;
    setSlideDir("left"); setGridKey((k) => k + 1);
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }, [month, year]);

  // Build filtered release map
  const releasesByDate: Record<string, GameRelease[]> = {};
  if (activeFilters.has("release")) {
    for (const r of releases) {
      if (!releasesByDate[r.released]) releasesByDate[r.released] = [];
      releasesByDate[r.released].push(r);
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* ── Nav row ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: isMobile ? "8px" : "10px", flexShrink: 0, position: "relative",
      }}>
        <button onClick={prevMonth} style={navBtnStyle}>‹</button>

        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontSize: isMobile ? "15px" : "17px", fontWeight: 700 }}>
            {MONTH_NAMES[month - 1]}
          </span>
          <span style={{ fontSize: isMobile ? "13px" : "14px", color: "var(--text-dim)" }}>{year}</span>
        </div>

        <div style={{ position: "absolute", right: "50px", display: "flex", alignItems: "center" }}>
          <button onClick={() => setWatchlistOpen(true)} style={{
            background: watchlistSlugs.length > 0 ? "rgba(82,214,138,0.1)" : "var(--card)",
            border: watchlistSlugs.length > 0 ? "1px solid rgba(82,214,138,0.3)" : "1px solid var(--border)",
            borderRadius: "7px", padding: "5px 10px",
            color: watchlistSlugs.length > 0 ? "var(--green)" : "var(--text-secondary)",
            cursor: "pointer", fontSize: "13px",
            display: "flex", alignItems: "center", gap: "5px",
            transition: "all 0.15s",
          }}>
            <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.02em" }}>Watchlist</span>
            {watchlistSlugs.length > 0 && (
              <span style={{
                fontSize: "10px", fontWeight: 700,
                background: watchlistSlugs.length > 0 ? "rgba(82,214,138,0.25)" : "rgba(255,255,255,0.1)",
                borderRadius: "10px", padding: "1px 6px", minWidth: "18px", textAlign: "center",
              }}>{watchlistSlugs.length}</span>
            )}
          </button>
        </div>

        <button onClick={nextMonth} style={{
          ...navBtnStyle,
          visibility: (year === 2026 && month === 12) ? "hidden" : "visible",
        }}>›</button>
      </div>

      {/* ── Filter row ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: isMobile ? "6px" : "8px",
        marginBottom: isMobile ? "8px" : "10px", flexShrink: 0,
        overflowX: "auto", paddingBottom: "2px",
      }}>
        {FILTERS.map((f) => (
          <FilterLegendItem key={f.key} color={f.color} label={f.label}
            active={activeFilters.has(f.key)} isMobile={isMobile}
            onToggle={() => toggleFilter(f.key)} />
        ))}
        {!allActive && (
          <button onClick={resetFilters} style={{
            fontSize: isMobile ? "12px" : "11px", color: "var(--text-dim)",
            background: "none", border: "none", cursor: "pointer",
            padding: isMobile ? "6px 8px" : "3px 6px", flexShrink: 0,
            textDecoration: "underline", transition: "color 0.15s",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
          >Clear</button>
        )}
      </div>

      {/* ── GTA VI Countdown ── */}
      <GTA6Countdown />

      {/* ── Grid card wrapper ── */}
      <div key={gridKey} style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        animation: slideDir ? `${slideDir === "left" ? "slideLeft" : "slideRight"} 0.18s ease` : "none",
        overflow: "hidden",
      }}>
      <div style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        border: "1px solid oklch(32% 0.06 240)",
        borderRadius: "12px", overflow: "hidden",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.04) inset, 0 12px 40px rgba(0,0,0,0.6)",
        background: "var(--card)",
      }}>

      {/* ── Day headers ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flexShrink: 0,
      }}>
        {DAY_LABELS.map((d) => (
          <div key={d} style={{
            textAlign: "center", fontSize: isMobile ? "9px" : "10px", fontWeight: 600,
            color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em",
            padding: isMobile ? "5px 0" : "6px 0", background: "var(--card)",
            borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
          }}>{d}</div>
        ))}
      </div>

      {/* ── Calendar grid ── */}
      <div style={{
        flex: 1, minHeight: 0, display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gridTemplateRows: `repeat(${numRows}, minmax(${isMobile ? "48px" : "0px"}, 1fr))`,
      }}>
        {cells.map(({ dateStr, day, thisMonth }) => {
          const cellReleases = thisMonth ? (releasesByDate[dateStr] ?? []) : [];
          const cellEvents   = thisMonth
            ? getEventsForDate(dateStr).filter((e) => activeFilters.has(e.type as FilterKey))
            : [];
          return (
            <CalendarCell
              key={dateStr} dateStr={dateStr} day={day}
              thisMonth={thisMonth} isToday={dateStr === todayStr}
              isSelected={dateStr === selectedDate}
              releases={cellReleases} events={cellEvents}
              onSelectDate={(d) => { setSelectedDate(d); setSelectedItem(null); }}
            />
          );
        })}
      </div>

      </div>{/* end grid card wrapper */}
      </div>{/* end slide animation wrapper */}

      {/* ── Wishlist panel ── */}
      {watchlistOpen && (
        <WatchlistPanel
          slugs={watchlistSlugs} releases={releases}
          onClose={() => setWatchlistOpen(false)}
          onRemove={watchlistRemove}
        />
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px",
  color: "var(--text)", cursor: "pointer", padding: "6px 14px",
  fontSize: "18px", lineHeight: 1, transition: "border-color 0.15s", flexShrink: 0,
};
