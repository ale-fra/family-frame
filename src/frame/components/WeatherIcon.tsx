import { weatherDescription, weatherKind } from "../lib/weather";

export function WeatherIcon({ code, className }: { code: number; className: string }) {
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
