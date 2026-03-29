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
  | { kind: "event"; data: GamingEvent; anchorRect: DOMRect }
  | { kind: "day"; dateStr: string; releases: GameRelease[]; events: GamingEvent[]; anchorRect: DOMRect };

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

  // Only pad to the end of the current week — no extra rows
  const numRows = Math.ceil(cells.length / 7);
  const totalCells = numRows * 7;
  const remaining = totalCells - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    cells.push({ dateStr: toDateStr(y, m, d), day: d, thisMonth: false });
  }

  return { cells, numRows };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function googleCalUrl(name: string, start: string, end: string, description = "", location = ""): string {
  const s = start.replace(/-/g, "");
  // Google Calendar end date is exclusive — add 1 day
  const eDate = new Date(end + "T00:00:00Z");
  eDate.setUTCDate(eDate.getUTCDate() + 1);
  const e = eDate.toISOString().slice(0, 10).replace(/-/g, "");
  return (
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(name)}` +
    `&dates=${s}/${e}` +
    (description ? `&details=${encodeURIComponent(description)}` : "") +
    (location ? `&location=${encodeURIComponent(location)}` : "")
  );
}

// ── Popover positioning ───────────────────────────────────────────────────────

function computePopoverStyle(rect: DOMRect, width = 310): React.CSSProperties {
  const MARGIN = 10;
  const OFFSET = 6;
  const ESTIMATED_HEIGHT = 400;

  let left = rect.left;
  let top = rect.bottom + OFFSET;

  if (top + ESTIMATED_HEIGHT > window.innerHeight - MARGIN) {
    top = Math.max(MARGIN, rect.top - ESTIMATED_HEIGHT - OFFSET);
  }
  if (left + width > window.innerWidth - MARGIN) {
    left = window.innerWidth - MARGIN - width;
  }
  left = Math.max(MARGIN, left);

  return { position: "fixed", top, left, width, zIndex: 200 };
}

// ── Platform tag — neutral grey ───────────────────────────────────────────────

function PlatformTag({ name }: { name: string }) {
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.03em",
        padding: "2px 5px",
        borderRadius: "4px",
        background: "rgba(255,255,255,0.07)",
        color: "var(--text-secondary)",
        border: "1px solid rgba(255,255,255,0.1)",
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      {name}
    </span>
  );
}

// ── Shared close button ───────────────────────────────────────────────────────

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

// ── Add to Calendar button ────────────────────────────────────────────────────

function AddToCalendarBtn({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        textAlign: "center",
        background: "rgba(255,255,255,0.05)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border)",
        fontWeight: 600,
        fontSize: "12px",
        padding: "7px 14px",
        borderRadius: "7px",
        textDecoration: "none",
        marginTop: "8px",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
    >
      + Add to Google Calendar
    </a>
  );
}

// ── Game popover ──────────────────────────────────────────────────────────────

function GamePopover({ game, onClose }: { game: GameRelease; onClose: () => void }) {
  const platforms = deduplicatePlatforms(game.platforms);
  const calUrl = googleCalUrl(
    `${game.name} — Release`,
    game.released,
    game.released,
    `${game.name} releases today. View on GAMES.GG: ${gamesGgUrl(game.slug)}`
  );

  return (
    <div>
      {/* Image area — always 130px, placeholder if no art */}
      <div style={{ position: "relative", height: "130px", overflow: "hidden", flexShrink: 0 }}>
        {game.background_image ? (
          <>
            <Image
              src={game.background_image}
              alt={game.name}
              fill
              style={{ objectFit: "cover", objectPosition: "top" }}
              sizes="310px"
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to bottom, rgba(6,13,23,0.05) 0%, var(--card) 100%)",
              }}
            />
          </>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(135deg, oklch(20% 0.06 240) 0%, oklch(13% 0.04 240) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: "36px", fontWeight: 800, color: "oklch(83% 0.22 158 / 0.2)", letterSpacing: "-0.04em" }}>
              {game.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <button onClick={onClose} style={closeButtonStyle}>✕</button>
      </div>

      <div style={{ padding: "12px 16px 14px" }}>
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "7px" }}>
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

        <h3 style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.2, marginBottom: "4px" }}>
          {game.name}
        </h3>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
          {formatDateLong(game.released)}
        </p>

        {game.genres.length > 0 && (
          <p style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "8px" }}>
            {game.genres.slice(0, 4).join(" · ")}
          </p>
        )}

        {platforms.length > 0 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "12px" }}>
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

        <AddToCalendarBtn url={calUrl} />
      </div>
    </div>
  );
}

// ── Event popover ─────────────────────────────────────────────────────────────

function EventPopover({ event, onClose }: { event: GamingEvent; onClose: () => void }) {
  const isSameDay = event.startDate === event.endDate;
  const calUrl = googleCalUrl(
    event.name,
    event.startDate,
    event.endDate,
    event.description,
    event.location
  );

  return (
    <div>
      {/* Colored header — logo if available, else gradient */}
      <div style={{ position: "relative", height: "90px", overflow: "hidden", flexShrink: 0 }}>
        {event.logoUrl ? (
          <>
            <Image src={event.logoUrl} alt={event.name} fill unoptimized style={{ objectFit: "cover" }} sizes="310px" />
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, rgba(6,13,23,0) 0%, var(--card) 100%)` }} />
          </>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(135deg, ${event.color}22 0%, ${event.color}08 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: event.color,
                opacity: 0.6,
              }}
            >
              {EVENT_TYPE_LABEL[event.type]}
            </span>
          </div>
        )}
        <button onClick={onClose} style={closeButtonStyle}>✕</button>
      </div>

      <div style={{ padding: "12px 16px 14px" }}>
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

        <h3 style={{ fontSize: "15px", fontWeight: 700, lineHeight: 1.2, marginBottom: "4px" }}>
          {event.name}
        </h3>

        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "2px" }}>
          {isSameDay
            ? formatDateLong(event.startDate)
            : `${formatDateShort(event.startDate)} – ${formatDateShort(event.endDate)}`}
        </p>
        {event.location && (
          <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "8px" }}>{event.location}</p>
        )}

        <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "12px" }}>
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

        <AddToCalendarBtn url={calUrl} />
      </div>
    </div>
  );
}

