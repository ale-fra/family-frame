# Timers and routines – design mockups

The approved design is implemented in `src/frame/components/ScheduleStage.tsx` and `ScheduleVisuals.tsx`; these
mockups remain as the design reference.

Design proposals, not part of the app. Each scene is data (what `GET /api/schedule` would return at a given
moment), and the page runs the frame's **real** display code on it: `mockup-lib.ts` bundles
`src/frame/lib/scheduleDisplay.ts` (phases, order, the 3-item limit, remaining-time text, sweets blocks) and
`render-icons.ts` renders icons through `src/frame/lib/scheduleIcons.ts`. Only the drawing of each style is
mockup code (it becomes React components in the UI). `test/integration/mockup-build.test.mjs` keeps it building.

The screenshot script generates these optional PNGs:

| Image | Shows |
|---|---|
| `styles-it.png` | The four countdown styles (`disc`, `sweets`, `journey`, `clock`) at 8 min, 45 s (last minute, in seconds), time's up and paused |
| `stage-one-it.png` | One timer: the whole photo area becomes the countdown |
| `stage-two-en.png` | Two timers side by side, each with its own style |
| `stage-mix-it.png` | Three items, timers and a routine: the ringing one is biggest |
| `stage-overflow-en.png` | Limit of 3 items with a "+1 more" badge; an unknown icon key drawn as "!" |

Rules shown (from `src/frame/lib/scheduleDisplay.ts`): at most 3 items, ringing first, then the soonest, paused
last; "soon" (amber) in the last 20 % or last minute; whole minutes rounded up, seconds in the last minute.
Ringing is shown by the card itself, with no border around the frame.

Regenerate:

```bash
node docs/mockups/build.mjs                    # writes schedule-ui.html (not committed: always built from current code)
cd docs/mockups && python3 screenshots.py      # writes the PNGs (Python Playwright + Chromium)
```

Open `schedule-ui.html?view=board&lang=en` or `schedule-ui.html?view=stage&scene=mix&lang=it` in a browser to
inspect a view.
