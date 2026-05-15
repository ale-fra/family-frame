import type { DateRangeSchedule, FrameConfig, SpecialDaySchedule } from "@/lib/types";

export function activeSpecialDayForDate(specialDays: FrameConfig["specialDays"], date: Date) {
  if (specialDays.enabled === false) return undefined;
  return specialDays.events.find((event) => event.enabled !== false && isSpecialDayActive(event.schedule, date));
}

export function isSpecialDayActive(schedule: SpecialDaySchedule, date: Date) {
  if (schedule.type === "fixedDate") {
    return date.getMonth() + 1 === schedule.month && date.getDate() === schedule.day;
  }

  if (schedule.type === "dateRange") {
    return isDateRangeActive(schedule, date);
  }

  if (schedule.type === "nthWeekday") {
    const target = nthWeekdayOfMonth(date.getFullYear(), schedule.month, schedule.weekday, schedule.nth);
    return sameLocalDate(date, target);
  }

  if (schedule.type === "easterOffset") {
    const start = addDays(easterDate(date.getFullYear()), schedule.offsetDays);
    const durationDays = Math.max(1, schedule.durationDays || 1);
    const end = addDays(start, durationDays - 1);
    return startOfLocalDay(date) >= startOfLocalDay(start) && startOfLocalDay(date) <= startOfLocalDay(end);
  }

  return false;
}

export function isDateRangeActive(schedule: DateRangeSchedule, date: Date) {
  const year = date.getFullYear();
  const start = new Date(year, schedule.start.month - 1, schedule.start.day);
  const end = new Date(year, schedule.end.month - 1, schedule.end.day);
  const today = startOfLocalDay(date).getTime();

  if (start <= end) {
    return today >= start.getTime() && today <= end.getTime();
  }

  const startThisYear = start.getTime();
  const endThisYear = end.getTime();
  const startPreviousYear = new Date(year - 1, schedule.start.month - 1, schedule.start.day).getTime();
  const endNextYear = new Date(year + 1, schedule.end.month - 1, schedule.end.day).getTime();

  return (today >= startThisYear && today <= endNextYear) || (today >= startPreviousYear && today <= endThisYear);
}

export function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  const firstDay = new Date(year, month - 1, 1);
  const offset = (weekday - firstDay.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + offset + (nth - 1) * 7);
}

export function easterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function sameLocalDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
