import React from "react";
import { createRoot } from "react-dom/client";
import ICAL from "ical.js";
import "./styles.css";

type FrameConfig = {
  frameName: string;
  photoManifestUrl: string;
  weather: {
    city?: string;
    latitude: number;
    longitude: number;
    timezone: string;
    label: string;
    showLocationLabel?: boolean;
    refreshMinutes: number;
  };
  calendar: {
    icsUrl: string;
    sourcesUrl?: string;
    sources?: CalendarSource[];
    lookaheadDays: number;
    maxEvents: number;
    importantKeywords: string[];
  };
  slideshow: {
    intervalSeconds: number;
  };
};

type FrameSettings = {
  calendar?: {
    importantKeywords?: string[];
  };
};

type CalendarSource = {
  label: string;
  icsUrl: string;
  enabled?: boolean;
};

type CalendarSourcesManifest = {
  sources: CalendarSource[];
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

const defaultConfig: FrameConfig = {
  frameName: "Cornice Famiglia",
  photoManifestUrl: "/photos/manifest.json",
  weather: {
    city: "Portuense, Roma",
    latitude: 41.8667,
    longitude: 12.4569,
    timezone: "Europe/Rome",
    label: "Portuense, Roma",
    showLocationLabel: false,
    refreshMinutes: 30
  },
  calendar: {
    icsUrl: "/calendar/family.ics",
    sourcesUrl: "/api/calendar-sources.json",
    sources: [],
    lookaheadDays: 12,
    maxEvents: 6,
    importantKeywords: [
      "compleanno",
      "anniversario",
      "colloquio",
      "riunione scuola",
      "ricevimento",
      "recita",
      "saggio",
      "gita",
      "scadenza",
      "pagamento",
      "bolletta",
      "visita",
      "dottore",
      "medico",
      "pediatra",
      "dentista",
      "vaccino",
      "esame",
      "analisi",
      "ospedale",
      "partenza",
      "viaggio",
      "vacanza",
      "londra",
      "milano",
      "volo",
      "treno",
      "prenotazione",
      "documenti",
      "passaporto",
      "carta identità",
      "birthday",
      "anniversary",
      "parent teacher",
      "doctor",
      "dentist",
      "vaccine",
      "exam",
      "deadline",
      "travel",
      "flight"
    ]
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
          forecast: payload.daily.time.slice(0, 4).map((date: string, index: number) => ({
            date,
            min: payload.daily.temperature_2m_min[index],
            max: payload.daily.temperature_2m_max[index],
            code: payload.daily.weather_code[index]
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

    return () => {
      cancelled = true;
    };
  }, [config.calendar]);

  const activePhoto = photos[photoIndex];

  return (
    <main className="frame-shell">
      <section className="photo-stage">
        {activePhoto ? (
          <>
            <img src={activePhoto.src} alt={activePhoto.caption || "Foto di famiglia"} />
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
          {config.weather.showLocationLabel !== false ? (
            <div className="section-label">{weather.locationLabel || config.weather.label}</div>
          ) : null}
          {weather.current ? (
            <>
              <div className="current-weather">
                <WeatherIcon code={weather.current.code} className="weather-icon" />
                <span>{Math.round(weather.current.temperature)}°</span>
              </div>
              <div className="weather-detail">
                Percepiti {Math.round(weather.current.apparentTemperature)}° · Vento {Math.round(weather.current.windSpeed)} km/h
              </div>
              <div className="forecast-row">
                {weather.forecast.map((day) => (
                  <div className="forecast-day" key={day.date}>
                    <span>{formatDay(day.date)}</span>
                    <WeatherIcon code={day.code} className="forecast-icon" />
                    <strong>{Math.round(day.max)}°</strong>
                    <small>{Math.round(day.min)}°</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">{weather.error || "Caricamento meteo"}</p>
          )}
        </section>

        <section className="events-block">
          <div className="section-label">Eventi importanti</div>
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

function AdminApp() {
  const [photos, setPhotos] = React.useState<AdminPhoto[]>([]);
  const [activeTab, setActiveTab] = React.useState<PhotoStatus>("pending");
  const [pin, setPin] = React.useState(() => window.localStorage.getItem("frameAdminPin") || "");
  const [draftPin, setDraftPin] = React.useState(pin);
  const [importantKeywordsText, setImportantKeywordsText] = React.useState(defaultConfig.calendar.importantKeywords.join("\n"));
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

  const loadSettings = React.useCallback(async () => {
    try {
      const response = await fetch("/api/admin/settings", {
        cache: "no-store",
        headers: authHeaders(pin)
      });
      if (response.status === 401) {
        setNeedsPin(true);
        return;
      }

      const baseConfigResponse = await fetch("/frame.config.json", { cache: "no-store" });
      const baseConfig = baseConfigResponse.ok ? mergeConfig(await baseConfigResponse.json() as Partial<FrameConfig>) : defaultConfig;
      if (!response.ok) {
        setImportantKeywordsText(baseConfig.calendar.importantKeywords.join("\n"));
        return;
      }

      const settings = await response.json() as FrameSettings;
      const keywords = settings.calendar?.importantKeywords || baseConfig.calendar.importantKeywords;
      setImportantKeywordsText(keywords.join("\n"));
    } catch {
      setImportantKeywordsText(defaultConfig.calendar.importantKeywords.join("\n"));
    }
  }, [pin]);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
      setMessage("Caricamento non riuscito");
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

  async function saveImportantKeywords(event: React.FormEvent) {
    event.preventDefault();
    const importantKeywords = parseKeywordEditorValue(importantKeywordsText);
    setBusy(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(pin)
        },
        body: JSON.stringify({ calendar: { importantKeywords } })
      });
      if (response.status === 401) {
        setNeedsPin(true);
        return;
      }
      if (!response.ok) throw new Error("Settings update failed");
      const settings = await response.json() as FrameSettings;
      setImportantKeywordsText((settings.calendar?.importantKeywords || importantKeywords).join("\n"));
      setMessage("Parole importanti salvate");
    } catch {
      setMessage("Salvataggio parole importanti non riuscito");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="section-label">Cornice Famiglia</p>
          <h1>Foto</h1>
        </div>
        <a className="frame-link" href="/">Cornice</a>
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

          <form className="settings-panel" onSubmit={saveImportantKeywords}>
            <label htmlFor="important-keywords">Parole importanti</label>
            <textarea
              id="important-keywords"
              value={importantKeywordsText}
              onChange={(event) => setImportantKeywordsText(event.target.value)}
              rows={8}
              spellCheck={false}
            />
            <div className="settings-actions">
              <small>Una parola o frase per riga. Puoi anche separarle con virgole.</small>
              <button type="submit" disabled={busy}>Salva</button>
            </div>
          </form>

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

async function fetchFrameSettings(): Promise<FrameSettings> {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) return {};
    return await response.json() as FrameSettings;
  } catch {
    return {};
  }
}

function authHeaders(pin: string): Record<string, string> {
  return pin ? { "x-frame-admin-pin": pin } : {};
}

function parseKeywordEditorValue(value: string) {
  return [...new Set(value
    .split(/[\n,]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean))];
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
  if (!trimmedTitle.startsWith("!")) {
    return { title: rawTitle, important: false };
  }

  const title = trimmedTitle.replace(/^!\s*/, "");
  return {
    title: title || rawTitle,
    important: true
  };
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

function mergeConfig(loadedConfig: Partial<FrameConfig>, settings: FrameSettings = {}): FrameConfig {
  const mergedCalendar = {
    ...defaultConfig.calendar,
    ...loadedConfig.calendar
  };
  const importantKeywords = settings.calendar?.importantKeywords;

  return {
    ...defaultConfig,
    ...loadedConfig,
    weather: {
      ...defaultConfig.weather,
      ...loadedConfig.weather
    },
    calendar: {
      ...mergedCalendar,
      importantKeywords: Array.isArray(importantKeywords) ? importantKeywords : mergedCalendar.importantKeywords
    },
    slideshow: {
      ...defaultConfig.slideshow,
      ...loadedConfig.slideshow
    }
  };
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
