import { describe, expect, it } from "vitest";
import {
  activePhotoIndex,
  displayPhotoSrc,
  nextDisplayablePhotoIndex,
  normalizedSlideshowInterval,
  photoKey,
  samePhotoList
} from "../src/frame/lib/photoLogic";

describe("photo slideshow logic", () => {
  const photos = [
    { id: "a", src: "/a.jpg" },
    { id: "b", src: "/b.jpg" },
    { id: "c", src: "/c.jpg" }
  ];

  it("uses stable ids as photo keys", () => {
    expect(photoKey({ id: "photo", src: "/photo.jpg" })).toBe("photo");
    expect(photoKey({ src: "/photo.jpg" })).toBe("/photo.jpg");
  });

  it("skips failed queued photos", () => {
    const queue = [2, 1];
    const failed = new Set(["b"]);

    expect(nextDisplayablePhotoIndex(0, photos, queue, failed)).toBe(2);
  });

  it("keeps the current photo when every alternative has failed", () => {
    const queue: number[] = [];
    const failed = new Set(["b", "c"]);

    expect(nextDisplayablePhotoIndex(0, photos, queue, failed)).toBe(0);
  });

  it("compares full photo list signatures", () => {
    expect(samePhotoList(photos, [...photos])).toBe(true);
    expect(samePhotoList(photos, [{ id: "a", src: "/changed.jpg" }, photos[1], photos[2]])).toBe(false);
    expect(samePhotoList(photos, [{ ...photos[0], optimizedSrc: "/a.webp" }, photos[1], photos[2]])).toBe(false);
  });

  it("uses contain optimized photo sources when available", () => {
    expect(displayPhotoSrc({ src: "/original.jpg" })).toBe("/original.jpg");
    expect(displayPhotoSrc({
      src: "/original.jpg",
      optimizedSrc: "/optimized.webp",
      optimized: { mode: "contain" }
    })).toBe("/optimized.webp");
  });

  it("keeps the original source when an optimized photo is cropped for cover", () => {
    expect(displayPhotoSrc({
      src: "/portrait.jpg",
      optimizedSrc: "/landscape-crop.webp",
      optimized: { mode: "cover" }
    })).toBe("/portrait.jpg");
  });

  it("normalizes short slideshow intervals", () => {
    expect(normalizedSlideshowInterval(1)).toBe(5);
  });

  it("uses a pinned photo index synchronously when configured", () => {
    expect(activePhotoIndex(0, photos, "c")).toBe(2);
    expect(activePhotoIndex(1, photos, "")).toBe(1);
    expect(activePhotoIndex(8, photos, "")).toBe(0);
    expect(activePhotoIndex(1, photos, "missing")).toBe(1);
  });
});
