# Gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add wishlist tracking, a GTA VI release countdown banner, and visual delight micro-animations to the gaming calendar.

**Architecture:** Wishlist state lives in a new `lib/wishlist.ts` hook (localStorage, no backend). The GTA VI countdown and wishlist panel are new components added to `CalendarClient.tsx`. Visual delight is a mix of CSS keyframes in `globals.css` and inline style/state changes in `CalendarClient.tsx`.

**Tech Stack:** React (useState, useEffect, useRef, useCallback), localStorage, CSS keyframes, Next.js 16 App Router, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `lib/wishlist.ts` | **Create** — `useWishlist()` hook wrapping localStorage |
| `components/CalendarClient.tsx` | **Modify** — add GTA6Countdown, WishlistPanel, "+" button, animations |
| `app/globals.css` | **Modify** — add pulse, slideLeft, slideRight, confetti keyframes |

---

### Task 1: Wishlist hook

**Files:**
- Create: `lib/wishlist.ts`

- [ ] **Create `lib/wishlist.ts` with the following content:**

```typescript
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "calendar_wishlist";

function readStorage(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function useWishlist() {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    setSlugs(readStorage());
  }, []);

  const add = useCallback((slug: string) => {
    setSlugs((prev) => {
      if (prev.includes(slug)) return prev;
      const next = [...prev, slug];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const remove = useCallback((slug: string) => {
    setSlugs((prev) => {
      const next = prev.filter((s) => s !== slug);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggle = useCallback((slug: string) => {
    setSlugs((prev) => {
      const next = prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const has = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  return { slugs, add, remove, toggle, has };
}
```

- [ ] **Commit**

```bash
git add lib/wishlist.ts
git commit -m "Add useWishlist hook with localStorage persistence"
```

---

### Task 2: GTA VI countdown banner

**Files:**
- Modify: `components/CalendarClient.tsx` — add `GTA6Countdown` component and render it between filter row and grid wrapper

- [ ] **Add this component just above the `// ── Filter legend ──` comment in `CalendarClient.tsx`:**

```tsx
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

  if (released) {
    return (
      <div style={{
        background: "linear-gradient(90deg, #1a0a0a 0%, #2d0a0a 50%, #1a0a0a 100%)",
        border: "1px solid #8b1a1a", borderRadius: "8px",
        padding: "10px 16px", marginBottom: "10px",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "8px", flexShrink: 0,
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#ff4444" }}>
          GTA VI IS OUT NOW 🎮
        </span>
      </div>
    );
  }

  const unit = (val: number, label: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "36px" }}>
      <span style={{ fontSize: "16px", fontWeight: 800, color: "#ff4444", lineHeight: 1 }}>
        {String(val).padStart(2, "0")}
      </span>
      <span style={{ fontSize: "8px", fontWeight: 600, color: "#8b1a1a",
        textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>
        {label}
      </span>
    </div>
  );

  return (
    <div style={{
      background: "linear-gradient(90deg, #0f0505 0%, #1f0808 40%, #1f0808 60%, #0f0505 100%)",
      border: "1px solid #4a0e0e", borderRadius: "8px",
      padding: "8px 14px", marginBottom: "10px",
      display: "flex", alignItems: "center", gap: "12px",
      flexShrink: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: "10px", fontWeight: 800, color: "#cc2222",
          textTransform: "uppercase", letterSpacing: "0.1em", lineHeight: 1 }}>
          GTA VI
        </span>
        <span style={{ fontSize: "9px", color: "#6b1a1a", marginTop: "2px" }}>Nov 19, 2026</span>
      </div>
      <div style={{ width: "1px", height: "28px", background: "#4a0e0e" }} />
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {unit(days,    "days")}
        <span style={{ color: "#4a0e0e", fontWeight: 700, marginBottom: "10px" }}>:</span>
        {unit(hours,   "hrs")}
        <span style={{ color: "#4a0e0e", fontWeight: 700, marginBottom: "10px" }}>:</span>
        {unit(minutes, "min")}
        <span style={{ color: "#4a0e0e", fontWeight: 700, marginBottom: "10px" }}>:</span>
        {unit(seconds, "sec")}
      </div>
      <div style={{ marginLeft: "auto", fontSize: "9px", color: "#4a0e0e",
        fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Rockstar Games
      </div>
    </div>
  );
}
```

