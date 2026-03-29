"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import type { GameRelease } from "@/lib/releases";
import { getReleasesForDate, deduplicatePlatforms, gamesGgUrl } from "@/lib/releases";
import type { GamingEvent } from "@/lib/events";
import { getEventsForDate } from "@/lib/events";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrev = new Date(year, month - 1, 0).getDate();
  const startOffset = firstDay; // Sun = 0

  const cells: { dateStr: string; day: number; thisMonth: boolean }[] = [];

  // Prev month tail
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    cells.push({ dateStr: toDateStr(y, m, d), day: d, thisMonth: false });
  }

  // This month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: toDateStr(year, month, d), day: d, thisMonth: true });
  }

  // Next month pad to complete 6 rows (42 cells)
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

// ── Platform colors ───────────────────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  PC: "#4f9cf9",
  PS5: "#003791",
  PS4: "#003791",
  "Xbox Series": "#107c10",
  "Xbox One": "#107c10",
  Switch: "#e60012",
  iOS: "#555",
  Android: "#3ddc84",
  Mac: "#999",
};

function PlatformTag({ name }: { name: string }) {
  const bg = PLATFORM_COLORS[name] ?? "#555";
  return (
    <span
      className="tag"
      style={{ background: bg + "28", color: bg, border: `1px solid ${bg}44` }}
    >
      {name}
    </span>
  );
}

// ── Event type config ─────────────────────────────────────────────────────────
const EVENT_TYPE_LABEL: Record<string, string> = {
  convention: "Convention",
  showcase: "Showcase",
  awards: "Awards",
  sale: "Sale",
};
const EVENT_TYPE_ICON: Record<string, string> = {
  convention: "🎮",
  showcase: "📺",
  awards: "🏆",
  sale: "🏷",
};

// ── Dot preview in calendar cell ──────────────────────────────────────────────
function CellPreview({ releases, events }: { releases: GameRelease[]; events: GamingEvent[] }) {
  const maxDots = 3;
  const releaseDots = Math.min(releases.length, maxDots);
  const eventDots = Math.min(events.length, maxDots - releaseDots);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px" }}>
      {Array.from({ length: releaseDots }).map((_, i) => (
        <span key={`r${i}`} className="event-dot" style={{ background: "var(--green)" }} />
      ))}
      {releases.length > maxDots && (
        <span style={{ fontSize: "9px", color: "var(--text-dim)", lineHeight: 1 }}>
          +{releases.length - maxDots}
        </span>
      )}
      {Array.from({ length: eventDots }).map((_, i) => (
        <span key={`e${i}`} className="event-dot" style={{ background: events[i].color }} />
      ))}
    </div>
  );
}

