import type { FrameConfig, FrameI18n } from "@/lib/types";
import type { CalendarEvent, WeatherState } from "../types";
import { formatDay, formatEventDate, formatFullDate, formatTime } from "../lib/formatters";
import { frameMessages } from "../lib/i18n";
import { WeatherIcon } from "./WeatherIcon";

export function InfoPanel({
  clock,
  i18n,
  weather,
  events,
  maxEvents
}: {
  clock: Date;
  i18n: FrameI18n;
  weather: WeatherState;
  events: CalendarEvent[];
  maxEvents: FrameConfig["calendar"]["maxEvents"];
}) {
  const t = frameMessages(i18n.language);
  return (
    <aside className="info-panel">
      <header className="status-block">
        <div className="date">{formatFullDate(clock, i18n)}</div>
        <div className="status-top">
          <div className="time-cluster">
            <div className="time">{formatTime(clock, i18n)}</div>
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
                <span>{formatDay(day.date, i18n)}</span>
                <WeatherIcon code={day.code} className="forecast-icon" />
                <strong>{Math.round(day.max)}°</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{weather.error ? t.weatherUnavailable : t.loadingWeather}</p>
        )}
      </header>

      <section className="events-block">
        <div className="section-label">{t.upcomingEvents}</div>
        {events.length > 0 ? (
          <div className="event-list">
            {events.slice(0, maxEvents).map((event) => (
              <article className={event.important ? "event important" : "event"} key={event.id}>
                <div className="event-date">{formatEventDate(event, i18n)}</div>
                <div className="event-title">
                  <span>{event.title}</span>
                  {event.calendarName ? <small>{event.calendarName}</small> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">{t.noEvents}</p>
        )}
      </section>
    </aside>
  );
}