- [ ] **In the `CalendarClient` return JSX, add `<GTA6Countdown />` between the filter row div and the grid card wrapper div:**

```tsx
      {/* ── GTA VI Countdown ── */}
      <GTA6Countdown />

      {/* ── Grid card wrapper ── */}
```

- [ ] **Verify it renders by running `npm run dev` and checking the calendar**

- [ ] **Commit**

```bash
git add components/CalendarClient.tsx
git commit -m "Add GTA VI live countdown banner"
```

---

### Task 3: "+" wishlist button on game popovers

**Files:**
- Modify: `components/CalendarClient.tsx` — import `useWishlist`, thread it into `GamePopover`, add toggle button

- [ ] **Add import at the top of `CalendarClient.tsx`:**

```tsx
import { useWishlist } from "@/lib/wishlist";
```

- [ ] **Update `GamePopover` signature to accept wishlist props:**

Find:
```tsx
function GamePopover({ game, onClose }: { game: GameRelease; onClose: () => void }) {
```

Replace with:
```tsx
function GamePopover({ game, onClose, onWishlistToggle, inWishlist }: {
  game: GameRelease; onClose: () => void;
  onWishlistToggle: (slug: string) => void; inWishlist: boolean;
}) {
```

- [ ] **Add the wishlist button inside `GamePopover`, next to the close button (after `<button onClick={onClose} style={closeButtonStyle}>✕</button>`):**

```tsx
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
```

- [ ] **In `CalendarClient`, call `useWishlist()`:**

```tsx
  const { slugs: wishlistSlugs, toggle: wishlistToggle, has: wishlistHas } = useWishlist();
```

- [ ] **Find where `GamePopover` is rendered in `CalendarPopover` and pass the new props:**

Find:
```tsx
        {item.kind === "game"  && <GamePopover  game={item.data}  onClose={onClose} />}
```

Replace with:
```tsx
        {item.kind === "game"  && <GamePopover  game={item.data}  onClose={onClose}
          onWishlistToggle={wishlistToggle}
          inWishlist={wishlistHas(item.data.slug)} />}
```

- [ ] **Commit**

```bash
git add components/CalendarClient.tsx lib/wishlist.ts
git commit -m "Add + wishlist button to game popovers"
```

---

### Task 4: Wishlist header icon and slide-out panel

**Files:**
- Modify: `components/CalendarClient.tsx` — add `WishlistPanel` component, header icon with count badge, panel open state

- [ ] **Add `WishlistPanel` component just above `// ── Main calendar ──`:**

```tsx
// ── Wishlist panel ────────────────────────────────────────────────────────────

function WishlistPanel({
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
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 250,
      }} />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "300px",
        background: "var(--card)", borderLeft: "1px solid var(--border-hover)",
        zIndex: 260, display: "flex", flexDirection: "column",
        boxShadow: "-12px 0 40px rgba(0,0,0,0.6)",
        animation: "slideInRight 0.2s ease",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: "14px" }}>
            My Wishlist {saved.length > 0 && (
              <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>
                ({saved.length})
              </span>
            )}
          </span>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)",
            borderRadius: "50%", width: "28px", height: "28px",
            color: "var(--text-secondary)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px",
          }}>✕</button>
        </div>
        {/* List */}
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
```

- [ ] **Add `slideInRight` keyframe to `app/globals.css`:**

```css
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
```

- [ ] **Add wishlist panel open state in `CalendarClient`:**

