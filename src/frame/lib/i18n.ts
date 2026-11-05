// Texts shown on the frame, in the languages FRAME_LOCALE can select. Italian is the default.
const it = {
  upcomingEvents: "Prossimi eventi",
  noEvents: "Nessun evento in arrivo",
  loadingWeather: "Caricamento meteo",
  weatherUnavailable: "Meteo non disponibile",
  scheduleLabel: "Timer e appuntamenti",
  timeUp: "Tempo scaduto!",
  itsTime: "È ora!",
  paused: "In pausa",
  dueAt: (time: string) => `alle ${time}`,
  more: (count: number) => (count === 1 ? "+1 altro" : `+${count} altri`)
};

export type FrameMessages = typeof it;

const en: FrameMessages = {
  upcomingEvents: "Upcoming events",
  noEvents: "No upcoming events",
  loadingWeather: "Loading weather",
  weatherUnavailable: "Weather unavailable",
  scheduleLabel: "Timers and appointments",
  timeUp: "Time's up!",
  itsTime: "It's time!",
  paused: "Paused",
  dueAt: (time) => `at ${time}`,
  more: (count) => `+${count} more`
};

export function frameMessages(language: string | undefined): FrameMessages {
  return language === "en" ? en : it;
}
