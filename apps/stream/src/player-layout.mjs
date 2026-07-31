export function stageAspectRatio(width, height) {
  const normalizedWidth = Number(width);
  const normalizedHeight = Number(height);
  if (
    !Number.isFinite(normalizedWidth) ||
    !Number.isFinite(normalizedHeight) ||
    normalizedWidth <= 0 ||
    normalizedHeight <= 0
  ) {
    return null;
  }
  return `${normalizedWidth} / ${normalizedHeight}`;
}
