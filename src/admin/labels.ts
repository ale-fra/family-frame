import type { PhotoStatus, SpecialDaySchedule } from "@/lib/types";

export type AdminSection = "photos" | "routines" | "settings";

export const adminTabs: Array<{ status: PhotoStatus; label: string }> = [
  { status: "pending", label: "Da approvare" },
  { status: "approved", label: "Visibili" },
  { status: "hidden", label: "Nascoste" },
  { status: "trashed", label: "Cestino" }
];

export const photoStatusLabels: Record<PhotoStatus, string> = {
  pending: "Da approvare",
  approved: "Visibile",
  hidden: "Nascosta",
  trashed: "Nel cestino"
};

export function emptyAdminTitle(status: PhotoStatus) {
  const titles: Record<PhotoStatus, string> = {
    pending: "Nessuna foto da approvare",
    approved: "Nessuna foto visibile",
    hidden: "Nessuna foto nascosta",
    trashed: "Cestino vuoto"
  };
  return titles[status];
}

export function emptyAdminText(status: PhotoStatus) {
  const descriptions: Record<PhotoStatus, string> = {
    pending: "Carica nuove foto: compariranno qui prima di andare nella cornice.",
    approved: "Approva qualche foto dalla coda per mostrarla nel frame.",
    hidden: "Le foto tolte dalla cornice senza cestinarle finiranno qui.",
    trashed: "Le foto cestinate restano recuperabili da questa sezione."
  };
  return descriptions[status];
}

export function specialDayScheduleLabel(schedule: SpecialDaySchedule) {
  if (schedule.type === "fixedDate") return `${schedule.day}/${schedule.month}`;
  if (schedule.type === "dateRange") {
    return `${schedule.start.day}/${schedule.start.month} – ${schedule.end.day}/${schedule.end.month}`;
  }
  if (schedule.type === "nthWeekday") {
    return `${schedule.nth}° ${weekdayName(schedule.weekday)} di ${monthName(schedule.month)}`;
  }
  if (schedule.type === "easterOffset") {
    return schedule.durationDays && schedule.durationDays > 1 ? "Pasqua e lunedì dell'angelo" : "Pasqua";
  }
  return "Data configurata";
}

function monthName(month: number) {
  return new Intl.DateTimeFormat("it-IT", { month: "long" }).format(new Date(2024, month - 1, 1));
}

function weekdayName(weekday: number) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "long" }).format(new Date(2024, 0, 7 + weekday));
}

export function countPhotos<T extends { status: PhotoStatus }>(photos: T[]) {
  return photos.reduce<Record<PhotoStatus, number>>(
    (counts, photo) => {
      counts[photo.status] += 1;
      return counts;
    },
    { pending: 0, approved: 0, hidden: 0, trashed: 0 }
  );
}
