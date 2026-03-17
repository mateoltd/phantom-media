export function getYtDlpPath(): string {
  return process.env.YTDLP_PATH?.trim() || "yt-dlp";
}
