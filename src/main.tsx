import React from "react";
import { createRoot } from "react-dom/client";
import ICAL from "ical.js";
import "./styles.css";
import { defaultConfig, mergeConfig } from "@/lib/config";
import type {
  CalendarSource,
  CalendarSourcesManifest,
  FrameConfig,
  FrameSettings,
  Photo,
  PhotoManifest,
  SpecialDayConfig,
  SpecialDaySchedule,
  DateRangeSchedule
} from "@/lib/types";

const AdminApp = React.lazy(() => import("@/admin/AdminApp"));

type WeatherState = {
  current?: {
    temperature: number;
    apparentTemperature: number;
    code: number;
    windSpeed: number;
  };
  locationLabel?: string;
  forecast: Array<{
    date: string;
    min: number;
    max: number;
    code: number;
  }>;
  error?: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  calendarName?: string;
  startsAt: Date;
  endsAt?: Date;
  allDay: boolean;
  important: boolean;
};

type FamilyFrameDebugApi = {
  pause: () => void;
  play: () => void;
  resume: () => void;
  next: () => Photo | null;
  previous: () => Photo | null;
  show: (target: number | string) => Photo | null;
  status: () => {
    paused: boolean;
    pinnedPhotoId: string;
    index: number;
    total: number;
    photo: Photo | null;
  };
  photos: () => Photo[];
};

declare global {
  interface Window {
    familyFrame?: FamilyFrameDebugApi;
  }
}

function Root() {
  if (window.location.pathname.startsWith("/admin")) {
    return (
      <React.Suspense fallback={null}>
        <AdminApp />
      </React.Suspense>
    );
  }

  return <FrameApp />;
}

