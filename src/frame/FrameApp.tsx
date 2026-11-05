import * as React from "react";
import type { FamilyFrameDebugApi } from "./types";
import { logFrameEvent } from "./api";
import { activeSpecialDayForDate } from "./lib/specialDays";
import { useCalendarEvents } from "./hooks/useCalendarEvents";
import { useClock } from "./hooks/useClock";
import { useFrameConfig } from "./hooks/useFrameConfig";
import { useSchedule } from "./hooks/useSchedule";
import { usePhotos } from "./hooks/usePhotos";
import { useSlideshow } from "./hooks/useSlideshow";
import { useSpecialDayPulse } from "./hooks/useSpecialDayPulse";
import { useWeather } from "./hooks/useWeather";
import { InfoPanel } from "./components/InfoPanel";
import { PhotoStage } from "./components/PhotoStage";
import { ScheduleStage } from "./components/ScheduleStage";

declare global {
  interface Window {
    familyFrame?: FamilyFrameDebugApi;
  }
}

export function FrameApp() {
  const config = useFrameConfig();
  const photos = usePhotos(config.photoManifestUrl);
  const pinnedPhotoId = config.slideshow.pinnedPhotoId || "";
  const { schedule, serverNow } = useSchedule();
  // True while timers or routines cover the photo area: the slideshow waits underneath.
  const [scheduleActive, setScheduleActive] = React.useState(false);
  const slideshow = useSlideshow(photos, config.slideshow.intervalSeconds, pinnedPhotoId, scheduleActive);
  const photoStageRef = React.useRef<HTMLElement | null>(null);
  const weather = useWeather(config.weather);
  const events = useCalendarEvents(config.calendar);
  const clock = useClock(serverNow, schedule);
  const specialDayPulse = useSpecialDayPulse(config.specialDays.ambientEveryMinutes);
  const activeSpecialDay = activeSpecialDayForDate(config.specialDays, clock);

  React.useEffect(() => {
    logFrameEvent("frame-app-start", {
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visibilityState: document.visibilityState
    });
  }, []);

  React.useEffect(() => {
    const api: FamilyFrameDebugApi = {
      pause: () => slideshow.setManualPaused(true),
      play: () => slideshow.setManualPaused(false),
      resume: () => slideshow.setManualPaused(false),
      next: slideshow.nextPhoto,
      previous: slideshow.previousPhoto,
      show: (target) => {
        const index = typeof target === "number"
          ? target
          : photos.findIndex((photo) => photo.id === target || photo.src === target || photo.src.endsWith(target));
        return slideshow.showPhotoAt(index);
      },
      status: () => ({
        paused: slideshow.manualPaused,
        pinnedPhotoId,
        index: slideshow.photoIndex,
        total: photos.length,
        photo: photos[slideshow.photoIndex] || null
      }),
      photos: () => [...photos]
    };

    window.familyFrame = api;
    return () => {
      if (window.familyFrame === api) delete window.familyFrame;
    };
  }, [photos, pinnedPhotoId, slideshow]);

  return (
    <main className="frame-shell">
      <PhotoStage
        stageRef={photoStageRef}
        activePhoto={slideshow.activePhoto}
        frameName={config.frameName}
        activeSpecialDay={activeSpecialDay}
        specialDayPulse={specialDayPulse}
        onPhotoLoaded={slideshow.handlePhotoLoaded}
        onPhotoError={slideshow.handlePhotoError}
        covered={scheduleActive}
      />

      <ScheduleStage schedule={schedule} serverNow={serverNow} i18n={config.i18n} onActiveChange={setScheduleActive} />

      <InfoPanel
        clock={clock}
        i18n={config.i18n}
        weather={weather}
        events={events}
        maxEvents={config.calendar.maxEvents}
      />
    </main>
  );
}
