"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import type { GameRelease } from "@/lib/releases";
import { deduplicatePlatforms, gamesGgUrl } from "@/lib/releases";
import type { GamingEvent } from "@/lib/events";
import { getEventsForDate } from "@/lib/events";
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

// ── GTA VI Countdown ──────────────────────────────────────────────────────────

const GTA6_RELEASE = new Date("2026-11-19T00:00:00");

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(() => Math.max(0, target.getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setDiff(Math.max(0, target.getTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);
  return {
    days:     Math.floor(diff / 86400000),
    hours:    Math.floor((diff % 86400000) / 3600000),
    minutes:  Math.floor((diff % 3600000)  / 60000),
    seconds:  Math.floor((diff % 60000)    / 1000),
    released: diff === 0,
  };
}

function GTA6Banner({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { days, hours, minutes, seconds, released } = useCountdown(GTA6_RELEASE);
  if (released) return null;
  return (
    <div style={{ background: "oklch(13% 0.03 240)", borderBottom: "1px solid oklch(20% 0.04 240)", padding: "0 20px", flexShrink: 0 }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", gap: "16px", height: collapsed ? "0" : "auto", overflow: "hidden", transition: "height 0.2s" }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "8px 0", flex: 1, flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#666", letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0 }}>GTA VI</span>
            <span style={{ fontSize: "10px", color: "#444", flexShrink: 0 }}>Nov 19, 2026</span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              {([
                [days, "DAYS"], [hours, "HRS"], [minutes, "MIN"], [seconds, "SEC"],
              ] as [number, string][]).map(([val, lbl]) => (
                <div key={lbl} style={{ display: "flex", alignItems: "baseline", gap: "3px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 800, color: "#bbb" }}>{String(val).padStart(lbl === "DAYS" ? 3 : 2, "0")}</span>
                  <span style={{ fontSize: "8px", color: "#444", letterSpacing: "0.06em" }}>{lbl}</span>
                </div>
              ))}
            </div>
            <span style={{ marginLeft: "auto", fontSize: "9px", color: "#333", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Rockstar Games</span>
          </div>
        )}
      </div>
      {/* toggle strip */}
      <button
        type="button" onClick={onToggle}
        style={{ display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: "3px 0", fontSize: "8px", color: "#333", letterSpacing: "0.06em" }}
      >{collapsed ? "▸ GTA VI countdown" : "▴ hide"}</button>
    </div>
  );
}

// ── Game detail modal ─────────────────────────────────────────────────────────

function GameDetailModal({
  game, inWatchlist, onWatchlistToggle, onClose,
}: {
  game: GameRelease; inWatchlist: boolean;
  onWatchlistToggle: (slug: string) => void;
  onClose: () => void;
}) {
  const platforms = deduplicatePlatforms(game.platforms);
  const calUrl    = googleCalUrl(
    `${game.name} — Release`, game.released, game.released,
    `${game.name} releases today. View on GAMES.GG: ${gamesGgUrl(game.slug)}`,
  );
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 290, backdropFilter: "blur(4px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "calc(100vw - 32px)", maxWidth: "480px", maxHeight: "90vh", zIndex: 300, borderRadius: "16px", overflow: "hidden", display: "flex", flexDirection: "column", background: "oklch(15% 0.04 240)", border: "1px solid oklch(28% 0.06 240)", boxShadow: "0 32px 80px rgba(0,0,0,0.8)", animation: "popIn 0.15s ease" }}>
        {/* Cover */}
        <div style={{ position: "relative", height: "220px", flexShrink: 0, overflow: "hidden" }}>
          {game.background_image && !imgFailed ? (
            <>
              <Image src={game.background_image} alt={game.name} fill style={{ objectFit: "cover", objectPosition: "top" }} sizes="480px" onError={() => setImgFailed(true)} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 25%, oklch(15% 0.04 240) 100%)" }} />
            </>
          ) : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, oklch(22% 0.07 240), oklch(12% 0.04 240))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "56px", fontWeight: 800, color: "oklch(83% 0.22 158 / 0.12)", letterSpacing: "-0.04em" }}>{game.name.slice(0, 2).toUpperCase()}</span>
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
          <h2 style={{ fontSize: "22px", fontWeight: 800, lineHeight: 1.15, marginBottom: "4px" }}>{game.name}</h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>{formatDateLong(game.released)}</p>
          {game.genres.length > 0 && <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "16px" }}>{game.genres.slice(0, 4).join(" · ")}</p>}
          <button type="button" onClick={() => onWatchlistToggle(game.slug)} style={{ width: "100%", padding: "11px 14px", borderRadius: "9px", fontWeight: 700, fontSize: "14px", cursor: "pointer", border: "1px solid", background: inWatchlist ? "oklch(83% 0.22 158 / 0.15)" : "oklch(83% 0.22 158 / 0.08)", color: "var(--green)", borderColor: inWatchlist ? "oklch(83% 0.22 158 / 0.5)" : "oklch(83% 0.22 158 / 0.3)", marginBottom: "10px", transition: "all 0.15s" }}>
            {inWatchlist ? "✓ In Watchlist" : "+ Add to Watchlist"}
          </button>
          {platforms.length > 0 && (
            <>
              <div style={{ height: "1px", background: "oklch(22% 0.05 240)", margin: "4px 0 12px" }} />
              <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "8px" }}>Platforms</p>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
                {platforms.map((p) => <span key={p} style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "5px", background: "rgba(255,255,255,0.07)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.1)", textTransform: "uppercase" }}>{p}</span>)}
              </div>
            </>
          )}
          <a href={gamesGgUrl(game.slug)} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: "var(--green)", color: "#060D17", fontWeight: 700, fontSize: "14px", padding: "11px 14px", borderRadius: "9px", textDecoration: "none", transition: "opacity 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>View on GAMES.GG</a>
          <a href={calUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid oklch(22% 0.05 240)", fontWeight: 600, fontSize: "13px", padding: "9px 14px", borderRadius: "9px", textDecoration: "none", marginTop: "8px" }}>+ Add to Google Calendar</a>
        </div>
      </div>
    </>
  );
}