```tsx
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const { slugs: wishlistSlugs, toggle: wishlistToggle, has: wishlistHas, remove: wishlistRemove } = useWishlist();
```

(Remove the earlier `useWishlist` call from Task 3 and replace with this combined one.)

- [ ] **Add the wishlist icon button to the nav row in `CalendarClient`, after the `‹` button and before the month heading. Insert it on the right side, right before the `›` button:**

```tsx
        {/* Wishlist icon — right side of nav */}
        <div style={{ position: "absolute", right: "44px", display: "flex", alignItems: "center" }}>
          <button onClick={() => setWishlistOpen(true)} style={{
            background: wishlistSlugs.length > 0 ? "rgba(82,214,138,0.1)" : "var(--card)",
            border: wishlistSlugs.length > 0 ? "1px solid rgba(82,214,138,0.3)" : "1px solid var(--border)",
            borderRadius: "7px", padding: "6px 10px",
            color: wishlistSlugs.length > 0 ? "var(--green)" : "var(--text-secondary)",
            cursor: "pointer", fontSize: "13px",
            display: "flex", alignItems: "center", gap: "5px",
            transition: "all 0.15s",
          }}>
            ＋ {wishlistSlugs.length > 0 && (
              <span style={{ fontSize: "11px", fontWeight: 700 }}>{wishlistSlugs.length}</span>
            )}
          </button>
        </div>
```

- [ ] **Render `WishlistPanel` at the bottom of the `CalendarClient` return, before the closing `</div>`:**

```tsx
      {/* ── Wishlist panel ── */}
      {wishlistOpen && (
        <WishlistPanel
          slugs={wishlistSlugs}
          releases={releases}
          onClose={() => setWishlistOpen(false)}
          onRemove={wishlistRemove}
        />
      )}
```

- [ ] **Verify: open a game popover, click +, check the header icon updates, open the panel, verify the game appears, click × to remove**

- [ ] **Commit**

```bash
git add components/CalendarClient.tsx app/globals.css
git commit -m "Add wishlist panel with header icon and slide-out drawer"
```

---

### Task 5: Visual delight — CSS keyframes

**Files:**
- Modify: `app/globals.css` — add pulse, slideLeft, slideRight, confetti keyframes

- [ ] **Append to `app/globals.css`:**

```css
@keyframes pulseRing {
  0%   { box-shadow: 0 0 0 0 rgba(82, 214, 138, 0.5); }
  70%  { box-shadow: 0 0 0 6px rgba(82, 214, 138, 0); }
  100% { box-shadow: 0 0 0 0 rgba(82, 214, 138, 0); }
}

@keyframes slideLeft {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes slideRight {
  from { opacity: 0; transform: translateX(-24px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes confettiFall {
  0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}
```

- [ ] **Commit**

```bash
git add app/globals.css
git commit -m "Add CSS keyframes: pulseRing, slideLeft, slideRight, confettiFall"
```

---

### Task 6: Today cell pulse + event cell accent border + pill hover lift

**Files:**
- Modify: `components/CalendarClient.tsx`

- [ ] **In `CalendarCell`, update the day number div to add pulse animation when `isToday`:**

Find:
```tsx
        background: isToday ? "var(--green)" : "transparent",
        marginBottom: "3px", flexShrink: 0,
```

Replace with:
```tsx
        background: isToday ? "var(--green)" : "transparent",
        animation: isToday ? "pulseRing 2s ease-out infinite" : "none",
        marginBottom: "3px", flexShrink: 0,
```

- [ ] **In `CalendarCell`, add a colored left-border accent when the cell contains events. Update the cell's outer `div` style to include:**

```tsx
      borderLeft: events.length > 0
        ? `2px solid ${events[0].color}55`
        : "none",
```

(Place this inside the existing cell `style` object, replacing the implicit no-left-border.)

- [ ] **In `EventPill`, add a subtle lift on hover. Update `onMouseEnter`/`onMouseLeave`:**

