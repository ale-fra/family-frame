import * as React from "react";
import "@/admin.css";
import type {
  AdminPhoto,
  CalendarSource,
  NightDisplaySettings,
  PhotoStatus,
  SpecialDayConfig,
  SpecialDaySchedule
} from "@/lib/types";
import { defaultConfig } from "@/lib/config";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { PinGate } from "./PinGate";
import { AdminLayout } from "./AdminLayout";
import { PhotoOptimizationDialog } from "./PhotoOptimizationDialog";
import { PhotosSection } from "./PhotosSection";
import { SettingsSection } from "./SettingsSection";
import { countPhotos, type AdminSection } from "./labels";
import {
  ApiRequestError,
  UnauthorizedError,
  defaultNightDisplaySettings,
  loadAdminSettings,
  loadDisplayControlsAvailable,
  loadPhotos,
  optimizePhoto,
  parseKeywordEditorValue,
  removePhotoOptimization,
  saveAdminSettings,
  setPinnedPhoto,
  setDisplayPower,
  updatePhotoStatus,
  uploadPhotos,
  type OptimizePhotoPayload
} from "./api";

const PIN_STORAGE_KEY = "frameAdminPin";

export default function AdminApp() {
  const [pin, setPin] = React.useState(() => window.localStorage.getItem(PIN_STORAGE_KEY) || "");
  const [needsPin, setNeedsPin] = React.useState(!pin);
  const [photos, setPhotos] = React.useState<AdminPhoto[]>([]);
  const [activeSection, setActiveSection] = React.useState<AdminSection>("photos");
  const [activeTab, setActiveTab] = React.useState<PhotoStatus>("pending");
  const [busy, setBusy] = React.useState(false);
  const [optimizingPhoto, setOptimizingPhoto] = React.useState<AdminPhoto | null>(null);

  const [keywordsText, setKeywordsText] = React.useState(defaultConfig.calendar.importantKeywords.join("\n"));
  const [calendarSources, setCalendarSources] = React.useState<CalendarSource[]>(
    defaultConfig.calendar.sources || []
  );
  const [specialDayEvents, setSpecialDayEvents] = React.useState<SpecialDayConfig[]>(
    defaultConfig.specialDays.events
  );
  const [disabledSpecialDayIds, setDisabledSpecialDayIds] = React.useState<string[]>([]);
  const [nightDisplay, setNightDisplay] = React.useState<NightDisplaySettings>(defaultNightDisplaySettings);
  const [pinnedPhotoId, setPinnedPhotoId] = React.useState("");
  const [displayControlsAvailable, setDisplayControlsAvailable] = React.useState(false);

  const handleUnauthorized = React.useCallback(() => {
    setNeedsPin(true);
    setPin("");
    window.localStorage.removeItem(PIN_STORAGE_KEY);
    toast.error("Sessione scaduta", { description: "Reinserisci il PIN admin." });
  }, []);

  const refreshPhotos = React.useCallback(async () => {
    if (!pin) return;
    try {
      const list = await loadPhotos(pin);
      setNeedsPin(false);
      setPhotos(list);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return;
      }
      toast.error("Server foto non raggiungibile", {
        description: "Avvia npm run server insieme a npm run dev."
      });
    }
  }, [pin, handleUnauthorized]);

  const refreshSettings = React.useCallback(async () => {
    if (!pin) return;
    try {
      const [bundle, displayControls] = await Promise.all([
        loadAdminSettings(pin),
        loadDisplayControlsAvailable(pin)
      ]);
      setDisplayControlsAvailable(displayControls);
      setCalendarSources(bundle.calendarSources);
      setSpecialDayEvents(bundle.specialDayEvents);
      setKeywordsText(bundle.importantKeywords.join("\n"));
      setDisabledSpecialDayIds(bundle.disabledSpecialDayIds);
      setNightDisplay(bundle.nightDisplay);
      setPinnedPhotoId(bundle.pinnedPhotoId);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return;
      }
      // silent fallback to defaults
      setCalendarSources(defaultConfig.calendar.sources || []);
      setKeywordsText(defaultConfig.calendar.importantKeywords.join("\n"));
      setSpecialDayEvents(defaultConfig.specialDays.events);
      setDisabledSpecialDayIds([]);
      setNightDisplay(defaultNightDisplaySettings);
      setPinnedPhotoId("");
    }
  }, [pin, handleUnauthorized]);

  React.useEffect(() => {
    if (!pin) return;
    refreshPhotos();
    refreshSettings();
  }, [pin, refreshPhotos, refreshSettings]);

  const counts = React.useMemo(() => countPhotos(photos), [photos]);

  function submitPin(value: string) {
    window.localStorage.setItem(PIN_STORAGE_KEY, value);
    setPin(value);
    setNeedsPin(false);
  }

  function logout() {
    window.localStorage.removeItem(PIN_STORAGE_KEY);
    setPin("");
    setPhotos([]);
    setNeedsPin(true);
  }

  async function handleUpload(files: File[]) {
    if (!pin || files.length === 0) return;
    setBusy(true);
    const toastId = toast.loading(`Caricamento di ${files.length} foto…`);
    try {
      const result = await uploadPhotos(pin, files);
      setPhotos(result.photos);
      setActiveSection("photos");
      setActiveTab("pending");
      toast.success(
        result.rejected > 0
          ? `${result.accepted} aggiunte · ${result.rejected} scartate`
          : `${result.accepted} foto aggiunte alla coda`,
        { id: toastId }
      );
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        toast.dismiss(toastId);
        handleUnauthorized();
        return;
      }
      toast.error("Caricamento non riuscito", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateStatus(photo: AdminPhoto, status: PhotoStatus) {
    if (!pin) return;
    setBusy(true);
    const previous = photos;
    const previousPinnedPhotoId = pinnedPhotoId;
    setPhotos((current) => current.map((entry) => (entry.id === photo.id ? { ...entry, status } : entry)));
    if (status !== "approved" && pinnedPhotoId === photo.id) setPinnedPhotoId("");
    try {
      await updatePhotoStatus(pin, photo.id, status);
      toast.success(`${photo.originalName}`, {
        description: `Spostata in “${statusLabel(status)}”.`
      });
    } catch (error) {
      setPhotos(previous);
      setPinnedPhotoId(previousPinnedPhotoId);
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return;
      }
      toast.error("Aggiornamento non riuscito");
    } finally {
      setBusy(false);
    }
  }

  async function handlePinnedPhoto(photo: AdminPhoto, pinned: boolean) {
    if (!pin) return;
    setBusy(true);
    const previousPinnedPhotoId = pinnedPhotoId;
    setPinnedPhotoId(pinned ? photo.id : "");
    try {
      const settings = await setPinnedPhoto(pin, pinned ? photo.id : "");
      setPinnedPhotoId(settings.slideshow?.pinnedPhotoId || "");
      toast.success(pinned ? "Foto fissata nella cornice" : "Foto fissa rimossa", {
        description: photo.originalName
      });
    } catch (error) {
      setPinnedPhotoId(previousPinnedPhotoId);
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return;
      }
      toast.error("Aggiornamento non riuscito");
    } finally {
      setBusy(false);
    }
  }

  async function handleOptimizePhoto(payload: OptimizePhotoPayload) {
    if (!pin || !optimizingPhoto) return false;
    setBusy(true);
    try {
      const list = await optimizePhoto(pin, optimizingPhoto.id, payload);
      setPhotos(list);
      toast.success("Foto ottimizzata", { description: optimizingPhoto.originalName });
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return false;
      }
      toast.error("Ottimizzazione non riuscita", {
        description: error instanceof ApiRequestError ? error.message : undefined
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleRemovePhotoOptimization() {
    if (!pin || !optimizingPhoto) return false;
    setBusy(true);
    try {
      const list = await removePhotoOptimization(pin, optimizingPhoto.id);
      setPhotos(list);
      toast.success("Ottimizzazione rimossa", { description: optimizingPhoto.originalName });
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return false;
      }
      toast.error("Rimozione non riuscita", {
        description: error instanceof ApiRequestError ? error.message : undefined
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function persistSettings(
    nextDisabledIds: string[],
    nextCalendarSources: CalendarSource[],
    nextKeywords: string[],
    nextEvents: SpecialDayConfig[],
    successMessage: string,
    nextNightDisplay?: NightDisplaySettings
  ) {
    if (!pin) return;
    setBusy(true);
    try {
      const settings = await saveAdminSettings(pin, {
        calendarSources: nextCalendarSources,
        importantKeywords: nextKeywords,
        nightDisplay: nextNightDisplay,
        disabledSpecialDayIds: nextDisabledIds,
        specialDayEvents: nextEvents.map((event) => ({
          ...event,
          enabled: event.enabled !== false && !nextDisabledIds.includes(event.id)
        }))
      });
      setCalendarSources(settings.calendar?.sources || nextCalendarSources);
      setKeywordsText((settings.calendar?.importantKeywords || nextKeywords).join("\n"));
      setDisabledSpecialDayIds(settings.specialDays?.disabledIds || nextDisabledIds);
      setSpecialDayEvents(settings.specialDays?.events || nextEvents);
      if (nextNightDisplay) setNightDisplay(settings.display?.nightMode || nextNightDisplay);
      toast.success(successMessage);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return;
      }
      toast.error("Salvataggio non riuscito");
    } finally {
      setBusy(false);
    }
  }

  async function saveKeywords() {
    const keywords = parseKeywordEditorValue(keywordsText);
    await persistSettings(disabledSpecialDayIds, calendarSources, keywords, specialDayEvents, "Parole importanti salvate");
  }

  async function saveCalendarSources(nextSources: CalendarSource[]) {
    const keywords = parseKeywordEditorValue(keywordsText);
    const normalizedSources = nextSources.map((source) => ({
      ...source,
      label: source.label.trim(),
      icsUrl: source.icsUrl.trim()
    }));
    setCalendarSources(normalizedSources);
    await persistSettings(
      disabledSpecialDayIds,
      normalizedSources,
      keywords,
      specialDayEvents,
      "Calendari salvati"
    );
  }

  async function toggleSpecialDay(eventId: string, enabled: boolean) {
    const keywords = parseKeywordEditorValue(keywordsText);
    const nextDisabled = enabled
      ? disabledSpecialDayIds.filter((id) => id !== eventId)
      : [...new Set([...disabledSpecialDayIds, eventId])];
    const nextEvents = specialDayEvents.map((event) => (
      event.id === eventId ? { ...event, enabled } : event
    ));
    setDisabledSpecialDayIds(nextDisabled);
    setSpecialDayEvents(nextEvents);
    await persistSettings(
      nextDisabled,
      calendarSources,
      keywords,
      nextEvents,
      enabled ? "Giornata evento attivata" : "Giornata evento disattivata"
    );
  }

  async function updateSpecialDaySchedule(eventId: string, schedule: SpecialDaySchedule) {
    const keywords = parseKeywordEditorValue(keywordsText);
    const nextEvents = specialDayEvents.map((event) => (
      event.id === eventId ? { ...event, schedule } : event
    ));
    setSpecialDayEvents(nextEvents);
    await persistSettings(disabledSpecialDayIds, calendarSources, keywords, nextEvents, "Data giornata salvata");
  }

  async function saveNightDisplay(nextNightDisplay: NightDisplaySettings) {
    const keywords = parseKeywordEditorValue(keywordsText);
    await persistSettings(
      disabledSpecialDayIds,
      calendarSources,
      keywords,
      specialDayEvents,
      nextNightDisplay.enabled ? "Orari schermo salvati" : "Spegnimento notturno disattivato",
      nextNightDisplay
    );
  }

  async function handleDisplayPower(action: "on" | "off", output: string) {
    if (!pin) return;
    setBusy(true);
    try {
      await setDisplayPower(pin, action, output);
      toast.success(action === "on" ? "Schermo acceso" : "Schermo spento");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return;
      }
      toast.error(action === "on" ? "Accensione non riuscita" : "Spegnimento non riuscito");
    } finally {
      setBusy(false);
    }
  }

  if (needsPin) {
    return (
      <div className="admin-root">
        <PinGate initialPin={pin} onSubmit={submitPin} />
        <Toaster richColors closeButton position="top-right" />
      </div>
    );
  }

  const sectionTitle = activeSection === "photos" ? "Dashboard foto" : "Eventi e giornate speciali";
  const sectionDescription =
    activeSection === "photos"
      ? "Carica, approva e gestisci la libreria della cornice."
      : "Configura le parole calendario e i temi automatici della cornice.";

  return (
    <div className="admin-root">
      <TooltipProvider delayDuration={150}>
        <AdminLayout
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          pendingCount={counts.pending}
          onLogout={logout}
          sectionTitle={sectionTitle}
          sectionDescription={sectionDescription}
        >
          {activeSection === "photos" ? (
            <PhotosSection
              photos={photos}
              counts={counts}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              busy={busy}
              onUpload={handleUpload}
              onUpdateStatus={handleUpdateStatus}
              pinnedPhotoId={pinnedPhotoId}
              onPinnedPhotoChange={handlePinnedPhoto}
              onOptimizePhoto={setOptimizingPhoto}
            />
          ) : (
            <SettingsSection
              keywordsText={keywordsText}
              onKeywordsChange={setKeywordsText}
              onSaveKeywords={saveKeywords}
              calendarSources={calendarSources}
              onSaveCalendarSources={saveCalendarSources}
              nightDisplay={nightDisplay}
              displayControlsAvailable={displayControlsAvailable}
              onSaveNightDisplay={saveNightDisplay}
              onDisplayPower={handleDisplayPower}
              busy={busy}
              events={specialDayEvents}
              disabledIds={disabledSpecialDayIds}
              onToggleEvent={toggleSpecialDay}
              onUpdateEventSchedule={updateSpecialDaySchedule}
            />
          )}
        </AdminLayout>
        <PhotoOptimizationDialog
          photo={optimizingPhoto}
          open={Boolean(optimizingPhoto)}
          busy={busy}
          onOpenChange={(open) => {
            if (!open) setOptimizingPhoto(null);
          }}
          onSave={handleOptimizePhoto}
          onRemove={handleRemovePhotoOptimization}
        />
        <Toaster richColors closeButton position="top-right" />
      </TooltipProvider>
    </div>
  );
}

function statusLabel(status: PhotoStatus) {
  const map: Record<PhotoStatus, string> = {
    pending: "Da approvare",
    approved: "Visibile",
    hidden: "Nascosta",
    trashed: "Cestino"
  };
  return map[status];
}
