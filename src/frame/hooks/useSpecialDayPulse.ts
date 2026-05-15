import * as React from "react";
import type { FrameConfig } from "@/lib/types";

export function useSpecialDayPulse(cadence: FrameConfig["specialDays"]["ambientEveryMinutes"]) {
  const [pulse, setPulse] = React.useState(0);

  React.useEffect(() => {
    const minMinutes = Math.max(1, Math.min(cadence.min, cadence.max));
    const maxMinutes = Math.max(minMinutes, cadence.max);
    let timeout: number | undefined;

    function scheduleNextPulse() {
      const delayMinutes = minMinutes + Math.random() * (maxMinutes - minMinutes);
      timeout = window.setTimeout(() => {
        setPulse((current) => current + 1);
        scheduleNextPulse();
      }, delayMinutes * 60_000);
    }

    scheduleNextPulse();
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [cadence.min, cadence.max]);

  return pulse;
}
