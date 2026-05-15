import type { FrameConfig } from "@/lib/types";
import type { WeatherLocation } from "../types";

export async function resolveWeatherLocation(config: FrameConfig["weather"]): Promise<WeatherLocation> {
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

export function weatherKind(code: number) {
  if (code === 0) return "sun";
  if ([1, 2, 3].includes(code)) return "cloud";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "cloud";
}

export function weatherDescription(kind: ReturnType<typeof weatherKind>) {
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