// ── Event detail modal ────────────────────────────────────────────────────────

function EventDetailModal({ event, onClose }: { event: GamingEvent; onClose: () => void }) {
  const isSameDay = event.startDate === event.endDate;
  const calUrl    = googleCalUrl(event.name, event.startDate, event.endDate, event.description, event.location);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!event.logoUrl && !imgFailed;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 290, backdropFilter: "blur(4px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "calc(100vw - 32px)", maxWidth: "480px", maxHeight: "90vh", zIndex: 300, borderRadius: "16px", overflow: "hidden", display: "flex", flexDirection: "column", background: "oklch(15% 0.04 240)", border: "1px solid oklch(28% 0.06 240)", boxShadow: "0 32px 80px rgba(0,0,0,0.8)", animation: "popIn 0.15s ease" }}>
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
              <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: event.color, opacity: 0.6 }}>{EVENT_TYPE_LABEL[event.type]}</span>
            </div>
          )}
          <button type="button" onClick={onClose} style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(6,13,23,0.75)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", width: "30px", height: "30px", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
          <span style={{ display: "inline-block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: event.color, padding: "2px 7px", background: event.color + "22", borderRadius: "4px", border: `1px solid ${event.color}40`, marginBottom: "10px" }}>{EVENT_TYPE_LABEL[event.type]}</span>
          <h2 style={{ fontSize: "20px", fontWeight: 800, lineHeight: 1.2, marginBottom: "4px" }}>{event.name}</h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "2px" }}>
            {isSameDay ? formatDateLong(event.startDate) : `${formatDateShort(event.startDate)} – ${formatDateShort(event.endDate)}`}
          </p>
          {event.location && <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "12px" }}>{event.location}</p>}
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: "16px" }}>{event.description}</p>
          {event.url && <a href={event.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: event.color + "1a", color: event.color, border: `1px solid ${event.color}40`, fontWeight: 700, fontSize: "13px", padding: "10px 14px", borderRadius: "9px", textDecoration: "none", marginBottom: "8px" }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>Official Website ↗</a>}
          <a href={calUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid oklch(22% 0.05 240)", fontWeight: 600, fontSize: "13px", padding: "9px 14px", borderRadius: "9px", textDecoration: "none" }}>+ Add to Google Calendar</a>
        </div>
      </div>
    </>
  );
}

