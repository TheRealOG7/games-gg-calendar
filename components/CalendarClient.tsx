"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import type { GameRelease } from "@/lib/releases";
import { getReleasesForDate, deduplicatePlatforms, gamesGgUrl } from "@/lib/releases";
import type { GamingEvent } from "@/lib/events";
import { getEventsForDate } from "@/lib/events";
import { useWishlist } from "@/lib/wishlist";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterKey = "release" | "convention" | "showcase" | "awards" | "esports";

type PopoverItem =
  | { kind: "game";  data: GameRelease; anchorRect: DOMRect }
  | { kind: "event"; data: GamingEvent; anchorRect: DOMRect }
  | { kind: "day";   dateStr: string; releases: GameRelease[]; events: GamingEvent[]; anchorRect: DOMRect };

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

// ── Popover positioning ───────────────────────────────────────────────────────

function computePopoverStyle(rect: DOMRect, width = 310, isMobile = false): React.CSSProperties {
  if (isMobile) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "calc(100vw - 32px)",
      maxWidth: "380px",
      zIndex: 300,
    };
  }
  const MARGIN = 10, OFFSET = 6, EST_H = 420;
  let left = rect.left;
  let top  = rect.bottom + OFFSET;
  if (top + EST_H > window.innerHeight - MARGIN) top = Math.max(MARGIN, rect.top - EST_H - OFFSET);
  if (left + width > window.innerWidth  - MARGIN) left = window.innerWidth - MARGIN - width;
  left = Math.max(MARGIN, left);
  return { position: "fixed", top, left, width, zIndex: 200 };
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

const closeButtonStyle: React.CSSProperties = {
  position: "absolute", top: "10px", right: "10px",
  background: "rgba(6,13,23,0.6)", border: "1px solid var(--border)",
  borderRadius: "50%", width: "26px", height: "26px",
  color: "var(--text-secondary)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: "12px", lineHeight: 1, padding: 0,
};

function AddToCalendarBtn({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: "block", textAlign: "center",
      background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)",
      border: "1px solid var(--border)", fontWeight: 600, fontSize: "12px",
      padding: "7px 14px", borderRadius: "7px", textDecoration: "none",
      marginTop: "8px", transition: "background 0.15s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
    >
      + Add to Google Calendar
    </a>
  );
}

// ── Game popover ──────────────────────────────────────────────────────────────

function GamePopover({ game, onClose, onWishlistToggle, inWishlist }: {
  game: GameRelease; onClose: () => void;
  onWishlistToggle: (slug: string) => void; inWishlist: boolean;
}) {
  const platforms = deduplicatePlatforms(game.platforms);
  const calUrl = googleCalUrl(
    `${game.name} — Release`, game.released, game.released,
    `${game.name} releases today. View on GAMES.GG: ${gamesGgUrl(game.slug)}`
  );
  return (
    <div>
      <div style={{ position: "relative", height: "130px", overflow: "hidden", flexShrink: 0 }}>
        {game.background_image ? (
          <>
            <Image src={game.background_image} alt={game.name} fill
              style={{ objectFit: "cover", objectPosition: "top" }} sizes="380px" />
            <div style={{ position: "absolute", inset: 0,
              background: "linear-gradient(to bottom, rgba(6,13,23,0.05) 0%, var(--card) 100%)" }} />
          </>
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(135deg, oklch(20% 0.06 240) 0%, oklch(13% 0.04 240) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: "36px", fontWeight: 800, color: "oklch(83% 0.22 158 / 0.2)", letterSpacing: "-0.04em" }}>
              {game.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <button onClick={onClose} style={closeButtonStyle}>✕</button>
        <button onClick={() => onWishlistToggle(game.slug)} style={{
          position: "absolute", top: "10px", right: "42px",
          background: inWishlist ? "rgba(82,214,138,0.15)" : "rgba(6,13,23,0.6)",
          border: inWishlist ? "1px solid rgba(82,214,138,0.4)" : "1px solid var(--border)",
          borderRadius: "50%", width: "26px", height: "26px",
          color: inWishlist ? "var(--green)" : "var(--text-secondary)",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: "13px", lineHeight: 1,
          transition: "all 0.15s",
        }}>
          {inWishlist ? "✓" : "+"}
        </button>
      </div>
      <div style={{ padding: "12px 16px 14px" }}>
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
        <h3 style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1.2, marginBottom: "4px" }}>{game.name}</h3>
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
        <a href={gamesGgUrl(game.slug)} target="_blank" rel="noopener noreferrer" style={{
          display: "block", textAlign: "center", background: "var(--green)",
          color: "#060D17", fontWeight: 700, fontSize: "13px",
          padding: "9px 14px", borderRadius: "7px", textDecoration: "none", transition: "opacity 0.15s",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >View on GAMES.GG</a>
        <AddToCalendarBtn url={calUrl} />
      </div>
    </div>
  );
}

// ── Event popover ─────────────────────────────────────────────────────────────

function EventPopover({ event, onClose }: { event: GamingEvent; onClose: () => void }) {
  const isSameDay = event.startDate === event.endDate;
  const calUrl = googleCalUrl(event.name, event.startDate, event.endDate, event.description, event.location);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!event.logoUrl && !imgFailed;

  return (
    <div>
      <div style={{ position: "relative", height: "90px", overflow: "hidden", flexShrink: 0 }}>
        {showImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.logoUrl} alt={event.name} onError={() => setImgFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
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
              textTransform: "uppercase", color: event.color, opacity: 0.6 }}>
              {EVENT_TYPE_LABEL[event.type]}
            </span>
          </div>
        )}
        <button onClick={onClose} style={closeButtonStyle}>✕</button>
      </div>
      <div style={{ padding: "12px 16px 14px" }}>
        <span style={{
          display: "inline-block", fontSize: "10px", fontWeight: 700,
          letterSpacing: "0.06em", textTransform: "uppercase",
          color: event.color, padding: "2px 6px",
          background: event.color + "22", borderRadius: "4px",
          border: `1px solid ${event.color}40`, marginBottom: "6px",
        }}>{EVENT_TYPE_LABEL[event.type]}</span>
        <h3 style={{ fontSize: "15px", fontWeight: 700, lineHeight: 1.2, marginBottom: "4px" }}>{event.name}</h3>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "2px" }}>
          {isSameDay ? formatDateLong(event.startDate) : `${formatDateShort(event.startDate)} – ${formatDateShort(event.endDate)}`}
        </p>
        {event.location && (
          <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "8px" }}>{event.location}</p>
        )}
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "12px" }}>
          {event.description}
        </p>
        {event.url && (
          <a href={event.url} target="_blank" rel="noopener noreferrer" style={{
            display: "block", textAlign: "center",
            background: event.color + "20", color: event.color,
            border: `1px solid ${event.color}40`, fontWeight: 700, fontSize: "13px",
            padding: "9px 14px", borderRadius: "7px", textDecoration: "none", transition: "opacity 0.15s",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >Official Website</a>
        )}
        <AddToCalendarBtn url={calUrl} />
      </div>
    </div>
  );
}

