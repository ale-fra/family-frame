import * as React from "react";
import type { SpecialDayConfig, SpecialDaySchedule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { specialDayScheduleLabel } from "./labels";
import { CalendarDays, Save, Sparkles, X } from "lucide-react";

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
          <KeywordTokenEditor
            value={keywordsText}
            onChange={onKeywordsChange}
            disabled={busy}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Premi Invio o usa una virgola per aggiungere una parola o frase.
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
                  className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
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
                    className="sm:mt-1"
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

function KeywordTokenEditor({
  value,
  onChange,
  disabled
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = React.useState("");
  const tokens = React.useMemo(() => parseKeywordTokens(value), [value]);

  function commitDraft(nextDraft = draft) {
    const additions = parseKeywordTokens(nextDraft);
    if (additions.length === 0) {
      setDraft("");
      return;
    }
    onChange([...new Set([...tokens, ...additions])].join(", "));
    setDraft("");
  }

  function removeToken(token: string) {
    onChange(tokens.filter((entry) => entry !== token).join(", "));
  }

  return (
    <div
      className="min-h-36 rounded-md border border-input bg-background p-2 focus-within:ring-[3px] focus-within:ring-ring/50"
      onClick={(event) => {
        const input = event.currentTarget.querySelector("input");
        input?.focus();
      }}
    >
      <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto pr-1">
        {tokens.map((token) => (
          <span
            key={token}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-sm"
          >
            <span className="truncate">{token}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                removeToken(token);
              }}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
              aria-label={`Rimuovi ${token}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          id="important-keywords"
          value={draft}
          disabled={disabled}
          spellCheck={false}
          placeholder={tokens.length === 0 ? "compleanno, visita medica, ..." : "Aggiungi parola"}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (nextValue.includes(",")) {
              commitDraft(nextValue);
              return;
            }
            setDraft(nextValue);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
            }
            if (event.key === "Backspace" && draft.length === 0 && tokens.length > 0) {
              onChange(tokens.slice(0, -1).join(", "));
            }
          }}
          onBlur={() => commitDraft()}
          className="h-8 min-w-44 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

function parseKeywordTokens(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    )
  ];
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
    <div className="mt-3 grid gap-2 rounded-md border border-border/70 bg-muted/25 p-3 lg:grid-cols-[140px_1fr_auto]">
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
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
