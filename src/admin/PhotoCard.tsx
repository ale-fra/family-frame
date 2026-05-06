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
import { Check, EyeOff, MoreVertical, RotateCcw, Trash2 } from "lucide-react";

const statusVariant: Record<PhotoStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  approved: "default",
  hidden: "secondary",
  trashed: "destructive"
};

type Props = {
  photo: AdminPhoto;
  busy: boolean;
  onApprove: () => void;
  onHide: () => void;
  onTrash: () => void;
  onRestore: () => void;
};

export function PhotoCard({ photo, busy, onApprove, onHide, onTrash, onRestore }: Props) {
  return (
    <article className="group overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={photo.thumbSrc || photo.src}
          alt={photo.originalName}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute right-2 top-2">
          <Badge variant={statusVariant[photo.status]} className="shadow-md backdrop-blur">
            {photoStatusLabels[photo.status]}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={busy}>
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Azioni</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {photo.status !== "approved" && photo.status !== "trashed" && (
              <DropdownMenuItem onClick={onApprove}>
                <Check className="mr-2 h-4 w-4" />
                Approva
              </DropdownMenuItem>
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