// ── Day popover ("+N more" on desktop) ────────────────────────────────────────

function DayPopover({
  dateStr, releases, events, onClose, onOpen,
}: {
  dateStr: string; releases: GameRelease[]; events: GamingEvent[];
  onClose: () => void; onOpen: (item: PopoverItem) => void;
}) {
  const items = [
    ...events.map((e)  => ({ kind: "event" as const, data: e,   color: e.color,     label: e.name })),
    ...releases.map((r) => ({ kind: "game"  as const, data: r,   color: "#52d68a",   label: r.name + " Release" })),
  ];
  return (
    <div>
      <div style={{ padding: "11px 14px 10px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", fontWeight: 700 }}>{formatDateShort(dateStr)} — {items.length} events</span>
        <button onClick={onClose} style={{ background: "none", border: "none",
          color: "var(--text-secondary)", cursor: "pointer", fontSize: "14px", padding: "2px 4px" }}>✕</button>
      </div>
      <div style={{ maxHeight: "min(60vh, 420px)", overflowY: "auto", padding: "6px" }}>
        {items.map((item, i) => (
          <button key={i} onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onOpen(item.kind === "game"
              ? { kind: "game",  data: item.data as GameRelease, anchorRect: rect }
              : { kind: "event", data: item.data as GamingEvent, anchorRect: rect });
          }} style={{
            display: "flex", alignItems: "center", gap: "8px", width: "100%",
            textAlign: "left", padding: "7px 8px", borderRadius: "6px",
            background: "transparent", border: "none", cursor: "pointer",
            marginBottom: "2px", transition: "background 0.1s",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ width: "8px", height: "8px", borderRadius: "2px",
              background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Mobile bottom sheet ───────────────────────────────────────────────────────

function MobileDaySheet({
  dateStr, releases, events, onClose, onOpenItem,
}: {
  dateStr: string; releases: GameRelease[]; events: GamingEvent[];
  onClose: () => void; onOpenItem: (item: PopoverItem) => void;
}) {
  const items = [
    ...events.map((e)  => ({ kind: "event" as const, data: e,   color: e.color,   label: e.name })),
    ...releases.map((r) => ({ kind: "game"  as const, data: r,   color: "#52d68a", label: r.name })),
  ];
  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 150,
      }} />
      {/* Sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "var(--card)", borderTop: "1px solid var(--border)",
        borderRadius: "16px 16px 0 0", zIndex: 200,
        maxHeight: "65vh", display: "flex", flexDirection: "column",
        animation: "slideUp 0.2s ease",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px",
            background: "rgba(255,255,255,0.15)" }} />
        </div>
        {/* Header */}
        <div style={{ padding: "4px 16px 12px", display: "flex",
          justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>{formatDateLong(dateStr)}</p>
            <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "2px 0 0" }}>
              {items.length} event{items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)",
            border: "1px solid var(--border)", borderRadius: "50%", width: "30px",
            height: "30px", color: "var(--text-secondary)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px",
          }}>✕</button>
        </div>
        {/* List */}
        <div style={{ overflowY: "auto", padding: "0 12px 24px" }}>
          {items.map((item, i) => (
            <button key={i} onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onOpenItem(item.kind === "game"
                ? { kind: "game",  data: item.data as GameRelease, anchorRect: rect }
                : { kind: "event", data: item.data as GamingEvent, anchorRect: rect });
            }} style={{
              display: "flex", alignItems: "center", gap: "12px", width: "100%",
              textAlign: "left", padding: "12px", borderRadius: "10px",
              background: "transparent", border: "none", cursor: "pointer",
              marginBottom: "4px", transition: "background 0.1s",
            }}
              onTouchStart={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onTouchEnd={(e)   => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ width: "10px", height: "10px", borderRadius: "3px",
                background: item.color, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: "14px", fontWeight: 600, margin: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </p>
                {item.kind === "game" && (
                  <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: "2px 0 0" }}>
                    Game Release
                  </p>
                )}
                {item.kind === "event" && (
                  <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: "2px 0 0" }}>
                    {EVENT_TYPE_LABEL[(item.data as GamingEvent).type]}
                  </p>
                )}
              </div>
              <div style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: "16px", flexShrink: 0 }}>›</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Popover container ─────────────────────────────────────────────────────────

