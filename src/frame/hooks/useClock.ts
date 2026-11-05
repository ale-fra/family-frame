import * as React from "react";

/** Update the header from the same clock as the countdowns, including when a new sample arrives. */
export function useClock(now: () => number, clockSample: unknown) {
  const [, redraw] = React.useReducer((count) => count + 1, 0);

  React.useEffect(() => {
    let timeout: number;
    const update = () => {
      redraw();
      timeout = window.setTimeout(update, 60_000 - (now() % 60_000));
    };
    timeout = window.setTimeout(update, 60_000 - (now() % 60_000));
    return () => window.clearTimeout(timeout);
  }, [now, clockSample]);

  return new Date(now());
}
