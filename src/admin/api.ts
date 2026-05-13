import type {
  AdminPhoto,
  CalendarSource,
  FrameConfig,
  FrameSettings,
  NightDisplaySettings,
  SpecialDayConfig
} from "@/lib/types";
import { defaultConfig, mergeConfig } from "@/lib/config";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

export function authHeaders(pin: string): Record<string, string> {
  return pin ? { "x-frame-admin-pin": pin } : {};
}

export function parseKeywordEditorValue(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    )
  ];
}

async function request(input: string, init: RequestInit, pin: string) {
  const response = await fetch(input, {
    ...init,
    headers: { ...(init.headers || {}), ...authHeaders(pin) }
  });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response;
}

export async function loadPhotos(pin: string): Promise<AdminPhoto[]> {
  const response = await request("/api/admin/photos", { cache: "no-store" }, pin);
  const payload = (await response.json()) as { photos: AdminPhoto[] };
  return payload.photos;
}

export async function uploadPhotos(pin: string, files: File[]): Promise<{
  accepted: number;
  rejected: number;
  photos: AdminPhoto[];
}> {
  const body = new FormData();
  files.forEach((file) => body.append("photos", file));
  const response = await request("/api/admin/photos", { method: "POST", body }, pin);
  const payload = (await response.json()) as {
    results: Array<{ accepted: boolean; reason?: string }>;
    photos: AdminPhoto[];
  };
  const accepted = payload.results.filter((result) => result.accepted).length;
  return { accepted, rejected: payload.results.length - accepted, photos: payload.photos };
}

export async function updatePhotoStatus(
  pin: string,
  photoId: string,
  status: AdminPhoto["status"]
) {
  await request(
    `/api/admin/photos/${photoId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    },
    pin
  );
}

export type AdminSettingsBundle = {
  baseConfig: FrameConfig;
  calendarSources: CalendarSource[];
  importantKeywords: string[];
  nightDisplay: NightDisplaySettings;
  specialDayEvents: SpecialDayConfig[];
  disabledSpecialDayIds: string[];
};

export const defaultNightDisplaySettings: NightDisplaySettings = {
  enabled: false,
  offTime: "23:00",
  onTime: "07:00",
  output: "DVI-I-1-1"
};

export async function loadAdminSettings(pin: string): Promise<AdminSettingsBundle> {
  const baseConfigResponse = await fetch("/frame.config.json", { cache: "no-store" });
  const baseConfig = baseConfigResponse.ok
    ? mergeConfig((await baseConfigResponse.json()) as Partial<FrameConfig>)
    : defaultConfig;

  try {
    const response = await request("/api/admin/settings", { cache: "no-store" }, pin);
    const settings = (await response.json()) as FrameSettings;
    return {
      baseConfig,
      calendarSources: settings.calendar?.sources || baseConfig.calendar.sources || [],
      importantKeywords:
        settings.calendar?.importantKeywords || baseConfig.calendar.importantKeywords,
      nightDisplay: settings.display?.nightMode || defaultNightDisplaySettings,
      specialDayEvents: settings.specialDays?.events || baseConfig.specialDays.events,
      disabledSpecialDayIds: settings.specialDays?.disabledIds || []
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    return {
      baseConfig,
      calendarSources: baseConfig.calendar.sources || [],
      importantKeywords: baseConfig.calendar.importantKeywords,
      nightDisplay: defaultNightDisplaySettings,
      specialDayEvents: baseConfig.specialDays.events,
      disabledSpecialDayIds: []
    };
  }
}

export async function saveAdminSettings(
  pin: string,
  payload: {
    calendarSources: CalendarSource[];
    importantKeywords: string[];
    nightDisplay?: NightDisplaySettings;
    disabledSpecialDayIds: string[];
    specialDayEvents: SpecialDayConfig[];
  }
): Promise<FrameSettings> {
  const response = await request(
    "/api/admin/settings",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendar: {
          sources: payload.calendarSources,
          importantKeywords: payload.importantKeywords
        },
        specialDays: {
          disabledIds: payload.disabledSpecialDayIds,
          events: payload.specialDayEvents
        },
        ...(payload.nightDisplay ? { display: { nightMode: payload.nightDisplay } } : {})
      })
    },
    pin
  );
  return (await response.json()) as FrameSettings;
}

export async function setDisplayPower(pin: string, action: "on" | "off", output: string) {
  await request(
    `/api/admin/display/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ output })
    },
    pin
  );
}
