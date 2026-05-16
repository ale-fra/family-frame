export type FrameConfig = {
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
    refreshMinutes: number;
    importantKeywords: string[];
  };
  slideshow: {
    intervalSeconds: number;
    pinnedPhotoId?: string;
  };
  specialDays: {
    enabled: boolean;
    ambientEveryMinutes: {
      min: number;
      max: number;
    };
    events: SpecialDayConfig[];
  };
};

export type FrameSettings = {
  calendar?: {
    sources?: CalendarSource[];
    importantKeywords?: string[];
  };
  display?: {
    nightMode?: NightDisplaySettings;
  };
  specialDays?: {
    disabledIds?: string[];
    events?: SpecialDayConfig[];
  };
  slideshow?: {
    pinnedPhotoId?: string;
  };
};

export type NightDisplaySettings = {
  enabled: boolean;
  offTime: string;
  onTime: string;
  output: string;
};

export type SpecialDayEffect =
  | "santaPeek"
  | "warmLights"
  | "confettiBurst"
  | "hearts"
  | "flowers"
  | "springDecor"
  | "pumpkinGlow"
  | "festone"
  | "stars";

export type SpecialDayTheme =
  | "christmas"
  | "new-year"
  | "epiphany"
  | "valentine"
  | "family"
  | "spring"
  | "grandparents"
  | "halloween"
  | "birthday"
  | "anniversary";

export type FixedDateSchedule = {
  type: "fixedDate";
  month: number;
  day: number;
};

export type DateRangeSchedule = {
  type: "dateRange";
  start: { month: number; day: number };
  end: { month: number; day: number };
};

export type NthWeekdaySchedule = {
  type: "nthWeekday";
  month: number;
  weekday: number;
  nth: number;
};

export type EasterOffsetSchedule = {
  type: "easterOffset";
  offsetDays: number;
  durationDays?: number;
};

export type SpecialDaySchedule =
  | FixedDateSchedule
  | DateRangeSchedule
  | NthWeekdaySchedule
  | EasterOffsetSchedule;

export type SpecialDayConfig = {
  id: string;
  label: string;
  enabled?: boolean;
  theme: SpecialDayTheme;
  schedule: SpecialDaySchedule;
  effects: SpecialDayEffect[];
};

export type CalendarSource = {
  id?: string;
  label: string;
  icsUrl: string;
  enabled?: boolean;
};

export type CalendarSourcesManifest = {
  sources: CalendarSource[];
};

export type Photo = {
  id?: string;
  src: string;
  thumbSrc?: string;
  optimizedSrc?: string;
  optimizedThumbSrc?: string;
  optimized?: {
    mode?: PhotoOptimizationMode;
  };
  caption?: string;
};

export type PhotoStatus = "pending" | "approved" | "hidden" | "trashed";

export type AdminPhoto = Photo & {
  id: string;
  originalName: string;
  status: PhotoStatus;
  source: "web" | "telegram";
  size: number;
  optimized?: PhotoOptimization;
  createdAt: string;
  updatedAt: string;
};

export type PhotoOptimizationMode = "contain" | "cover" | "cover-original";

export type PhotoOptimization = {
  filename: string;
  thumbFilename: string;
  width: number;
  height: number;
  format: "webp";
  quality: number;
  mode: PhotoOptimizationMode;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  createdAt: string;
  updatedAt: string;
  sourceUpdatedAt: string;
};

export type PhotoManifest = {
  photos: Photo[];
};
