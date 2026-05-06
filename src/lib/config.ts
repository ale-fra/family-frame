import type { FrameConfig, FrameSettings } from "./types";

export const defaultConfig: FrameConfig = {
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
      "compleanno", "anniversario", "colloquio", "riunione scuola", "ricevimento",
      "recita", "saggio", "gita", "scadenza", "pagamento", "bolletta", "visita",
      "dottore", "medico", "pediatra", "dentista", "vaccino", "esame", "analisi",
      "ospedale", "partenza", "viaggio", "vacanza", "londra", "milano", "volo",
      "treno", "prenotazione", "documenti", "passaporto", "carta identità",
      "birthday", "anniversary", "parent teacher", "doctor", "dentist", "vaccine",
      "exam", "deadline", "travel", "flight"
    ]
  },
  slideshow: {
    intervalSeconds: 18
  },
  specialDays: {
    enabled: true,
    ambientEveryMinutes: { min: 3, max: 8 },
    events: [
      {
        id: "natale", label: "Natale", enabled: true, theme: "christmas",
        schedule: { type: "dateRange", start: { month: 12, day: 24 }, end: { month: 12, day: 26 } },
        effects: ["warmLights", "santaPeek", "stars"]
      },
      {
        id: "capodanno", label: "Capodanno", enabled: true, theme: "new-year",
        schedule: { type: "dateRange", start: { month: 12, day: 31 }, end: { month: 1, day: 1 } },
        effects: ["confettiBurst", "stars"]
      },
      {
        id: "befana", label: "Befana", enabled: true, theme: "epiphany",
        schedule: { type: "fixedDate", month: 1, day: 6 },
        effects: ["stars"]
      },
      {
        id: "san-valentino", label: "San Valentino", enabled: true, theme: "valentine",
        schedule: { type: "fixedDate", month: 2, day: 14 },
        effects: ["hearts"]
      },
      {
        id: "festa-papa", label: "Festa del papà", enabled: true, theme: "family",
        schedule: { type: "fixedDate", month: 3, day: 19 },
        effects: ["stars"]
      },
      {
        id: "pasqua", label: "Pasqua", enabled: true, theme: "spring",
        schedule: { type: "easterOffset", offsetDays: 0, durationDays: 2 },
        effects: ["springDecor", "flowers"]
      },
      {
        id: "festa-mamma", label: "Festa della mamma", enabled: true, theme: "family",
        schedule: { type: "nthWeekday", month: 5, weekday: 0, nth: 2 },
        effects: ["flowers", "hearts"]
      },
      {
        id: "festa-nonni", label: "Festa dei nonni", enabled: true, theme: "grandparents",
        schedule: { type: "fixedDate", month: 10, day: 2 },
        effects: ["flowers", "stars"]
      },
      {
        id: "halloween", label: "Halloween", enabled: true, theme: "halloween",
        schedule: { type: "fixedDate", month: 10, day: 31 },
        effects: ["pumpkinGlow", "stars"]
      }
    ]
  }
};

export function mergeConfig(loadedConfig: Partial<FrameConfig>, settings: FrameSettings = {}): FrameConfig {
  const mergedCalendar = { ...defaultConfig.calendar, ...loadedConfig.calendar };
  const mergedSpecialDays = {
    ...defaultConfig.specialDays,
    ...loadedConfig.specialDays,
    ambientEveryMinutes: {
      ...defaultConfig.specialDays.ambientEveryMinutes,
      ...loadedConfig.specialDays?.ambientEveryMinutes
    },
    events: Array.isArray(loadedConfig.specialDays?.events) && loadedConfig.specialDays.events.length > 0
      ? loadedConfig.specialDays.events
      : defaultConfig.specialDays.events
  };
  const importantKeywords = settings.calendar?.importantKeywords;
  const disabledSpecialDayIds = new Set(settings.specialDays?.disabledIds || []);
  const settingEvents = settings.specialDays?.events;
  const specialDayEvents = Array.isArray(settingEvents) && settingEvents.length > 0
    ? mergeSpecialDayEvents(mergedSpecialDays.events, settingEvents)
    : mergedSpecialDays.events;

  return {
    ...defaultConfig,
    ...loadedConfig,
    weather: { ...defaultConfig.weather, ...loadedConfig.weather },
    calendar: {
      ...mergedCalendar,
      importantKeywords: Array.isArray(importantKeywords) ? importantKeywords : mergedCalendar.importantKeywords
    },
    slideshow: { ...defaultConfig.slideshow, ...loadedConfig.slideshow },
    specialDays: {
      ...mergedSpecialDays,
      events: specialDayEvents.map((event) => ({
        ...event,
        enabled: event.enabled !== false && !disabledSpecialDayIds.has(event.id)
      }))
    }
  };
}

function mergeSpecialDayEvents(baseEvents: FrameConfig["specialDays"]["events"], settingEvents: FrameConfig["specialDays"]["events"]) {
  const baseById = new Map(baseEvents.map((event) => [event.id, event]));
  const settingById = new Map(settingEvents.map((event) => [event.id, event]));
  const merged = baseEvents.map((baseEvent) => {
    const settingEvent = settingById.get(baseEvent.id);
    if (!settingEvent) return baseEvent;
    return {
      ...baseEvent,
      ...settingEvent,
      schedule: settingEvent.schedule || baseEvent.schedule,
      effects: settingEvent.effects || baseEvent.effects
    };
  });

  for (const settingEvent of settingEvents) {
    if (!baseById.has(settingEvent.id)) merged.push(settingEvent);
  }

  return merged;
}