// ── Game detail modal ─────────────────────────────────────────────────────────
function GameModal({ game, onClose }: { game: GameRelease; onClose: () => void }) {
  const platforms = deduplicatePlatforms(game.platforms);
  const url = gamesGgUrl(game.slug);

  return (
    <div
      className="game-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="game-modal">
        {game.background_image && (
          <div style={{ position: "relative", width: "100%", height: "180px" }}>
            <Image
              src={game.background_image}
              alt={game.name}
              fill
              style={{ objectFit: "cover" }}
              sizes="480px"
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to bottom, transparent 30%, var(--card) 100%)",
              }}
            />
            <button
              onClick={onClose}
              style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                background: "rgba(6,13,23,0.7)",
                border: "1px solid var(--border)",
                borderRadius: "50%",
                width: "28px",
                height: "28px",
                color: "var(--text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
              }}
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ padding: "16px 20px 20px" }}>
          {!game.background_image && (
            <button
              onClick={onClose}
              style={{
                float: "right",
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                fontSize: "18px",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
            {platforms.map((p) => <PlatformTag key={p} name={p} />)}
            {game.metacritic && (
              <span
                className="tag"
                style={{
                  background: "#f5c84222",
                  color: "#f5c842",
                  border: "1px solid #f5c84244",
                }}
              >
                MC {game.metacritic}
              </span>
            )}
          </div>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "6px", lineHeight: 1.2 }}>
            {game.name}
          </h2>

          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
            Release: {new Date(game.released + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
            })}
          </p>

          {game.genres.length > 0 && (
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "14px" }}>
              {game.genres.slice(0, 4).join(" · ")}
            </p>
          )}

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              background: "var(--green)",
              color: "#060D17",
              fontWeight: 700,
              fontSize: "14px",
              padding: "10px 16px",
              borderRadius: "8px",
              transition: "opacity 0.15s",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            View on GAMES.GG
            <span style={{ fontSize: "11px", opacity: 0.7 }}>↗</span>
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Event detail modal ────────────────────────────────────────────────────────
function EventModal({ event, onClose }: { event: GamingEvent; onClose: () => void }) {
  const start = new Date(event.startDate + "T12:00:00");
  const end = new Date(event.endDate + "T12:00:00");
  const isSameDay = event.startDate === event.endDate;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div
      className="game-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="game-modal" style={{ maxWidth: "440px" }}>
        <div
          style={{
            background: event.color + "18",
            borderBottom: `1px solid ${event.color}33`,
            padding: "20px 20px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "24px" }}>{EVENT_TYPE_ICON[event.type]}</span>
              <div>
                <span
                  className="tag"
                  style={{
                    background: event.color + "22",
                    color: event.color,
                    border: `1px solid ${event.color}44`,
                    marginBottom: "4px",
                    display: "inline-block",
                  }}
                >
                  {EVENT_TYPE_LABEL[event.type]}
                </span>
                <h2 style={{ fontSize: "17px", fontWeight: 700, lineHeight: 1.2 }}>{event.name}</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                fontSize: "18px",
                lineHeight: 1,
                flexShrink: 0,
                marginLeft: "12px",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: "16px 20px 20px" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                color: "var(--text-secondary)",
              }}
            >
              <span>📅</span>
              <span>
                {isSameDay ? formatDate(start) : `${formatDate(start)} — ${formatDate(end)}`}
              </span>
            </div>
          </div>

          {event.location && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                color: "var(--text-secondary)",
                marginBottom: "12px",
              }}
            >
              <span>📍</span>
              <span>{event.location}</span>
            </div>
          )}

          <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "16px" }}>
            {event.description}
          </p>

          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                background: event.color + "22",
                color: event.color,
                border: `1px solid ${event.color}44`,
                fontWeight: 700,
                fontSize: "14px",
                padding: "10px 16px",
                borderRadius: "8px",
                transition: "opacity 0.15s",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Official Website ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Day detail panel ──────────────────────────────────────────────────────────
