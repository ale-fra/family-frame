import * as React from "react";
import type { Photo, PhotoManifest } from "@/lib/types";
import { fetchApprovedPhotos, subscribeFrameEvents } from "../api";
import { samePhotoList } from "../lib/photoLogic";

export function usePhotos(photoManifestUrl: string) {
  const [photos, setPhotos] = React.useState<Photo[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      const dynamicPhotos = await fetchApprovedPhotos();
      if (cancelled) return;

      if (dynamicPhotos) {
        setPhotos((currentPhotos) => (
          samePhotoList(currentPhotos, dynamicPhotos) ? currentPhotos : dynamicPhotos
        ));
        return;
      }

      fetch(photoManifestUrl, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Photo manifest unavailable");
          return response.json() as Promise<PhotoManifest>;
        })
        .then((manifest) => {
          const manifestPhotos = manifest.photos.filter((photo) => photo.src);
          if (!cancelled) {
            setPhotos((currentPhotos) => (
              samePhotoList(currentPhotos, manifestPhotos) ? currentPhotos : manifestPhotos
            ));
          }
        })
        .catch(() => {
          if (!cancelled) setPhotos([]);
        });
    }

    loadPhotos();
    const unsubscribe = subscribeFrameEvents((event) => {
      if (event.type === "photos") loadPhotos();
    });
    const interval = window.setInterval(loadPhotos, 60_000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [photoManifestUrl]);

  return photos;
}
