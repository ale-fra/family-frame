import * as React from "react";
import type { SpecialDayConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { specialDayScheduleLabel } from "./labels";
import { Save, Sparkles } from "lucide-react";

type Props = {
  keywordsText: string;
  onKeywordsChange: (value: string) => void;
  onSaveKeywords: () => void;
  busy: boolean;
  events: SpecialDayConfig[];
  disabledIds: string[];
  onToggleEvent: (eventId: string, enabled: boolean) => void;
};

export function SettingsSection({
  keywordsText,
  onKeywordsChange,
  onSaveKeywords,
  busy,
  events,
  disabledIds,
  onToggleEvent
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
            Disattiva i temi che non vuoi mostrare sulla cornice. Le date restano definite nel file di configurazione.
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

