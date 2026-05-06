# Photo Frame & Festa della Mamma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cinematic blurred backdrop to all photos and upgrade the "Festa della mamma" special day with SVG corner bouquets, a fabric banner, and animated rising hearts.

**Architecture:** Two independent layers — (1) the backdrop runs always when a photo is loaded, injecting two absolute divs inside `photo-stage` before `photo-wrap`; (2) the festa-mamma effects are gated on the existing `SpecialDayEffect` system, replacing the old emoji-based `PhotoFrameFlowers` with SVG `FlowerCorner` components and adding a `FestoneBanner` component in `SpecialDayLayer`. Both changes are isolated to `src/main.tsx` and `src/styles.css`.

**Tech Stack:** React 19, TypeScript 5, Vite 7 — no test framework. Verification is visual via `npm run dev`.

---

## File Map

| File | Changes |
|------|---------|
| `src/styles.css` | Add `.photo-stage-backdrop`, `.photo-stage-vignette`, update `.photo-wrap` z-index; add `.special-day-festone` + `::before/::after`; replace old `photo-frame-flowers` CSS with new `.flower-corner*`, `.flower-el`, `.flower-heart`; add `@keyframes banner-sway`, `flower-breathe`, `heart-pulse`; remove `@keyframes photo-frame-flowers-in`, `flower-frame-breathe` |
| `src/main.tsx` | Add backdrop divs to `FrameApp` render; add `"festone"` to `SpecialDayEffect` union; add `FestoneBanner` component; update `SpecialDayLayer` ribbon → festone conditional; add `FlowerKind` type + `FlowerSVG` component + `CORNER_FLOWERS` constant + `FlowerCorner` component; rewrite `PhotoFrameFlowers` |
| `frame.config.json` | Add `"festone"` to `festa-mamma.effects` |
| `public/frame.config.json` | Same as above |

---

## Task 1: Cinematic Backdrop — CSS

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add backdrop and vignette CSS, update photo-wrap z-index**

In `src/styles.css`, add immediately after the `.photo-wrap img` block (after line 78):

```css
.photo-stage-backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: blur(38px) saturate(1.05);
  transform: scale(1.18);
}

.photo-stage-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0.18));
  pointer-events: none;
  z-index: 1;
}
```

Also update `.photo-wrap` to sit above the vignette — change the existing `.photo-wrap` rule (lines 66–70):

```css
.photo-wrap {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
}
```

And update `.photo-caption` to stay above `photo-wrap`. Without this, `z-index: auto` would put the caption below `z-index: 2`. Add `z-index: 3` to the existing `.photo-caption` rule (around line 81):

```css
.photo-caption {
  position: absolute;
  z-index: 3;
  left: 26px;
  bottom: 24px;
  max-width: min(640px, calc(100% - 52px));
  padding: 12px 16px;
  border-radius: 8px;
  color: #29342f;
  background: rgba(248, 244, 235, 0.86);
  box-shadow: 0 10px 26px rgba(86, 74, 56, 0.16);
  font-size: 22px;
  line-height: 1.25;
}
```

And remove the background from `.photo-wrap img` (it will now show the backdrop during load). Change `.photo-wrap img` (lines 72–78):

```css
.photo-wrap img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
```

- [ ] **Step 2: Commit CSS-only change**

```bash
git add src/styles.css
git commit -m "style: add photo-stage-backdrop and vignette CSS"
```

---

## Task 2: Cinematic Backdrop — React

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add backdrop divs to FrameApp render**

In `src/main.tsx`, find the `activePhoto ?` block inside `<section className="photo-stage">` (around line 551). Replace this:

```tsx
{activePhoto ? (
  <>
    <div
      className="photo-wrap"
      style={photoBox ? { width: photoBox.width, height: photoBox.height } : undefined}
    >
```

With this:

```tsx
{activePhoto ? (
  <>
    <div
      className="photo-stage-backdrop"
      style={{ backgroundImage: `url(${activePhoto.src})` }}
    />
    <div className="photo-stage-vignette" />
    <div
      className="photo-wrap"
      style={photoBox ? { width: photoBox.width, height: photoBox.height } : undefined}
    >
```

- [ ] **Step 2: Start dev server and verify visually**

```bash
npm run dev
```

Open http://localhost:5173. With a photo loaded:
- A vertical photo should now have blurred ambient light filling the stage instead of plain cream bands
- The photo itself should be perfectly centered and undistorted
- The white inset shadow on `photo-stage` should frame the blurred backdrop nicely
- The `empty-photos` view (no photos loaded) should still show plain beige background (backdrop only renders inside the `activePhoto ?` branch)

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: add cinematic blurred backdrop to photo-stage"
```

---

## Task 3: Festone Banner — TypeScript, Component, Config

**Files:**
- Modify: `src/main.tsx`
- Modify: `frame.config.json`
- Modify: `public/frame.config.json`

- [ ] **Step 1: Add `"festone"` to `SpecialDayEffect` union type**

In `src/main.tsx`, find `type SpecialDayEffect` (line 48). Add `"festone"`:

```typescript
type SpecialDayEffect =
  | "santaPeek"
  | "warmLights"
  | "confettiBurst"
  | "hearts"
  | "flowers"
  | "springDecor"
  | "pumpkinGlow"
  | "festone"
  | "stars";
