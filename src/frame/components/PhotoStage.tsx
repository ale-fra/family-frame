import * as React from "react";
import type { Photo, SpecialDayConfig } from "@/lib/types";
import { containedBox } from "../lib/layout";
import { PhotoFrameFlowers, SpecialDayLayer } from "./SpecialDayLayer";

export function PhotoStage({
  stageRef,
  activePhoto,
  frameName,
  photoStageSize,
  activeSpecialDay,
  specialDayPulse,
  onPhotoLoaded,
  onPhotoError
}: {
  stageRef: React.Ref<HTMLElement>;
  activePhoto?: Photo;
  frameName: string;
  photoStageSize: { width: number; height: number };
  activeSpecialDay?: SpecialDayConfig;
  specialDayPulse: number;
  onPhotoLoaded: (photo: Photo, image: HTMLImageElement) => void;
  onPhotoError: (photo: Photo) => void;
}) {
  const [photoAspect, setPhotoAspect] = React.useState(1);
  const activeSpecialDayEffects = new Set(activeSpecialDay?.effects || []);
  const photoBox = containedBox(photoStageSize.width, photoStageSize.height, photoAspect);

  return (
    <section className="photo-stage" ref={stageRef}>
      <SpecialDayLayer specialDay={activeSpecialDay} pulse={specialDayPulse} />
      {activePhoto ? (
        <>
          <div
            className="photo-stage-backdrop"
            style={{ backgroundImage: `url(${activePhoto.src})` }}
          />
          <div className="photo-stage-vignette" />
          <div
            className="photo-wrap"
            style={photoBox ? { width: photoBox.width, height: photoBox.height } : undefined}
          >
            <img
              key={activePhoto.src}
              src={activePhoto.src}
              alt={activePhoto.caption || "Foto di famiglia"}
              loading="eager"
              decoding="sync"
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                  setPhotoAspect(image.naturalWidth / image.naturalHeight);
                  onPhotoLoaded(activePhoto, image);
                }
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
