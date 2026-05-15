import * as React from "react";
import type { FrameConfig } from "@/lib/types";
import type { WeatherState } from "../types";
import { resolveWeatherLocation } from "../lib/weather";

export function useWeather(config: FrameConfig["weather"]) {
  const [weather, setWeather] = React.useState<WeatherState>({ forecast: [] });

  React.useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        const location = await resolveWeatherLocation(config);
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
    const interval = window.setInterval(loadWeather, Math.max(5, config.refreshMinutes) * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [config]);

  return weather;
}
