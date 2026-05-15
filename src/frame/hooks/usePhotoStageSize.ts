import * as React from "react";

export function usePhotoStageSize() {
  const photoStageRef = React.useRef<HTMLElement | null>(null);
  const [photoStageSize, setPhotoStageSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const element = photoStageRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setPhotoStageSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { photoStageRef, photoStageSize };
}
