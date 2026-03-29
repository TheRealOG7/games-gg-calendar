"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import type { GameRelease } from "@/lib/releases";
import { getReleasesForDate, deduplicatePlatforms, gamesGgUrl } from "@/lib/releases";
import type { GamingEvent } from "@/lib/events";
import { getEventsForDate } from "@/lib/events";

// ── Types ─────────────────────────────────────────────────────────────────────

type PopoverItem =
  | { kind: "game"; data: GameRelease; anchorRect: DOMRect }
  | { kind: "event"; data: GamingEvent; anchorRect: DOMRect };

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrev = new Date(year, month - 1, 0).getDate();
  const cells: { dateStr: string; day: number; thisMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    cells.push({ dateStr: toDateStr(y, m, d), day: d, thisMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: toDateStr(year, month, d), day: d, thisMonth: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    cells.push({ dateStr: toDateStr(y, m, d), day: d, thisMonth: false });
  }
  return cells;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PLATFORM_COLORS: Record<string, string> = {
  PC: "#4f9cf9",
  PS5: "#4169e1",
  PS4: "#4169e1",
  "Xbox Series": "#3a9e3a",
  "Xbox One": "#3a9e3a",
  Switch: "#e63946",
  iOS: "#888",
  Android: "#3ddc84",
  Mac: "#999",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  convention: "Convention",
  showcase: "Showcase",
  awards: "Awards",
  sale: "Sale",
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

// ── Popover positioning ───────────────────────────────────────────────────────

function computePopoverStyle(rect: DOMRect, width = 310): React.CSSProperties {
  const MARGIN = 10;
  const OFFSET = 6;
  const ESTIMATED_HEIGHT = 380;

  let left = rect.left;
  let top = rect.bottom + OFFSET;

  // Flip above if near bottom
  if (top + ESTIMATED_HEIGHT > window.innerHeight - MARGIN) {
    top = Math.max(MARGIN, rect.top - ESTIMATED_HEIGHT - OFFSET);
  }

  // Keep within right edge
  if (left + width > window.innerWidth - MARGIN) {
    left = window.innerWidth - MARGIN - width;
  }
  left = Math.max(MARGIN, left);

  return { position: "fixed", top, left, width, zIndex: 200 };
}

// ── Platform tag ──────────────────────────────────────────────────────────────

function PlatformTag({ name }: { name: string }) {
  const color = PLATFORM_COLORS[name] ?? "#666";
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.03em",
        padding: "2px 5px",
        borderRadius: "4px",
        background: color + "22",
        color,
        border: `1px solid ${color}40`,
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      {name}
    </span>
  );
}

// ── Popover ───────────────────────────────────────────────────────────────────

function CalendarPopover({ item, onClose }: { item: PopoverItem; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const style = computePopoverStyle(item.anchorRect);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        ...style,
        background: "var(--card)",
        border: "1px solid var(--border-hover)",
        borderRadius: "12px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
        overflow: "hidden",
        animation: "popIn 0.15s ease",
      }}
    >
      {item.kind === "game" ? (
        <GamePopover game={item.data} onClose={onClose} />
      ) : (
        <EventPopover event={item.data} onClose={onClose} />
      )}
    </div>
  );
}

// ── Game popover ──────────────────────────────────────────────────────────────

function GamePopover({ game, onClose }: { game: GameRelease; onClose: () => void }) {
  const platforms = deduplicatePlatforms(game.platforms);

  return (
    <div>
      {game.background_image && (
        <div style={{ position: "relative", height: "140px" }}>
          <Image
            src={game.background_image}
            alt={game.name}
            fill
            style={{ objectFit: "cover" }}
            sizes="310px"
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, rgba(6,13,23,0.1) 0%, var(--card) 100%)",
            }}
          />
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>
      )}

      <div style={{ padding: "14px 16px 16px" }}>
        {!game.background_image && (
          <button onClick={onClose} style={{ ...closeButtonStyle, position: "relative", float: "right", top: 0, right: 0, background: "none", border: "none", marginBottom: "4px" }}>
            ✕
          </button>
        )}

        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "8px" }}>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--green)",
              padding: "2px 6px",
              background: "oklch(83% 0.22 158 / 0.15)",
              borderRadius: "4px",
              border: "1px solid oklch(83% 0.22 158 / 0.3)",
            }}
          >
            Game Release
          </span>
          {game.metacritic && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: "4px",
                background: "#f5c84222",
                color: "#f5c842",
                border: "1px solid #f5c84240",
              }}
            >
              MC {game.metacritic}
            </span>
          )}
        </div>

        <h3 style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.2, marginBottom: "6px" }}>
          {game.name}
        </h3>

        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "10px" }}>
          {formatDateLong(game.released)}
        </p>

        {game.genres.length > 0 && (
          <p style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "10px" }}>
            {game.genres.slice(0, 4).join(" · ")}
          </p>
        )}

        {platforms.length > 0 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "14px" }}>
            {platforms.map((p) => <PlatformTag key={p} name={p} />)}
          </div>
        )}

        <a
          href={gamesGgUrl(game.slug)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            textAlign: "center",
            background: "var(--green)",
            color: "#060D17",
            fontWeight: 700,
            fontSize: "13px",
            padding: "9px 14px",
            borderRadius: "7px",
            textDecoration: "none",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          View on GAMES.GG
        </a>
      </div>
    </div>
  );
}

