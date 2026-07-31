function maximum(values) {
  return values.reduce(
    (best, value) =>
      Number.isFinite(value) && value > best ? value : best,
    0,
  );
}

export function hlsMaxVideoHeight(manifest) {
  return maximum(
    [...String(manifest).matchAll(/\bRESOLUTION\s*=\s*\d+\s*x\s*(\d+)/gi)].map(
      (match) => Number(match[1]),
    ),
  );
}

export function dashMaxVideoHeight(manifest) {
  return maximum(
    [...String(manifest).matchAll(/\bheight\s*=\s*["'](\d+)["']/gi)].map(
      (match) => Number(match[1]),
    ),
  );
}

export function manifestVideoHeight(type, manifest) {
  if (type === "hls") return hlsMaxVideoHeight(manifest);
  if (type === "dash") return dashMaxVideoHeight(manifest);
  return 0;
}
