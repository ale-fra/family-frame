import type { Photo } from "@/lib/types";
import { defaultConfig } from "@/lib/config";

export function nextDisplayablePhotoIndex(
  current: number,
  photos: Photo[],
  queue: number[],
  failedKeys: Set<string>
) {
  if (photos.length < 2) return 0;

  const isDisplayable = (index: number) => {
    const photo = photos[index];
    return Boolean(photo) && !failedKeys.has(photoKey(photo));
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (queue.length === 0) {
      queue.push(
        ...shuffle(
          Array.from({ length: photos.length }, (_value, index) => index)
            .filter((index) => index !== current && isDisplayable(index))
        )
      );
    }

    while (queue.length > 0) {
      const nextIndex = queue.pop();
      if (nextIndex !== undefined && nextIndex !== current && isDisplayable(nextIndex)) return nextIndex;
    }
  }

  return current >= 0 && current < photos.length ? current : 0;
}

export function normalizedSlideshowInterval(value: number) {
  return Math.max(5, Number.isFinite(value) ? value : defaultConfig.slideshow.intervalSeconds);
}

export function samePhotoList(left: Photo[], right: Photo[]) {
  return left.length === right.length && left.every((photo, index) => photoSignature(photo) === photoSignature(right[index]));
}

export function photoSignature(photo: Photo) {
  return [photoKey(photo), photo.src, photo.thumbSrc || "", photo.caption || ""].join("\u0000");
}

export function photoKey(photo: Photo) {
  return photo.id || photo.src;
}

export function syncFailedPhotoKeys(failedKeys: Set<string>, photos: Photo[]) {
  const validKeys = new Set(photos.map(photoKey));
  for (const key of failedKeys) {
    if (!validKeys.has(key)) failedKeys.delete(key);
  }
}

export function shuffle(values: number[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
