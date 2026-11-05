import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScheduleVisual } from "@/frame/components/ScheduleVisuals";
import type { DisplayItem } from "@/frame/lib/scheduleDisplay";
import { SCHEDULE_ICONS, resolveScheduleIcon } from "@/frame/lib/scheduleIcons";
import { ROUTINE_MAX_INTERVAL } from "@/lib/api-schema";
import { cn } from "@/lib/utils";
import { UnauthorizedError } from "../api";
import type { RoutineMessages } from "./messages";
import {
  NOTICE_OPTIONS,
  PRESETS,
  RING_OPTIONS,
  WEEKDAYS,
  describeRoutine,
  emptyRoutineForm,
  formToPayload,
  routineToForm,
  type Routine,
  type RoutineForm,
  type RoutinePayload,
  type ScheduleStyle
} from "./routineFormat";

const STYLES: ScheduleStyle[] = ["clock", "disc", "sweets", "journey"];

export function RoutineFormDialog({
  routine, t, language, timeZone, onClose, onSave, onUnauthorized
}: {
  routine: Routine | null;
  t: RoutineMessages;
  language?: string;
  timeZone: string;
  onClose: () => void;
  onSave: (payload: RoutinePayload) => Promise<void>;
  onUnauthorized: () => void;
}) {
  const [form, setForm] = React.useState<RoutineForm>(() => {
    if (routine) return routineToForm(routine);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(Date.now());
    return emptyRoutineForm(today);
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const update = (patch: Partial<RoutineForm>) => setForm((current) => ({ ...current, ...patch }));
  const maxInterval = ROUTINE_MAX_INTERVAL[form.frequency];
  const validInterval = Number.isInteger(form.interval) && form.interval >= 1 && form.interval <= maxInterval;
  const invalid = !form.title.trim() || !form.time || !validInterval ||
    (form.frequency === "weekly" && form.weekdays.length === 0);
  const payload = formToPayload(form);
  const unit = form.frequency === "weekly" ? t.unitWeeks : form.frequency === "daily" ? t.unitDays : t.unitMonths;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave(payload);
    } catch (caught) {
      if (caught instanceof UnauthorizedError) onUnauthorized();
      else setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>{routine ? t.formEditTitle : t.formNewTitle}</DialogTitle>
            <DialogDescription>{t.sectionDescription}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-2">
              <Label htmlFor="routine-title">{t.name}</Label>
              <Input id="routine-title" value={form.title} maxLength={80} placeholder={t.namePlaceholder}
                onChange={(event) => update({ title: event.target.value })} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routine-time">{t.time}</Label>
              <Input id="routine-time" type="time" value={form.time} onChange={(event) => update({ time: event.target.value })} />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t.repeats}</legend>
            <div className="flex flex-wrap gap-2">
              {(["weekly", "daily", "monthly"] as const).map((frequency) => (
                <Toggle key={frequency} pressed={form.frequency === frequency}
                  onClick={() => update({ frequency, interval: Math.min(form.interval, ROUTINE_MAX_INTERVAL[frequency]) })}>
                  {t[frequency]}
                </Toggle>
              ))}
            </div>

            {form.frequency === "weekly" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => (
                    <Toggle key={day} small pressed={form.weekdays.includes(day)}
                      onClick={() => update({ weekdays: form.weekdays.includes(day) ? form.weekdays.filter((d) => d !== day) : [...form.weekdays, day] })}>
                      {t.weekdayShort[day]}
                    </Toggle>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(["weekdays", "weekend", "everyDay"] as const).map((preset) => (
                    <Button key={preset} type="button" variant="link" size="sm" className="h-auto p-0"
                      onClick={() => update({ weekdays: [...PRESETS[preset]] })}>
                      {preset === "weekdays" ? t.presetWeekdays : preset === "weekend" ? t.presetWeekend : t.presetEveryDay}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {form.frequency === "monthly" ? (
              <div className="space-y-1">
                <Label htmlFor="routine-month-day">{t.monthDay}</Label>
                <NativeSelect id="routine-month-day" value={form.monthDay} onChange={(value) => update({ monthDay: Number(value) })}
                  options={Array.from({ length: 31 }, (_, index) => [String(index + 1), String(index + 1)])} />
                <p className="text-xs text-muted-foreground">{t.lastDayHint}</p>
              </div>
            ) : null}

            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="routine-interval">{t.every}</Label>
              <Input id="routine-interval" className="w-20" type="number" inputMode="numeric"
                min={1} max={maxInterval} step={1} required
                value={Number.isNaN(form.interval) ? "" : form.interval}
                onChange={(event) => update({ interval: event.target.valueAsNumber })} />
              <span>{unit(form.interval)}</span>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="routine-start">{t.startDate}</Label>
              <Input id="routine-start" type="date" value={form.startDate} onChange={(event) => update({ startDate: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routine-end">{t.endDate}</Label>
              <Input id="routine-end" type="date" value={form.endDate} min={form.startDate} onChange={(event) => update({ endDate: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routine-notice">{t.notice}</Label>
              <NativeSelect id="routine-notice" value={form.noticeMinutes} onChange={(value) => update({ noticeMinutes: Number(value) })}
                options={NOTICE_OPTIONS.map((minutes) => [String(minutes), t.noticeOption(minutes)])} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routine-ring">{t.ringFor}</Label>
              <NativeSelect id="routine-ring" value={form.autoDismissMs} onChange={(value) => update({ autoDismissMs: Number(value) })}
                options={RING_OPTIONS.map((ms) => [String(ms), t.ringOption(ms)])} />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.style}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STYLES.map((style) => (
                <button key={style} type="button" aria-pressed={form.style === style} onClick={() => update({ style })}
                  className={cn("flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-sm font-medium transition",
                    form.style === style ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                  <StylePreview style={style} icon={form.icon} timeZone={timeZone} />
                  {t.styleNames[style]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.icon}</legend>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={form.icon === null} onClick={() => update({ icon: null })}
                className={cn("h-10 rounded-lg border-2 px-3 text-sm font-medium transition",
                  form.icon === null ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                {t.defaultIcon}
              </button>
              {Object.keys(SCHEDULE_ICONS).map((key) => (
                <IconChoice key={key} label={key} selected={form.icon === key} onClick={() => update({ icon: key })} iconKey={key} />
              ))}
            </div>
          </fieldset>

          {validInterval ? (
            <div className="rounded-lg bg-muted px-4 py-3 text-sm">
              <span className="font-medium">{t.summary}: </span>
              <span>{describeRoutine({ recurrence: payload.recurrence, time: form.time, noticeMinutes: form.noticeMinutes }, language)}</span>
            </div>
          ) : null}

          {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t.close}</Button>
            <Button type="submit" disabled={invalid || saving}>{routine ? t.save : t.create}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The frame's real drawing of a style, at 70 % of the countdown, as it would look on the frame. */
function StylePreview({ style, icon, timeZone }: { style: ScheduleStyle; icon: string | null; timeZone: string }) {
  const now = Date.now();
  const item: DisplayItem = {
    key: `preview-${style}`, kind: "routine", title: "", icon, style, phase: "counting",
    remainingMs: 7 * 60_000, totalMs: 10 * 60_000, fraction: 0.7, dueAtMs: now + 7 * 60_000, ringingSinceMs: null
  };
  return (
    <div className="schedule-card schedule-preview pointer-events-none h-24 w-full" aria-hidden="true">
      <ScheduleVisual item={item} nowMs={now} timeZone={timeZone} />
    </div>
  );
}

function Toggle({ pressed, small, onClick, children }: { pressed: boolean; small?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant={pressed ? "default" : "outline"} size="sm" aria-pressed={pressed} onClick={onClick}
      className={cn(small && "w-12 px-0 capitalize")}>
      {children}
    </Button>
  );
}

function IconChoice({ label, selected, onClick, iconKey }: { label: string; selected: boolean; onClick: () => void; iconKey: string }) {
  const Icon = resolveScheduleIcon(iconKey, "routine");
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={selected} onClick={onClick}
      className={cn("flex h-10 w-10 items-center justify-center rounded-lg border-2 transition",
        selected ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:bg-muted")}>
      <Icon className="h-5 w-5" />
    </button>
  );
}

function NativeSelect({ id, value, onChange, options }: {
  id: string;
  value: string | number;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select id={id} value={String(value)} onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}
    </select>
  );
}
