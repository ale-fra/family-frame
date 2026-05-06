import React from "react";
import { createRoot } from "react-dom/client";
import ICAL from "ical.js";
import "./styles.css";

type FrameConfig = {
  frameName: string;
  photoManifestUrl: string;
  weather: {
    latitude: number;
    longitude: string | number;
    timezone: string;
    label: string;
    refreshMinutes: number;
  };
  calendar: {
    icsUrl: string;
    lookaheadDays: number;
    importantKeywords: string[];
  };
  slideshow: {
    intervalSeconds: number;
  };
};

type Photo = {
  id?: string;
  src: string;
  thumbSrc?: string;
  caption?: string;
};

type PhotoStatus = "pending" | "approved" | "hidden" | "trashed";

type AdminPhoto = Photo & {
  id: string;
  originalName: string;
  status: PhotoStatus;
  source: "web" | "telegram";
  size: number;
  createdAt: string;
  updatedAt: string;
};

type PhotoManifest = {
  photos: Photo[];
};

type WeatherState = {
  current?: {
    temperature: number;
    apparentTemperature: number;
    code: number;
    windSpeed: number;
  };
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
  startsAt: Date;
  endsAt?: Date;
  allDay: boolean;
  important: boolean;
};

const defaultConfig: FrameConfig = {
  frameName: "Family Frame",
  photoManifestUrl: "/photos/manifest.json",
  weather: {
    latitude: 45.4642,
    longitude: 9.19,
    timezone: "Europe/Rome",
    label: "Milan",
    refreshMinutes: 30
  },
  calendar: {
    icsUrl: "/calendar/family.ics",
    lookaheadDays: 14,
    importantKeywords: ["birthday", "anniversary", "doctor", "travel", "school", "family"]
  },
  slideshow: {
    intervalSeconds: 18
  }
};

const adminTabs: Array<{ status: PhotoStatus; label: string }> = [
  { status: "pending", label: "Da approvare" },
  { status: "approved", label: "Visibili" },
  { status: "hidden", label: "Nascoste" },
  { status: "trashed", label: "Cestino" }
];

function Root() {
  if (window.location.pathname.startsWith("/admin")) {
    return <AdminApp />;
  }

  return <FrameApp />;
}

