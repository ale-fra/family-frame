import * as React from "react";
import type { AdminPhoto, PhotoStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { photoStatusLabels } from "./labels";
import { formatBytes, formatShortDate } from "@/lib/format";
import { Check, CheckCircle2, Crop, EyeOff, MoreVertical, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";

const statusVariant: Record<PhotoStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  approved: "default",
  hidden: "secondary",
  trashed: "destructive"
};

type Props = {
  photo: AdminPhoto;
  pinned: boolean;
  busy: boolean;
  onApprove: () => void;
  onHide: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onOptimize: () => void;
};

export function PhotoCard({
  photo,
  pinned,
  busy,
  onApprove,
  onHide,
  onTrash,
  onRestore,
  onPin,
  onUnpin,
  onOptimize
}: Props) {
  const thumbSrc = photo.optimizedThumbSrc || photo.thumbSrc || photo.src;

  return (
    <article className="group overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={thumbSrc}
          alt={photo.originalName}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {photo.optimizedSrc ? (
          <div className="absolute left-2 top-2">
            <Badge variant="secondary" className="gap-1 shadow-md backdrop-blur">
              <CheckCircle2 className="h-3 w-3" />
              Ottimizzata
            </Badge>
          </div>
        ) : null}
        <div className="absolute right-2 top-2">
          <Badge variant={statusVariant[photo.status]} className="shadow-md backdrop-blur">
            {pinned ? "Fissa" : photoStatusLabels[photo.status]}
          </Badge>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={photo.originalName}>
            {photo.originalName}
          </p>
          <p className="text-xs text-muted-foreground">
            {photo.source === "telegram" ? "Telegram" : "Web"} · {formatBytes(photo.size)} ·{" "}
            {formatShortDate(photo.createdAt)}
          </p>
        </div>
        {photo.status === "approved" && (
          <Button
            variant={pinned ? "secondary" : "outline"}
            size="icon-sm"
            className="shrink-0"
            disabled={busy}
            title={pinned ? "Rimuovi foto fissa" : "Fissa nella cornice"}
            onClick={pinned ? onUnpin : onPin}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            <span className="sr-only">{pinned ? "Rimuovi foto fissa" : "Fissa nella cornice"}</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={busy}>
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Azioni</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onOptimize}>
              <Crop className="mr-2 h-4 w-4" />
              Ottimizza
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {photo.status !== "approved" && photo.status !== "trashed" && (
              <DropdownMenuItem onClick={onApprove}>
                <Check className="mr-2 h-4 w-4" />
                Approva
              </DropdownMenuItem>
            )}
            {photo.status === "approved" && (
              pinned ? (
                <DropdownMenuItem onClick={onUnpin}>
                  <PinOff className="mr-2 h-4 w-4" />
                  Rimuovi foto fissa
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onPin}>
                  <Pin className="mr-2 h-4 w-4" />
                  Fissa nella cornice
                </DropdownMenuItem>
              )
            )}
            {photo.status !== "hidden" && photo.status !== "trashed" && (
              <DropdownMenuItem onClick={onHide}>
                <EyeOff className="mr-2 h-4 w-4" />
                {photo.status === "approved" ? "Togli dalla cornice" : "Nascondi"}
              </DropdownMenuItem>
            )}
            {photo.status === "trashed" ? (
              <DropdownMenuItem onClick={onRestore}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Ripristina
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onTrash} variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cestina
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