function CalendarPopover({
  item, onClose, onOpen, isMobile, watchlistToggle, watchlistHas,
}: {
  item: PopoverItem; onClose: () => void;
  onOpen: (item: PopoverItem) => void; isMobile: boolean;
  watchlistToggle: (slug: string) => void; watchlistHas: (slug: string) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = item.kind === "day" ? 270 : 310;
  const style = computePopoverStyle(item.anchorRect, width, isMobile);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown",   onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown",   onKey);
    };
  }, [onClose]);

  return (
    <>
      {isMobile && (
        <div onClick={onClose} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 290,
        }} />
      )}
      <div ref={ref} style={{
        ...style,
        background: "var(--card)", border: "1px solid var(--border-hover)",
        borderRadius: "12px", boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
        overflow: "hidden", animation: "popIn 0.15s ease",
      }}>
        {item.kind === "game"  && <GamePopover  game={item.data}  onClose={onClose}
          onWishlistToggle={watchlistToggle} inWishlist={watchlistHas(item.data.slug)} />}
        {item.kind === "event" && <EventPopover event={item.data} onClose={onClose} />}
        {item.kind === "day"   && (
          <DayPopover dateStr={item.dateStr} releases={item.releases}
            events={item.events} onClose={onClose} onOpen={onOpen} />
        )}
      </div>
    </>
  );
}

// ── Calendar cell ─────────────────────────────────────────────────────────────

const GAME_COLOR_HEX = "#52d68a";

function EventPill({ label, color, isGame, onClick }: {
  label: string; color: string; isGame: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const c = isGame ? GAME_COLOR_HEX : color;
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(e); }} style={{
      width: "100%", textAlign: "left", padding: "2px 5px", borderRadius: "3px",
      fontSize: "10px", lineHeight: "16px",
      background: c + (isGame ? "28" : "22"), color: c,
      overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
      cursor: "pointer", border: `1px solid ${c}40`,
      display: "block", marginBottom: "2px", transition: "opacity 0.1s, transform 0.1s",
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = "0.8";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >{label}</button>
  );
}

