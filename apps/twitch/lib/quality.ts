export interface QualityResult {
  codec: string;
}

export async function probeQuality(url: string): Promise<QualityResult | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.text();

    if (data.includes(".ts")) {
      return { codec: "avc1.4D001E" };
    }

    if (data.includes(".mp4")) {
      // Check init segment for H.265 vs H.264
      const initUrl = url.replace(/[^/]+$/, "init-0.mp4");
      const mp4Resp = await fetch(initUrl);

      if (mp4Resp.ok) {
        const buffer = await mp4Resp.arrayBuffer();
        const text = new TextDecoder("latin1").decode(buffer);
        return {
          codec: text.includes("hev1")
            ? "hev1.1.6.L93.B0"
            : "avc1.4D001E",
        };
      }

      return { codec: "hev1.1.6.L93.B0" };
    }

    return null;
  } catch {
    return null;
  }
}
