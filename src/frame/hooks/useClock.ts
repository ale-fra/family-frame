import * as React from "react";

export function useClock() {
  const [clock, setClock] = React.useState(new Date());

  React.useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return clock;
}
