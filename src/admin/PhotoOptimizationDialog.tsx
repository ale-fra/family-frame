import * as React from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import type { AdminPhoto, PhotoOptimizationMode } from "@/lib/types";
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

type FrameTransform = {
  x: number;
  y: number;
  zoom: number;
};

const frameAspect = 4 / 3;
const defaultQuality = 82;

export function PhotoOptimizationDialog({ photo, open, busy, onOpenChange, onSave, onRemove }: Props) {
  const [mode, setMode] = React.useState<PhotoOptimizationMode>("contain");
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [quality, setQuality] = React.useState(defaultQuality);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<CropArea | null>(null);
  const [initialCroppedAreaPixels, setInitialCroppedAreaPixels] = React.useState<CropArea | undefined>();
  const [resetKey, setResetKey] = React.useState(0);
  const [frameTransform, setFrameTransform] = React.useState<FrameTransform>({ x: 0, y: 0, zoom: 1 });
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTransform: FrameTransform;
    rect: DOMRect;
  } | null>(null);

  React.useEffect(() => {
    if (!photo || !open) return;
    const nextMode = photo.optimized?.mode === "cover-original" ? "frame" : photo.optimized?.mode || "contain";
    const nextTransform = photo.optimized?.transform || { x: 0, y: 0, zoom: 1 };
    setMode(nextMode);
    setCrop({ x: 0, y: 0 });
    setZoom(nextMode === "frame" ? nextTransform.zoom : 1);
    setQuality(photo.optimized?.quality || defaultQuality);
    setCroppedAreaPixels(photo.optimized?.crop || null);
    setInitialCroppedAreaPixels(
      photo.optimized && photo.optimized.mode === "cover" ? photo.optimized.crop : undefined
    );
    setResetKey((value) => value + 1);
    setFrameTransform(nextTransform);
  }, [photo, open]);

  if (!photo) return null;

  const sourceSrc = photo.src;
  const isCropMode = mode === "cover";
  const isFrameMode = mode === "frame";
  const canSave = mode === "contain" || isFrameMode || (isCropMode && Boolean(croppedAreaPixels));
  const outputLabel = mode === "contain" ? "Originale" : "4:3";

  async function save() {
    const payload: OptimizePhotoPayload = {
      mode,
      quality,
      ...(isCropMode && croppedAreaPixels
        ? {
            crop: {
              x: croppedAreaPixels.x,
              y: croppedAreaPixels.y,
              width: croppedAreaPixels.width,
              height: croppedAreaPixels.height
            }
          }
        : {}),
      ...(isFrameMode
        ? {
            transform: {
              x: frameTransform.x,
              y: frameTransform.y,
              zoom: frameTransform.zoom
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
    setFrameTransform({ x: 0, y: 0, zoom: 1 });
    setResetKey((value) => value + 1);
  }

  function selectMode(nextMode: PhotoOptimizationMode) {
    setMode(nextMode);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setInitialCroppedAreaPixels(undefined);
    setFrameTransform({ x: 0, y: 0, zoom: 1 });
    setResetKey((value) => value + 1);
  }

  function updateZoom(value: number) {
    const nextZoom = clamp(value, 1, 4);
    setZoom(nextZoom);
    if (isFrameMode) {
      setFrameTransform((current) => ({ ...current, zoom: nextZoom }));
    }
  }

  function startFrameDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!isFrameMode || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTransform: frameTransform,
      rect: event.currentTarget.getBoundingClientRect()
    };
  }

  function moveFrameDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = drag.startTransform.x + (event.clientX - drag.startX) / drag.rect.width;
    const nextY = drag.startTransform.y + (event.clientY - drag.startY) / drag.rect.height;
    setFrameTransform((current) => ({
      ...current,
      x: clamp(nextX, -0.5, 0.5),
      y: clamp(nextY, -0.5, 0.5)
    }));
  }

  function stopFrameDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) dragRef.current = null;
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
                onClick={() => selectMode("contain")}
              >
                Adatta
              </Button>
              <Button
                type="button"
                variant={mode === "cover" ? "default" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => selectMode("cover")}
              >
                4:3
              </Button>
              <Button
                type="button"
                variant={mode === "frame" ? "default" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => selectMode("frame")}
              >
                Ritaglia
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={reset}>
                Reset
              </Button>
            </div>

            <div className="photo-stage photo-optimization-preview mx-auto w-full max-w-5xl">
              <div
                className="photo-stage-backdrop"
                style={{ backgroundImage: `url(${sourceSrc})` }}
              />
              <div className="photo-stage-vignette" />
              {isCropMode ? (
                <div className="absolute inset-0 z-[2]">
                  <Cropper
                    key={`${photo.id}-${mode}-${resetKey}`}
                    image={sourceSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={frameAspect}
                    objectFit="contain"
                    initialCroppedAreaPixels={initialCroppedAreaPixels}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                    showGrid
                  />
                </div>
              ) : (
                <div
                  className={isFrameMode ? "photo-optimization-media photo-optimization-media-drag" : "photo-optimization-media"}
                  onPointerDown={startFrameDrag}
                  onPointerMove={moveFrameDrag}
                  onPointerUp={stopFrameDrag}
                  onPointerCancel={stopFrameDrag}
                >
                  <img
                    src={sourceSrc}
                    alt={photo.originalName}
                    style={isFrameMode
                      ? {
                          left: `${50 + frameTransform.x * 100}%`,
                          top: `${50 + frameTransform.y * 100}%`,
                          transform: `translate(-50%, -50%) scale(${frameTransform.zoom})`
                        }
                      : undefined}
                  />
                </div>
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
                disabled={busy || (!isCropMode && !isFrameMode)}
                onChange={(event) => updateZoom(Number(event.currentTarget.value))}
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
                <p className="font-medium">Max 1440x1080 · {outputLabel}</p>
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

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
