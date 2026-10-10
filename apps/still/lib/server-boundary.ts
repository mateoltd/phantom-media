// This guard also works in the direct Worker bundle and the Node fixture harness.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  throw new Error("Twitch upstream modules must run on the server");
}
export {};