function FrameApp() {
  const [config, setConfig] = React.useState<FrameConfig>(defaultConfig);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [photoIndex, setPhotoIndex] = React.useState(0);
  const [manualPaused, setManualPaused] = React.useState(false);
  const [photoAspect, setPhotoAspect] = React.useState(1);
  const [photoStageSize, setPhotoStageSize] = React.useState({ width: 0, height: 0 });
  const [weather, setWeather] = React.useState<WeatherState>({ forecast: [] });
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [clock, setClock] = React.useState(new Date());
  const [specialDayPulse, setSpecialDayPulse] = React.useState(0);
  const [loadedPhotoKey, setLoadedPhotoKey] = React.useState("");
  const photoStageRef = React.useRef<HTMLElement | null>(null);
  const shuffleQueueRef = React.useRef<number[]>([]);
  const failedPhotoKeysRef = React.useRef<Set<string>>(new Set());
  const activePhotoKeyRef = React.useRef("");
  const photoListSignatureRef = React.useRef("");
  const photoListCountRef = React.useRef(0);
  const activePhotoSelectedAtRef = React.useRef(Date.now());
  const pinnedPhotoId = config.slideshow.pinnedPhotoId || "";
  const activePhoto = photos[photoIndex];
  const slideshowIntervalSeconds = normalizedSlideshowInterval(config.slideshow.intervalSeconds);

  React.useEffect(() => {
    logFrameEvent("frame-app-start", {
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visibilityState: document.visibilityState
    });
  }, []);

  const showPhotoAt = React.useCallback((index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= photos.length) return null;
    shuffleQueueRef.current = [];
    activePhotoKeyRef.current = photoKey(photos[index]);
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(index);
    return photos[index] || null;
  }, [photos]);

  const nextPhoto = React.useCallback(() => {
    if (photos.length === 0) return null;
    const nextIndex = nextDisplayablePhotoIndex(photoIndex, photos, shuffleQueueRef, failedPhotoKeysRef);
    activePhotoKeyRef.current = photos[nextIndex] ? photoKey(photos[nextIndex]) : "";
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(nextIndex);
    return photos[nextIndex] || null;
  }, [photoIndex, photos]);

  const previousPhoto = React.useCallback(() => {
    if (photos.length === 0) return null;
    const previousIndex = photoIndex <= 0 ? photos.length - 1 : photoIndex - 1;
    shuffleQueueRef.current = [];
    activePhotoKeyRef.current = photos[previousIndex] ? photoKey(photos[previousIndex]) : "";
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(previousIndex);
    return photos[previousIndex] || null;
  }, [photoIndex, photos]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await fetch("/frame.config.json", { cache: "no-store" });
        const loadedConfig = response.ok ? await response.json() as Partial<FrameConfig> : defaultConfig;
        const settings = await fetchFrameSettings();
        if (!cancelled) setConfig(mergeConfig(loadedConfig, settings));
      } catch {
        if (!cancelled) setConfig(defaultConfig);
      }
    }

    loadConfig();
    const interval = window.setInterval(loadConfig, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      const dynamicPhotos = await fetchApprovedPhotos();
      if (cancelled) return;

      if (dynamicPhotos) {
        setPhotos((currentPhotos) => {
          syncFailedPhotoKeys(failedPhotoKeysRef.current, dynamicPhotos);
          return samePhotoList(currentPhotos, dynamicPhotos) ? currentPhotos : dynamicPhotos;
        });
        return;
      }

      fetch(config.photoManifestUrl, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Photo manifest unavailable");
          return response.json() as Promise<PhotoManifest>;
        })
        .then((manifest) => {
          const manifestPhotos = manifest.photos.filter((photo) => photo.src);
          if (!cancelled) {
            setPhotos((currentPhotos) => {
              syncFailedPhotoKeys(failedPhotoKeysRef.current, manifestPhotos);
              return samePhotoList(currentPhotos, manifestPhotos) ? currentPhotos : manifestPhotos;
            });
          }
        })
        .catch(() => {
          if (!cancelled) setPhotos([]);
        });
    }

    loadPhotos();
    const interval = window.setInterval(loadPhotos, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [config.photoManifestUrl]);

  React.useEffect(() => {
    const signature = photos.map(photoSignature).join("\u0001");
    if (photoListSignatureRef.current !== signature) {
      logFrameEvent(photoListSignatureRef.current ? "photo-list-changed" : "photo-list-loaded", {
        count: photos.length,
        previousCount: photoListCountRef.current
      });
      photoListSignatureRef.current = signature;
      photoListCountRef.current = photos.length;
    }

    shuffleQueueRef.current = [];
    setPhotoIndex((current) => {
      if (photos.length === 0) {
        activePhotoKeyRef.current = "";
        return 0;
      }

      const activeKey = activePhotoKeyRef.current;
      if (activeKey) {
        const stableIndex = photos.findIndex((photo) => photoKey(photo) === activeKey);
        if (stableIndex !== -1) return stableIndex;
      }

      const nextIndex = current >= photos.length ? 0 : current;
      activePhotoKeyRef.current = photos[nextIndex] ? photoKey(photos[nextIndex]) : "";
      if (nextIndex !== current) activePhotoSelectedAtRef.current = Date.now();
      return nextIndex;
    });
  }, [photos]);

  React.useEffect(() => {
    if (!pinnedPhotoId) return;
    const pinnedIndex = photos.findIndex((photo) => photo.id === pinnedPhotoId);
    if (pinnedIndex === -1) return;
    shuffleQueueRef.current = [];
    activePhotoKeyRef.current = photoKey(photos[pinnedIndex]);
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(pinnedIndex);
  }, [photos, pinnedPhotoId]);

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

  React.useEffect(() => {
    if (!activePhoto || photos.length < 2 || manualPaused || pinnedPhotoId) return;
    if (loadedPhotoKey !== photoKey(activePhoto)) return;

    const timeout = window.setTimeout(() => {
      setPhotoIndex((current) => {
        const nextIndex = nextDisplayablePhotoIndex(current, photos, shuffleQueueRef, failedPhotoKeysRef);
        logFrameEvent("slideshow-advance", {
          reason: "timer",
          previousIndex: current,
          nextIndex,
          total: photos.length,
          intervalSeconds: slideshowIntervalSeconds,
          previousPhoto: photos[current]?.src || "",
          nextPhoto: photos[nextIndex]?.src || ""
        });
        activePhotoKeyRef.current = photos[nextIndex] ? photoKey(photos[nextIndex]) : "";
        if (nextIndex !== current) activePhotoSelectedAtRef.current = Date.now();
        return nextIndex;
      });
    }, slideshowIntervalSeconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [activePhoto, loadedPhotoKey, manualPaused, photos, pinnedPhotoId, slideshowIntervalSeconds]);

  React.useEffect(() => {
    const api: FamilyFrameDebugApi = {
      pause: () => setManualPaused(true),
      play: () => setManualPaused(false),
      resume: () => setManualPaused(false),
      next: nextPhoto,
      previous: previousPhoto,
      show: (target) => {
        const index = typeof target === "number"
          ? target
          : photos.findIndex((photo) => photo.id === target || photo.src === target || photo.src.endsWith(target));
        return showPhotoAt(index);
      },
      status: () => ({
        paused: manualPaused,
        pinnedPhotoId,
        index: photoIndex,
        total: photos.length,
        photo: photos[photoIndex] || null
      }),
      photos: () => [...photos]
    };

    window.familyFrame = api;
    return () => {
      if (window.familyFrame === api) delete window.familyFrame;
    };
  }, [manualPaused, nextPhoto, photoIndex, photos, pinnedPhotoId, previousPhoto, showPhotoAt]);

  React.useEffect(() => {
    if (!activePhoto) return;
    logFrameEvent("photo-selected", {
      index: photoIndex,
      total: photos.length,
      photoId: activePhoto.id || "",
      src: activePhoto.src,
      caption: activePhoto.caption || "",
      visibilityState: document.visibilityState
    });
  }, [activePhoto, photoIndex, photos.length]);

  React.useEffect(() => {
    const updateClock = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(updateClock);
  }, []);

  React.useEffect(() => {
    const cadence = config.specialDays.ambientEveryMinutes;
    const minMinutes = Math.max(1, Math.min(cadence.min, cadence.max));
    const maxMinutes = Math.max(minMinutes, cadence.max);
    let timeout: number | undefined;

    function scheduleNextPulse() {
      const delayMinutes = minMinutes + Math.random() * (maxMinutes - minMinutes);
      timeout = window.setTimeout(() => {
        setSpecialDayPulse((current) => current + 1);
        scheduleNextPulse();
      }, delayMinutes * 60_000);
    }

    scheduleNextPulse();
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [config.specialDays.ambientEveryMinutes.min, config.specialDays.ambientEveryMinutes.max]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        const location = await resolveWeatherLocation(config.weather);
        if (cancelled) return;

        const params = new URLSearchParams({
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          timezone: location.timezone,
          current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
          daily: "weather_code,temperature_2m_max,temperature_2m_min",
          forecast_days: "4"
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
        if (!response.ok) throw new Error("Weather unavailable");
        const payload = await response.json();
        if (cancelled) return;
        setWeather({
          locationLabel: location.label,
          current: {
            temperature: payload.current.temperature_2m,
            apparentTemperature: payload.current.apparent_temperature,
            code: payload.current.weather_code,
            windSpeed: payload.current.wind_speed_10m
          },
          forecast: payload.daily.time.slice(1, 4).map((date: string, index: number) => ({
            date,
            min: payload.daily.temperature_2m_min[index + 1],
            max: payload.daily.temperature_2m_max[index + 1],
            code: payload.daily.weather_code[index + 1]
          }))
        });
      } catch {
        if (!cancelled) {
          setWeather((current) => ({ ...current, error: "Meteo non disponibile" }));
        }
      }
    }

    loadWeather();
    const interval = window.setInterval(loadWeather, Math.max(5, config.weather.refreshMinutes) * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [config.weather]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadCalendarEvents() {
      const sources = await calendarSources(config.calendar);
      const loadedEvents = await Promise.allSettled(
        sources.map(async (source) => {
          const response = await fetch(source.icsUrl, { cache: "no-store" });
          if (!response.ok) throw new Error(`Calendar unavailable: ${source.label}`);
          const calendarText = await response.text();
          return parseEvents(calendarText, config.calendar.lookaheadDays, config.calendar.importantKeywords, source.label);
        })
      );

      if (cancelled) return;

      setEvents(
        uniqueCalendarEvents(loadedEvents.flatMap((result) => (result.status === "fulfilled" ? result.value : [])))
          .sort(compareCalendarEvents)
      );
    }

    loadCalendarEvents().catch(() => {
      if (!cancelled) setEvents([]);
    });

    const interval = window.setInterval(() => {
      loadCalendarEvents().catch(() => {
        if (!cancelled) setEvents([]);
      });
    }, Math.max(5, config.calendar.refreshMinutes) * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [config.calendar]);

  const activeSpecialDay = activeSpecialDayForDate(config.specialDays, clock);
  const activeSpecialDayEffects = new Set(activeSpecialDay?.effects || []);
  const photoBox = containedBox(photoStageSize.width - 28, photoStageSize.height - 28, photoAspect);

  return (
    <main className="frame-shell">
      <section className="photo-stage" ref={photoStageRef}>
        <SpecialDayLayer specialDay={activeSpecialDay} pulse={specialDayPulse} />
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
              <img
                key={activePhoto.src}
                src={activePhoto.src}
                alt={activePhoto.caption || "Foto di famiglia"}
                loading="eager"
                decoding="sync"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    const selectedPhoto = activePhoto;
                    const selectedPhotoKey = photoKey(selectedPhoto);
                    setPhotoAspect(image.naturalWidth / image.naturalHeight);
                    activePhotoKeyRef.current = selectedPhotoKey;
                    setLoadedPhotoKey(selectedPhotoKey);
                    failedPhotoKeysRef.current.delete(selectedPhotoKey);
                    logFrameEvent("photo-loaded", {
                      index: photoIndex,
                      total: photos.length,
                      photoId: selectedPhoto.id || "",
                      src: selectedPhoto.src,
                      naturalWidth: image.naturalWidth,
                      naturalHeight: image.naturalHeight,
                      elapsedMs: Date.now() - activePhotoSelectedAtRef.current,
                      visibilityState: document.visibilityState
                    });
                    window.requestAnimationFrame(() => {
                      window.requestAnimationFrame(() => {
                        if (activePhotoKeyRef.current !== selectedPhotoKey) return;
                        logFrameEvent("photo-visible", {
                          index: photoIndex,
                          total: photos.length,
                          photoId: selectedPhoto.id || "",
                          src: selectedPhoto.src,
                          elapsedMs: Date.now() - activePhotoSelectedAtRef.current,
                          visibilityState: document.visibilityState,
                          ...imageVisibilityDetails(image)
                        });
                      });
                    });
                  }
                }}
                onError={() => {
                  failedPhotoKeysRef.current.add(photoKey(activePhoto));
                  console.warn("Skipping photo that failed to load:", activePhoto.src);
                  logFrameEvent("photo-load-error", {
                    index: photoIndex,
                    total: photos.length,
                    photoId: activePhoto.id || "",
                    src: activePhoto.src,
                    caption: activePhoto.caption || ""
                  });
                  if (photos.length > 1) {
                    setPhotoIndex((current) => {
                      const nextIndex = nextDisplayablePhotoIndex(current, photos, shuffleQueueRef, failedPhotoKeysRef);
                      logFrameEvent("slideshow-advance", {
                        reason: "photo-load-error",
                        previousIndex: current,
                        nextIndex,
                        total: photos.length,
                        previousPhoto: photos[current]?.src || "",
                        nextPhoto: photos[nextIndex]?.src || ""
                      });
                      activePhotoKeyRef.current = photos[nextIndex] ? photoKey(photos[nextIndex]) : "";
                      if (nextIndex !== current) activePhotoSelectedAtRef.current = Date.now();
                      return nextIndex;
                    });
                  }
                }}
              />
              {activeSpecialDayEffects.has("flowers") ? <PhotoFrameFlowers /> : null}
            </div>
            {activePhoto.caption ? <div className="photo-caption">{activePhoto.caption}</div> : null}
          </>
        ) : (
          <div className="empty-photos">
            <h1>{config.frameName}</h1>
            <p>Apri /admin dal telefono per caricare e approvare nuove foto</p>
          </div>
        )}
      </section>

      <aside className="info-panel">
        <header className="status-block">
          <div className="date">{formatFullDate(clock)}</div>
          <div className="status-top">
            <div className="time-cluster">
              <div className="time">{formatTime(clock)}</div>
            </div>
            {weather.current ? (
              <div className="weather-cluster">
                <div className="current-weather-row">
                  <WeatherIcon code={weather.current.code} className="weather-icon" />
                  <span className="current-temperature">{Math.round(weather.current.temperature)}°</span>
                </div>
              </div>
            ) : null}
          </div>
          {weather.current ? (
            <div className="forecast-row">
              {weather.forecast.map((day) => (
                <div className="forecast-day" key={day.date}>
                  <span>{formatDay(day.date)}</span>
                  <WeatherIcon code={day.code} className="forecast-icon" />
                  <strong>{Math.round(day.max)}°</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{weather.error || "Caricamento meteo"}</p>
          )}
        </header>

        <section className="events-block">
          <div className="section-label">Prossimi eventi</div>
          {events.length > 0 ? (
            <div className="event-list">
              {events.slice(0, config.calendar.maxEvents).map((event) => (
                <article className={event.important ? "event important" : "event"} key={event.id}>
                  <div className="event-date">{formatEventDate(event)}</div>
                  <div className="event-title">
                    <span>{event.title}</span>
                    {event.calendarName ? <small>{event.calendarName}</small> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">Nessun evento in arrivo</p>
          )}
        </section>
      </aside>
    </main>
  );
}

function SpecialDayLayer({ specialDay, pulse }: { specialDay?: SpecialDayConfig; pulse: number }) {
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
  // top-left
  [
    { kind: "peony",      x: 32, y: 32, size: 30, delay: 0 },
    { kind: "leaf",       x: 14, y: 52, size: 22, delay: 0.4 },
    { kind: "peony-pale", x: 54, y: 18, size: 24, delay: 0.8 },
    { kind: "daisy",      x: 68, y: 44, size: 20, delay: 1.2 },
    { kind: "bud",        x: 22, y: 74, size: 18, delay: 1.6 },
    { kind: "leaf-dark",  x: 50, y: 64, size: 16, delay: 2.0 },
    { kind: "heart",      x: 76, y: 20, size: 14, delay: 2.4 },
  ],
  // top-right (mirror H: x → 96-x)
  [
    { kind: "peony",      x: 64, y: 32, size: 30, delay: 0.2 },
    { kind: "leaf",       x: 82, y: 52, size: 22, delay: 0.6 },
    { kind: "peony-pale", x: 42, y: 18, size: 24, delay: 1.0 },
    { kind: "daisy",      x: 28, y: 44, size: 20, delay: 1.4 },
    { kind: "bud",        x: 74, y: 74, size: 18, delay: 1.8 },
    { kind: "leaf-dark",  x: 46, y: 64, size: 16, delay: 2.2 },
    { kind: "heart",      x: 20, y: 20, size: 14, delay: 2.6 },
  ],
  // bottom-left (mirror V: y → 96-y)
  [
    { kind: "peony",      x: 32, y: 64, size: 30, delay: 0.3 },
    { kind: "leaf",       x: 14, y: 44, size: 22, delay: 0.7 },
    { kind: "peony-pale", x: 54, y: 78, size: 24, delay: 1.1 },
    { kind: "daisy",      x: 68, y: 52, size: 20, delay: 1.5 },
    { kind: "bud",        x: 22, y: 22, size: 18, delay: 1.9 },
    { kind: "leaf-dark",  x: 50, y: 32, size: 16, delay: 2.3 },
    { kind: "heart",      x: 76, y: 76, size: 14, delay: 2.7 },
  ],
  // bottom-right (mirror H+V)
  [
    { kind: "peony",      x: 64, y: 64, size: 30, delay: 0.5 },
    { kind: "leaf",       x: 82, y: 44, size: 22, delay: 0.9 },
    { kind: "peony-pale", x: 42, y: 78, size: 24, delay: 1.3 },
    { kind: "daisy",      x: 28, y: 52, size: 20, delay: 1.7 },
    { kind: "bud",        x: 74, y: 22, size: 18, delay: 2.1 },
    { kind: "leaf-dark",  x: 46, y: 32, size: 16, delay: 2.5 },
    { kind: "heart",      x: 20, y: 76, size: 14, delay: 2.9 },
  ],
];

const CORNER_CLASSES = ["flower-corner-tl", "flower-corner-tr", "flower-corner-bl", "flower-corner-br"];

function FlowerCorner({ flowers, cornerClass }: { flowers: typeof CORNER_FLOWERS[0]; cornerClass: string }) {
  return (
    <div className={`flower-corner ${cornerClass}`}>
      {flowers.map((f, i) => (
        <div
          key={i}
          className={`flower-el${f.kind === "heart" ? " flower-heart" : ""}`}
          style={{ left: f.x, top: f.y, animationDelay: `${f.delay}s` }}
        >
          <FlowerSVG kind={f.kind} size={f.size} />
        </div>
      ))}
    </div>
  );
}

function PhotoFrameFlowers() {
  return (
    <div className="photo-frame-flowers">
      {CORNER_FLOWERS.map((flowers, i) => (
        <FlowerCorner key={i} flowers={flowers} cornerClass={CORNER_CLASSES[i]} />
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

async function fetchApprovedPhotos() {
  try {
    const response = await fetch("/api/photos?status=approved", { cache: "no-store" });
    if (!response.ok) throw new Error("Photo API unavailable");
    const manifest = await response.json() as PhotoManifest;
    return manifest.photos.filter((photo) => photo.src);
  } catch {
    return null;
  }
}

async function fetchFrameSettings(): Promise<FrameSettings> {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) return {};
    return await response.json() as FrameSettings;
  } catch {
    return {};
  }
}

function nextDisplayablePhotoIndex(
  current: number,
  photos: Photo[],
  queueRef: React.MutableRefObject<number[]>,
  failedKeysRef: React.MutableRefObject<Set<string>>
) {
  if (photos.length < 2) return 0;

  const failedKeys = failedKeysRef.current;
  const isDisplayable = (index: number) => {
    const photo = photos[index];
    return Boolean(photo) && !failedKeys.has(photoKey(photo));
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (queueRef.current.length === 0) {
      queueRef.current = shuffle(
        Array.from({ length: photos.length }, (_value, index) => index)
          .filter((index) => index !== current && isDisplayable(index))
      );
    }

    while (queueRef.current.length > 0) {
      const nextIndex = queueRef.current.pop();
      if (nextIndex !== undefined && nextIndex !== current && isDisplayable(nextIndex)) return nextIndex;
    }
  }

  return current >= 0 && current < photos.length ? current : 0;
}

function normalizedSlideshowInterval(value: number) {
  return Math.max(5, Number.isFinite(value) ? value : defaultConfig.slideshow.intervalSeconds);
}

function samePhotoList(left: Photo[], right: Photo[]) {
  return left.length === right.length && left.every((photo, index) => photoSignature(photo) === photoSignature(right[index]));
}

function photoSignature(photo: Photo) {
  return [photoKey(photo), photo.src, photo.thumbSrc || "", photo.caption || ""].join("\u0000");
}

function photoKey(photo: Photo) {
  return photo.id || photo.src;
}

function syncFailedPhotoKeys(failedKeys: Set<string>, photos: Photo[]) {
  const validKeys = new Set(photos.map(photoKey));
  for (const key of failedKeys) {
    if (!validKeys.has(key)) failedKeys.delete(key);
  }
}

function imageVisibilityDetails(image: HTMLImageElement): Record<string, string | number | boolean | null> {
  const imageRect = image.getBoundingClientRect();
  const parentRect = image.parentElement?.getBoundingClientRect();
  const centerX = imageRect.left + imageRect.width / 2;
  const centerY = imageRect.top + imageRect.height / 2;
  const topElement = document.elementFromPoint(centerX, centerY);

  return {
    imageWidth: Math.round(imageRect.width),
    imageHeight: Math.round(imageRect.height),
    imageLeft: Math.round(imageRect.left),
    imageTop: Math.round(imageRect.top),
    parentWidth: parentRect ? Math.round(parentRect.width) : null,
    parentHeight: parentRect ? Math.round(parentRect.height) : null,
    complete: image.complete,
    currentSrc: image.currentSrc,
    topElementClass: topElement instanceof HTMLElement ? topElement.className : ""
  };
}

function logFrameEvent(event: string, details: Record<string, string | number | boolean | null>) {
  const payload = {
    event,
    clientId: frameClientId(),
    bootId: frameBootId(),
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    details
  };

  fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {
    // The frame should keep running even when the local photo server is unavailable.
  });
}

function frameClientId() {
  return storedFrameId("family-frame-client-id");
}

function frameBootId() {
  const frameWindow = window as Window & { __familyFrameBootId?: string };
  if (!frameWindow.__familyFrameBootId) {
    frameWindow.__familyFrameBootId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  }
  return frameWindow.__familyFrameBootId;
}

function storedFrameId(key: string) {
  try {
    const current = window.sessionStorage.getItem(key);
    if (current) return current;
    const next = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return "session-storage-unavailable";
  }
}

function shuffle(values: number[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function containedBox(maxWidth: number, maxHeight: number, aspect: number) {
  if (maxWidth <= 0 || maxHeight <= 0 || aspect <= 0) return null;

  const frameAspect = maxWidth / maxHeight;
  if (frameAspect > aspect) {
    return {
      width: Math.round(maxHeight * aspect),
      height: Math.round(maxHeight)
    };
  }

  return {
    width: Math.round(maxWidth),
    height: Math.round(maxWidth / aspect)
  };
}

async function calendarSources(calendar: FrameConfig["calendar"]): Promise<CalendarSource[]> {
  const configuredSources = normalizeCalendarSources(calendar.sources);

  if (configuredSources.length > 0) return configuredSources;

  const manifestSources = await fetchCalendarSourcesManifest(calendar);
  if (manifestSources.length > 0) return manifestSources;

  return [{
    label: "Famiglia",
    icsUrl: calendar.icsUrl
  }];
}

async function fetchCalendarSourcesManifest(calendar: FrameConfig["calendar"]) {
  if (!calendar.sourcesUrl) return [];

  try {
    const response = await fetch(calendar.sourcesUrl, { cache: "no-store" });
    if (!response.ok) return [];
    const manifest = await response.json() as CalendarSourcesManifest;
    return normalizeCalendarSources(manifest.sources);
  } catch {
    return [];
  }
}

function normalizeCalendarSources(sources: CalendarSource[] | undefined) {
  return sources
    ?.filter((source) => source.enabled !== false && typeof source.icsUrl === "string" && source.icsUrl.trim())
    .map((source) => ({
      ...source,
      label: typeof source.label === "string" && source.label.trim() ? source.label.trim() : "Calendario",
      icsUrl: source.icsUrl.trim()
    })) || [];
}

function parseEvents(calendarText: string, lookaheadDays: number, keywords: string[], calendarName?: string): CalendarEvent[] {
  const jcal = ICAL.parse(calendarText);
  const component = new ICAL.Component(jcal);
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + lookaheadDays);
  until.setHours(23, 59, 59, 999);
  const normalizedKeywords = keywords.map((keyword) => keyword.toLocaleLowerCase());
  const events: CalendarEvent[] = [];

  component.getAllSubcomponents("vevent").forEach((vevent, index) => {
    const event = new ICAL.Event(vevent);
    const parsedTitle = parseEventTitle(event.summary || "Untitled event");
    const title = parsedTitle.title;
    const sourceId = calendarName || "calendar";
    const baseId = `${sourceId}-${event.uid || `${title}-${index}`}`;
    const important = parsedTitle.important || titleMatchesImportantKeyword(title, normalizedKeywords);

    if (event.isRecurrenceException()) return;

    if (event.isRecurring()) {
      const iterator = event.iterator();
      let occurrence: ICAL.Time | null;
      let guard = 0;

      while ((occurrence = iterator.next()) && guard < 1000) {
        guard += 1;
        const details = event.getOccurrenceDetails(occurrence);
        const startsAt = details.startDate.toJSDate();
        const endsAt = details.endDate?.toJSDate();
        const effectiveEnd = endsAt ?? startsAt;

        if (effectiveEnd < now) continue;
        if (startsAt > until) break;

        events.push({
          id: `${baseId}-${startsAt.toISOString()}`,
          title,
          calendarName,
          startsAt,
          endsAt,
          allDay: details.startDate.isDate,
          important
        });
      }

      return;
    }

    events.push({
      id: baseId,
      title,
      calendarName,
      startsAt: event.startDate.toJSDate(),
      endsAt: event.endDate?.toJSDate(),
      allDay: event.startDate.isDate,
      important
    });
  });

  return uniqueCalendarEvents(events)
    .filter((event) => {
      const effectiveEnd = event.endsAt ?? event.startsAt;
      return effectiveEnd >= now && event.startsAt <= until;
    })
    .sort(compareCalendarEvents);
}

function titleMatchesImportantKeyword(title: string, normalizedKeywords: string[]) {
  const normalizedTitle = title.toLocaleLowerCase();
  return normalizedKeywords.some((keyword) => normalizedTitle.includes(keyword));
}

function parseEventTitle(rawTitle: string) {
  const trimmedTitle = rawTitle.trim();
  const important = trimmedTitle.startsWith("!");
  const titleWithoutFlag = important ? trimmedTitle.replace(/^!\s*/, "") : trimmedTitle;
  const titleWithoutTimePrefix = stripLeadingCompactTime(titleWithoutFlag);

  return {
    title: titleWithoutTimePrefix || titleWithoutFlag || rawTitle,
    important
  };
}

function stripLeadingCompactTime(title: string) {
  return title.replace(/^\d{4}(?:\s+|[-:.]\s*)/, "").trim();
}

function uniqueCalendarEvents(events: CalendarEvent[]) {
  const seen = new Set<string>();
  const uniqueEvents: CalendarEvent[] = [];

  for (const event of events) {
    const key = [
      event.title.trim().toLowerCase(),
      event.startsAt.getTime(),
      event.endsAt?.getTime() ?? "",
      event.allDay ? "all-day" : "timed"
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    uniqueEvents.push(event);
  }

  return uniqueEvents;
}

function compareCalendarEvents(left: CalendarEvent, right: CalendarEvent) {
  const startDifference = left.startsAt.getTime() - right.startsAt.getTime();
  if (startDifference !== 0) return startDifference;

  const leftEnd = left.endsAt?.getTime() ?? left.startsAt.getTime();
  const rightEnd = right.endsAt?.getTime() ?? right.startsAt.getTime();
  const endDifference = leftEnd - rightEnd;
  if (endDifference !== 0) return endDifference;

  return left.title.localeCompare(right.title);
}

function activeSpecialDayForDate(specialDays: FrameConfig["specialDays"], date: Date) {
  if (specialDays.enabled === false) return undefined;
  return specialDays.events.find((event) => event.enabled !== false && isSpecialDayActive(event.schedule, date));
}

function isSpecialDayActive(schedule: SpecialDaySchedule, date: Date) {
  if (schedule.type === "fixedDate") {
    return date.getMonth() + 1 === schedule.month && date.getDate() === schedule.day;
  }

  if (schedule.type === "dateRange") {
    return isDateRangeActive(schedule, date);
  }

  if (schedule.type === "nthWeekday") {
    const target = nthWeekdayOfMonth(date.getFullYear(), schedule.month, schedule.weekday, schedule.nth);
    return sameLocalDate(date, target);
  }

  if (schedule.type === "easterOffset") {
    const start = addDays(easterDate(date.getFullYear()), schedule.offsetDays);
    const durationDays = Math.max(1, schedule.durationDays || 1);
    const end = addDays(start, durationDays - 1);
    return startOfLocalDay(date) >= startOfLocalDay(start) && startOfLocalDay(date) <= startOfLocalDay(end);
  }

  return false;
}

function isDateRangeActive(schedule: DateRangeSchedule, date: Date) {
  const year = date.getFullYear();
  const start = new Date(year, schedule.start.month - 1, schedule.start.day);
  const end = new Date(year, schedule.end.month - 1, schedule.end.day);
  const today = startOfLocalDay(date).getTime();

  if (start <= end) {
    return today >= start.getTime() && today <= end.getTime();
  }

  const startThisYear = start.getTime();
  const endThisYear = end.getTime();
  const startPreviousYear = new Date(year - 1, schedule.start.month - 1, schedule.start.day).getTime();
  const endNextYear = new Date(year + 1, schedule.end.month - 1, schedule.end.day).getTime();

  return (today >= startThisYear && today <= endNextYear) || (today >= startPreviousYear && today <= endThisYear);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  const firstDay = new Date(year, month - 1, 1);
  const offset = (weekday - firstDay.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + offset + (nth - 1) * 7);
}

function easterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function sameLocalDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

type WeatherLocation = {
  latitude: number;
  longitude: number;
  timezone: string;
  label: string;
};

async function resolveWeatherLocation(config: FrameConfig["weather"]): Promise<WeatherLocation> {
  const city = config.city?.trim();
  const fallback = {
    latitude: config.latitude,
    longitude: config.longitude,
    timezone: config.timezone,
    label: config.label || city || "Meteo"
  };

  if (!city) return fallback;

  const params = new URLSearchParams({
    name: city,
    count: "1",
    language: "it",
    format: "json"
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
  if (!response.ok) return fallback;

  const payload = await response.json() as {
    results?: Array<{
      name: string;
      country_code?: string;
      latitude: number;
      longitude: number;
      timezone?: string;
    }>;
  };
  const match = payload.results?.[0];
  if (!match) return fallback;

  return {
    latitude: match.latitude,
    longitude: match.longitude,
    timezone: match.timezone || config.timezone,
    label: match.country_code ? `${match.name}, ${match.country_code}` : match.name
  };
}

function WeatherIcon({ code, className }: { code: number; className: string }) {
  const kind = weatherKind(code);

  return (
    <svg className={className} viewBox="0 0 96 96" role="img" aria-label={weatherDescription(kind)}>
      {kind === "sun" ? (
        <>
          <circle className="weather-sun" cx="48" cy="48" r="18" />
          <path className="weather-ray" d="M48 12v12M48 72v12M12 48h12M72 48h12M22 22l8.5 8.5M65.5 65.5 74 74M74 22l-8.5 8.5M30.5 65.5 22 74" />
        </>
      ) : null}
      {kind === "cloud" ? (
        <>
          <circle className="weather-sun weather-sun-soft" cx="35" cy="35" r="15" />
          <CloudShape />
        </>
      ) : null}
      {kind === "fog" ? (
        <>
          <CloudShape />
          <path className="weather-line" d="M20 62h56M14 73h48M34 84h42" />
        </>
      ) : null}
      {kind === "rain" ? (
        <>
          <CloudShape />
          <path className="weather-drop" d="M31 67l-5 11M48 68l-5 12M65 67l-5 11" />
        </>
      ) : null}
      {kind === "snow" ? (
        <>
          <CloudShape />
          <path className="weather-snow" d="M31 71v12M25 77h12M27 73l8 8M35 73l-8 8M58 70v12M52 76h12M54 72l8 8M62 72l-8 8" />
        </>
      ) : null}
      {kind === "storm" ? (
        <>
          <CloudShape />
          <path className="weather-bolt" d="M49 57 38 77h12l-5 15 17-25H50l7-10z" />
        </>
      ) : null}
    </svg>
  );
}

function CloudShape() {
  return <path className="weather-cloud" d="M27 60c-8 0-14-5.7-14-13 0-6.7 5-12.1 11.4-12.9C27.6 26.3 35.2 21 44 21c10.4 0 19.1 7.1 21.6 16.7H67c8.8 0 16 6.7 16 15S75.8 68 67 68H28c-.3 0-.7 0-1-.1z" />;
}

function weatherKind(code: number) {
  if (code === 0) return "sun";
  if ([1, 2, 3].includes(code)) return "cloud";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "cloud";
}

function weatherDescription(kind: ReturnType<typeof weatherKind>) {
  const labels = {
    sun: "Sereno",
    cloud: "Nuvoloso",
    fog: "Nebbia",
    rain: "Pioggia",
    snow: "Neve",
    storm: "Temporale"
  };
  return labels[kind];
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

function formatDay(dateText: string) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(new Date(dateText));
}

function formatEventDate(event: CalendarEvent) {
  if (event.allDay) {
    return new Intl.DateTimeFormat("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short"
    }).format(event.startsAt);
  }
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(event.startsAt);
}


createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
