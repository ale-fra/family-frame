import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Frame } from "lucide-react";

type Props = {
  initialPin: string;
  onSubmit: (pin: string) => void;
};

export function PinGate({ initialPin, onSubmit }: Props) {
  const [draft, setDraft] = React.useState(initialPin);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit(draft);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm border-border/60 shadow-2xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Frame className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Cornice Famiglia
            </p>
            <CardTitle className="text-2xl">Admin</CardTitle>
          </div>
          <CardDescription>
            Accesso protetto per caricare, approvare e organizzare le foto del frame.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-pin">PIN admin</Label>
              <Input
                id="admin-pin"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full">
              Entra
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
