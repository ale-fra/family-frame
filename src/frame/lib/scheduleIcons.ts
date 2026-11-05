import {
  AlarmClock, Apple, Baby, Backpack, Bath, BedDouble, Bike, BookOpen, Bus, Cake, Car, Cat, CircleAlert,
  CookingPot, Dog, Egg, Gamepad2, Gift, GraduationCap, Heart, Moon, Music, Palette, PartyPopper, Phone, Pill,
  Pizza, Puzzle, School, Shirt, ShowerHead, Soup, Sparkles, Star, Stethoscope, Sun, Timer, Trash2, Tv,
  Utensils, Volleyball, type LucideIcon
} from "lucide-react";

/**
 * Icon keys accepted by the API (server/lib/schedule-icons.mjs lists the same keys; a test keeps them equal).
 * SVG icons rather than emoji: the kiosk may not have a colour emoji font.
 */
export const SCHEDULE_ICONS: Record<string, LucideIcon> = {
  alarm: AlarmClock, apple: Apple, baby: Baby, backpack: Backpack, bath: Bath, bed: BedDouble, bike: Bike,
  book: BookOpen, bus: Bus, cake: Cake, car: Car, cat: Cat, doctor: Stethoscope, dog: Dog, egg: Egg,
  game: Gamepad2, gift: Gift, graduation: GraduationCap, heart: Heart, medicine: Pill, moon: Moon, music: Music,
  paint: Palette, party: PartyPopper, phone: Phone, pizza: Pizza, pot: CookingPot, puzzle: Puzzle, school: School,
  shirt: Shirt, shower: ShowerHead, soup: Soup, sparkles: Sparkles, sport: Volleyball, star: Star, sun: Sun,
  timer: Timer, trash: Trash2, tv: Tv, utensils: Utensils
};

const DEFAULT_ICONS: Record<"timer" | "routine", LucideIcon> = { timer: Timer, routine: AlarmClock };

/** null → the kind's default icon; a key the frame does not know → an exclamation mark. */
export function resolveScheduleIcon(key: string | null, kind: "timer" | "routine"): LucideIcon {
  if (key === null) return DEFAULT_ICONS[kind];
  return Object.prototype.hasOwnProperty.call(SCHEDULE_ICONS, key) ? SCHEDULE_ICONS[key] : CircleAlert;
}