function CalendarCell({
  dateStr, day, thisMonth, isToday, releases, events,
  onOpenPopover, onOpenSheet, isMobile,
}: {
  dateStr: string; day: number; thisMonth: boolean; isToday: boolean;
  releases: GameRelease[]; events: GamingEvent[];
  onOpenPopover: (item: PopoverItem) => void;
  onOpenSheet:   (dateStr: string) => void;
  isMobile: boolean;
}) {
  const items = [
    ...events.map((e)  => ({ kind: "event" as const, data: e })),
    ...releases.map((r) => ({ kind: "game"  as const, data: r })),
  ];
  const hasItems = items.length > 0;

  const handleCellClick = () => {
    if (!thisMonth || !isMobile || !hasItems) return;
    onOpenSheet(dateStr);
  };

  return (
    <div onClick={handleCellClick} style={{
      background: "var(--bg)", padding: isMobile ? "4px 3px 3px" : "5px 5px 4px",
      borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
      borderLeft: thisMonth && events.length > 0 ? `2px solid ${events[0].color}55` : "none",
      overflow: "hidden", opacity: thisMonth ? 1 : 0.3, minHeight: 0,
      cursor: isMobile && thisMonth && hasItems ? "pointer" : "default",
    }}>
      {/* Day number */}
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: isMobile ? "22px" : "20px", height: isMobile ? "22px" : "20px",
        borderRadius: "50%", fontSize: isMobile ? "12px" : "11px",
        fontWeight: isToday ? 700 : 500,
        color: isToday ? "#060D17" : hasItems ? "var(--text)" : "var(--text-secondary)",
        background: isToday ? "var(--green)" : "transparent",
        animation: isToday ? "pulseRing 2s ease-out infinite" : "none",
        marginBottom: "3px", flexShrink: 0,
      }}>{day}</div>

      {/* Mobile: colored dots */}
      {isMobile && thisMonth && hasItems && (
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", paddingLeft: "2px" }}>
          {items.slice(0, 3).map((item, i) => (
            <div key={i} style={{
              width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
              background: item.kind === "game" ? GAME_COLOR_HEX : (item.data as GamingEvent).color,
            }} />
          ))}
          {items.length > 3 && (
            <span style={{ fontSize: "8px", color: "var(--text-dim)", lineHeight: "6px" }}>
              +{items.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Desktop: text pills */}
      {!isMobile && thisMonth && (() => {
        const maxVisible = items.length > 2 ? 2 : items.length;
        const visible  = items.slice(0, maxVisible);
        const overflow = items.length - maxVisible;
        return (
          <>
            {visible.map((item, i) => item.kind === "event" ? (
              <EventPill key={`ev-${i}`} label={item.data.name} color={item.data.color} isGame={false}
                onClick={(e) => onOpenPopover({ kind: "event", data: item.data,
                  anchorRect: e.currentTarget.getBoundingClientRect() })} />
            ) : (
              <EventPill key={`g-${i}`} label={`${item.data.name} Release`}
                color="var(--green)" isGame={true}
                onClick={(e) => onOpenPopover({ kind: "game", data: item.data,
                  anchorRect: e.currentTarget.getBoundingClientRect() })} />
            ))}
            {overflow > 0 && (
              <button onClick={(e) => { e.stopPropagation();
                onOpenPopover({ kind: "day", dateStr, releases, events,
                  anchorRect: e.currentTarget.getBoundingClientRect() }); }} style={{
                fontSize: "9px", fontWeight: 700,
                color: "rgba(255,255,255,0.65)",
                background: "rgba(255,255,255,0.09)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: "3px",
                padding: "2px 5px", marginTop: "2px",
                cursor: "pointer", width: "100%", textAlign: "left",
                transition: "background 0.1s",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
              >+{overflow} more</button>
            )}
          </>
        );
      })()}
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
  const [popover, setPopover]   = useState<PopoverItem | null>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);
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
    setPopover(null); setDaySheet(null);
    setSlideDir("right"); setGridKey((k) => k + 1);
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    setPopover(null); setDaySheet(null);
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

  // Mobile day sheet data
  const sheetReleases = daySheet ? (releasesByDate[daySheet] ?? []) : [];
  const sheetEvents   = daySheet
    ? getEventsForDate(daySheet).filter((e) => activeFilters.has(e.type as FilterKey))
    : [];

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
              releases={cellReleases} events={cellEvents}
              onOpenPopover={setPopover} onOpenSheet={setDaySheet}
              isMobile={isMobile}
            />
          );
        })}
      </div>

      </div>{/* end grid card wrapper */}
      </div>{/* end slide animation wrapper */}

      {/* ── Mobile tap hint ── */}
      {isMobile && (
        <p style={{ fontSize: "10px", color: "var(--text-dim)", textAlign: "center",
          margin: "6px 0 0", flexShrink: 0 }}>
          Tap a day to see events
        </p>
      )}

      {/* ── Mobile day sheet ── */}
      {isMobile && daySheet && (sheetReleases.length > 0 || sheetEvents.length > 0) && (
        <MobileDaySheet
          dateStr={daySheet} releases={sheetReleases} events={sheetEvents}
          onClose={() => setDaySheet(null)}
          onOpenItem={(item) => { setDaySheet(null); setPopover(item); }}
        />
      )}

      {/* ── Popover ── */}
      {popover && (
        <CalendarPopover item={popover} onClose={() => setPopover(null)}
          onOpen={setPopover} isMobile={isMobile}
          watchlistToggle={watchlistToggle} watchlistHas={watchlistHas} />
      )}

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
