import type { FrameConfig } from "@/lib/types";
import type { CalendarEvent, WeatherState } from "../types";
import { formatDay, formatEventDate, formatFullDate, formatTime } from "../lib/formatters";
import { WeatherIcon } from "./WeatherIcon";

export function InfoPanel({
  clock,
  weather,
  events,
  maxEvents
}: {
  clock: Date;
  weather: WeatherState;
  events: CalendarEvent[];
  maxEvents: FrameConfig["calendar"]["maxEvents"];
}) {
  return (
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
            {events.slice(0, maxEvents).map((event) => (
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
  );
}