function DayPanel({
  dateStr,
  releases,
  events,
  onGameClick,
  onEventClick,
  onClose,
}: {
  dateStr: string;
  releases: GameRelease[];
  events: GamingEvent[];
  onGameClick: (g: GameRelease) => void;
  onEventClick: (e: GamingEvent) => void;
  onClose: () => void;
}) {
  const date = new Date(dateStr + "T12:00:00");
  const formatted = date.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const empty = releases.length === 0 && events.length === 0;

  return (
    <div
      className="detail-panel"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "18px",
        marginTop: "20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <p style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
            Selected Day
          </p>
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>{formatted}</h3>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text-dim)",
            cursor: "pointer",
            padding: "4px 10px",
            fontSize: "13px",
          }}
        >
          Close
        </button>
      </div>

      {empty && (
        <p style={{ color: "var(--text-dim)", fontSize: "14px", textAlign: "center", padding: "24px 0" }}>
          No releases or events on this day.
        </p>
      )}

      {events.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <p style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
            Events
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {events.map((ev) => (
              <button
                key={ev.id}
                className="event-chip"
                onClick={() => onEventClick(ev)}
                style={{ background: ev.color + "14", borderColor: ev.color + "33" }}
              >
                <span style={{ fontSize: "18px" }}>{EVENT_TYPE_ICON[ev.type]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "1px" }}>
                    {ev.name}
                  </p>
                  <p style={{ fontSize: "11px", color: ev.color }}>
                    {EVENT_TYPE_LABEL[ev.type]}
                    {ev.location ? ` · ${ev.location}` : ""}
                  </p>
                </div>
                <span style={{ color: "var(--text-dim)", fontSize: "14px" }}>›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {releases.length > 0 && (
        <div>
          <p style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
            Game Releases ({releases.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {releases.map((game) => {
              const platforms = deduplicatePlatforms(game.platforms);
              return (
                <button
                  key={game.id}
                  className="game-chip"
                  onClick={() => onGameClick(game)}
                >
                  {game.background_image ? (
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "6px",
                        overflow: "hidden",
                        flexShrink: 0,
                        position: "relative",
                      }}
                    >
                      <Image
                        src={game.background_image}
                        alt={game.name}
                        fill
                        style={{ objectFit: "cover" }}
                        sizes="44px"
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "6px",
                        background: "var(--border)",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "18px",
                      }}
                    >
                      🎮
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--text)",
                        marginBottom: "4px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {game.name}
                    </p>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {platforms.map((p) => <PlatformTag key={p} name={p} />)}
                    </div>
                  </div>
                  <span style={{ color: "var(--green)", fontSize: "14px" }}>›</span>
                </button>
              );
            })}
          </div>
        </div>
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState<GameRelease | null>(null);
  const [activeEvent, setActiveEvent] = useState<GamingEvent | null>(null);

  const cells = getMonthDays(year, month);

  const prevMonth = useCallback(() => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }, [month]);

  const nextMonth = useCallback(() => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }, [month]);

  const handleDayClick = useCallback((dateStr: string, thisMonth: boolean) => {
    if (!thisMonth) return;
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
  }, []);

  const selectedReleases = selectedDate ? getReleasesForDate(releases, selectedDate) : [];
  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  // Count releases + events per date for dot display
  const releasesByDate: Record<string, GameRelease[]> = {};
  for (const r of releases) {
    if (!releasesByDate[r.released]) releasesByDate[r.released] = [];
    releasesByDate[r.released].push(r);
  }

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <button
          onClick={prevMonth}
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text)",
            cursor: "pointer",
            padding: "8px 14px",
            fontSize: "16px",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          ‹
        </button>

        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, lineHeight: 1.1 }}>
            {MONTH_NAMES[month - 1]}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "1px" }}>{year}</p>
        </div>

        <button
          onClick={nextMonth}
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text)",
            cursor: "pointer",
            padding: "8px 14px",
            fontSize: "16px",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          ›
        </button>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "14px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="event-dot" style={{ background: "var(--green)" }} />
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Game Release</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="event-dot" style={{ background: "#4f9cf9" }} />
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Convention</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="event-dot" style={{ background: "#b06ff5" }} />
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Showcase</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="event-dot" style={{ background: "#f5c842" }} />
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Awards</span>
        </div>
      </div>

      {/* Day headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "1px",
          marginBottom: "1px",
        }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "6px 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="cal-grid">
        {cells.map(({ dateStr, day, thisMonth }) => {
          const dayReleases = releasesByDate[dateStr] ?? [];
          const dayEvents = getEventsForDate(dateStr);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasContent = dayReleases.length > 0 || dayEvents.length > 0;

          let className = "cal-day";
          if (!thisMonth) className += " other-month";
          if (isToday) className += " today";
          if (isSelected) className += " selected";

          return (
            <div
              key={dateStr}
              className={className}
              onClick={() => handleDayClick(dateStr, thisMonth)}
              style={isSelected ? { outline: "2px solid var(--green)", outlineOffset: "-2px" } : undefined}
            >
              <div
                className="day-num"
                style={{
                  fontSize: "12px",
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? undefined : hasContent ? "var(--text)" : "var(--text-secondary)",
                  marginBottom: "2px",
                  lineHeight: "22px",
                  minWidth: "22px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {day}
              </div>

              {/* Mini event name for single-day events that fit */}
              {thisMonth && dayEvents.length === 1 && dayReleases.length === 0 && (
                <p
                  style={{
                    fontSize: "9px",
                    color: dayEvents[0].color,
                    lineHeight: 1.3,
                    marginTop: "2px",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {dayEvents[0].name}
                </p>
              )}

              {thisMonth && hasContent && (
                <CellPreview releases={dayReleases} events={dayEvents} />
              )}
            </div>
          );
        })}
      </div>

      {/* Day detail panel */}
      {selectedDate && (
        <DayPanel
          dateStr={selectedDate}
          releases={selectedReleases}
          events={selectedEvents}
          onGameClick={setActiveGame}
          onEventClick={setActiveEvent}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {/* Modals */}
      {activeGame && (
        <GameModal game={activeGame} onClose={() => setActiveGame(null)} />
      )}
      {activeEvent && (
        <EventModal event={activeEvent} onClose={() => setActiveEvent(null)} />
      )}
    </>
  );
}
