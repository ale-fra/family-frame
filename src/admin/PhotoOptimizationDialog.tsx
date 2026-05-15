import * as React from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import type { AdminPhoto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OptimizePhotoPayload } from "./api";

type Props = {
  photo: AdminPhoto | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: OptimizePhotoPayload) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
};

type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const targetAspect = 4 / 3;
const defaultQuality = 82;

export function PhotoOptimizationDialog({ photo, open, busy, onOpenChange, onSave, onRemove }: Props) {
  const [mode, setMode] = React.useState<"contain" | "cover">("contain");
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [quality, setQuality] = React.useState(defaultQuality);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<CropArea | null>(null);
  const [initialCroppedAreaPixels, setInitialCroppedAreaPixels] = React.useState<CropArea | undefined>();
  const [resetKey, setResetKey] = React.useState(0);

  React.useEffect(() => {
    if (!photo || !open) return;
    setMode(photo.optimized?.mode || "contain");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setQuality(photo.optimized?.quality || defaultQuality);
    setCroppedAreaPixels(photo.optimized?.crop || null);
    setInitialCroppedAreaPixels(photo.optimized?.mode === "cover" ? photo.optimized.crop : undefined);
    setResetKey((value) => value + 1);
  }, [photo, open]);

  if (!photo) return null;

  const sourceSrc = photo.src;
  const canSave = mode === "contain" || Boolean(croppedAreaPixels);

  async function save() {
    const payload: OptimizePhotoPayload = {
      mode,
      quality,
      ...(mode === "cover" && croppedAreaPixels
        ? {
            crop: {
              x: croppedAreaPixels.x,
              y: croppedAreaPixels.y,
              width: croppedAreaPixels.width,
              height: croppedAreaPixels.height
            }
          }
        : {})
    };
    const saved = await onSave(payload);
    if (saved) onOpenChange(false);
  }

  async function remove() {
    const removed = await onRemove();
    if (removed) onOpenChange(false);
  }

  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setQuality(defaultQuality);
    setCroppedAreaPixels(null);
    setInitialCroppedAreaPixels(undefined);
    setResetKey((value) => value + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1.5rem)] max-w-[calc(100vw-1.5rem)] grid-rows-none flex-col overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b px-4 py-3 sm:px-6">
          <DialogTitle>Ottimizza foto</DialogTitle>
          <DialogDescription className="truncate" title={photo.originalName}>
            {photo.originalName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden sm:p-6">
          <div className="min-h-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={mode === "contain" ? "default" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => setMode("contain")}
              >
                Adatta
              </Button>
              <Button
                type="button"
                variant={mode === "cover" ? "default" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => setMode("cover")}
              >
                Ritaglia
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={reset}>
                Reset
              </Button>
            </div>

            <div className="relative mx-auto aspect-[4/3] max-h-[min(68dvh,720px)] w-full overflow-hidden rounded-lg border border-border bg-[#f8f4eb] shadow-sm">
              {mode === "cover" ? (
                <Cropper
                  key={`${photo.id}-${resetKey}`}
                  image={sourceSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={targetAspect}
                  objectFit="contain"
                  initialCroppedAreaPixels={initialCroppedAreaPixels}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                  showGrid
                />
              ) : (
                <>
                  <div
                    className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl saturate-105"
                    style={{ backgroundImage: `url(${sourceSrc})` }}
                  />
                  <div className="absolute inset-0 bg-[#f8f4eb]/35" />
                  <img
                    src={sourceSrc}
                    alt={photo.originalName}
                    className="relative z-10 h-full w-full object-contain p-2"
                  />
                </>
              )}
            </div>
          </div>

          <div className="space-y-5 lg:overflow-y-auto">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="photo-zoom">Zoom</Label>
                <span className="text-xs text-muted-foreground">{zoom.toFixed(2)}x</span>
              </div>
              <Input
                id="photo-zoom"
                type="range"
                min="1"
                max="4"
                step="0.01"
                value={zoom}
                disabled={busy || mode !== "cover"}
                onChange={(event) => setZoom(Number(event.currentTarget.value))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="photo-quality">Qualità WebP</Label>
                <Input
                  id="photo-quality"
                  type="number"
                  min="60"
                  max="95"
                  value={quality}
                  disabled={busy}
                  className="h-8 w-20"
                  onChange={(event) => setQuality(readQuality(event.currentTarget.value))}
                />
              </div>
              <Input
                type="range"
                min="60"
                max="95"
                step="1"
                value={quality}
                disabled={busy}
                onChange={(event) => setQuality(readQuality(event.currentTarget.value))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Output</p>
                <p className="font-medium">1440x1080 WebP</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cornice</p>
                <p className="font-medium">4:3</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-4 py-3 sm:px-6">
          {photo.optimizedSrc ? (
            <Button type="button" variant="destructive" disabled={busy} onClick={remove}>
              Rimuovi ottimizzazione
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              Annulla
            </Button>
          </DialogClose>
          <Button type="button" disabled={busy || !canSave} onClick={save}>
            Salva ottimizzata
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function readQuality(value: string) {
  const quality = Number(value);
  if (!Number.isFinite(quality)) return defaultQuality;
  return Math.min(95, Math.max(60, Math.round(quality)));
}