// ── Watchlist modal ───────────────────────────────────────────────────────────

function WatchlistModal({ slugs, releases, onClose, onRemove }: { slugs: string[]; releases: GameRelease[]; onClose: () => void; onRemove: (slug: string) => void }) {
  const releaseMap = new Map(releases.map((r) => [r.slug, r]));
  const saved = slugs.map((s) => releaseMap.get(s)).filter((r): r is GameRelease => !!r).sort((a, b) => a.released.localeCompare(b.released));
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 280, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "calc(100vw - 32px)", maxWidth: "440px", maxHeight: "80vh", background: "oklch(15% 0.04 240)", border: "1px solid oklch(28% 0.06 240)", borderRadius: "16px", zIndex: 290, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.75)", animation: "popIn 0.15s ease" }}>
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
      </div>
    </>
  );
}

// ── Game feed tile ────────────────────────────────────────────────────────────

function GameFeedTile({ game, isSelected, inWatchlist, onSelect, onWatchlistToggle }: { game: GameRelease; isSelected: boolean; inWatchlist: boolean; onSelect: () => void; onWatchlistToggle: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const platforms = deduplicatePlatforms(game.platforms).slice(0, 3);

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
            <span style={{ fontSize: "28px", fontWeight: 800, color: "oklch(83% 0.22 158 / 0.15)", letterSpacing: "-0.04em" }}>{game.name.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 40%, rgba(4,8,16,0.96) 100%)" }} />
        {/* Platform tags */}
        {platforms.length > 0 && (
          <div style={{ position: "absolute", top: "7px", left: "7px", display: "flex", flexDirection: "column", gap: "3px" }}>
            {platforms.map((p) => <span key={p} style={{ fontSize: "8px", fontWeight: 700, padding: "2px 6px", borderRadius: "3px", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", color: "#ccc", letterSpacing: "0.04em", textTransform: "uppercase" }}>{p}</span>)}
          </div>
        )}
        {/* Name */}
        <div style={{ position: "absolute", bottom: "30px", left: "8px", right: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff", lineHeight: 1.25, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>{game.name}</span>
        </div>
        {/* Watchlist */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onWatchlistToggle(); }} style={{ position: "absolute", bottom: "7px", right: "7px", width: "24px", height: "24px", borderRadius: "50%", background: inWatchlist ? "oklch(83% 0.22 158 / 0.3)" : "rgba(4,8,16,0.78)", border: inWatchlist ? "1px solid oklch(83% 0.22 158 / 0.6)" : "1px solid rgba(255,255,255,0.2)", color: inWatchlist ? "var(--green)" : "#777", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", transition: "all 0.15s" }}>{inWatchlist ? "✓" : "+"}</button>
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
    <div
      onClick={onSelect}
      style={{ display: "flex", cursor: "pointer", borderRadius: "10px", overflow: "hidden", border: "1px solid oklch(20% 0.04 240)", background: "oklch(13% 0.03 240)", marginBottom: "8px", transition: "border-color 0.15s, transform 0.15s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "oklch(28% 0.06 240)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "oklch(20% 0.04 240)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      <div style={{ width: "4px", background: event.color, flexShrink: 0 }} />
      <div style={{ width: "64px", height: "64px", flexShrink: 0, background: showImg ? "oklch(11% 0.03 240)" : `${event.color}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.logoUrl} alt={event.name} onError={() => setImgFailed(true)} style={{ width: "100%", height: "100%", objectFit: "contain", padding: "8px" }} />
        ) : (
          <span style={{ fontSize: "8px", fontWeight: 700, color: event.color, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", padding: "4px" }}>{EVENT_TYPE_LABEL[event.type]}</span>
        )}
      </div>
      <div style={{ padding: "12px 14px", flex: 1, minWidth: 0 }}>
        <span style={{ display: "inline-block", fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: event.color, padding: "2px 6px", background: event.color + "1a", borderRadius: "3px", border: `1px solid ${event.color}35`, marginBottom: "4px" }}>{EVENT_TYPE_LABEL[event.type]}</span>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "2px" }}>{event.name}</div>
        <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
          {isSameDay ? formatDateShort(event.startDate) : `${formatDateShort(event.startDate)} – ${formatDateShort(event.endDate)}`}
          {event.location && ` · ${event.location}`}
        </div>
      </div>
    </div>
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
  const [selectedItem, setSelectedItem] = useState<
    | { kind: "game";  data: GameRelease }
    | { kind: "event"; data: GamingEvent }
    | null
  >(null);
  const [watchlistOpen,  setWatchlistOpen]  = useState(false);
  const [filtersOpen,    setFiltersOpen]    = useState(false);
  const [countdownHidden, setCountdownHidden] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(
    () => new Set(ALL_FILTER_KEYS)
  );

  const { slugs: watchlistSlugs, toggle: watchlistToggle, has: watchlistHas, remove: watchlistRemove } = useWishlist();
  const feedRef = useRef<HTMLDivElement>(null);

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
      if (selectedItem)   { setSelectedItem(null);   return; }
      if (watchlistOpen)  { setWatchlistOpen(false);  return; }
      if (filtersOpen)    { setFiltersOpen(false);    return; }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedItem, watchlistOpen, filtersOpen]);

  const prevMonth = useCallback(() => {
    setSelectedItem(null);
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    if (year === 2026 && month === 12) return;
    setSelectedItem(null);
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }, [month, year]);

  // Scroll to top of feed on month change
  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [year, month]);

  // Build feed days
  const daysInMonth = new Date(year, month, 0).getDate();
  type DayData = { dateStr: string; day: number; releases: GameRelease[]; events: GamingEvent[] };
  const feedDays: DayData[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(year, month, d);
    const dayRels = activeFilters.has("release") ? releases.filter((r) => r.released === dateStr) : [];
    const dayEvts = getEventsForDate(dateStr).filter((e) => activeFilters.has(e.type as FilterKey));
    if (dayRels.length > 0 || dayEvts.length > 0) {
      feedDays.push({ dateStr, day: d, releases: dayRels, events: dayEvts });
    }
  }

  const atMonthEnd = year === 2026 && month === 12;

  // ── Topbar ──
  const navBtn = (onClick: () => void, label: string, disabled = false): React.ReactNode => (
    <button type="button" onClick={onClick} disabled={disabled} style={{ background: "none", border: "none", color: disabled ? "#2a2a2a" : "#666", cursor: disabled ? "default" : "pointer", fontSize: "22px", padding: "4px 10px", lineHeight: 1, flexShrink: 0 }}>{label}</button>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Top bar ── */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid oklch(17% 0.04 240)", background: "oklch(10% 0.025 240)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}>
          {/* Row 1: nav + watchlist */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 0 0" }}>
            {navBtn(prevMonth, "‹")}
            <span style={{ fontSize: isMobile ? "18px" : "22px", fontWeight: 700, minWidth: isMobile ? "130px" : "160px", textAlign: "center" }}>
              {MONTH_NAMES[month - 1]}{" "}
              <span style={{ fontWeight: 300, color: "#555" }}>{year}</span>
            </span>
            {navBtn(nextMonth, "›", atMonthEnd)}

            <div style={{ flex: 1 }} />

            <button type="button" onClick={() => setWatchlistOpen(true)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", background: watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.1)" : "oklch(13% 0.03 240)", border: `1px solid ${watchlistSlugs.length > 0 ? "oklch(83% 0.22 158 / 0.3)" : "oklch(20% 0.04 240)"}`, color: watchlistSlugs.length > 0 ? "var(--green)" : "#888", cursor: "pointer", fontSize: "13px", fontWeight: 600, flexShrink: 0, transition: "all 0.15s" }}>
              Watchlist
              {watchlistSlugs.length > 0 && <span style={{ fontSize: "11px", fontWeight: 700, background: "oklch(83% 0.22 158 / 0.2)", borderRadius: "10px", padding: "1px 7px" }}>{watchlistSlugs.length}</span>}
            </button>
          </div>

          {/* Row 2: filter pills */}
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "6px" : "8px", padding: "8px 0 10px", overflowX: "auto", scrollbarWidth: "none" }}>
            {FILTERS.map((f) => {
              const on = activeFilters.has(f.key);
              return (
                <button
                  key={f.key} type="button"
                  onClick={() => toggleFilter(f.key)}
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: isMobile ? "5px 10px" : "5px 12px", borderRadius: "20px", border: `1px solid ${on ? f.color + "55" : "oklch(20% 0.04 240)"}`, background: on ? f.color + "14" : "transparent", cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}
                >
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: on ? f.color : "#2a2a2a", transition: "background 0.15s", flexShrink: 0 }} />
                  <span style={{ fontSize: isMobile ? "11px" : "12px", fontWeight: on ? 600 : 400, color: on ? "#ccc" : "#3a3a3a", transition: "color 0.15s", whiteSpace: "nowrap" }}>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── GTA VI Countdown ── */}
      <GTA6Banner collapsed={countdownHidden} onToggle={() => setCountdownHidden((v) => !v)} />

      {/* ── Day feed ── */}
      <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px 40px" : "28px 20px 48px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          {feedDays.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-dim)" }}>
              <p style={{ fontSize: "16px", fontWeight: 600 }}>Nothing scheduled for {MONTH_NAMES[month - 1]} {year}</p>
              <p style={{ fontSize: "13px", marginTop: "6px" }}>Try toggling filters or browsing another month.</p>
            </div>
          ) : feedDays.map(({ dateStr, day, releases: dayRels, events: dayEvts }) => {
            const isToday = dateStr === todayStr;
            const weekday = getWeekday(dateStr);

            return (
              <div key={dateStr} style={{ marginBottom: isMobile ? "40px" : "52px" }}>
                {/* Day header */}
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid oklch(17% 0.04 240)" }}>
                  <span style={{ fontSize: isMobile ? "40px" : "52px", fontWeight: 900, lineHeight: 1, color: isToday ? "oklch(83% 0.22 158)" : "#2a2a2a" }}>{day}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                    <span style={{ fontSize: isMobile ? "13px" : "15px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: isToday ? "oklch(83% 0.22 158 / 0.8)" : "#4a4a4a" }}>{weekday}</span>
                    <span style={{ fontSize: "11px", color: "#333" }}>{MONTH_NAMES[month - 1]} {year}</span>
                  </div>
                  {isToday && (
                    <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--green)", background: "oklch(83% 0.22 158 / 0.1)", padding: "3px 10px", borderRadius: "4px", border: "1px solid oklch(83% 0.22 158 / 0.2)" }}>TODAY</span>
                  )}
                </div>

                {/* Events */}
                {dayEvts.length > 0 && (
                  <div style={{ marginBottom: dayRels.length > 0 ? "14px" : "0", maxWidth: "640px" }}>
                    {dayEvts.map((event) => (
                      <EventFeedRow key={event.id} event={event} onSelect={() => setSelectedItem({ kind: "event", data: event })} />
                    ))}
                  </div>
                )}

                {/* Game releases */}
                {dayRels.length > 0 && (
                  <>
                    {dayEvts.length > 0 && (
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#333", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>
                        Game Releases · {dayRels.length}
                      </p>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(auto-fill, minmax(130px, 1fr))" : "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
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
        />
      )}

      {selectedItem?.kind === "event" && (
        <EventDetailModal event={selectedItem.data} onClose={() => setSelectedItem(null)} />
      )}

      {watchlistOpen && (
        <WatchlistModal slugs={watchlistSlugs} releases={releases} onClose={() => setWatchlistOpen(false)} onRemove={watchlistRemove} />
      )}
    </div>
  );
}
