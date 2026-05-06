# Design: Photo Frame & Festa della Mamma

**Data**: 2026-05-06  
**Stato**: Approvato (brainstorming visuale completato)

---

## Riepilogo

Due miglioramenti distinti ma coordinati:

1. **Backdrop sfocato** — risolve i bordi crema vuoti per foto verticali/quadrate. Si applica a *tutte* le foto, tutto l'anno.
2. **Effetti Festa della Mamma** — sostituisce emoji e pillola generica con: bouquet SVG agli angoli, cuori integrati, banner "festone" animato.

---

## 1. Backdrop sfocato (sempre attivo)

### Problema
`containedBox()` dimensiona la foto mantenendo l'aspect ratio. Le foto verticali lasciano bande crema vuote (rosate durante la festa della mamma) ai lati della `photo-stage`. Non c'è cornice reale.

### Soluzione
Aggiungere un layer di backdrop alla `photo-stage`: stessa immagine della foto, filtrata e scalata a riempire l'intero stage.

### Struttura HTML (in `FrameApp`)
```tsx
{activePhoto ? (
  <>
    <div
      className="photo-stage-backdrop"
      style={{ backgroundImage: `url(${activePhoto.src})` }}
    />
    <div className="photo-stage-vignette" />
    <div className="photo-wrap" style={...}>
      <img ... />
      {activeSpecialDayEffects.has("flowers") ? <PhotoFrameFlowers /> : null}
    </div>
    {activePhoto.caption ? <div className="photo-caption">...</div> : null}
  </>
) : (...)}
```

### CSS da aggiungere
```css
.photo-stage-backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: blur(38px) saturate(1.05);
  transform: scale(1.18); /* evita aloni ai bordi per via del blur */
}

.photo-stage-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(0,0,0,0.18));
  pointer-events: none;
  z-index: 1;
}

.photo-wrap {
  z-index: 2; /* sopra backdrop e vignette */
}
```

`.photo-stage` ha già `overflow: hidden`, quindi il `scale(1.18)` non sborda.

---

## 2. Effetti Festa della Mamma

### 2a. Banner festone (sostituisce `.special-day-ribbon` per questo tema)

**Config** (`frame.config.json` e `public/frame.config.json`):
```json
{
  "id": "festa-mamma",
  "effects": ["festone", "flowers", "hearts"]
}
```
Aggiungere `"festone"` come nuovo effect. Richiede anche aggiornare il tipo TypeScript in `main.tsx`:

```typescript
type SpecialDayEffect =
  | "santaPeek"
  | "warmLights"
  | "confettiBurst"
  | "hearts"
  | "flowers"
  | "springDecor"
  | "pumpkinGlow"
  | "festone"   // ← aggiunto
  | "stars";
```

**Componente** in `main.tsx`:
```tsx
function FestoneBanner({ label }: { label: string }) {
  return <div className="special-day-festone">{label}</div>;
}
```

In `SpecialDayLayer`, sostituire il render del ribbon:
```tsx
{effects.has("festone")
  ? <FestoneBanner label={specialDay.label} />
  : <div className="special-day-ribbon">{specialDay.label}</div>}
```

**CSS**:
```css
.special-day-festone {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  /* nessun z-index esplicito: eredita lo stacking context di special-day-layer (z-index: 3) */
  padding: 11px 30px 9px;
  background: linear-gradient(180deg, #d57a89, #b85b6f);
  color: #fffaf0;
  font-family: "Georgia", serif;
  font-style: italic;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: 0 6px 16px rgba(184, 91, 111, 0.36);
  animation: banner-sway 5s ease-in-out infinite;
  white-space: nowrap;
}
.special-day-festone::before {
  content: "";
  position: absolute;
  top: 0; bottom: 0; left: -14px; width: 18px;
  background: inherit;
  clip-path: polygon(100% 0, 0 50%, 100% 100%);
}
.special-day-festone::after {
  content: "";
  position: absolute;
  top: 0; bottom: 0; right: -14px; width: 18px;
  background: inherit;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}

@keyframes banner-sway {
  0%, 100% { transform: translateX(-50%) rotate(0deg); }
  50%       { transform: translateX(-50%) rotate(0.6deg); }
}
```

### 2b. Bouquet SVG agli angoli (sostituisce `PhotoFrameFlowers`)

**Componente** — reimplementare `PhotoFrameFlowers` in `main.tsx`:

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

const CORNER_FLOWERS: Record<string, Array<{ kind: string; top: string; left: string; delay: number }>> = {
  tl: [
    { kind: "peony",      top: "32%", left: "30%", delay: 0 },
    { kind: "daisy",      top: "18%", left: "60%", delay: 180 },
    { kind: "leaf",       top: "56%", left: "22%", delay: 360 },
    { kind: "bud",        top: "60%", left: "56%", delay: 540 },
    { kind: "peony-pale", top: "30%", left: "64%", delay: 720 },
    { kind: "leaf-dark",  top: "70%", left: "40%", delay: 900 },
    { kind: "bud",        top: "14%", left: "38%", delay: 1080 },
    { kind: "heart",      top: "88%", left: "70%", delay: 0 },
  ],
  // tr: mirrored left→right
  // bl: mirrored top→bottom
  // br: mirrored both
};

