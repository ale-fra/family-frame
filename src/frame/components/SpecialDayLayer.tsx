import type { SpecialDayConfig } from "@/lib/types";

export function SpecialDayLayer({ specialDay, pulse }: { specialDay?: SpecialDayConfig; pulse: number }) {
  if (!specialDay) return null;

  const effects = new Set(specialDay.effects);
  const burstKey = `${specialDay.id}-${pulse}`;

  return (
    <div className={`special-day-layer theme-${specialDay.theme}`} aria-hidden="true">
      {effects.has("festone")
        ? <FestoneBanner label={specialDay.label} />
        : <div className="special-day-ribbon">{specialDay.label}</div>}
      {effects.has("warmLights") ? <WarmLights /> : null}
      {effects.has("santaPeek") ? <SantaPeek key={`santa-${burstKey}`} /> : null}
      {effects.has("confettiBurst") ? <ConfettiBurst key={`confetti-${burstKey}`} /> : null}
      {effects.has("hearts") ? <FloatingShapes key={`hearts-${burstKey}`} kind="heart" /> : null}
      {effects.has("springDecor") ? <SpringDecor /> : null}
      {effects.has("pumpkinGlow") ? <PumpkinGlow /> : null}
      {effects.has("stars") ? <FloatingShapes key={`stars-${burstKey}`} kind="star" /> : null}
    </div>
  );
}

function FestoneBanner({ label }: { label: string }) {
  return <div className="special-day-festone">{label}</div>;
}

function WarmLights() {
  return (
    <div className="special-lights">
      {Array.from({ length: 18 }, (_value, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function SantaPeek() {
  return (
    <div className="santa-peek">
      <div className="santa-hat" />
      <div className="santa-face">
        <span className="santa-eye" />
        <span className="santa-eye" />
        <span className="santa-nose" />
        <span className="santa-beard" />
      </div>
      <div className="santa-wave" />
    </div>
  );
}

function ConfettiBurst() {
  return (
    <div className="confetti-burst">
      {Array.from({ length: 18 }, (_value, index) => (
        <span key={index} style={{ "--confetti-index": index } as React.CSSProperties} />
      ))}
    </div>
  );
}

function FloatingShapes({ kind }: { kind: "heart" | "flower" | "star" }) {
  const labels = {
    heart: "♥",
    flower: "✿",
    star: "★"
  };

  return (
    <div className={`floating-shapes ${kind}-shapes`}>
      {Array.from({ length: 10 }, (_value, index) => (
        <span key={index} style={{ "--shape-index": index } as React.CSSProperties}>{labels[kind]}</span>
      ))}
    </div>
  );
}

type FlowerKind = "peony" | "peony-pale" | "daisy" | "bud" | "leaf" | "leaf-dark" | "heart";

function FlowerSVG({ kind, size }: { kind: FlowerKind; size: number }) {
  switch (kind) {
    case "peony":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
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
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
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
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
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
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <circle cx="12" cy="12" r="6" fill="#e8c54a" />
          <circle cx="12" cy="12" r="3" fill="#a87a18" />
        </svg>
      );
    case "leaf":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path d="M4 16 C4 8, 16 4, 20 4 C20 12, 14 18, 4 16 Z" fill="#7ca673" />
          <path d="M5 15 L18 6" stroke="#5e8459" strokeWidth="1" fill="none" />
        </svg>
      );
    case "leaf-dark":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path d="M4 16 C4 8, 16 4, 20 4 C20 12, 14 18, 4 16 Z" fill="#5e8459" />
          <path d="M5 15 L18 6" stroke="#476641" strokeWidth="1" fill="none" />
        </svg>
      );
    case "heart":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
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

const CORNER_FLOWERS: { kind: FlowerKind; x: number; y: number; size: number; delay: number }[][] = [
  [
    { kind: "peony", x: 32, y: 32, size: 30, delay: 0 },
    { kind: "leaf", x: 14, y: 52, size: 22, delay: 0.4 },
    { kind: "peony-pale", x: 54, y: 18, size: 24, delay: 0.8 },
    { kind: "daisy", x: 68, y: 44, size: 20, delay: 1.2 },
    { kind: "bud", x: 22, y: 74, size: 18, delay: 1.6 },
    { kind: "leaf-dark", x: 50, y: 64, size: 16, delay: 2.0 },
    { kind: "heart", x: 76, y: 20, size: 14, delay: 2.4 }
  ],
  [
    { kind: "peony", x: 64, y: 32, size: 30, delay: 0.2 },
    { kind: "leaf", x: 82, y: 52, size: 22, delay: 0.6 },
    { kind: "peony-pale", x: 42, y: 18, size: 24, delay: 1.0 },
    { kind: "daisy", x: 28, y: 44, size: 20, delay: 1.4 },
    { kind: "bud", x: 74, y: 74, size: 18, delay: 1.8 },
    { kind: "leaf-dark", x: 46, y: 64, size: 16, delay: 2.2 },
    { kind: "heart", x: 20, y: 20, size: 14, delay: 2.6 }
  ],
  [
    { kind: "peony", x: 32, y: 64, size: 30, delay: 0.3 },
    { kind: "leaf", x: 14, y: 44, size: 22, delay: 0.7 },
    { kind: "peony-pale", x: 54, y: 78, size: 24, delay: 1.1 },
    { kind: "daisy", x: 68, y: 52, size: 20, delay: 1.5 },
    { kind: "bud", x: 22, y: 22, size: 18, delay: 1.9 },
    { kind: "leaf-dark", x: 50, y: 32, size: 16, delay: 2.3 },
    { kind: "heart", x: 76, y: 76, size: 14, delay: 2.7 }
  ],
  [
    { kind: "peony", x: 64, y: 64, size: 30, delay: 0.5 },
    { kind: "leaf", x: 82, y: 44, size: 22, delay: 0.9 },
    { kind: "peony-pale", x: 42, y: 78, size: 24, delay: 1.3 },
    { kind: "daisy", x: 28, y: 52, size: 20, delay: 1.7 },
    { kind: "bud", x: 74, y: 22, size: 18, delay: 2.1 },
    { kind: "leaf-dark", x: 46, y: 32, size: 16, delay: 2.5 },
    { kind: "heart", x: 20, y: 76, size: 14, delay: 2.9 }
  ]
];

const CORNER_CLASSES = ["flower-corner-tl", "flower-corner-tr", "flower-corner-bl", "flower-corner-br"];

function FlowerCorner({ flowers, cornerClass }: { flowers: typeof CORNER_FLOWERS[0]; cornerClass: string }) {
  return (
    <div className={`flower-corner ${cornerClass}`}>
      {flowers.map((flower, index) => (
        <div
          key={index}
          className={`flower-el${flower.kind === "heart" ? " flower-heart" : ""}`}
          style={{ left: flower.x, top: flower.y, animationDelay: `${flower.delay}s` }}
        >
          <FlowerSVG kind={flower.kind} size={flower.size} />
        </div>
      ))}
    </div>
  );
}

export function PhotoFrameFlowers() {
  return (
    <div className="photo-frame-flowers">
      {CORNER_FLOWERS.map((flowers, index) => (
        <FlowerCorner key={index} flowers={flowers} cornerClass={CORNER_CLASSES[index]} />
      ))}
    </div>
  );
}

function SpringDecor() {
  return (
    <div className="spring-decor">
      <span />
      <span />
      <span />
    </div>
  );
}

function PumpkinGlow() {
  return (
    <div className="pumpkin-glow">
      <span className="pumpkin-stem" />
      <span className="pumpkin-body" />
    </div>
  );
}
