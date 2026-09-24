export interface Resolution {
  name: string;
  resolution: string;
  frameRate: number;
}

// Ordered highest quality first
export const defaultResolutions: Record<string, Resolution> = {
  chunked: { name: "Source", resolution: "1920x1080", frameRate: 60 },
  "1440p60": { name: "1440p60", resolution: "2560x1440", frameRate: 60 },
  "1080p60": { name: "1080p60", resolution: "1920x1080", frameRate: 60 },
  "720p60": { name: "720p60", resolution: "1280x720", frameRate: 60 },
  "480p30": { name: "480p", resolution: "854x480", frameRate: 30 },
  "360p30": { name: "360p", resolution: "640x360", frameRate: 30 },
  "160p30": { name: "160p", resolution: "284x160", frameRate: 30 },
};
