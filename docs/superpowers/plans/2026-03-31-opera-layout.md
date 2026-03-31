# OperaGX-Style Day Panel Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace floating popovers with a 3-panel layout: monthly calendar | day view (game art grid + event cards) | game/event detail panel.

**Architecture:** All changes live in `components/CalendarClient.tsx`. Remove the old `PopoverItem`/`GamePopover`/`EventPopover`/`DayPopover`/`CalendarPopover`/`MobileDaySheet`/`EventPill` system. Add `selectedDate` + `selectedItem` state. Add five new components: `GameCard`, `EventBannerCard`, `DayPanel`, `GameDetailPanel`, `EventDetailPanel`. Desktop layout becomes a flex row with up to three panels; mobile keeps a bottom sheet for the day list and a full-screen overlay for the detail.

**Tech Stack:** Next.js 16.2.1 App Router, React 19, TypeScript, inline styles (no Tailwind in this file), `next/image` for game covers.

---

## File Structure

- **Modify only:** `components/CalendarClient.tsx`
  - Remove: `PopoverItem` type, `computePopoverStyle`, `EventPill`, `DayPopover`, `MobileDaySheet`, `CalendarPopover`, `GamePopover`, `EventPopover`
  - Add: `GameCard`, `EventBannerCard`, `DayPanel`, `GameDetailPanel`, `EventDetailPanel`
  - Modify: `CalendarCell` (dots-only, `onSelectDate` prop), `CalendarClient` (new state + layout)

---

## Task 1: Remove old popover system + rewrite CalendarCell to dots

**Files:**
- Modify: `components/CalendarClient.tsx`

- [ ] **Step 1: Delete the `PopoverItem` type and `computePopoverStyle` function**

  In `CalendarClient.tsx`, delete lines 15–18 (the `PopoverItem` type) and lines 117–136 (the `computePopoverStyle` function). Also delete the `closeButtonStyle` const and `AddToCalendarBtn` component — they will be rebuilt in later tasks. Keep `PlatformTag` — it's still used.

  The `AddToCalendarBtn` will be rewritten as an inline `<a>` in the new detail panels.

- [ ] **Step 2: Delete old popover components**

  Delete the following complete function definitions:
  - `GamePopover` (lines ~181–266)
  - `EventPopover` (lines ~270–334)
  - `DayPopover` (lines ~338–383)
  - `MobileDaySheet` (lines ~387–473)
  - `CalendarPopover` (lines ~477–524)
  - `EventPill` (lines ~531–554)

- [ ] **Step 3: Rewrite `CalendarCell` to use dots only**

  Replace the entire `CalendarCell` function with this:

  ```tsx
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
  ```

- [ ] **Step 4: Update `CalendarClient` state**

  In the `CalendarClient` function body, replace:
  ```tsx
  const [popover, setPopover]   = useState<PopoverItem | null>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);
  ```
  With:
  ```tsx
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<
    | { kind: "game";  data: GameRelease }
    | { kind: "event"; data: GamingEvent }
    | null
  >(null);
  ```

- [ ] **Step 5: Update `prevMonth` and `nextMonth` to clear new state**

  Replace the two callbacks:
  ```tsx
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
  ```

- [ ] **Step 6: Update mobile/day-sheet variables that referenced old state**

  Find and delete these two variables (they referenced `daySheet` which no longer exists):
  ```tsx
  const sheetReleases = daySheet ? (releasesByDate[daySheet] ?? []) : [];
  const sheetEvents   = daySheet
    ? getEventsForDate(daySheet).filter((e) => activeFilters.has(e.type as FilterKey))
    : [];
  ```

- [ ] **Step 7: Update the `CalendarCell` call site in the render loop**

  Find the `cells.map(...)` block and update `CalendarCell` props:
  ```tsx
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
  ```

- [ ] **Step 8: Remove old JSX from the render return**

  In the return JSX, delete:
  - The `{isMobile && (...tap hint...)}` paragraph
  - The `{isMobile && daySheet && ... <MobileDaySheet ...>}` block
  - The `{popover && <CalendarPopover ...>}` block

  Keep the `{watchlistOpen && <WatchlistPanel ...>}` block.

- [ ] **Step 9: Build to verify no TypeScript errors**

  ```bash
  cd /Users/og/Desktop/Claude/calendar && npm run build 2>&1 | tail -20
  ```
  Expected: `✓ Compiled successfully` (or type errors only from missing components — new components come in Tasks 2–6).

- [ ] **Step 10: Commit**

  ```bash
  git add components/CalendarClient.tsx
  git commit -m "refactor: remove popover system, rewrite CalendarCell to dots

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Task 2: Add `GameDetailPanel` component

**Files:**
- Modify: `components/CalendarClient.tsx` (add component before `CalendarClient` function)

- [ ] **Step 1: Add `AddToCalendarBtn` helper back (simplified)**

  Add this small helper right before the `// ── Game detail panel` comment you'll add next:

  ```tsx
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
  ```

- [ ] **Step 2: Add `GameDetailPanel` component**

  ```tsx
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
          <button onClick={onClose} style={{
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
          <button onClick={() => onWatchlistToggle(game.slug)} style={{
            width: "100%", padding: "7px 12px", borderRadius: "7px",
            fontWeight: 700, fontSize: "12px", cursor: "pointer",
            border: "1px solid",
            background: inWatchlist ? "oklch(83% 0.22 158 / 0.15)" : "oklch(83% 0.22 158 / 0.08)",
            color: inWatchlist ? "var(--green)" : "var(--green)",
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
  ```

