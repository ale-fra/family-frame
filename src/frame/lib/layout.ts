export function containedBox(maxWidth: number, maxHeight: number, aspect: number) {
  if (maxWidth <= 0 || maxHeight <= 0 || aspect <= 0) return null;

  const frameAspect = maxWidth / maxHeight;
  if (frameAspect > aspect) {
    return {
      width: Math.round(maxHeight * aspect),
      height: Math.round(maxHeight)
    };
  }

  return {
    width: Math.round(maxWidth),
    height: Math.round(maxWidth / aspect)
  };
}
