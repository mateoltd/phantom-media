import type { OutputSink } from "./types.ts";
const BLOB_LIMIT = 256 * 1024 * 1024;
interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options: object) => Promise<{ createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }>;
}
export async function createSink(filename: string, mime: string): Promise<OutputSink> {
  const picker = (window as FilePickerWindow).showSaveFilePicker;
  if (picker) {
    const handle = await picker.call(window, { suggestedName: filename });
    return handle.createWritable();
  }
  let parts: BlobPart[] = [], bytes = 0, finished = false;
  return {
    async write(data) {
      if (finished) throw new Error("Download is closed");
      if (bytes + data.byteLength > BLOB_LIMIT) throw new Error("This browser can save up to 256 MB. Use a browser with direct file saving for larger downloads.");
      parts.push(new Uint8Array(data)); bytes += data.byteLength;
    },
    async close() {
      if (finished) return;
      finished = true;
      const url = URL.createObjectURL(new Blob(parts, { type: mime })); parts = [];
      const link = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    async abort() { finished = true; parts = []; },
  };
}
