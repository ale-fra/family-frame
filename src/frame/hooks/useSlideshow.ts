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
  const [preparedPhotoRevision, setPreparedPhotoRevision] = React.useState(0);
  const shuffleQueueRef = React.useRef<number[]>([]);
  const failedPhotoKeysRef = React.useRef<Set<string>>(new Set());
  const preparedPhotoRef = React.useRef<PreparedPhoto | null>(null);
  const activePhotoKeyRef = React.useRef("");
  const photoListSignatureRef = React.useRef("");
  const photoListCountRef = React.useRef(0);
  const activePhotoSelectedAtRef = React.useRef(Date.now());
  const slideshowIntervalSeconds = normalizedSlideshowInterval(intervalSeconds);
  const activePhoto = photos[photoIndex];

  const clearPreparedPhoto = React.useCallback(() => {
    releasePreparedPhoto(preparedPhotoRef.current);
    preparedPhotoRef.current = null;
  }, []);

  const showPhotoAt = React.useCallback((index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= photos.length) return null;
    shuffleQueueRef.current = [];
    clearPreparedPhoto();
    activePhotoKeyRef.current = photoKey(photos[index]);
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(index);
    return photos[index] || null;
  }, [clearPreparedPhoto, photos]);

  const nextPhoto = React.useCallback(() => {
    if (photos.length === 0) return null;
    const preparedPhoto = validPreparedPhoto(preparedPhotoRef.current, photos, photos[photoIndex]);
    const nextIndex = preparedPhoto?.status === "ready"
      ? preparedPhoto.index
      : nextDisplayablePhotoIndex(photoIndex, photos, shuffleQueueRef.current, failedPhotoKeysRef.current);
    clearPreparedPhoto();
    activePhotoKeyRef.current = photos[nextIndex] ? photoKey(photos[nextIndex]) : "";
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(nextIndex);
    return photos[nextIndex] || null;
  }, [clearPreparedPhoto, photoIndex, photos]);

  const previousPhoto = React.useCallback(() => {
    if (photos.length === 0) return null;
    const previousIndex = photoIndex <= 0 ? photos.length - 1 : photoIndex - 1;
    shuffleQueueRef.current = [];
    clearPreparedPhoto();
    activePhotoKeyRef.current = photos[previousIndex] ? photoKey(photos[previousIndex]) : "";
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(previousIndex);
    return photos[previousIndex] || null;
  }, [clearPreparedPhoto, photoIndex, photos]);

  React.useEffect(() => {
    syncFailedPhotoKeys(failedPhotoKeysRef.current, photos);
    clearPreparedPhoto();
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
  }, [clearPreparedPhoto, photos]);

  React.useEffect(() => {
    if (!pinnedPhotoId) return;
    const pinnedIndex = photos.findIndex((photo) => photo.id === pinnedPhotoId);
    if (pinnedIndex === -1) return;
    shuffleQueueRef.current = [];
    clearPreparedPhoto();
    activePhotoKeyRef.current = photoKey(photos[pinnedIndex]);
    activePhotoSelectedAtRef.current = Date.now();
    setPhotoIndex(pinnedIndex);
  }, [clearPreparedPhoto, photos, pinnedPhotoId]);

  React.useEffect(() => {
    if (!activePhoto || photos.length < 2 || manualPaused || pinnedPhotoId) {
      clearPreparedPhoto();
      return;
    }
    if (loadedPhotoKey !== photoKey(activePhoto)) return;

    const preparedPhoto = validPreparedPhoto(preparedPhotoRef.current, photos, activePhoto);
    if (preparedPhoto) return;

    const nextIndex = nextDisplayablePhotoIndex(photoIndex, photos, shuffleQueueRef.current, failedPhotoKeysRef.current);
    const nextPhoto = photos[nextIndex];
    if (!nextPhoto || nextIndex === photoIndex) return;

    const nextKey = photoKey(nextPhoto);
    const prepared: PreparedPhoto = {
      image: new Image(),
      index: nextIndex,
      key: nextKey,
      src: nextPhoto.src,
      status: "loading",
      startedAt: Date.now()
    };
    preparedPhotoRef.current = prepared;

    const markReady = () => {
      if (preparedPhotoRef.current !== prepared) return;
      if (prepared.status !== "loading") return;
      prepared.status = "ready";
      logFrameEvent("photo-preloaded", {
        index: nextIndex,
        total: photos.length,
        photoId: nextPhoto.id || "",
        src: nextPhoto.src,
        naturalWidth: prepared.image.naturalWidth,
        naturalHeight: prepared.image.naturalHeight,
        elapsedMs: Date.now() - prepared.startedAt,
        visibilityState: document.visibilityState
      });
      setPreparedPhotoRevision((revision) => revision + 1);
    };

    const markFailed = () => {
      if (preparedPhotoRef.current !== prepared) return;
      if (prepared.status !== "loading") return;
      prepared.status = "error";
      failedPhotoKeysRef.current.add(nextKey);
      logFrameEvent("photo-preload-error", {
        index: nextIndex,
        total: photos.length,
        photoId: nextPhoto.id || "",
        src: nextPhoto.src,
        caption: nextPhoto.caption || ""
      });
      releasePreparedPhoto(prepared);
      preparedPhotoRef.current = null;
      setPreparedPhotoRevision((revision) => revision + 1);
    };

    prepared.image.onload = markReady;
    prepared.image.onerror = markFailed;
    prepared.image.decoding = "async";
    prepared.image.src = nextPhoto.src;
    if (typeof prepared.image.decode === "function") {
      prepared.image.decode().then(markReady).catch(markFailed);
    }
  }, [
    activePhoto,
    clearPreparedPhoto,
    loadedPhotoKey,
    manualPaused,
    photoIndex,
    photos,
    pinnedPhotoId,
    preparedPhotoRevision
  ]);

  React.useEffect(() => {
    if (!activePhoto || photos.length < 2 || manualPaused || pinnedPhotoId) return;
    if (loadedPhotoKey !== photoKey(activePhoto)) return;

    const timeouts: number[] = [];
    const advanceWhenPrepared = () => {
      const preparedPhoto = validPreparedPhoto(preparedPhotoRef.current, photos, photos[photoIndex]);
      if (!preparedPhoto || preparedPhoto.status !== "ready") {
        timeouts.push(window.setTimeout(advanceWhenPrepared, 100));
        return;
      }

      setPhotoIndex((current) => {
        const stillPrepared = validPreparedPhoto(preparedPhotoRef.current, photos, photos[current]);
        const nextIndex = stillPrepared?.status === "ready"
          ? stillPrepared.index
          : nextDisplayablePhotoIndex(current, photos, shuffleQueueRef.current, failedPhotoKeysRef.current);
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
        clearPreparedPhoto();
        return nextIndex;
      });
    };

    timeouts.push(window.setTimeout(advanceWhenPrepared, slideshowIntervalSeconds * 1000));
    return () => {
      for (const timeout of timeouts) window.clearTimeout(timeout);
    };
  }, [
    activePhoto,
    clearPreparedPhoto,
    loadedPhotoKey,
    manualPaused,
    photoIndex,
    photos,
    pinnedPhotoId,
    slideshowIntervalSeconds
  ]);

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

type PreparedPhoto = {
  image: HTMLImageElement;
  index: number;
  key: string;
  src: string;
  status: "loading" | "ready" | "error";
  startedAt: number;
};

function validPreparedPhoto(preparedPhoto: PreparedPhoto | null, photos: Photo[], activePhoto?: Photo) {
  if (!preparedPhoto) return null;
  if (activePhoto && preparedPhoto.key === photoKey(activePhoto)) return null;
  const photo = photos[preparedPhoto.index];
  if (!photo || photoKey(photo) !== preparedPhoto.key || photo.src !== preparedPhoto.src) return null;
  return preparedPhoto;
}

function releasePreparedPhoto(preparedPhoto: PreparedPhoto | null) {
  if (!preparedPhoto) return;
  preparedPhoto.image.onload = null;
  preparedPhoto.image.onerror = null;
  if (preparedPhoto.status === "loading") preparedPhoto.image.src = "";
}
