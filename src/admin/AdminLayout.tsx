import * as React from "react";
import type { AdminSection } from "./labels";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme";
import {
  CalendarClock,
  ExternalLink,
  Frame,
  Image as ImageIcon,
  LogOut,
  Moon,
  Settings as SettingsIcon,
  Sun
} from "lucide-react";

type Props = {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  pendingCount: number;
  onLogout: () => void;
  children: React.ReactNode;
  sectionTitle: string;
  sectionDescription: string;
  /** The Routines section follows FRAME_LOCALE (the rest of the admin is Italian for now). */
  routinesLabel: string;
};

export function AdminLayout({
  activeSection,
  onSectionChange,
  pendingCount,
  onLogout,
  children,
  sectionTitle,
  sectionDescription,
  routinesLabel
}: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && document.documentElement.classList.contains("dark"));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Frame className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Cornice
            </p>
            <p className="text-sm font-semibold">Famiglia · Admin</p>
          </div>
        </div>
        <Separator />

        <nav className="flex-1 space-y-1 p-3" aria-label="Sezioni admin">
          <SidebarLink
            active={activeSection === "photos"}
            onClick={() => onSectionChange("photos")}
            icon={<ImageIcon className="h-4 w-4" />}
            label="Foto"
            badge={pendingCount > 0 ? pendingCount : undefined}
          />
          <SidebarLink
            active={activeSection === "routines"}
            onClick={() => onSectionChange("routines")}
            icon={<CalendarClock className="h-4 w-4" />}
            label={routinesLabel}
          />
          <SidebarLink
            active={activeSection === "settings"}
            onClick={() => onSectionChange("settings")}
            icon={<SettingsIcon className="h-4 w-4" />}
            label="Impostazioni"
          />
        </nav>

        <Separator />
        <div className="space-y-1 p-3">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground"
            onClick={toggle}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? "Tema chiaro" : "Tema scuro"}
          </Button>
          <Button asChild variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground">
            <a href="/" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Apri cornice
            </a>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground hover:text-destructive"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
            Esci
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {activeSection === "photos" ? "Libreria" : activeSection === "routines" ? routinesLabel : "Configurazione"}
              </p>
              <h1 className="truncate text-xl font-semibold">{sectionTitle}</h1>
              <p className="truncate text-sm text-muted-foreground">{sectionDescription}</p>
            </div>
            <MobileNav
              routinesLabel={routinesLabel}
              activeSection={activeSection}
              onSectionChange={onSectionChange}
              pendingCount={pendingCount}
              onToggleTheme={toggle}
              isDark={isDark}
              onLogout={onLogout}
            />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarLink({
  active,
  onClick,
  icon,
  label,
  badge
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      <span className="flex items-center gap-3">
        {icon}
        {label}
      </span>
      {badge !== undefined && (
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

function MobileNav({
  routinesLabel,
  activeSection,
  onSectionChange,
  pendingCount,
  onToggleTheme,
  isDark,
  onLogout
}: {
  routinesLabel: string;
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  pendingCount: number;
  onToggleTheme: () => void;
  isDark: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center gap-1 md:hidden">
      <Button
        variant={activeSection === "photos" ? "default" : "ghost"}
        size="icon"
        onClick={() => onSectionChange("photos")}
        aria-label="Foto"
        className="relative"
      >
        <ImageIcon className="h-4 w-4" />
        {pendingCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {pendingCount}
          </span>
        )}
      </Button>
      <Button
        variant={activeSection === "routines" ? "default" : "ghost"}
        size="icon"
        onClick={() => onSectionChange("routines")}
        aria-label={routinesLabel}
      >
        <CalendarClock className="h-4 w-4" />
      </Button>
      <Button
        variant={activeSection === "settings" ? "default" : "ghost"}
        size="icon"
        onClick={() => onSectionChange("settings")}
        aria-label="Impostazioni"
      >
        <SettingsIcon className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="Cambia tema">
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Esci">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
