import * as React from "react";
import { cn } from "@/lib/utils";
import { ImagePlus, Loader2, UploadCloud } from "lucide-react";

type Props = {
  busy: boolean;
  onFiles: (files: File[]) => void;
};

export function UploadDropzone({ busy, onFiles }: Props) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleDrag(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!busy) setDragging(true);
  }

  function stopDrag(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
  }

  function drop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    onFiles(Array.from(event.dataTransfer.files || []));
  }

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    onFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  return (
    <label
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={stopDrag}
      onDrop={drop}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/70 bg-muted/30 p-8 text-center transition-colors",
        "hover:border-primary/60 hover:bg-primary/5",
        dragging && "border-primary bg-primary/10",
        busy && "pointer-events-none opacity-70"
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted-foreground transition-colors",
          dragging && "text-primary",
          "group-hover:text-primary"
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : dragging ? (
          <UploadCloud className="h-5 w-5" />
        ) : (
          <ImagePlus className="h-5 w-5" />
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {busy
            ? "Caricamento in corso…"
            : dragging
              ? "Rilascia qui le foto"
              : "Trascina le foto o clicca per scegliere"}
        </p>
        <p className="text-xs text-muted-foreground">JPEG, PNG, WebP o GIF</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="sr-only"
        disabled={busy}
        onChange={pick}
      />
    </label>
  );
}