// ── Event popover ─────────────────────────────────────────────────────────────

function EventPopover({ event, onClose }: { event: GamingEvent; onClose: () => void }) {
  const isSameDay = event.startDate === event.endDate;

  return (
    <div>
      <div
        style={{
          background: event.color + "16",
          borderBottom: `1px solid ${event.color}30`,
          padding: "14px 16px 12px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <div>
          <span
            style={{
              display: "inline-block",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: event.color,
              padding: "2px 6px",
              background: event.color + "22",
              borderRadius: "4px",
              border: `1px solid ${event.color}40`,
              marginBottom: "6px",
            }}
          >
            {EVENT_TYPE_LABEL[event.type]}
          </span>
          <h3 style={{ fontSize: "15px", fontWeight: 700, lineHeight: 1.2, color: "var(--text)" }}>
            {event.name}
          </h3>
        </div>
        <button onClick={onClose} style={{ ...closeButtonStyle, position: "relative", top: 0, right: 0, background: "none", border: "none", flexShrink: 0 }}>
          ✕
        </button>
      </div>

      <div style={{ padding: "12px 16px 16px" }}>
        <div style={{ marginBottom: "10px" }}>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px" }}>
            {isSameDay
              ? formatDateLong(event.startDate)
              : `${formatDateShort(event.startDate)} - ${formatDateShort(event.endDate)}`}
          </p>
          {event.location && (
            <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>{event.location}</p>
          )}
        </div>

        <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: event.url ? "14px" : 0 }}>
          {event.description}
        </p>

        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              textAlign: "center",
              background: event.color + "20",
              color: event.color,
              border: `1px solid ${event.color}40`,
              fontWeight: 700,
              fontSize: "13px",
              padding: "9px 14px",
              borderRadius: "7px",
              textDecoration: "none",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Official Website
          </a>
        )}
      </div>
    </div>
  );
}

const closeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "10px",
  background: "rgba(6,13,23,0.6)",
  border: "1px solid var(--border)",
  borderRadius: "50%",
  width: "26px",
  height: "26px",
  color: "var(--text-secondary)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "12px",
  lineHeight: 1,
  padding: 0,
};

// ── Cell pills ────────────────────────────────────────────────────────────────

// Game pills use a fixed green constant so alpha appending always works
const GAME_COLOR_HEX = "#52d68a";

function EventPill({
  label,
  color,
  isGame,
  onClick,
}: {
  label: string;
  color: string;
  isGame: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  // Events pass hex colors — appending a 2-digit alpha is valid.
  // Games previously passed "var(--green)" which broke concat — use hex constant instead.
  const resolvedColor = isGame ? GAME_COLOR_HEX : color;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "2px 5px",
        borderRadius: "3px",
        fontSize: "10px",
        lineHeight: "16px",
        background: resolvedColor + (isGame ? "28" : "22"),
        color: resolvedColor,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        cursor: "pointer",
        border: `1px solid ${resolvedColor}40`,
        display: "block",
        marginBottom: "2px",
        transition: "opacity 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {label}
    </button>
  );
}

// ── Calendar cell ─────────────────────────────────────────────────────────────

