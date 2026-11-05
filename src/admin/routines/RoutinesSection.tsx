import * as React from "react";
import { CalendarClock, ChevronDown, Pause, Pencil, Play, Plus, SkipForward, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { resolveScheduleIcon } from "@/frame/lib/scheduleIcons";
import type { FrameI18n } from "@/lib/types";
import { cn } from "@/lib/utils";
import { UnauthorizedError } from "../api";
import * as api from "./api";
import { RoutineFormDialog } from "./RoutineFormDialog";
import { routineMessages, type RoutineMessages } from "./messages";
import {
  describeRoutine,
  formatLocalDate,
  formatNextOccurrence,
  formatOccurrenceDay,
  type Routine
} from "./routineFormat";

const UPCOMING_DAYS = 14;
const UPCOMING_SHOWN = 5;

type Props = {
  pin: string;
  i18n: FrameI18n;
  onUnauthorized: () => void;
};

/** /admin section to create and manage routines (timers are managed through the API only). */
export function RoutinesSection({ pin, i18n, onUnauthorized }: Props) {
  const t = routineMessages(i18n.language);
  const zone = { locale: i18n.locale, timeZone: i18n.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone };
  const [routines, setRoutines] = React.useState<Routine[] | null>(null);
  const [occurrences, setOccurrences] = React.useState<api.Occurrence[]>([]);
  const [showCancelled, setShowCancelled] = React.useState(false);
  const [editing, setEditing] = React.useState<Routine | "new" | null>(null);
  const [pausing, setPausing] = React.useState<Routine | null>(null);
  const [cancelling, setCancelling] = React.useState<Routine | null>(null);

  const handleError = React.useCallback((error: unknown) => {
    if (error instanceof UnauthorizedError) {
      onUnauthorized();
      return;
    }
    toast.error(t.toastError, { description: error instanceof Error ? error.message : undefined });
  }, [onUnauthorized, t.toastError]);

  const load = React.useCallback(async () => {
    const now = Date.now();
    try {
      const [list, upcoming] = await Promise.all([
        api.listRoutines(pin, showCancelled),
        api.listOccurrences(pin, new Date(now).toISOString(), new Date(now + UPCOMING_DAYS * 86_400_000).toISOString())
      ]);
      setRoutines(list);
      setOccurrences(upcoming);
    } catch (error) {
      if (error instanceof UnauthorizedError) onUnauthorized();
      else {
        setRoutines((current) => current ?? []);
        toast.error(t.loadError);
      }
    }
  }, [pin, showCancelled, onUnauthorized, t.loadError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** Runs a change, tells the user, reloads. */
  async function act(run: () => Promise<unknown>, success: string) {
    try {
      await run();
      toast.success(success);
      await load();
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showCancelled} onCheckedChange={setShowCancelled} />
          {t.showCancelled}
        </label>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          {t.newRoutine}
        </Button>
      </div>

      {routines === null ? null : routines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarClock className="h-6 w-6" />
            </div>
            <p className="text-lg font-semibold">{t.emptyTitle}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t.emptyText}</p>
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              {t.newRoutine}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              occurrences={occurrences.filter((occurrence) => occurrence.routineId === routine.id)}
              t={t}
              language={i18n.language}
              zone={zone}
              onEdit={() => setEditing(routine)}
              onPause={() => setPausing(routine)}
              onResume={() => act(() => api.resumeRoutine(pin, routine.id), t.toastResumed)}
              onCancel={() => setCancelling(routine)}
              onSkip={(date) => act(() => api.skipOccurrence(pin, routine.id, date), t.toastSkipped)}
              onRestore={(date) => act(() => api.restoreOccurrence(pin, routine.id, date), t.toastRestored)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <RoutineFormDialog
          routine={editing === "new" ? null : editing}
          t={t}
          language={i18n.language}
          timeZone={zone.timeZone}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            if (editing === "new") await api.createRoutine(pin, payload);
            else await api.updateRoutine(pin, editing.id, payload);
            toast.success(editing === "new" ? t.toastCreated : t.toastSaved);
            setEditing(null);
            await load();
          }}
          onUnauthorized={onUnauthorized}
        />
      ) : null}

      <PauseDialog
        routine={pausing}
        t={t}
        onClose={() => setPausing(null)}
        onConfirm={async (resumeOn) => {
          if (pausing && await act(() => api.pauseRoutine(pin, pausing.id, resumeOn), t.toastPaused)) setPausing(null);
        }}
      />

      <Dialog open={cancelling !== null} onOpenChange={(open) => { if (!open) setCancelling(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.cancelTitle}</DialogTitle>
            <DialogDescription>{cancelling?.title} · {t.cancelText}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>{t.keep}</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (cancelling && await act(() => api.cancelRoutine(pin, cancelling.id), t.toastCancelled)) setCancelling(null);
              }}
            >
              {t.cancelRoutine}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Zone = { locale: string; timeZone: string };

function RoutineCard({
  routine, occurrences, t, language, zone, onEdit, onPause, onResume, onCancel, onSkip, onRestore
}: {
  routine: Routine;
  occurrences: api.Occurrence[];
  t: RoutineMessages;
  language?: string;
  zone: Zone;
  onEdit: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onSkip: (date: string) => void;
  onRestore: (date: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const Icon = resolveScheduleIcon(routine.icon, "routine");
  const now = Date.now();
  const cancelled = routine.status === "cancelled";
  const status = cancelled
    ? t.statusCancelled
    : routine.status === "paused"
      ? routine.resumeOn ? t.statusPausedUntil(formatLocalDate(routine.resumeOn, zone)) : t.statusPaused
      : t.statusActive;
  const upcoming = [
    ...occurrences.map((occurrence) => ({ date: occurrence.date, skipped: false })),
    ...routine.exceptions.filter((exception) => exception.kind === "skipped").map((exception) => ({ date: exception.date, skipped: true }))
  ].sort((left, right) => left.date.localeCompare(right.date)).slice(0, UPCOMING_SHOWN);

  return (
    <Card className={cn("min-w-0 py-0", cancelled && "opacity-60")}>
      <CardContent className="p-0">
        <article className="space-y-4 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="min-w-0 max-w-full truncate text-base font-semibold">{routine.title}</h3>
                <Badge variant={routine.status === "active" ? "default" : "secondary"}>{status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{describeRoutine(routine, language)}</p>
              {!cancelled ? (
                <p className="text-sm font-medium">
                  {routine.nextOccurrence ? t.next(formatNextOccurrence(routine.nextOccurrence.at, now, zone, language)) : t.noNext}
                </p>
              ) : null}
            </div>
          </div>

          {!cancelled ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-4 w-4" />{t.edit}</Button>
              {routine.status === "paused" ? (
                <Button variant="outline" size="sm" onClick={onResume}><Play className="h-4 w-4" />{t.resume}</Button>
              ) : (
                <Button variant="outline" size="sm" onClick={onPause}><Pause className="h-4 w-4" />{t.pause}</Button>
              )}
              <Button variant="ghost" size="sm" className="text-destructive" onClick={onCancel}><X className="h-4 w-4" />{t.cancelRoutine}</Button>
              {routine.status === "active" ? (
                <Button variant="ghost" size="sm" className="ml-auto" aria-expanded={open} onClick={() => setOpen(!open)}>
                  {t.upcoming}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                </Button>
              ) : null}
            </div>
          ) : null}

          {open ? (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {upcoming.map(({ date, skipped }) => (
                <li key={date} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className={cn(skipped && "text-muted-foreground line-through")}>
                    {formatOccurrenceDay(date, routine.time, now, zone, language)}
                  </span>
                  {skipped ? (
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">{t.skipped}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => onRestore(date)}><Undo2 className="h-4 w-4" />{t.restore}</Button>
                    </span>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => onSkip(date)}><SkipForward className="h-4 w-4" />{t.skip}</Button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      </CardContent>
    </Card>
  );
}

function PauseDialog({ routine, t, onClose, onConfirm }: {
  routine: Routine | null;
  t: RoutineMessages;
  onClose: () => void;
  onConfirm: (resumeOn: string) => void;
}) {
  const [resumeOn, setResumeOn] = React.useState("");
  React.useEffect(() => setResumeOn(""), [routine]);
  return (
    <Dialog open={routine !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.pauseTitle}</DialogTitle>
          <DialogDescription>{routine?.title} · {t.pauseText}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="routine-resume-on">{t.pauseUntil}</Label>
          <Input id="routine-resume-on" type="date" value={resumeOn} onChange={(event) => setResumeOn(event.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.close}</Button>
          <Button onClick={() => onConfirm(resumeOn)}><Pause className="h-4 w-4" />{t.pause}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
