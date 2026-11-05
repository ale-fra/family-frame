import * as React from "react";
import { PartyPopper, Snail } from "lucide-react";
import { clockHands, sweetsLayout, type DisplayItem } from "../lib/scheduleDisplay";
import { resolveScheduleIcon } from "../lib/scheduleIcons";

// The four countdown styles. Each draws into a square (or wide) SVG viewBox and scales with its card; colours come
// from the card's phase through CSS (currentColor), so the drawings only know geometry.

type VisualProps = { item: DisplayItem; nowMs: number; timeZone: string };

export function ScheduleVisual(props: VisualProps) {
  if (props.item.style === "sweets") return <SweetsVisual {...props} />;
  if (props.item.style === "journey") return <JourneyVisual {...props} />;
  if (props.item.style === "clock") return <ClockVisual {...props} />;
  return <DiscVisual {...props} />;
}

function ItemIcon({ item, className }: { item: DisplayItem; className: string }) {
  const Icon = resolveScheduleIcon(item.icon, item.kind);
  return (
    <div className={`schedule-icon ${className}`}>
      <Icon aria-hidden="true" strokeWidth={2.2} />
    </div>
  );
}

/** "Time Timer": the slice shrinks towards 12 o'clock; full and bright while ringing. */
export function DiscVisual({ item }: VisualProps) {
  const center = 50;
  const radius = 42;
  const angle = item.phase === "ringing" ? 360 : item.fraction * 360;
  const end = polar(center, radius, angle);
  return (
    <div className="schedule-visual visual-disc">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="disc-face" cx={center} cy={center} r={radius} />
        {angle >= 359.9 ? (
          <circle className="disc-slice" cx={center} cy={center} r={radius} />
        ) : angle > 0 ? (
          <path
            className="disc-slice"
            d={`M${center},${center} L${center},${center - radius} A${radius},${radius} 0 ${angle > 180 ? 1 : 0} 1 ${end.x},${end.y} Z`}
          />
        ) : null}
        {Array.from({ length: 12 }, (_, index) => {
          const inner = polar(center, radius + 1.5, index * 30);
          const outer = polar(center, radius + 5, index * 30);
          return <line key={index} className={index % 3 ? "disc-tick" : "disc-tick major"} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
        })}
      </svg>
      <ItemIcon item={item} className="icon-center" />
    </div>
  );
}

/** One sweet per minute (10 s for short timers; at most 12 sweets), eaten from the last one. */
export function SweetsVisual({ item }: VisualProps) {
  const clipBase = React.useId().replace(/:/g, "");
  if (item.phase === "ringing") {
    return (
      <div className="schedule-visual visual-party">
        <PartyPopper aria-hidden="true" strokeWidth={2} />
      </div>
    );
  }
  const { fills } = sweetsLayout(item.totalMs, item.remainingMs);
  const columns = fills.length <= 6 ? fills.length : Math.ceil(fills.length / 2);
  const rows = Math.ceil(fills.length / columns);
  const [width, height, gap, pad] = [16, 20, 5, 2];
  return (
    // Sweets keep the same size whatever their number; the row is at most 80 % of the card wide.
    <div className="schedule-visual visual-sweets" style={{ width: `min(82cqw, ${columns * 15}cqmin)` }}>
      <svg viewBox={`0 0 ${columns * width + (columns - 1) * gap + pad * 2} ${rows * height + (rows - 1) * gap + pad * 2}`} aria-hidden="true">
        {fills.map((fill, index) => {
          const x = pad + (index % columns) * (width + gap);
          const y = pad + Math.floor(index / columns) * (height + gap);
          const clipId = `${clipBase}-sweet-${index}`;
          return (
            <g key={index}>
              <clipPath id={clipId}>
                <rect x={x} y={y} width={width} height={height} rx={4} />
              </clipPath>
              {fill > 0 ? (
                <rect className="sweet-fill" x={x} y={y + height * (1 - fill)} width={width} height={height * fill} clipPath={`url(#${clipId})`} />
              ) : null}
              <rect className="sweet" x={x} y={y} width={width} height={height} rx={4} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A snail walks to the item's icon: halfway there, half the time gone. */
export function JourneyVisual({ item }: VisualProps) {
  const Goal = resolveScheduleIcon(item.icon, item.kind);
  const done = 1 - item.fraction;
  const trackStart = 8;
  const trackLength = 86;
  const snailX = trackStart + done * (trackLength - 14);
  return (
    <div className="schedule-visual visual-journey">
      <svg viewBox="0 0 130 50" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => {
          const x = trackStart + 10 + index * (trackLength / 9);
          return <circle key={index} className={x < snailX + 6 ? "journey-dot walked" : "journey-dot"} cx={x} cy={36} r={2.4} />;
        })}
        <g className="journey-snail" transform={`translate(${snailX},10) scale(1.3)`}>
          <Snail size={24} strokeWidth={2} />
        </g>
        <g className="journey-goal" transform="translate(100,8) scale(1.2)">
          <Goal size={24} strokeWidth={2} />
        </g>
      </svg>
    </div>
  );
}

/** A real clock in the frame's time zone, with a zone from the minute hand to the due time. */
export function ClockVisual({ item, nowMs, timeZone }: VisualProps) {
  const center = 50;
  const radius = 45;
  const hands = clockHands(nowMs, item.dueAtMs, timeZone);
  const zoneEnd = polar(center, radius - 2, hands.zoneStartDeg + hands.zoneSweepDeg);
  const zoneStart = polar(center, radius - 2, hands.zoneStartDeg);
  const hour = polar(center, radius * 0.5, hands.hourDeg);
  const minute = polar(center, radius * 0.8, hands.minuteDeg);
  return (
    <div className="schedule-visual visual-clock">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="clock-face" cx={center} cy={center} r={radius} />
        {hands.zoneSweepDeg > 0 ? (
          <path
            className="clock-zone"
            d={`M${center},${center} L${zoneStart.x},${zoneStart.y} A${radius - 2},${radius - 2} 0 ${hands.zoneSweepDeg > 180 ? 1 : 0} 1 ${zoneEnd.x},${zoneEnd.y} Z`}
          />
        ) : null}
        {Array.from({ length: 12 }, (_, index) => {
          const outer = polar(center, radius - 2, index * 30);
          const inner = polar(center, radius - (index % 3 ? 6 : 10), index * 30);
          return <line key={index} className={index % 3 ? "clock-tick" : "clock-tick major"} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} />;
        })}
        <circle className="clock-target" cx={zoneEnd.x} cy={zoneEnd.y} r={4.5} />
        <line className="clock-hand hour" x1={center} y1={center} x2={hour.x} y2={hour.y} />
        <line className="clock-hand minute" x1={center} y1={center} x2={minute.x} y2={minute.y} />
        <circle className="clock-pin" cx={center} cy={center} r={3.5} />
      </svg>
      <ItemIcon item={item} className="icon-corner" />
    </div>
  );
}

function polar(center: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: center + radius * Math.sin(radians), y: center - radius * Math.cos(radians) };
}
