# OperaGX-Style 3-Panel Layout Design

**Date:** 2026-03-31
**Goal:** Replace the floating day popover with a side-panel day view (OperaGX-style): clicking a date on the monthly grid slides in a day panel showing large game cover art and event cards, and clicking a game slides in a detail panel.

---

## Overview

Two modes:
- **Calendar mode** (default): Full-width monthly grid, unchanged except cells now show colored dots instead of event pills (more compact, cleaner).
- **Day view mode**: When a date is clicked, a day panel slides in from the right. The calendar stays visible on the left (~42% width). If a game or event is clicked in the day panel, a detail panel also slides in (~260px from the right edge).

All three panels are visible simultaneously on desktop when a game is selected.

---

## Layout

```
┌─────────────────────────────┬───────────────────────────┬────────────────┐
│      Calendar Panel         │       Day Panel            │ Detail Panel   │
│      (42% width)            │       (fills rest)         │ (260px)        │
│                             │                            │                │
│  Monthly grid with dots     │  MARCH 31  TODAY  [✕]     │  Game cover    │
│  Clicking date → day panel  │                            │  Title         │
│  Selected date highlighted  │  GAME RELEASES · 8         │  Genre tags    │
│                             │  [cover][cover][cover]     │  Platforms     │
│                             │  [cover][cover][+3 more]   │  Metacritic    │
│                             │                            │  + Watchlist   │
│                             │  EVENTS TODAY · 2          │  + Cal button  │
│                             │  [ESL banner card]         │                │
│                             │  [Convention banner card]  │                │
└─────────────────────────────┴───────────────────────────┴────────────────┘
```

On mobile: Day panel opens as a full-screen overlay (existing mobile behavior adapted).

---

## Components

### 1. Calendar cells (modified)

Replace event pills with colored dot indicators:
- Up to 3 dots (one per event type present: green=release, red=esports, blue=convention, purple=showcase, gold=awards)
- If more than the dot limit: show `+N` in tiny text below dots
- Selected cell: green border + green-tinted background
- Today cell: retains pulse ring animation

### 2. `DayPanel` (new)

Slides in from right when a date is clicked. Contains:

**Header:**
- Date in format `MARCH 31` + `TODAY` badge (if applicable), uppercase bold
- `✕` close button (closes day panel and detail panel)

**Game Releases section:**
- Section label: `GAME RELEASES · N` (count of games)
- 3-column portrait grid of `GameCard` components
- If more than 6 games: last card shows `+N more` placeholder, clicking it shows all in a scrollable expanded state
- Full section scrollable

**Events Today section** (below games, only if events exist):
- Section label: `EVENTS · N`
- Full-width `EventBannerCard` for each event active on that date

### 3. `GameCard` (new)

Portrait card in day panel:
- **Art area**: `background_image` as cover, `aspect-ratio: 3/4`, object-fit cover, object-position top. If null: gradient placeholder with game initials.
- **Watchlist button**: `+` / `✓` overlay top-right corner of art
- **Info strip** below art: game name (truncated), platform tags
- **Active state**: green border highlight when this game's detail panel is open
- **Click**: opens GameDetailPanel with this game's data

### 4. `EventBannerCard` (new)

Full-width card for events in day panel:
- Left: event `logoUrl` image in a 72×72 square. If null: colored square with event type initial.
- Right: event type badge (colored pill), event name bold, date range, location if present
- Left border: 3px in event color
- Click: opens EventDetailPanel (same slot as GameDetailPanel)

### 5. `GameDetailPanel` (new)

Slides in from right (fixed 260px width):
- **Cover**: `background_image`, 130px tall, object-fit cover, gradient fade at bottom. Initials placeholder if null.
- **Body** (scrollable):
  - Tags row: "Game Release" green badge + metacritic badge if present
  - Title (bold, 15px)
  - Date (long format)
  - Genres (dot-separated, dim)
  - `+ Add to Watchlist` / `✓ In Watchlist` button (green styled)
  - Divider
  - Platforms section
  - `+ Add to Google Calendar` button

### 6. `EventDetailPanel` (new, same slot as GameDetailPanel)

- **Cover**: `logoUrl` image (contain mode, dark bg). Placeholder if null.
- **Body**:
  - Event type badge
  - Event name bold
  - Date range + location
  - Description text
  - `+ Add to Google Calendar` button
  - External URL link if present

---

## State

In `CalendarClient`:

```ts
const [selectedDate, setSelectedDate] = useState<string | null>(null);
const [selectedItem, setSelectedItem] = useState<
  | { kind: "game"; data: GameRelease }
  | { kind: "event"; data: GamingEvent }
  | null
>(null);
```

- Click date cell → `setSelectedDate(dateStr)`, clear `selectedItem`
- Click game/event in day panel → `setSelectedItem(...)`
- Click ✕ on day panel → clear both
- Click ✕ on detail panel → clear `selectedItem` only
- Click outside panels → clear both (backdrop click or Escape key)

The existing `PopoverItem` type and floating popover logic (`computePopoverStyle`, `GamePopover`, `EventPopover`, `DayPopover`) are **removed**.

---

## Images

- **Games**: `game.background_image` — already fetched from RAWG/IGDB. Always render art area; show gradient+initials placeholder when null.
- **Events**: `event.logoUrl` — already on most events. Always render image area; show colored placeholder when null. For `EventBannerCard`, use `logoUrl` as a contained square logo. For `EventDetailPanel` cover, use `logoUrl` with contain + dark bg.

---

## Animations

- Day panel: `slideInRight` (translateX 24px → 0, 200ms ease-out)
- Detail panel: same `slideInRight` animation
- Both panels close instantly (no close animation needed)
- Calendar cell dots: no animation
- Selected cell: instant highlight change

---

## What is Removed

- `GamePopover` component
- `EventPopover` component
- `DayPopover` component
- `computePopoverStyle` helper
- `PopoverItem` type
- All `popover` state and click-position tracking
- Event pill rendering in calendar cells (replaced by dots)

---

## What is Kept

- `useWishlist` hook and watchlist drawer (unchanged)
- `GTA6Countdown` (unchanged)
- Filter pills in header (unchanged, still control which event types are shown)
- Month navigation (unchanged)
- `getMonthDays`, `toDateStr`, all date helpers (unchanged)
- `googleCalUrl` helper (used in detail panels)
- Mobile detection hook (adapted for panels)
