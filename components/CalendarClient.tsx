"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
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
  const allItems = [
    ...events.map((e) => ({ color: e.color, name: e.name })),
    ...releases.map((r) => ({ color: GAME_COLOR_HEX, name: r.name })),
  ];
  const hasItems = allItems.length > 0;
  const MAX_VISIBLE = 3;
  const visible  = allItems.slice(0, MAX_VISIBLE);
  const overflow = allItems.length - visible.length;

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
        marginBottom: "2px", flexShrink: 0,
      }}>{day}</div>
      {thisMonth && hasItems && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {visible.map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: "3px", minWidth: 0,
            }}>
              <div style={{
                width: "5px", height: "5px", borderRadius: "50%",
                background: item.color, flexShrink: 0,
              }} />
              <span style={{
                fontSize: "9px", lineHeight: 1.2,
                color: "var(--text-secondary)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                minWidth: 0,
              }}>{item.name}</span>
            </div>
          ))}
          {overflow > 0 && (
            <span style={{ fontSize: "8px", color: "var(--text-dim)", paddingLeft: "8px" }}>
              +{overflow} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Game card (day panel) ─────────────────────────────────────────────────────

function GameCard({ game, isSelected, inWatchlist, onSelect, onWatchlistToggle }: {
  game: GameRelease;
  isSelected: boolean;
  inWatchlist: boolean;
  onSelect: () => void;
  onWatchlistToggle: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const platforms = deduplicatePlatforms(game.platforms).slice(0, 2);

  return (
    <div
      onClick={onSelect}
      style={{
        cursor: "pointer", borderRadius: "8px", overflow: "hidden",
        border: isSelected
          ? "1px solid oklch(83% 0.22 158 / 0.6)"
          : "1px solid var(--border)",
        transition: "border-color 0.15s, transform 0.15s",
        background: "var(--card)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = isSelected
          ? "oklch(83% 0.22 158 / 0.6)"
          : "var(--border)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Art */}
      <div style={{ position: "relative", aspectRatio: "3/4", overflow: "hidden" }}>
        {game.background_image && !imgFailed ? (
          <Image src={game.background_image} alt={game.name} fill
            style={{ objectFit: "cover", objectPosition: "top" }}
            sizes="140px"
            onError={() => setImgFailed(true)} />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(135deg, oklch(20% 0.06 240) 0%, oklch(13% 0.04 240) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: "20px", fontWeight: 800,
              color: "oklch(83% 0.22 158 / 0.25)", letterSpacing: "-0.04em" }}>
              {game.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        {/* Watchlist overlay */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onWatchlistToggle(); }}
          style={{
            position: "absolute", top: "5px", right: "5px",
            width: "22px", height: "22px", borderRadius: "50%",
            background: inWatchlist ? "oklch(83% 0.22 158 / 0.25)" : "rgba(6,13,23,0.7)",
            border: inWatchlist ? "1px solid oklch(83% 0.22 158 / 0.5)" : "1px solid rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "11px", color: inWatchlist ? "var(--green)" : "var(--text-secondary)",
            cursor: "pointer", transition: "all 0.15s",
          }}
        >{inWatchlist ? "✓" : "+"}</button>
      </div>
      {/* Info */}
      <div style={{ padding: "5px 7px 7px", background: "oklch(16% 0.04 240)" }}>
        <div style={{
          fontSize: "10px", fontWeight: 700, color: "oklch(90% 0 0)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginBottom: "3px",
        }}>{game.name}</div>
        <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
          {platforms.map((p) => (
            <span key={p} style={{
              fontSize: "7px", fontWeight: 600, letterSpacing: "0.03em",
              padding: "1px 4px", borderRadius: "3px",
              background: "rgba(255,255,255,0.07)", color: "var(--text-dim)",
              border: "1px solid rgba(255,255,255,0.08)", textTransform: "uppercase",
            }}>{p}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Event banner card (day panel) ─────────────────────────────────────────────

function EventBannerCard({ event, isSelected, onSelect }: {
  event: GamingEvent;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!event.logoUrl && !imgFailed;
  const isSameDay = event.startDate === event.endDate;

  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", cursor: "pointer", borderRadius: "8px",
        overflow: "hidden",
        border: isSelected
          ? `1px solid ${event.color}66`
          : "1px solid var(--border)",
        background: "var(--card)", marginBottom: "8px",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!isSelected)
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = isSelected
          ? `${event.color}66`
          : "var(--border)";
      }}
    >
      {/* Color accent bar */}
      <div style={{ width: "3px", background: event.color, flexShrink: 0 }} />
      {/* Logo square */}
      <div style={{
        width: "64px", height: "64px", flexShrink: 0, overflow: "hidden",
        background: showImg
          ? "oklch(12% 0.03 240)"
          : `linear-gradient(135deg, ${event.color}22 0%, ${event.color}08 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.logoUrl} alt={event.name} onError={() => setImgFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "contain", padding: "6px" }} />
        ) : (
          <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: event.color, opacity: 0.7,
            textAlign: "center", padding: "4px" }}>
            {EVENT_TYPE_LABEL[event.type]}
          </span>
        )}
      </div>
      {/* Text */}
      <div style={{ padding: "10px 12px", flex: 1, minWidth: 0 }}>
        <span style={{
          display: "inline-block", fontSize: "8px", fontWeight: 700,
          letterSpacing: "0.06em", textTransform: "uppercase",
          color: event.color, padding: "1px 5px",
          background: event.color + "22", borderRadius: "3px",
          border: `1px solid ${event.color}40`, marginBottom: "4px",
        }}>{EVENT_TYPE_LABEL[event.type]}</span>
        <div style={{
          fontSize: "12px", fontWeight: 700, color: "var(--text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginBottom: "2px",
        }}>{event.name}</div>
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

// ── CalBtn helper ─────────────────────────────────────────────────────────────

function CalBtn({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: "block", textAlign: "center",
      background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)",
      border: "1px solid var(--border)", fontWeight: 600, fontSize: "12px",
      padding: "7px 14px", borderRadius: "7px", textDecoration: "none",
      marginTop: "6px", transition: "background 0.15s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
    >+ Add to Google Calendar</a>
  );
}

// ── Game detail panel ─────────────────────────────────────────────────────────

function GameDetailPanel({ game, inWatchlist, onWatchlistToggle, onClose }: {
  game: GameRelease;
  inWatchlist: boolean;
  onWatchlistToggle: (slug: string) => void;
  onClose: () => void;
}) {
  const platforms = deduplicatePlatforms(game.platforms);
  const calUrl = googleCalUrl(
    `${game.name} — Release`, game.released, game.released,
    `${game.name} releases today. View on GAMES.GG: ${gamesGgUrl(game.slug)}`
  );
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div style={{
      width: "260px", flexShrink: 0,
      background: "var(--card)", border: "1px solid var(--border-hover)",
      borderRadius: "12px", overflow: "hidden",
      display: "flex", flexDirection: "column",
      animation: "slideLeft 0.2s ease",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {/* Cover image */}
      <div style={{ position: "relative", height: "130px", flexShrink: 0, overflow: "hidden" }}>
        {game.background_image && !imgFailed ? (
          <>
            <Image src={game.background_image} alt={game.name} fill
              style={{ objectFit: "cover", objectPosition: "top" }} sizes="260px"
              onError={() => setImgFailed(true)} />
            <div style={{ position: "absolute", inset: 0,
              background: "linear-gradient(to bottom, rgba(6,13,23,0.05) 0%, var(--card) 100%)" }} />
          </>
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(135deg, oklch(20% 0.06 240) 0%, oklch(13% 0.04 240) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: "32px", fontWeight: 800,
              color: "oklch(83% 0.22 158 / 0.2)", letterSpacing: "-0.04em" }}>
              {game.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <button type="button" onClick={onClose} style={{
          position: "absolute", top: "8px", right: "8px",
          background: "rgba(6,13,23,0.65)", border: "1px solid var(--border)",
          borderRadius: "50%", width: "24px", height: "24px",
          color: "var(--text-secondary)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "11px", lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>
      {/* Body */}
      <div style={{ padding: "12px 14px 14px", flex: 1, overflowY: "auto" }}>
        {/* Badges */}
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "7px" }}>
          <span style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase", color: "var(--green)",
            padding: "2px 6px", background: "oklch(83% 0.22 158 / 0.15)",
            borderRadius: "4px", border: "1px solid oklch(83% 0.22 158 / 0.3)",
          }}>Game Release</span>
          {game.metacritic && (
            <span style={{
              fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
              background: "#f5c84222", color: "#f5c842", border: "1px solid #f5c84240",
            }}>MC {game.metacritic}</span>
          )}
        </div>
        <h3 style={{ fontSize: "15px", fontWeight: 700, lineHeight: 1.2, marginBottom: "3px" }}>
          {game.name}
        </h3>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px" }}>
          {formatDateLong(game.released)}
        </p>
        {game.genres.length > 0 && (
          <p style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "10px" }}>
            {game.genres.slice(0, 4).join(" · ")}
          </p>
        )}
        {/* Watchlist button */}
        <button type="button" onClick={() => onWatchlistToggle(game.slug)} style={{
          width: "100%", padding: "7px 12px", borderRadius: "7px",
          fontWeight: 700, fontSize: "12px", cursor: "pointer",
          border: "1px solid",
          background: inWatchlist ? "oklch(83% 0.22 158 / 0.15)" : "oklch(83% 0.22 158 / 0.08)",
          color: "var(--green)",
          borderColor: inWatchlist ? "oklch(83% 0.22 158 / 0.5)" : "oklch(83% 0.22 158 / 0.3)",
          marginBottom: "8px", transition: "all 0.15s",
        }}>
          {inWatchlist ? "✓ In Watchlist" : "+ Add to Watchlist"}
        </button>
        {/* Platforms */}
        {platforms.length > 0 && (
          <>
            <div style={{
              height: "1px", background: "var(--border)", margin: "8px 0",
            }} />
            <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "6px" }}>
              Platforms
            </p>
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "4px" }}>
              {platforms.map((p) => <PlatformTag key={p} name={p} />)}
            </div>
          </>
        )}
        {/* GAMES.GG link */}
        <a href={gamesGgUrl(game.slug)} target="_blank" rel="noopener noreferrer" style={{
          display: "block", textAlign: "center", background: "var(--green)",
          color: "#060D17", fontWeight: 700, fontSize: "12px",
          padding: "8px 14px", borderRadius: "7px", textDecoration: "none",
          marginTop: "8px", transition: "opacity 0.15s",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >View on GAMES.GG</a>
        <CalBtn url={calUrl} />
      </div>
    </div>
  );
}

// ── Event detail panel ────────────────────────────────────────────────────────

function EventDetailPanel({ event, onClose }: {
  event: GamingEvent;
  onClose: () => void;
}) {
  const isSameDay = event.startDate === event.endDate;
  const calUrl = googleCalUrl(event.name, event.startDate, event.endDate,
    event.description, event.location);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!event.logoUrl && !imgFailed;

  return (
    <div style={{
      width: "260px", flexShrink: 0,
      background: "var(--card)", border: "1px solid var(--border-hover)",
      borderRadius: "12px", overflow: "hidden",
      display: "flex", flexDirection: "column",
      animation: "slideLeft 0.2s ease",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {/* Cover */}
      <div style={{ position: "relative", height: "100px", flexShrink: 0, overflow: "hidden" }}>
        {showImg ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.logoUrl} alt={event.name} onError={() => setImgFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover",
                objectPosition: "center" }} />
            <div style={{ position: "absolute", inset: 0,
              background: "linear-gradient(to bottom, rgba(6,13,23,0) 0%, var(--card) 100%)" }} />
          </>
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: `linear-gradient(135deg, ${event.color}22 0%, ${event.color}08 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: event.color, opacity: 0.7 }}>
              {EVENT_TYPE_LABEL[event.type]}
            </span>
          </div>
        )}
        <button type="button" onClick={onClose} style={{
          position: "absolute", top: "8px", right: "8px",
          background: "rgba(6,13,23,0.65)", border: "1px solid var(--border)",
          borderRadius: "50%", width: "24px", height: "24px",
          color: "var(--text-secondary)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "11px", lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>
      {/* Body */}
      <div style={{ padding: "12px 14px 14px", flex: 1, overflowY: "auto" }}>
        <span style={{
          display: "inline-block", fontSize: "10px", fontWeight: 700,
          letterSpacing: "0.06em", textTransform: "uppercase",
          color: event.color, padding: "2px 6px",
          background: event.color + "22", borderRadius: "4px",
          border: `1px solid ${event.color}40`, marginBottom: "8px",
        }}>{EVENT_TYPE_LABEL[event.type]}</span>
        <h3 style={{ fontSize: "15px", fontWeight: 700, lineHeight: 1.2, marginBottom: "4px" }}>
          {event.name}
        </h3>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "2px" }}>
          {isSameDay
            ? formatDateLong(event.startDate)
            : `${formatDateShort(event.startDate)} – ${formatDateShort(event.endDate)}`}
        </p>
        {event.location && (
          <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "8px" }}>
            {event.location}
          </p>
        )}
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6,
          marginBottom: "12px" }}>
          {event.description}
        </p>
        {event.url && (
          <a href={event.url} target="_blank" rel="noopener noreferrer" style={{
            display: "block", textAlign: "center",
            background: event.color + "20", color: event.color,
            border: `1px solid ${event.color}40`, fontWeight: 700, fontSize: "12px",
            padding: "8px 14px", borderRadius: "7px", textDecoration: "none",
            transition: "opacity 0.15s", marginBottom: "4px",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >Official Website ↗</a>
        )}
        <CalBtn url={calUrl} />
      </div>
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
        <button type="button" onClick={() => setCollapsed((c) => !c)} style={{
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
    <button type="button" onClick={onToggle} style={{
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
          <button type="button" onClick={onClose} style={{
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
              <button type="button" onClick={() => onRemove(r.slug)} style={{
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

// ── Day panel ─────────────────────────────────────────────────────────────────

function DayPanel({
  dateStr, releases, events, todayStr,
  watchlistHas, watchlistToggle,
  selectedItemKey, onSelectItem, onClose,
}: {
  dateStr: string;
  releases: GameRelease[];
  events: GamingEvent[];
  todayStr: string;
  watchlistHas: (slug: string) => boolean;
  watchlistToggle: (slug: string) => void;
  selectedItemKey: string | null;
  onSelectItem: (item: { kind: "game"; data: GameRelease } | { kind: "event"; data: GamingEvent }) => void;
  onClose: () => void;
}) {
  const date = new Date(dateStr + "T12:00:00");
  const monthName = MONTH_NAMES[date.getMonth()].toUpperCase();
  const dayNum    = date.getDate();
  const isToday   = dateStr === todayStr;

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: "var(--card)", border: "1px solid var(--border-hover)",
      borderRadius: "12px", overflow: "hidden",
      display: "flex", flexDirection: "column",
      animation: "slideLeft 0.2s ease",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "0.04em" }}>
            {monthName} {dayNum}
          </span>
          {isToday && (
            <span style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--green)",
              background: "oklch(83% 0.22 158 / 0.12)",
              padding: "2px 7px", borderRadius: "4px",
            }}>TODAY</span>
          )}
        </div>
        <button type="button" onClick={onClose} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
          borderRadius: "50%", width: "26px", height: "26px",
          color: "var(--text-secondary)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>

        {/* Games section */}
        {releases.length > 0 && (
          <>
            <div style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-dim)",
              marginBottom: "8px",
            }}>
              Game Releases · {releases.length}
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px",
              marginBottom: events.length > 0 ? "16px" : "0",
            }}>
              {releases.map((game) => (
                <GameCard
                  key={game.slug}
                  game={game}
                  isSelected={selectedItemKey === `game-${game.slug}`}
                  inWatchlist={watchlistHas(game.slug)}
                  onSelect={() => onSelectItem({ kind: "game", data: game })}
                  onWatchlistToggle={() => watchlistToggle(game.slug)}
                />
              ))}
            </div>
          </>
        )}

        {/* Events section */}
        {events.length > 0 && (
          <>
            <div style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-dim)",
              marginBottom: "8px",
            }}>
              Events · {events.length}
            </div>
            {events.map((event) => (
              <EventBannerCard
                key={event.id}
                event={event}
                isSelected={selectedItemKey === `event-${event.id}`}
                onSelect={() => onSelectItem({ kind: "event", data: event })}
              />
            ))}
          </>
        )}

        {releases.length === 0 && events.length === 0 && (
          <p style={{ fontSize: "13px", color: "var(--text-dim)",
            textAlign: "center", marginTop: "40px" }}>
            Nothing scheduled for this day.
          </p>
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

  // Close panels on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedItem) setSelectedItem(null);
        else if (selectedDate) setSelectedDate(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedItem, selectedDate]);

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

  // Data for day panel
  const dayReleases = selectedDate ? (releasesByDate[selectedDate] ?? []) : [];
  const dayEvents   = selectedDate
    ? getEventsForDate(selectedDate).filter((e) => activeFilters.has(e.type as FilterKey))
    : [];

  // Stable key for selected item (used to highlight active card in DayPanel)
  const selectedItemKey = selectedItem
    ? selectedItem.kind === "game"
      ? `game-${selectedItem.data.slug}`
      : `event-${(selectedItem.data as GamingEvent).id}`
    : null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* ── Nav row ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: isMobile ? "8px" : "10px", flexShrink: 0, position: "relative",
      }}>
        <button type="button" onClick={prevMonth} style={navBtnStyle}>‹</button>
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontSize: isMobile ? "15px" : "17px", fontWeight: 700 }}>
            {MONTH_NAMES[month - 1]}
          </span>
          <span style={{ fontSize: isMobile ? "13px" : "14px", color: "var(--text-dim)" }}>
            {year}
          </span>
        </div>
        <div style={{ position: "absolute", right: "50px", display: "flex", alignItems: "center" }}>
          <button type="button" onClick={() => setWatchlistOpen(true)} style={{
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
                background: "rgba(82,214,138,0.25)",
                borderRadius: "10px", padding: "1px 6px",
                minWidth: "18px", textAlign: "center",
              }}>{watchlistSlugs.length}</span>
            )}
          </button>
        </div>
        <button type="button" onClick={nextMonth} style={{
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
          <button type="button" onClick={resetFilters} style={{
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

      {/* ── Panels row ── */}
      <div style={{
        flex: 1, minHeight: 0, display: "flex",
        gap: selectedDate && !isMobile ? "10px" : "0",
      }}>

        {/* Calendar panel */}
        <div style={{
          display: "flex", flexDirection: "column",
          flex: selectedDate && !isMobile ? "0 0 42%" : "1",
          minWidth: 0, transition: "flex 0.2s ease",
        }}>
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
              {/* Day headers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flexShrink: 0 }}>
                {DAY_LABELS.map((d) => (
                  <div key={d} style={{
                    textAlign: "center", fontSize: isMobile ? "9px" : "10px", fontWeight: 600,
                    color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em",
                    padding: isMobile ? "5px 0" : "6px 0", background: "var(--card)",
                    borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                  }}>{d}</div>
                ))}
              </div>
              {/* Calendar grid */}
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
                      onSelectDate={(d) => {
                        setSelectedDate(d);
                        setSelectedItem(null);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Day panel (desktop only) */}
        {selectedDate && !isMobile && (
          <DayPanel
            dateStr={selectedDate}
            releases={dayReleases}
            events={dayEvents}
            todayStr={todayStr}
            watchlistHas={watchlistHas}
            watchlistToggle={watchlistToggle}
            selectedItemKey={selectedItemKey}
            onSelectItem={setSelectedItem}
            onClose={() => { setSelectedDate(null); setSelectedItem(null); }}
          />
        )}

        {/* Detail panel (desktop only) */}
        {selectedDate && selectedItem && !isMobile && (
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
      </div>

      {/* ── Mobile: day sheet (bottom sheet list) ── */}
      {isMobile && selectedDate && (dayReleases.length > 0 || dayEvents.length > 0) && (
        <>
          <div onClick={() => { setSelectedDate(null); setSelectedItem(null); }} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 150,
          }} />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            background: "var(--card)", borderTop: "1px solid var(--border)",
            borderRadius: "16px 16px 0 0", zIndex: 200,
            maxHeight: "65vh", display: "flex", flexDirection: "column",
            animation: "slideUp 0.2s ease",
          }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px",
                background: "rgba(255,255,255,0.15)" }} />
            </div>
            <div style={{ padding: "4px 16px 12px", display: "flex",
              justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <p style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>
                  {formatDateLong(selectedDate)}
                </p>
                <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "2px 0 0" }}>
                  {dayReleases.length + dayEvents.length} item{dayReleases.length + dayEvents.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button type="button" onClick={() => { setSelectedDate(null); setSelectedItem(null); }} style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)",
                borderRadius: "50%", width: "30px", height: "30px",
                color: "var(--text-secondary)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "13px",
              }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "0 12px 24px" }}>
              {[
                ...dayEvents.map((e)  => ({ kind: "event" as const, data: e, color: e.color, label: e.name })),
                ...dayReleases.map((r) => ({ kind: "game"  as const, data: r, color: "#52d68a", label: r.name })),
              ].map((item, i) => (
                <button type="button" key={i} onClick={() => setSelectedItem(
                  item.kind === "game"
                    ? { kind: "game",  data: item.data as GameRelease }
                    : { kind: "event", data: item.data as GamingEvent }
                )} style={{
                  display: "flex", alignItems: "center", gap: "12px", width: "100%",
                  textAlign: "left", padding: "12px", borderRadius: "10px",
                  background: "transparent", border: "none", cursor: "pointer",
                  marginBottom: "4px",
                }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "3px",
                    background: item.color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: "14px", fontWeight: 600, margin: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.label}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: "2px 0 0" }}>
                      {item.kind === "game" ? "Game Release" : EVENT_TYPE_LABEL[item.data.type]}
                    </p>
                  </div>
                  <div style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: "16px" }}>›</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Mobile: detail overlay ── */}
      {isMobile && selectedItem && (
        <>
          <div onClick={() => setSelectedItem(null)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 290,
          }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "calc(100vw - 32px)", maxWidth: "380px",
            zIndex: 300, borderRadius: "16px", overflow: "hidden",
            animation: "popIn 0.15s ease",
          }}>
            {selectedItem.kind === "game" ? (
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
            )}
          </div>
        </>
      )}

      {/* ── Watchlist panel ── */}
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
