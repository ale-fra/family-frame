import type { Photo, SpecialDayConfig } from "@/lib/types";

export type WeatherState = {
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

export type CalendarEvent = {
  id: string;
  title: string;
  calendarName?: string;
  startsAt: Date;
  endsAt?: Date;
  allDay: boolean;
  important: boolean;
};

export type WeatherLocation = {
  latitude: number;
  longitude: number;
  timezone: string;
  label: string;
};

export type FamilyFrameDebugApi = {
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

export type ActiveSpecialDay = SpecialDayConfig | undefined;
