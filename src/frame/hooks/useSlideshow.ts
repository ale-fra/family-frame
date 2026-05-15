import * as React from "react";
import type { Photo } from "@/lib/types";
import { logFrameEvent } from "../api";
import {
  nextDisplayablePhotoIndex,
  normalizedSlideshowInterval,
  photoKey,
  photoSignature,
  syncFailedPhotoKeys
} from "../lib/photoLogic";

export function useSlideshow(photos: Photo[], intervalSeconds: number, pinnedPhotoId: string) {
  const [photoIndex, setPhotoIndex] = React.useState(0);
  const [manualPaused, setManualPaused] = React.useState(false);
  const [loadedPhotoKey, setLoadedPhotoKey] = React.useState("");
  const shuffleQueueRef = React.useRef<number[]>([]);
  const failedPhotoKeysRef = React.useRef<Set<string>>(new Set());
  const activePhotoKeyRef = React.useRef("");
  const photoListSignatureRef = React.useRef("");
  const photoListCountRef = React.useRef(0);
  const activePhotoSelectedAtRef = React.useRef(Date.now());
  const slideshowIntervalSeconds = normalizedSlideshowInterval(intervalSeconds);
  const activePhoto = photos[photoIndex];

  const showPhotoAt = React.useCallback((index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= photos.length) return null;
    shuffleQueueRef.current = [];
    activePhotoKeyRef.current = photoKey(photos[index]);
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(index);
    return photos[index] || null;
  }, [photos]);

  const nextPhoto = React.useCallback(() => {
    if (photos.length === 0) return null;
    const nextIndex = nextDisplayablePhotoIndex(photoIndex, photos, shuffleQueueRef.current, failedPhotoKeysRef.current);
    activePhotoKeyRef.current = photos[nextIndex] ? photoKey(photos[nextIndex]) : "";
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(nextIndex);
    return photos[nextIndex] || null;
  }, [photoIndex, photos]);

  const previousPhoto = React.useCallback(() => {
    if (photos.length === 0) return null;
    const previousIndex = photoIndex <= 0 ? photos.length - 1 : photoIndex - 1;
    shuffleQueueRef.current = [];
    activePhotoKeyRef.current = photos[previousIndex] ? photoKey(photos[previousIndex]) : "";
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(previousIndex);
    return photos[previousIndex] || null;
  }, [photoIndex, photos]);

  React.useEffect(() => {
    syncFailedPhotoKeys(failedPhotoKeysRef.current, photos);
    const signature = photos.map(photoSignature).join("\u0001");
    if (photoListSignatureRef.current !== signature) {
      logFrameEvent(photoListSignatureRef.current ? "photo-list-changed" : "photo-list-loaded", {
        count: photos.length,
        previousCount: photoListCountRef.current
      });
      photoListSignatureRef.current = signature;
      photoListCountRef.current = photos.length;
    }

    shuffleQueueRef.current = [];
    setPhotoIndex((current) => {
      if (photos.length === 0) {
        activePhotoKeyRef.current = "";
        return 0;
      }

      const activeKey = activePhotoKeyRef.current;
      if (activeKey) {
        const stableIndex = photos.findIndex((photo) => photoKey(photo) === activeKey);
        if (stableIndex !== -1) return stableIndex;
      }

      const nextIndex = current >= photos.length ? 0 : current;
      activePhotoKeyRef.current = photos[nextIndex] ? photoKey(photos[nextIndex]) : "";
      if (nextIndex !== current) activePhotoSelectedAtRef.current = Date.now();
      return nextIndex;
    });
  }, [photos]);

  React.useEffect(() => {
    if (!pinnedPhotoId) return;
    const pinnedIndex = photos.findIndex((photo) => photo.id === pinnedPhotoId);
    if (pinnedIndex === -1) return;
    shuffleQueueRef.current = [];
    activePhotoKeyRef.current = photoKey(photos[pinnedIndex]);
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(pinnedIndex);
  }, [photos, pinnedPhotoId]);

  React.useEffect(() => {
    if (!activePhoto || photos.length < 2 || manualPaused || pinnedPhotoId) return;
    if (loadedPhotoKey !== photoKey(activePhoto)) return;

    const timeout = window.setTimeout(() => {
      setPhotoIndex((current) => {
        const nextIndex = nextDisplayablePhotoIndex(current, photos, shuffleQueueRef.current, failedPhotoKeysRef.current);
        logFrameEvent("slideshow-advance", {
          reason: "timer",
          previousIndex: current,
          nextIndex,
          total: photos.length,
          intervalSeconds: slideshowIntervalSeconds,
          previousPhoto: photos[current]?.src || "",
          nextPhoto: photos[nextIndex]?.src || ""
        });
        activePhotoKeyRef.current = photos[nextIndex] ? photoKey(photos[nextIndex]) : "";
        if (nextIndex !== current) activePhotoSelectedAtRef.current = Date.now();
        return nextIndex;
      });
    }, slideshowIntervalSeconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [activePhoto, loadedPhotoKey, manualPaused, photos, pinnedPhotoId, slideshowIntervalSeconds]);

  React.useEffect(() => {
    if (!activePhoto) return;
    logFrameEvent("photo-selected", {
      index: photoIndex,
      total: photos.length,
      photoId: activePhoto.id || "",
      src: activePhoto.src,
      caption: activePhoto.caption || "",
      visibilityState: document.visibilityState
    });
  }, [activePhoto, photoIndex, photos.length]);

  const handlePhotoLoaded = React.useCallback((photo: Photo, image: HTMLImageElement) => {
    const selectedPhotoKey = photoKey(photo);
    activePhotoKeyRef.current = selectedPhotoKey;
    setLoadedPhotoKey(selectedPhotoKey);
    failedPhotoKeysRef.current.delete(selectedPhotoKey);
    logFrameEvent("photo-loaded", {
      index: photoIndex,
      total: photos.length,
      photoId: photo.id || "",
      src: photo.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      elapsedMs: Date.now() - activePhotoSelectedAtRef.current,
      visibilityState: document.visibilityState
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (activePhotoKeyRef.current !== selectedPhotoKey) return;
        logFrameEvent("photo-visible", {
          index: photoIndex,
          total: photos.length,
          photoId: photo.id || "",
          src: photo.src,
          elapsedMs: Date.now() - activePhotoSelectedAtRef.current,
          visibilityState: document.visibilityState,
          ...imageVisibilityDetails(image)
        });
      });
    });
  }, [photoIndex, photos.length]);

  const handlePhotoError = React.useCallback((photo: Photo) => {
    failedPhotoKeysRef.current.add(photoKey(photo));
    console.warn("Skipping photo that failed to load:", photo.src);
    logFrameEvent("photo-load-error", {
      index: photoIndex,
      total: photos.length,
      photoId: photo.id || "",
      src: photo.src,
      caption: photo.caption || ""
    });
    if (photos.length > 1) {
      setPhotoIndex((current) => {
        const nextIndex = nextDisplayablePhotoIndex(current, photos, shuffleQueueRef.current, failedPhotoKeysRef.current);
        logFrameEvent("slideshow-advance", {
          reason: "photo-load-error",
          previousIndex: current,
          nextIndex,
          total: photos.length,
          previousPhoto: photos[current]?.src || "",
          nextPhoto: photos[nextIndex]?.src || ""
        });
        activePhotoKeyRef.current = photos[nextIndex] ? photoKey(photos[nextIndex]) : "";
        if (nextIndex !== current) activePhotoSelectedAtRef.current = Date.now();
        return nextIndex;
      });
    }
  }, [photoIndex, photos]);

  return {
    activePhoto,
    photoIndex,
    manualPaused,
    setManualPaused,
    showPhotoAt,
    nextPhoto,
    previousPhoto,
    handlePhotoLoaded,
    handlePhotoError,
    slideshowIntervalSeconds
  };
}

function imageVisibilityDetails(image: HTMLImageElement): Record<string, string | number | boolean | null> {
  const imageRect = image.getBoundingClientRect();
  const parentRect = image.parentElement?.getBoundingClientRect();
  const centerX = imageRect.left + imageRect.width / 2;
  const centerY = imageRect.top + imageRect.height / 2;
  const topElement = document.elementFromPoint(centerX, centerY);

  return {
    imageWidth: Math.round(imageRect.width),
    imageHeight: Math.round(imageRect.height),
    imageLeft: Math.round(imageRect.left),
    imageTop: Math.round(imageRect.top),
    parentWidth: parentRect ? Math.round(parentRect.width) : null,
    parentHeight: parentRect ? Math.round(parentRect.height) : null,
    complete: image.complete,
    currentSrc: image.currentSrc,
    topElementClass: topElement instanceof HTMLElement ? topElement.className : ""
  };
}