function FrameApp() {
  const [config, setConfig] = React.useState<FrameConfig>(defaultConfig);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [photoIndex, setPhotoIndex] = React.useState(0);
  const [weather, setWeather] = React.useState<WeatherState>({ forecast: [] });
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [clock, setClock] = React.useState(new Date());
  const shuffleQueueRef = React.useRef<number[]>([]);

  React.useEffect(() => {
    fetch("/frame.config.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : defaultConfig))
      .then((loadedConfig: FrameConfig) => setConfig({ ...defaultConfig, ...loadedConfig }))
      .catch(() => setConfig(defaultConfig));
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      const dynamicPhotos = await fetchApprovedPhotos();
      if (cancelled) return;

      if (dynamicPhotos) {
        setPhotos(dynamicPhotos);
        return;
      }

      fetch(config.photoManifestUrl, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Photo manifest unavailable");
          return response.json() as Promise<PhotoManifest>;
        })
        .then((manifest) => {
          if (!cancelled) setPhotos(manifest.photos.filter((photo) => photo.src));
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
    shuffleQueueRef.current = [];
    setPhotoIndex((current) => (current >= photos.length ? 0 : current));
  }, [photos]);

  React.useEffect(() => {
    if (photos.length < 2) return;
    const interval = window.setInterval(() => {
      setPhotoIndex((current) => nextPhotoIndex(current, photos.length, shuffleQueueRef));
    }, Math.max(5, config.slideshow.intervalSeconds) * 1000);
    return () => window.clearInterval(interval);
  }, [config.slideshow.intervalSeconds, photos.length]);

  React.useEffect(() => {
    const updateClock = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(updateClock);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        const params = new URLSearchParams({
          latitude: String(config.weather.latitude),
          longitude: String(config.weather.longitude),
          timezone: config.weather.timezone,
          current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
          daily: "weather_code,temperature_2m_max,temperature_2m_min",
          forecast_days: "4"
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
        if (!response.ok) throw new Error("Weather unavailable");
        const payload = await response.json();
        if (cancelled) return;
        setWeather({
          current: {
            temperature: payload.current.temperature_2m,
            apparentTemperature: payload.current.apparent_temperature,
            code: payload.current.weather_code,
            windSpeed: payload.current.wind_speed_10m
          },
          forecast: payload.daily.time.slice(0, 4).map((date: string, index: number) => ({
            date,
            min: payload.daily.temperature_2m_min[index],
            max: payload.daily.temperature_2m_max[index],
            code: payload.daily.weather_code[index]
          }))
        });
      } catch {
        if (!cancelled) {
          setWeather((current) => ({ ...current, error: "Weather unavailable" }));
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
    fetch(config.calendar.icsUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Calendar unavailable");
        return response.text();
      })
      .then((calendarText) => {
        setEvents(parseEvents(calendarText, config.calendar.lookaheadDays, config.calendar.importantKeywords));
      })
      .catch(() => setEvents([]));
  }, [config.calendar]);

  const activePhoto = photos[photoIndex];

  return (
    <main className="frame-shell">
      <section className="photo-stage">
        {activePhoto ? (
          <>
            <img src={activePhoto.src} alt={activePhoto.caption || "Family photo"} />
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
        <header className="clock-block">
          <div className="time">{formatTime(clock)}</div>
          <div className="date">{formatFullDate(clock)}</div>
        </header>

        <section className="weather-block">
          <div className="section-label">{config.weather.label}</div>
          {weather.current ? (
            <>
              <div className="current-weather">
                <span className="weather-icon">{weatherIcon(weather.current.code)}</span>
                <span>{Math.round(weather.current.temperature)}°</span>
              </div>
              <div className="weather-detail">
                Feels {Math.round(weather.current.apparentTemperature)}° · Wind {Math.round(weather.current.windSpeed)} km/h
              </div>
              <div className="forecast-row">
                {weather.forecast.map((day) => (
                  <div className="forecast-day" key={day.date}>
                    <span>{formatDay(day.date)}</span>
                    <strong>{Math.round(day.max)}°</strong>
                    <small>{Math.round(day.min)}°</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">{weather.error || "Loading weather"}</p>
          )}
        </section>

        <section className="events-block">
          <div className="section-label">Important events</div>
          {events.length > 0 ? (
            <div className="event-list">
              {events.slice(0, 6).map((event) => (
                <article className={event.important ? "event important" : "event"} key={event.id}>
                  <div className="event-date">{formatEventDate(event)}</div>
                  <div className="event-title">{event.title}</div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No upcoming events</p>
          )}
        </section>
      </aside>
    </main>
  );
}

function AdminApp() {
  const [photos, setPhotos] = React.useState<AdminPhoto[]>([]);
  const [activeTab, setActiveTab] = React.useState<PhotoStatus>("pending");
  const [pin, setPin] = React.useState(() => window.localStorage.getItem("frameAdminPin") || "");
  const [draftPin, setDraftPin] = React.useState(pin);
  const [needsPin, setNeedsPin] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("Caricamento libreria");

  const loadPhotos = React.useCallback(async () => {
    try {
      const response = await fetch("/api/admin/photos", {
        cache: "no-store",
        headers: authHeaders(pin)
      });
      if (response.status === 401) {
        setNeedsPin(true);
        setMessage("Inserisci il PIN admin");
        return;
      }
      if (!response.ok) throw new Error("Photo server unavailable");
      const payload = await response.json() as { photos: AdminPhoto[] };
      setNeedsPin(false);
      setPhotos(payload.photos);
      setMessage("");
    } catch {
      setMessage("Server foto non raggiungibile. Avvia npm run server insieme a npm run dev.");
    }
  }, [pin]);

  React.useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const counts = countPhotos(photos);
  const visiblePhotos = photos.filter((photo) => photo.status === activeTab);

  async function submitPin(event: React.FormEvent) {
    event.preventDefault();
    window.localStorage.setItem("frameAdminPin", draftPin);
    setPin(draftPin);
  }

  async function uploadPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const body = new FormData();
    files.forEach((file) => body.append("photos", file));
    setBusy(true);
    setMessage(`Caricamento di ${files.length} foto`);

    try {
      const response = await fetch("/api/admin/photos", {
        method: "POST",
        headers: authHeaders(pin),
        body
      });
      if (response.status === 401) {
        setNeedsPin(true);
        return;
      }
      if (!response.ok) throw new Error("Upload failed");
      const payload = await response.json() as { results: Array<{ accepted: boolean; reason?: string }>; photos: AdminPhoto[] };
      const accepted = payload.results.filter((result) => result.accepted).length;
      setPhotos(payload.photos);
      setActiveTab("pending");
      setMessage(`${accepted} foto aggiunte alla coda da approvare`);
    } catch {
      setMessage("Upload non riuscito");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function updateStatus(photo: AdminPhoto, status: PhotoStatus) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/photos/${photo.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(pin)
        },
        body: JSON.stringify({ status })
      });
      if (response.status === 401) {
        setNeedsPin(true);
        return;
      }
      if (!response.ok) throw new Error("Update failed");
      setPhotos((current) => current.map((entry) => (entry.id === photo.id ? { ...entry, status } : entry)));
    } catch {
      setMessage("Aggiornamento non riuscito");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="section-label">Family Frame</p>
          <h1>Foto</h1>
        </div>
        <a className="frame-link" href="/">Frame</a>
      </header>

      {needsPin ? (
        <form className="pin-panel" onSubmit={submitPin}>
          <label htmlFor="admin-pin">PIN admin</label>
          <input
            id="admin-pin"
            inputMode="numeric"
            value={draftPin}
            onChange={(event) => setDraftPin(event.target.value)}
            autoFocus
          />
          <button type="submit">Entra</button>
        </form>
      ) : (
        <>
          <label className="upload-panel">
            <span>Aggiungi foto</span>
            <small>JPEG, PNG, WebP o GIF. Le nuove foto entrano in coda.</small>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={uploadPhotos} disabled={busy} />
          </label>

          <nav className="admin-tabs" aria-label="Stati foto">
            {adminTabs.map((tab) => (
              <button
                className={activeTab === tab.status ? "active" : ""}
                key={tab.status}
                type="button"
                onClick={() => setActiveTab(tab.status)}
              >
                {tab.label}
                <span>{counts[tab.status]}</span>
              </button>
            ))}
          </nav>

          {message ? <p className="admin-message">{message}</p> : null}

          <section className="photo-grid" aria-live="polite">
            {visiblePhotos.length > 0 ? (
              visiblePhotos.map((photo) => (
                <article className="photo-card" key={photo.id}>
                  <img src={photo.thumbSrc || photo.src} alt={photo.originalName} />
                  <div className="photo-card-meta">
                    <strong>{photo.originalName}</strong>
                    <span>{photo.source} · {formatBytes(photo.size)} · {formatShortDate(photo.createdAt)}</span>
                  </div>
                  <div className="photo-card-actions">
                    {photo.status !== "approved" ? (
                      <button type="button" onClick={() => updateStatus(photo, "approved")} disabled={busy}>Approva</button>
                    ) : null}
                    {photo.status !== "hidden" ? (
                      <button type="button" onClick={() => updateStatus(photo, "hidden")} disabled={busy}>Nascondi</button>
                    ) : null}
                    {photo.status !== "trashed" ? (
                      <button type="button" onClick={() => updateStatus(photo, "trashed")} disabled={busy}>Cestina</button>
                    ) : (
                      <button type="button" onClick={() => updateStatus(photo, "hidden")} disabled={busy}>Ripristina</button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-admin">Nessuna foto in questa sezione</p>
            )}
          </section>
        </>
      )}
    </main>
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

function authHeaders(pin: string): Record<string, string> {
  return pin ? { "x-frame-admin-pin": pin } : {};
}

function countPhotos(photos: AdminPhoto[]) {
  return photos.reduce<Record<PhotoStatus, number>>((counts, photo) => {
    counts[photo.status] += 1;
    return counts;
  }, { pending: 0, approved: 0, hidden: 0, trashed: 0 });
}

function nextPhotoIndex(current: number, length: number, queueRef: React.MutableRefObject<number[]>) {
  if (length < 2) return 0;

  if (queueRef.current.length === 0) {
    queueRef.current = shuffle(Array.from({ length }, (_value, index) => index).filter((index) => index !== current));
  }

  return queueRef.current.pop() ?? current;
}

function shuffle(values: number[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function parseEvents(calendarText: string, lookaheadDays: number, keywords: string[]): CalendarEvent[] {
  const jcal = ICAL.parse(calendarText);
  const component = new ICAL.Component(jcal);
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + lookaheadDays);
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());

  return component
    .getAllSubcomponents("vevent")
    .map((vevent, index) => {
      const event = new ICAL.Event(vevent);
      const startsAt = event.startDate.toJSDate();
      const endsAt = event.endDate?.toJSDate();
      const title = event.summary || "Untitled event";
      return {
        id: event.uid || `${title}-${index}`,
        title,
        startsAt,
        endsAt,
        allDay: event.startDate.isDate,
        important: normalizedKeywords.some((keyword) => title.toLowerCase().includes(keyword))
      };
    })
    .filter((event) => {
      const effectiveEnd = event.endsAt ?? event.startsAt;
      return effectiveEnd >= now && event.startsAt <= until;
    })
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}

function weatherIcon(code: number) {
  if (code === 0) return "☀";
  if ([1, 2, 3].includes(code)) return "◐";
  if ([45, 48].includes(code)) return "≋";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "☂";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄";
  if ([95, 96, 99].includes(code)) return "⚡";
  return "•";
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

function formatDay(dateText: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(dateText));
}

function formatEventDate(event: CalendarEvent) {
  if (event.allDay) {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short"
    }).format(event.startsAt);
  }
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(event.startsAt);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatShortDate(dateText: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateText));
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
