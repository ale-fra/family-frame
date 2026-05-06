import * as React from "react";
import type { SpecialDayConfig, SpecialDaySchedule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { specialDayScheduleLabel } from "./labels";
import { CalendarDays, Save, Sparkles } from "lucide-react";

type Props = {
  keywordsText: string;
  onKeywordsChange: (value: string) => void;
  onSaveKeywords: () => void;
  busy: boolean;
  events: SpecialDayConfig[];
  disabledIds: string[];
  onToggleEvent: (eventId: string, enabled: boolean) => void;
  onUpdateEventSchedule: (eventId: string, schedule: SpecialDaySchedule) => void;
};

export function SettingsSection({
  keywordsText,
  onKeywordsChange,
  onSaveKeywords,
  busy,
  events,
  disabledIds,
  onToggleEvent,
  onUpdateEventSchedule
}: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Parole importanti del calendario</CardTitle>
              <CardDescription>
                Parole o frasi che evidenziano automaticamente gli appuntamenti nella cornice.
              </CardDescription>
            </div>
            <div className="hidden h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Label htmlFor="important-keywords" className="sr-only">
            Eventi importanti
          </Label>
          <Textarea
            id="important-keywords"
            value={keywordsText}
            onChange={(event) => onKeywordsChange(event.target.value)}
            rows={10}
            spellCheck={false}
            placeholder="compleanno&#10;visita medica&#10;…"
            className="font-mono text-sm"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Una parola o frase per riga. Puoi anche separarle con virgole.
          </p>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={onSaveKeywords} disabled={busy}>
            <Save className="h-4 w-4" />
            Salva parole
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Giornate evento</CardTitle>
          <CardDescription>
            Modifica le date e disattiva i temi che non vuoi mostrare sulla cornice.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border/60">
            {events.map((event) => {
              const configEnabled = event.enabled !== false;
              const enabled = configEnabled && !disabledIds.includes(event.id);
              return (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium leading-none">{event.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {specialDayScheduleLabel(event.schedule)}
                    </p>
                    <ScheduleEditor
                      eventId={event.id}
                      schedule={event.schedule}
                      busy={busy}
                      onSave={onUpdateEventSchedule}
                    />
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={busy || !configEnabled}
                    onCheckedChange={(checked) => onToggleEvent(event.id, checked)}
                    aria-label={`Attiva ${event.label}`}
                  />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleEditor({
  eventId,
  schedule,
  busy,
  onSave
}: {
  eventId: string;
  schedule: SpecialDaySchedule;
  busy: boolean;
  onSave: (eventId: string, schedule: SpecialDaySchedule) => void;
}) {
  const [draft, setDraft] = React.useState<SpecialDaySchedule>(schedule);

  React.useEffect(() => {
    setDraft(schedule);
  }, [schedule]);

  function changeType(type: SpecialDaySchedule["type"]) {
    if (type === "fixedDate") setDraft({ type, month: 1, day: 1 });
    if (type === "dateRange") setDraft({ type, start: { month: 1, day: 1 }, end: { month: 1, day: 1 } });
    if (type === "nthWeekday") setDraft({ type, month: 5, weekday: 0, nth: 2 });
    if (type === "easterOffset") setDraft({ type, offsetDays: 0, durationDays: 1 });
  }

  return (
    <div className="mt-3 grid gap-2 rounded-md border border-border/70 bg-muted/25 p-3 sm:grid-cols-[140px_1fr_auto]">
      <label className="grid gap-1 text-xs text-muted-foreground">
        Tipo
        <select
          value={draft.type}
          onChange={(event) => changeType(event.target.value as SpecialDaySchedule["type"])}
          disabled={busy}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="fixedDate">Data fissa</option>
          <option value="dateRange">Intervallo</option>
          <option value="nthWeekday">Giorno ricorrente</option>
          <option value="easterOffset">Pasqua</option>
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-4">
        <ScheduleFields schedule={draft} disabled={busy} onChange={setDraft} />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => onSave(eventId, draft)}
        className="self-end"
      >
        <CalendarDays className="h-4 w-4" />
        Salva data
      </Button>
    </div>
  );
}

function ScheduleFields({
  schedule,
  disabled,
  onChange
}: {
  schedule: SpecialDaySchedule;
  disabled: boolean;
  onChange: (schedule: SpecialDaySchedule) => void;
}) {
  if (schedule.type === "fixedDate") {
    return (
      <>
        <NumberField label="Mese" value={schedule.month} min={1} max={12} disabled={disabled} onChange={(month) => onChange({ ...schedule, month })} />
        <NumberField label="Giorno" value={schedule.day} min={1} max={31} disabled={disabled} onChange={(day) => onChange({ ...schedule, day })} />
      </>
    );
  }

  if (schedule.type === "dateRange") {
    return (
      <>
        <NumberField label="Mese inizio" value={schedule.start.month} min={1} max={12} disabled={disabled} onChange={(month) => onChange({ ...schedule, start: { ...schedule.start, month } })} />
        <NumberField label="Giorno inizio" value={schedule.start.day} min={1} max={31} disabled={disabled} onChange={(day) => onChange({ ...schedule, start: { ...schedule.start, day } })} />
        <NumberField label="Mese fine" value={schedule.end.month} min={1} max={12} disabled={disabled} onChange={(month) => onChange({ ...schedule, end: { ...schedule.end, month } })} />
        <NumberField label="Giorno fine" value={schedule.end.day} min={1} max={31} disabled={disabled} onChange={(day) => onChange({ ...schedule, end: { ...schedule.end, day } })} />
      </>
    );
  }

  if (schedule.type === "nthWeekday") {
    return (
      <>
        <NumberField label="Mese" value={schedule.month} min={1} max={12} disabled={disabled} onChange={(month) => onChange({ ...schedule, month })} />
        <NumberField label="Settimana" value={schedule.nth} min={1} max={5} disabled={disabled} onChange={(nth) => onChange({ ...schedule, nth })} />
        <label className="grid gap-1 text-xs text-muted-foreground">
          Giorno
          <select
            value={schedule.weekday}
            onChange={(event) => onChange({ ...schedule, weekday: Number(event.target.value) })}
            disabled={disabled}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value={0}>Domenica</option>
            <option value={1}>Lunedì</option>
            <option value={2}>Martedì</option>
            <option value={3}>Mercoledì</option>
            <option value={4}>Giovedì</option>
            <option value={5}>Venerdì</option>
            <option value={6}>Sabato</option>
          </select>
        </label>
      </>
    );
  }

  return (
    <>
      <NumberField label="Offset giorni" value={schedule.offsetDays} min={-30} max={30} disabled={disabled} onChange={(offsetDays) => onChange({ ...schedule, offsetDays })} />
      <NumberField label="Durata giorni" value={schedule.durationDays || 1} min={1} max={7} disabled={disabled} onChange={(durationDays) => onChange({ ...schedule, durationDays })} />
    </>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        className="h-9 text-sm"
      />
    </label>
  );
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