Find:
```tsx
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
```

Replace with:
```tsx
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = "0.8";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.transform = "translateY(0)";
      }}
```

- [ ] **Add `transition: "transform 0.1s"` to the `EventPill` button style object alongside the existing `transition: "opacity 0.1s"`:**

```tsx
      transition: "opacity 0.1s, transform 0.1s",
```

- [ ] **Commit**

```bash
git add components/CalendarClient.tsx
git commit -m "Visual delight: today pulse, event accent border, pill hover lift"
```

---

### Task 7: Month slide transition

**Files:**
- Modify: `components/CalendarClient.tsx` — track slide direction, animate grid wrapper

- [ ] **Add slide direction state in `CalendarClient`:**

```tsx
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [gridKey, setGridKey] = useState(0);
```

- [ ] **Update `prevMonth` and `nextMonth` to set direction and bump key:**

```tsx
  const prevMonth = useCallback(() => {
    setPopover(null); setDaySheet(null);
    setSlideDir("right");
    setGridKey((k) => k + 1);
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    setPopover(null); setDaySheet(null);
    if (year === 2026 && month === 12) return;
    setSlideDir("left");
    setGridKey((k) => k + 1);
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }, [month, year]);
```

- [ ] **Wrap the grid card wrapper div with a keyed container that applies the slide animation:**

Find the grid card wrapper opening tag:
```tsx
      {/* ── Grid card wrapper ── */}
      <div style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        border: "1px solid oklch(32% 0.06 240)",
```

Wrap it in:
```tsx
      {/* ── Grid card wrapper ── */}
      <div key={gridKey} style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        animation: slideDir ? `${slideDir === "left" ? "slideLeft" : "slideRight"} 0.18s ease` : "none",
        overflow: "hidden",
      }}>
      <div style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        border: "1px solid oklch(32% 0.06 240)",
```

And close the outer wrapper div after the existing grid card wrapper's closing `</div>`:
```tsx
      </div>{/* end grid card wrapper */}
      </div>{/* end slide animation wrapper */}
```

- [ ] **Verify: click ‹ and › — the calendar should slide in from the correct direction**

- [ ] **Commit**

```bash
git add components/CalendarClient.tsx
git commit -m "Add slide transition animation on month navigation"
```

---

### Task 8: Confetti burst on today's releases

**Files:**
- Modify: `components/CalendarClient.tsx` — add `Confetti` component, fire once on mount if today has releases

- [ ] **Add `Confetti` component above `// ── Main calendar ──`:**

```tsx
// ── Confetti ──────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ["#52d68a", "#4f9cf9", "#b06ff5", "#f5c842", "#e84855", "#ff9f43"];

function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 2.5 + Math.random() * 2,
    size: 6 + Math.random() * 6,
    rotate: Math.random() * 360,
  }));

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 500, overflow: "hidden" }}>
      {pieces.map((p) => (
        <div key={p.id} style={{
          position: "absolute",
          top: "-10px",
          left: `${p.left}%`,
          width: `${p.size}px`,
          height: `${p.size}px`,
          background: p.color,
          borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          opacity: 0.9,
          animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          transform: `rotate(${p.rotate}deg)`,
        }} />
      ))}
    </div>
  );
}
```

- [ ] **In `CalendarClient`, add confetti state and fire it once if today has releases:**

```tsx
  const [showConfetti, setShowConfetti] = useState(false);
  useEffect(() => {
    const todayReleases = releasesByDate[todayStr];
    if (todayReleases && todayReleases.length > 0) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Render `<Confetti />` conditionally near the top of the return:**

```tsx
      {showConfetti && <Confetti />}
```

- [ ] **Commit**

```bash
git add components/CalendarClient.tsx
git commit -m "Add confetti burst when today has game releases"
```

---

### Task 9: Build check + push

- [ ] **Run build and verify no errors:**

```bash
npm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Push to deploy:**

```bash
git push origin main
```