```

- [ ] **Step 2: Add `FestoneBanner` component**

In `src/main.tsx`, add this function after the `SpecialDayLayer` function (around line 656):

```tsx
function FestoneBanner({ label }: { label: string }) {
  return <div className="special-day-festone">{label}</div>;
}
```

- [ ] **Step 3: Update `SpecialDayLayer` to conditionally render festone vs ribbon**

In `SpecialDayLayer` (around line 644), find:

```tsx
<div className="special-day-ribbon">{specialDay.label}</div>
```

Replace with:

```tsx
{effects.has("festone")
  ? <FestoneBanner label={specialDay.label} />
  : <div className="special-day-ribbon">{specialDay.label}</div>}
```

- [ ] **Step 4: Add `"festone"` to festa-mamma effects in both config files**

In `frame.config.json`, find the `festa-mamma` entry and update `effects`:

```json
{
  "id": "festa-mamma",
  "label": "Festa della mamma",
  "enabled": true,
  "theme": "family",
  "schedule": { "type": "fixedDate", "month": 5, "day": 6 },
  "effects": ["festone", "flowers", "hearts"]
}
```

Do the same in `public/frame.config.json`.

- [ ] **Step 5: Add festone CSS to `src/styles.css`**

Add after the `.special-day-ribbon` rule (around line 194):

```css
.special-day-festone {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  padding: 11px 30px 9px;
  background: linear-gradient(180deg, #d57a89, #b85b6f);
  color: #fffaf0;
  font-family: "Georgia", "Times New Roman", serif;
  font-style: italic;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(184, 91, 111, 0.36);
  animation: banner-sway 5s ease-in-out infinite;
}

.special-day-festone::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -14px;
  width: 18px;
  background: inherit;
  clip-path: polygon(100% 0, 0 50%, 100% 100%);
}

.special-day-festone::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  right: -14px;
  width: 18px;
  background: inherit;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}

@keyframes banner-sway {
  0%,
  100% {
    transform: translateX(-50%) rotate(0deg);
  }
  50% {
    transform: translateX(-50%) rotate(0.6deg);
  }
}
```

- [ ] **Step 6: Verify visually**

With `npm run dev` running, open http://localhost:5173. Today is 2026-05-06, which matches `festa-mamma`'s `fixedDate` schedule, so the effect is active now:
- The pink fabric banner "Festa della mamma" should appear centered at the top
- It should have V-cut notches on both sides (::before / ::after triangles)
- It should sway gently (0.6° every 5s)
- No plain pill ribbon should appear

- [ ] **Step 7: Commit**

```bash
git add src/main.tsx src/styles.css frame.config.json public/frame.config.json
git commit -m "feat: add festone banner for Festa della mamma"
```

---

## Task 4: SVG Flower Components

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add `FlowerKind` type and `FlowerSVG` component**

In `src/main.tsx`, add these immediately before the `PhotoFrameFlowers` function (around line 709):

```tsx
type FlowerKind = "peony" | "peony-pale" | "daisy" | "bud" | "leaf" | "leaf-dark" | "heart";

