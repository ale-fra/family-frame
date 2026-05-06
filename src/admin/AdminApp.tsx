import * as React from "react";
import "@/admin.css";
import type { AdminPhoto, PhotoStatus, SpecialDayConfig, SpecialDaySchedule } from "@/lib/types";
import { defaultConfig } from "@/lib/config";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { PinGate } from "./PinGate";
import { AdminLayout } from "./AdminLayout";
import { PhotosSection } from "./PhotosSection";
import { SettingsSection } from "./SettingsSection";
import { countPhotos, type AdminSection } from "./labels";
import {
  UnauthorizedError,
  loadAdminSettings,
  loadPhotos,
  parseKeywordEditorValue,
  saveAdminSettings,
  updatePhotoStatus,
  uploadPhotos
} from "./api";

const PIN_STORAGE_KEY = "frameAdminPin";

export default function AdminApp() {
  const [pin, setPin] = React.useState(() => window.localStorage.getItem(PIN_STORAGE_KEY) || "");
  const [needsPin, setNeedsPin] = React.useState(!pin);
  const [photos, setPhotos] = React.useState<AdminPhoto[]>([]);
  const [activeSection, setActiveSection] = React.useState<AdminSection>("photos");
  const [activeTab, setActiveTab] = React.useState<PhotoStatus>("pending");
  const [busy, setBusy] = React.useState(false);

  const [keywordsText, setKeywordsText] = React.useState(defaultConfig.calendar.importantKeywords.join("\n"));
  const [specialDayEvents, setSpecialDayEvents] = React.useState<SpecialDayConfig[]>(
    defaultConfig.specialDays.events
  );
  const [disabledSpecialDayIds, setDisabledSpecialDayIds] = React.useState<string[]>([]);

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
      const bundle = await loadAdminSettings(pin);
      setSpecialDayEvents(bundle.specialDayEvents);
      setKeywordsText(bundle.importantKeywords.join("\n"));
      setDisabledSpecialDayIds(bundle.disabledSpecialDayIds);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return;
      }
      // silent fallback to defaults
      setKeywordsText(defaultConfig.calendar.importantKeywords.join("\n"));
      setSpecialDayEvents(defaultConfig.specialDays.events);
      setDisabledSpecialDayIds([]);
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
    setPhotos((current) => current.map((entry) => (entry.id === photo.id ? { ...entry, status } : entry)));
    try {
      await updatePhotoStatus(pin, photo.id, status);
      toast.success(`${photo.originalName}`, {
        description: `Spostata in “${statusLabel(status)}”.`
      });
    } catch (error) {
      setPhotos(previous);
      if (error instanceof UnauthorizedError) {
        handleUnauthorized();
        return;
      }
      toast.error("Aggiornamento non riuscito");
    } finally {
      setBusy(false);
    }
  }

  async function persistSettings(
    nextDisabledIds: string[],
    nextKeywords: string[],
    nextEvents: SpecialDayConfig[],
    successMessage: string
  ) {
    if (!pin) return;
    setBusy(true);
    try {
      const settings = await saveAdminSettings(pin, {
        importantKeywords: nextKeywords,
        disabledSpecialDayIds: nextDisabledIds,
        specialDayEvents: nextEvents.map((event) => ({
          ...event,
          enabled: event.enabled !== false && !nextDisabledIds.includes(event.id)
        }))
      });
      setKeywordsText((settings.calendar?.importantKeywords || nextKeywords).join("\n"));
      setDisabledSpecialDayIds(settings.specialDays?.disabledIds || nextDisabledIds);
      setSpecialDayEvents(settings.specialDays?.events || nextEvents);
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
    await persistSettings(disabledSpecialDayIds, keywords, specialDayEvents, "Parole importanti salvate");
  }

  async function toggleSpecialDay(eventId: string, enabled: boolean) {
    const keywords = parseKeywordEditorValue(keywordsText);
    const nextDisabled = enabled
      ? disabledSpecialDayIds.filter((id) => id !== eventId)
      : [...new Set([...disabledSpecialDayIds, eventId])];
    setDisabledSpecialDayIds(nextDisabled);
    await persistSettings(
      nextDisabled,
      keywords,
      specialDayEvents,
      enabled ? "Giornata evento attivata" : "Giornata evento disattivata"
    );
  }

  async function updateSpecialDaySchedule(eventId: string, schedule: SpecialDaySchedule) {
    const keywords = parseKeywordEditorValue(keywordsText);
    const nextEvents = specialDayEvents.map((event) => (
      event.id === eventId ? { ...event, schedule } : event
    ));
    setSpecialDayEvents(nextEvents);
    await persistSettings(disabledSpecialDayIds, keywords, nextEvents, "Data giornata salvata");
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
            />
          ) : (
            <SettingsSection
              keywordsText={keywordsText}
              onKeywordsChange={setKeywordsText}
              onSaveKeywords={saveKeywords}
              busy={busy}
              events={specialDayEvents}
              disabledIds={disabledSpecialDayIds}
              onToggleEvent={toggleSpecialDay}
              onUpdateEventSchedule={updateSpecialDaySchedule}
            />
          )}
        </AdminLayout>
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