function FlowerCorner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const flipH = position === "tr" || position === "br";
  const flipV = position === "bl" || position === "br";
  const base = CORNER_FLOWERS["tl"];

  return (
    <div className={`flower-corner flower-corner-${position}`}>
      {base.map((f, i) => {
        const left = flipH ? `${100 - parseFloat(f.left)}%` : f.left;
        const top  = flipV ? `${100 - parseFloat(f.top)}%`  : f.top;
        return (
          <span
            key={i}
            className={`flower-el flower-${f.kind}`}
            style={{
              top, left,
              animationDelay: `${f.delay}ms`,
            } as React.CSSProperties}
          >
            <FlowerSVG kind={f.kind} />
          </span>
        );
      })}
    </div>
  );
}
```

**SVG components** da creare come funzioni inline (no file separati):
- `PeonySVG` — cerchi sovrapposti rosa (#d99baa / #e8b8c4), centro #b46578
- `PeonyPaleSVG` — stessa forma, toni più chiari (#eac8d2 / #f3dde2)
- `DaisySVG` — 8 petali ellittici bianchi (#fffaf0), centro giallo (#e8b048)
- `BudSVG` — cerchio giallo (#e8c54a), punto centrale (#a87a18)
- `LeafSVG` — forma foglia verde (#7ca673), nervatura (#5e8459)
- `LeafDarkSVG` — stessa forma, verde scuro (#5e8459 / #476641)
- `HeartSVG` — cuore rosa (#d57a89), bordo (#a85068)

**CSS per il layout dei corner**:
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
.flower-corner-tl { top: 0;   left: 0; }
.flower-corner-tr { top: 0;   right: 0; }
.flower-corner-bl { bottom: 0; left: 0; }
.flower-corner-br { bottom: 0; right: 0; }

.flower-el {
  position: absolute;
  transform: translate(-50%, -50%);
  animation: flower-breathe 4.5s ease-in-out infinite;
}
.flower-heart {
  animation: heart-pulse 2.4s ease-in-out infinite;
}

@keyframes flower-breathe {
  0%, 100% { transform: translate(-50%, -50%) scale(0.95) rotate(-2deg); }
  50%       { transform: translate(-50%, -50%) scale(1.04)  rotate(2deg); }
}
@keyframes heart-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.85; }
  50%       { transform: translate(-50%, -50%) scale(1.12); opacity: 1; }
}
```

### 2c. Cuori che salgono (nessuna modifica)

L'effect `"hearts"` già presente in `festa-mamma` usa il componente `FloatingShapes kind="heart"` esistente, triggerato da `specialDayPulse`. Nessuna modifica necessaria.

---

## Cosa NON cambia

- `containedBox()` — invariato
- `photoStageSize` / `photoAspect` state — invariati
- Tutti gli altri effetti speciali (warmLights, santaPeek, confettiBurst, springDecor, pumpkinGlow, stars)
- Tutti gli altri temi che hanno `"flowers"` (pasqua, festa-papa, festa-nonni) ricevono anch'essi i bouquet SVG agli angoli, perché `PhotoFrameFlowers` è un componente condiviso. Solo il banner festone e gli hearts sono specifici della festa della mamma. Gli altri temi continuano a usare `.special-day-ribbon` per la pillola.
- Admin panel — invariato
- Server — invariato

---

## File da modificare

| File | Tipo modifica |
|------|--------------|
| `src/main.tsx` | Aggiungere backdrop nel render di `FrameApp`; reimplementare `PhotoFrameFlowers` + `FlowerCorner` + `FlowerSVG`; aggiungere `FestoneBanner`; aggiornare `SpecialDayLayer` |
| `src/styles.css` | Aggiungere `.photo-stage-backdrop`, `.photo-stage-vignette`, `.special-day-festone`, `.flower-corner*`, `.flower-el`, `@keyframes banner-sway`, `@keyframes heart-pulse`; aggiornare `@keyframes flower-frame-breathe` → `flower-breathe` |
| `frame.config.json` | Aggiungere `"festone"` a `festa-mamma.effects` |
| `public/frame.config.json` | Stesso |

---

## Ordine di implementazione suggerito

1. Backdrop sfocato (backdrop + vignette CSS + div nel render) — visibile subito, test con foto verticale
2. Festone banner (componente + CSS + config) — test con giorno speciale attivo
3. SVG components (`FlowerSVG`, singoli tipi) — costruire e testare uno per uno
4. `FlowerCorner` + `PhotoFrameFlowers` — rimpiazzare il vecchio componente
5. Verifica cuori che salgono (hearts effect già presente, solo controllare che sia ancora attivo)
6. Smoke test visivo con tutte le features attive insieme