// ── Day popover ("+N more") ───────────────────────────────────────────────────

function DayPopover({
  dateStr,
  releases,
  events,
  onClose,
  onOpen,
}: {
  dateStr: string;
  releases: GameRelease[];
  events: GamingEvent[];
  onClose: () => void;
  onOpen: (item: PopoverItem) => void;
}) {
  const allItems: Array<{ kind: "game" | "event"; data: GameRelease | GamingEvent }> = [
    ...events.map((e) => ({ kind: "event" as const, data: e })),
    ...releases.map((r) => ({ kind: "game" as const, data: r })),
  ];

  return (
    <div>
      <div
        style={{
          padding: "11px 14px 10px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>
          {formatDateShort(dateStr)} — {allItems.length} events
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "14px",
            padding: "2px 4px",
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ maxHeight: "280px", overflowY: "auto", padding: "6px" }}>
        {allItems.map((item, i) => {
          const isGame = item.kind === "game";
          const color = isGame ? "#52d68a" : (item.data as GamingEvent).color;
          const label = isGame
            ? (item.data as GameRelease).name + " Release"
            : (item.data as GamingEvent).name;

          return (
            <button
              key={i}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (item.kind === "game") {
                  onOpen({ kind: "game", data: item.data as GameRelease, anchorRect: rect });
                } else {
                  onOpen({ kind: "event", data: item.data as GamingEvent, anchorRect: rect });
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                textAlign: "left",
                padding: "7px 8px",
                borderRadius: "6px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                marginBottom: "2px",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "2px",
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: "12px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Popover container ─────────────────────────────────────────────────────────

function CalendarPopover({
  item,
  onClose,
  onOpen,
}: {
  item: PopoverItem;
  onClose: () => void;
  onOpen: (item: PopoverItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = item.kind === "day" ? 270 : 310;
  const style = computePopoverStyle(item.anchorRect, width);

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
      {item.kind === "game" && <GamePopover game={item.data} onClose={onClose} />}
      {item.kind === "event" && <EventPopover event={item.data} onClose={onClose} />}
      {item.kind === "day" && (
        <DayPopover
          dateStr={item.dateStr}
          releases={item.releases}
          events={item.events}
          onClose={onClose}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

// ── Cell pills ────────────────────────────────────────────────────────────────

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

      {thisMonth && overflow > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenPopover({
              kind: "day",
              dateStr,
              releases,
              events,
              anchorRect: e.currentTarget.getBoundingClientRect(),
            });
          }}
          style={{
            fontSize: "9px",
            color: "var(--text-dim)",
            paddingLeft: "5px",
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
            transition: "color 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
        >
          +{overflow} more
        </button>
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

  const { cells, numRows } = getMonthDays(year, month);

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
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

      {/* Nav row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <button onClick={prevMonth} style={navBtnStyle}>‹</button>

        {/* Month/year — absolutely centered so legend width doesn't affect it */}
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontSize: "17px", fontWeight: 700 }}>{MONTH_NAMES[month - 1]}</span>
          <span style={{ fontSize: "14px", color: "var(--text-dim)" }}>{year}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <LegendItem color="var(--green)" label="Release" />
          <LegendItem color="#4f9cf9" label="Convention" />
          <LegendItem color="#b06ff5" label="Showcase" />
          <LegendItem color="#f5c842" label="Awards" />
          <button onClick={nextMonth} style={navBtnStyle}>›</button>
        </div>
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
          gridTemplateRows: `repeat(${numRows}, 1fr)`,
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

      {popover && (
        <CalendarPopover item={popover} onClose={() => setPopover(null)} onOpen={setPopover} />
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: color, flexShrink: 0 }} />
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