function FlowerSVG({ kind }: { kind: FlowerKind }) {
  switch (kind) {
    case "peony":
      return (
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <g fill="#d99baa">
            <circle cx="12" cy="8" r="5" />
            <circle cx="7" cy="13" r="5" />
            <circle cx="17" cy="13" r="5" />
            <circle cx="12" cy="16" r="5" />
          </g>
          <g fill="#e8b8c4" opacity="0.85">
            <circle cx="12" cy="11" r="4" />
            <circle cx="9" cy="13" r="3" />
            <circle cx="15" cy="13" r="3" />
          </g>
          <circle cx="12" cy="12" r="2" fill="#b46578" />
        </svg>
      );
    case "peony-pale":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <g fill="#eac8d2">
            <circle cx="12" cy="8" r="5" />
            <circle cx="7" cy="13" r="5" />
            <circle cx="17" cy="13" r="5" />
            <circle cx="12" cy="16" r="5" />
          </g>
          <g fill="#f3dde2" opacity="0.9">
            <circle cx="12" cy="11" r="4" />
          </g>
          <circle cx="12" cy="12" r="2" fill="#c98ea0" />
        </svg>
      );
    case "daisy":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <g fill="#fffaf0" stroke="#e8d5b6" strokeWidth="0.4">
            <ellipse cx="12" cy="4.5" rx="2.4" ry="3.6" />
            <ellipse cx="12" cy="19.5" rx="2.4" ry="3.6" />
            <ellipse cx="4.5" cy="12" rx="3.6" ry="2.4" />
            <ellipse cx="19.5" cy="12" rx="3.6" ry="2.4" />
            <ellipse cx="6.6" cy="6.6" rx="2.4" ry="3.6" transform="rotate(-45 6.6 6.6)" />
            <ellipse cx="17.4" cy="6.6" rx="2.4" ry="3.6" transform="rotate(45 17.4 6.6)" />
            <ellipse cx="6.6" cy="17.4" rx="2.4" ry="3.6" transform="rotate(45 6.6 17.4)" />
            <ellipse cx="17.4" cy="17.4" rx="2.4" ry="3.6" transform="rotate(-45 17.4 17.4)" />
          </g>
          <circle cx="12" cy="12" r="3" fill="#e8b048" />
        </svg>
      );
    case "bud":
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <circle cx="12" cy="12" r="6" fill="#e8c54a" />
          <circle cx="12" cy="12" r="3" fill="#a87a18" />
        </svg>
      );
    case "leaf":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M4 16 C4 8, 16 4, 20 4 C20 12, 14 18, 4 16 Z" fill="#7ca673" />
          <path d="M5 15 L18 6" stroke="#5e8459" strokeWidth="1" fill="none" />
        </svg>
      );
    case "leaf-dark":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4 16 C4 8, 16 4, 20 4 C20 12, 14 18, 4 16 Z" fill="#5e8459" />
          <path d="M5 15 L18 6" stroke="#476641" strokeWidth="1" fill="none" />
        </svg>
      );
    case "heart":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M12 21 C12 21 5 16.4 5 10 A4 4 0 0 1 12 8 A4 4 0 0 1 19 10 C19 16.4 12 21 12 21 Z"
            fill="#d57a89"
            stroke="#a85068"
            strokeWidth="0.5"
          />
        </svg>
      );
  }
}
```

- [ ] **Step 2: Verify the SVG component renders without TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are errors related to SVG attributes (e.g. `strokeWidth` vs `stroke-width`), they are already handled by using camelCase props as shown above.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: add FlowerSVG component with 7 flower kinds"
```

---

## Task 5: Corner Bouquets — CSS

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Remove old `photo-frame-flowers` CSS**

In `src/styles.css`, delete the following blocks entirely:

- `.photo-frame-flowers` (the rule with `position: absolute; inset: -18px; border: 1px solid...`)
- `.photo-frame-flowers span` (the rule with `--flower-index`, `position: absolute`, `width: 28px`, etc.)
- `.photo-frame-flowers span:nth-child(-n + 7)` (top edge placement)
- `.photo-frame-flowers span:nth-child(n + 8):nth-child(-n + 14)` (bottom edge placement)
- `.photo-frame-flowers span:nth-child(n + 15):nth-child(-n + 18)` (left edge placement)
- `.photo-frame-flowers span:nth-child(n + 19)` (right edge placement)
- `.photo-frame-flowers span:nth-child(3n)` (green color)
- `.photo-frame-flowers span:nth-child(3n + 1)` (green color variant)
- `@keyframes photo-frame-flowers-in`
- `@keyframes flower-frame-breathe`

- [ ] **Step 2: Add new corner bouquet CSS**

In `src/styles.css`, add in the section where the old `photo-frame-flowers` rules were:

```css
.photo-frame-flowers {
  position: absolute;
  inset: -14px;
  pointer-events: none;
}

.flower-corner {
  position: absolute;
  width: 96px;
  height: 96px;
}

.flower-corner-tl {
  top: 0;
  left: 0;
}

.flower-corner-tr {
  top: 0;
  right: 0;
}

.flower-corner-bl {
  bottom: 0;
  left: 0;
}

.flower-corner-br {
  bottom: 0;
  right: 0;
}

.flower-el {
  position: absolute;
  transform: translate(-50%, -50%);
  animation: flower-breathe 4.5s ease-in-out infinite;
  line-height: 0;
}

.flower-heart {
  animation: heart-pulse 2.4s ease-in-out infinite;
}

@keyframes flower-breathe {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(0.95) rotate(-2deg);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.04) rotate(2deg);
  }
}

@keyframes heart-pulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(0.95);
    opacity: 0.85;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.12);
    opacity: 1;
  }
}
```

- [ ] **Step 3: Commit CSS-only change**

```bash
git add src/styles.css
git commit -m "style: replace photo-frame-flowers edge layout with corner bouquet CSS"
```

---