- [ ] **Step 3: Build**

  ```bash
  npm run build 2>&1 | tail -20
  ```
  Expected: `✓ Compiled successfully` (warnings OK, errors not OK)

- [ ] **Step 4: Commit**

  ```bash
  git add components/CalendarClient.tsx
  git commit -m "feat: add GameDetailPanel component

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Task 3: Add `EventDetailPanel` component

**Files:**
- Modify: `components/CalendarClient.tsx`

- [ ] **Step 1: Add `EventDetailPanel` component** (add right after `GameDetailPanel`)

  ```tsx
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
          <button onClick={onClose} style={{
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
  ```

- [ ] **Step 2: Build**

  ```bash
  npm run build 2>&1 | tail -20
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add components/CalendarClient.tsx
  git commit -m "feat: add EventDetailPanel component

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Task 4: Add `GameCard` and `EventBannerCard` components

**Files:**
- Modify: `components/CalendarClient.tsx`

- [ ] **Step 1: Add `GameCard` component** (add before `GameDetailPanel`)

  ```tsx
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
  ```

- [ ] **Step 2: Add `EventBannerCard` component** (add right after `GameCard`)

  ```tsx
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
  ```

- [ ] **Step 3: Build**

  ```bash
  npm run build 2>&1 | tail -20
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add components/CalendarClient.tsx
  git commit -m "feat: add GameCard and EventBannerCard components

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Task 5: Add `DayPanel` component

**Files:**
- Modify: `components/CalendarClient.tsx`

- [ ] **Step 1: Add `DayPanel` component** (add right before `// ── Main calendar`)

  ```tsx
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
          <button onClick={onClose} style={{
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
  ```

- [ ] **Step 2: Build**

  ```bash
  npm run build 2>&1 | tail -20
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add components/CalendarClient.tsx
  git commit -m "feat: add DayPanel component

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Task 6: Wire layout, mobile overlay, Escape key, push

**Files:**
- Modify: `components/CalendarClient.tsx`

- [ ] **Step 1: Derive `selectedItemKey` helper and filtered data for day panel**

  Inside `CalendarClient` function body, after the `releasesByDate` block, add:

  ```tsx
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
  ```

- [ ] **Step 2: Add Escape key handler**

  Inside `CalendarClient`, after the `resetFilters` callback, add:

  ```tsx
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
  ```

- [ ] **Step 3: Restructure the render return**

  Replace the entire `return (...)` block in `CalendarClient` with the following. This preserves all the existing header/filter/countdown content but wraps the grid + new panels in a flex row:

  ```tsx
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
          <span style={{ fontSize: isMobile ? "13px" : "14px", color: "var(--text-dim)" }}>
            {year}
          </span>
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
                background: "rgba(82,214,138,0.25)",
                borderRadius: "10px", padding: "1px 6px",
                minWidth: "18px", textAlign: "center",
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
              event={selectedItem.data as GamingEvent}
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
              <button onClick={() => { setSelectedDate(null); setSelectedItem(null); }} style={{
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
                <button key={i} onClick={() => setSelectedItem(
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
                      {item.kind === "game" ? "Game Release" : EVENT_TYPE_LABEL[(item.data as GamingEvent).type]}
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
                event={selectedItem.data as GamingEvent}
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
  ```

- [ ] **Step 4: Build — must pass cleanly**

  ```bash
  cd /Users/og/Desktop/Claude/calendar && npm run build 2>&1
  ```
  Expected: `✓ Compiled successfully` with `✓ Generating static pages`. No type errors, no unused variable errors.

- [ ] **Step 5: Commit and push**

  ```bash
  git add components/CalendarClient.tsx
  git commit -m "feat: 3-panel OperaGX-style layout with day + detail panels

  - Click date → day panel slides in (game art grid + event cards)
  - Click game → detail panel with cover, genres, watchlist, cal link
  - Click event → detail panel with logo, description, website link
  - Calendar cells now use dots instead of pills (cleaner)
  - All images always shown with placeholder fallback
  - Mobile: bottom sheet + center modal overlay preserved
  - Escape key closes panels

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  git push origin main
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Calendar cells → colored dots
- ✅ DayPanel slides in (slideLeft animation) with game art 3-col grid
- ✅ Events shown as EventBannerCard below games
- ✅ GameDetailPanel (260px, cover, genres, platforms, watchlist, cal)
- ✅ EventDetailPanel (logo, type badge, description, website, cal)
- ✅ All images always rendered (placeholder when null)
- ✅ Watchlist + button on every GameCard
- ✅ `isSelected` highlighting on GameCard and EventBannerCard
- ✅ Mobile bottom sheet + center modal preserved
- ✅ Escape closes panels
- ✅ Month navigation clears selectedDate + selectedItem
- ✅ Watchlist drawer unchanged
- ✅ GTA countdown unchanged
- ✅ Filters unchanged

**Placeholder scan:** No TBD/TODO. All code blocks are complete.

**Type consistency:** `selectedItem` uses `{ kind: "game"; data: GameRelease } | { kind: "event"; data: GamingEvent }` throughout. `selectedItemKey` = `game-${slug}` or `event-${id}` — matches `DayPanel`'s comparison logic.