function CalendarCell({
  dateStr,
  day,
  thisMonth,
  isToday,
  releases,
  events,
  onOpenPopover,
}: {
  dateStr: string;
  day: number;
  thisMonth: boolean;
  isToday: boolean;
  releases: GameRelease[];
  events: GamingEvent[];
  onOpenPopover: (item: PopoverItem) => void;
}) {
  const items = [
    ...events.map((e) => ({ kind: "event" as const, data: e })),
    ...releases.map((r) => ({ kind: "game" as const, data: r })),
  ];
  const visible = items.slice(0, 3);
  const overflow = items.length - visible.length;

  return (
    <div
      style={{
        background: "var(--bg)",
        padding: "5px 5px 4px",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        overflow: "hidden",
        opacity: thisMonth ? 1 : 0.3,
        minHeight: 0,
      }}
    >
      {/* Day number */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          fontSize: "11px",
          fontWeight: isToday ? 700 : 500,
          color: isToday ? "#060D17" : items.length > 0 ? "var(--text)" : "var(--text-secondary)",
          background: isToday ? "var(--green)" : "transparent",
          marginBottom: "3px",
          flexShrink: 0,
        }}
      >
        {day}
      </div>

      {/* Pills */}
      {thisMonth && visible.map((item, i) => {
        if (item.kind === "event") {
          return (
            <EventPill
              key={`ev-${item.data.id}-${i}`}
              label={item.data.name}
              color={item.data.color}
              isGame={false}
              onClick={(e) =>
                onOpenPopover({ kind: "event", data: item.data, anchorRect: e.currentTarget.getBoundingClientRect() })
              }
            />
          );
        }
        return (
          <EventPill
            key={`g-${item.data.id}-${i}`}
            label={`${item.data.name} Release`}
            color="var(--green)"
            isGame={true}
            onClick={(e) =>
              onOpenPopover({ kind: "game", data: item.data, anchorRect: e.currentTarget.getBoundingClientRect() })
            }
          />
        );
      })}

      {overflow > 0 && (
        <p style={{ fontSize: "9px", color: "var(--text-dim)", paddingLeft: "5px" }}>
          +{overflow} more
        </p>
      )}
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
  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [popover, setPopover] = useState<PopoverItem | null>(null);

  const cells = getMonthDays(year, month);

  const prevMonth = useCallback(() => {
    setPopover(null);
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    setPopover(null);
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }, [month]);

  const releasesByDate: Record<string, GameRelease[]> = {};
  for (const r of releases) {
    if (!releasesByDate[r.released]) releasesByDate[r.released] = [];
    releasesByDate[r.released].push(r);
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Nav row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
          flexShrink: 0,
        }}
      >
        <button onClick={prevMonth} style={navBtnStyle}>
          ‹
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: "17px", fontWeight: 700 }}>
              {MONTH_NAMES[month - 1]}
            </span>
            <span style={{ fontSize: "14px", color: "var(--text-dim)", marginLeft: "6px" }}>
              {year}
            </span>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: "12px" }}>
            <LegendItem color="var(--green)" label="Release" />
            <LegendItem color="#4f9cf9" label="Convention" />
            <LegendItem color="#b06ff5" label="Showcase" />
            <LegendItem color="#f5c842" label="Awards" />
          </div>
        </div>

        <button onClick={nextMonth} style={navBtnStyle}>
          ›
        </button>
      </div>

      {/* Day headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          borderLeft: "1px solid var(--border)",
          borderTop: "1px solid var(--border)",
          borderRadius: "10px 10px 0 0",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "6px 0",
              background: "var(--card)",
              borderRight: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: "repeat(6, 1fr)",
          borderLeft: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          borderRadius: "0 0 10px 10px",
          overflow: "hidden",
        }}
      >
        {cells.map(({ dateStr, day, thisMonth }) => (
          <CalendarCell
            key={dateStr}
            dateStr={dateStr}
            day={day}
            thisMonth={thisMonth}
            isToday={dateStr === todayStr}
            releases={thisMonth ? (releasesByDate[dateStr] ?? []) : []}
            events={thisMonth ? getEventsForDate(dateStr) : []}
            onOpenPopover={setPopover}
          />
        ))}
      </div>

      {/* Popover */}
      {popover && (
        <CalendarPopover item={popover} onClose={() => setPopover(null)} />
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "2px",
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{label}</span>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "7px",
  color: "var(--text)",
  cursor: "pointer",
  padding: "6px 14px",
  fontSize: "18px",
  lineHeight: 1,
  transition: "border-color 0.15s",
};