## Task 6: Corner Bouquets — React Component

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add `CORNER_FLOWERS` constant and `FlowerCorner` component**

In `src/main.tsx`, add these immediately before `PhotoFrameFlowers` (after `FlowerSVG`):

```tsx
const CORNER_FLOWERS: Array<{ kind: FlowerKind; top: string; left: string; delay: number }> = [
  { kind: "peony",      top: "32%", left: "30%", delay: 0 },
  { kind: "daisy",      top: "18%", left: "60%", delay: 180 },
  { kind: "leaf",       top: "56%", left: "22%", delay: 360 },
  { kind: "bud",        top: "60%", left: "56%", delay: 540 },
  { kind: "peony-pale", top: "30%", left: "64%", delay: 720 },
  { kind: "leaf-dark",  top: "70%", left: "40%", delay: 900 },
  { kind: "bud",        top: "14%", left: "38%", delay: 1080 },
  { kind: "heart",      top: "88%", left: "70%", delay: 0 },
];

function FlowerCorner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const flipH = position === "tr" || position === "br";
  const flipV = position === "bl" || position === "br";

  return (
    <div className={`flower-corner flower-corner-${position}`}>
      {CORNER_FLOWERS.map((f, i) => {
        const left = flipH ? `${100 - parseFloat(f.left)}%` : f.left;
        const top = flipV ? `${100 - parseFloat(f.top)}%` : f.top;
        return (
          <span
            key={i}
            className={`flower-el${f.kind === "heart" ? " flower-heart" : ""}`}
            style={{ top, left, animationDelay: `${f.delay}ms` } as React.CSSProperties}
          >
            <FlowerSVG kind={f.kind} />
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `PhotoFrameFlowers`**

Replace the entire existing `PhotoFrameFlowers` function:

```tsx
function PhotoFrameFlowers() {
  return (
    <div className="photo-frame-flowers">
      {(["tl", "tr", "bl", "br"] as const).map((pos) => (
        <FlowerCorner key={pos} position={pos} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify visually**

With `npm run dev` running:
- Four corner bouquets of 7 SVG flowers + 1 heart should appear around the photo
- Each corner should be a mirror of the top-left: TR is flipped horizontally, BL vertically, BR both
- Flowers breathe gently (4.5s cycle), hearts pulse (2.4s cycle)
- Rising hearts (FloatingShapes "heart") should also appear periodically from the bottom of the frame — this uses the existing `"hearts"` effect, no code change needed

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx
git commit -m "feat: replace emoji flower grid with SVG corner bouquets"
```

---

## Task 7: Final Visual Smoke Test

**Files:** None — verification only.

- [ ] **Step 1: Full festa della mamma check**

With `npm run dev` running and today's date active (2026-05-06 = festa della mamma):

Verify all five elements together:
1. **Backdrop**: blurred cinematic photo fills stage behind the main photo
2. **Vignette**: subtle dark edge radial gradient on the backdrop
3. **Festone banner**: pink fabric banner "Festa della mamma" centered at top, swaying
4. **Corner bouquets**: SVG flowers in all 4 corners of the photo frame, breathing
5. **Rising hearts**: 10 hearts float up from the bottom on each `specialDayPulse` (every 90 seconds — to test immediately, temporarily change the pulse interval in code, then revert)

- [ ] **Step 2: Check other special days still work**

In `frame.config.json`, temporarily change a non-active special day's date to today's date (e.g. `festa-papa`). Reload:
- The `special-day-ribbon` pill should appear (not a festone)
- SVG corner bouquets should appear (because `PhotoFrameFlowers` is shared for all `"flowers"` effects)
- Revert the config change after confirming.

- [ ] **Step 3: Check landscape photo**

Approve a landscape (wide) photo in admin and wait for it to display:
- The photo should fill horizontally; backdrop fills any vertical bands
- If no vertical bands (photo is wider than stage), backdrop is mostly hidden behind photo — that's correct

- [ ] **Step 4: Check empty state**

With no approved photos, the `empty-photos` view should still show the plain beige stage background — no backdrop div is rendered.

- [ ] **Step 5: Final commit if tweaks were made**

```bash
git add -p  # stage only intentional tweaks
git commit -m "fix: visual smoke test adjustments"
```

---

## Notes

- `specialDayPulse` increments every 90 seconds (`setInterval` in `FrameApp`). To test hearts immediately without waiting, temporarily change the interval to 3000ms, verify hearts appear, then revert.
- The `inset 0 0 0 10px rgba(255, 255, 255, 0.52)` box-shadow on `.photo-stage` creates a visible white mat border around the backdrop — this is intentional and looks like a photo frame edge. If it feels too heavy after seeing it live, reduce to `6px`.
- Both `frame.config.json` (used in dev) and `public/frame.config.json` (served by the photo server) must be kept in sync. Task 3 updates both.
