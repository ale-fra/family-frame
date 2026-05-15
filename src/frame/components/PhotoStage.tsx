import * as React from "react";
import type { Photo, SpecialDayConfig } from "@/lib/types";
import { displayPhotoSrc } from "../lib/photoLogic";
import { PhotoFrameFlowers, SpecialDayLayer } from "./SpecialDayLayer";

export function PhotoStage({
  stageRef,
  activePhoto,
  frameName,
  activeSpecialDay,
  specialDayPulse,
  onPhotoLoaded,
  onPhotoError
}: {
  stageRef: React.Ref<HTMLElement>;
  activePhoto?: Photo;
  frameName: string;
  activeSpecialDay?: SpecialDayConfig;
  specialDayPulse: number;
  onPhotoLoaded: (photo: Photo, image: HTMLImageElement) => void;
  onPhotoError: (photo: Photo) => void;
}) {
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const currentDisplaySrcRef = React.useRef("");
  const decodeAttemptRef = React.useRef(0);
  const notifiedLoadedSrcRef = React.useRef("");
  const activeSpecialDayEffects = new Set(activeSpecialDay?.effects || []);
  const displaySrc = activePhoto ? displayPhotoSrc(activePhoto) : "";
  currentDisplaySrcRef.current = displaySrc;
  const [loadedPhotoSrc, setLoadedPhotoSrc] = React.useState("");
  const isCurrentPhotoReady = loadedPhotoSrc === displaySrc;

  React.useEffect(() => {
    decodeAttemptRef.current += 1;
    setLoadedPhotoSrc((src) => (src === displaySrc ? src : ""));
  }, [displaySrc]);

  const markPhotoLoaded = React.useCallback((photo: Photo, image: HTMLImageElement, src: string) => {
    if (src !== displaySrc || displayPhotoSrc(photo) !== src) return;
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;

    const decodeAttempt = ++decodeAttemptRef.current;
    void waitForDecodedImage(image).then((decoded) => {
      if (!decoded) return;
      if (decodeAttemptRef.current !== decodeAttempt) return;
      if (currentDisplaySrcRef.current !== src || imageRef.current !== image) return;
      if (displayPhotoSrc(photo) !== src) return;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;

      setLoadedPhotoSrc(src);

      if (notifiedLoadedSrcRef.current === src) return;
      notifiedLoadedSrcRef.current = src;
      onPhotoLoaded(photo, image);
    });
  }, [displaySrc, onPhotoLoaded]);

  React.useEffect(() => {
    const image = imageRef.current;
    if (!activePhoto || !displaySrc || !image?.complete) return;
    markPhotoLoaded(activePhoto, image, displaySrc);
  }, [activePhoto, displaySrc, markPhotoLoaded]);

  return (
    <section className="photo-stage" ref={stageRef}>
      <SpecialDayLayer specialDay={activeSpecialDay} pulse={specialDayPulse} />
      {activePhoto ? (
        <>
          <div
            className="photo-stage-backdrop"
            style={{ backgroundImage: `url(${displaySrc})` }}
          />
          <div className="photo-stage-vignette" />
          <div
            className={`photo-wrap${isCurrentPhotoReady ? "" : " is-loading"}`}
          >
            <img
              ref={imageRef}
              key={displaySrc}
              src={displaySrc}
              alt={activePhoto.caption || "Foto di famiglia"}
              loading="eager"
              decoding="async"
              onLoad={(event) => {
                markPhotoLoaded(activePhoto, event.currentTarget, displaySrc);
              }}
              onError={() => onPhotoError(activePhoto)}
            />
            {activeSpecialDayEffects.has("flowers") ? <PhotoFrameFlowers /> : null}
          </div>
          {activePhoto.caption ? <div className="photo-caption">{activePhoto.caption}</div> : null}
        </>
      ) : (
        <div className="empty-photos">
          <h1>{frameName}</h1>
          <p>Apri /admin dal telefono per caricare e approvare nuove foto</p>
        </div>
      )}
    </section>
  );
}

async function waitForDecodedImage(image: HTMLImageElement) {
  if (typeof image.decode === "function") {
    try {
      await image.decode();
    } catch {
      if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;
    }
  }

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
  return true;
}
