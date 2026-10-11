import Hls from "hls.js";
import type { FragBufferedData, FragLoadingData } from "hls.js";

/** Encoder-paced prefetch is not a bandwidth test. Keep hls.js ABR for real delivery. */
export class LiveAbrController extends Hls.DefaultConfig.abrController {
  private predictiveTimer?: ReturnType<typeof setInterval>;
  private firstProgress = new WeakMap<object, number | null>();

  public clearTimer() {
    clearInterval(this.predictiveTimer);
    this.predictiveTimer = undefined;
    super.clearTimer();
  }

  protected onFragLoading(event: typeof Hls.Events.FRAG_LOADING, data: FragLoadingData) {
    super.onFragLoading(event, data);
    const { frag, part } = data;
    if (frag.type !== "main" || frag.sn === "initSegment") return;
    if (!frag.tagList.some(tag => tag[0] === "EXT-X-STILL-PREFETCH")) return;
    this.clearTimer();
    const stats = part?.stats ?? frag.stats;
    this.firstProgress.set(part ?? frag, null);
    const durationMs = (part?.duration ?? frag.duration) * 1_000;
    this.predictiveTimer = setInterval(() => {
      if (stats.aborted || stats.loading.end) {
        this.clearTimer();
        return;
      }
      if (!stats.loaded) return;
      const key = part ?? frag;
      const now = performance.now();
      const first = this.firstProgress.get(key) ?? now;
      this.firstProgress.set(key, first);
      // Response headers can arrive before any encoded bytes. Start the
      // production allowance at observed payload progress, not headers/TTFB.
      // Once a full segment plus jitter allowance has elapsed, real delivery
      // is too slow: restore hls.js's normal in-flight downswitch mechanism.
      if (now - first > durationMs + 500) {
        this.clearTimer();
        super.onFragLoading(event, data);
      }
    }, 250);
  }

  protected onFragBuffered(event: typeof Hls.Events.FRAG_BUFFERED, data: FragBufferedData) {
    const { frag, part } = data;
    if (frag.tagList.some(tag => tag[0] === "EXT-X-STILL-PREFETCH")) {
      if (frag.type !== "main" || frag.sn === "initSegment") return;
      const stats = part?.stats.loaded ? part.stats : frag.stats;
      const observedFirst = this.firstProgress.get(part ?? frag);
      // A late burst that completes between monitor ticks has no observable
      // payload duration. Its header wait cannot be used as a throughput test.
      if (observedFirst === null) return;
      const first = observedFirst ?? stats.loading.first;
      const deliveryMs = stats.loading.end - first;
      if (!stats.aborted && stats.loaded > 0 && Number.isFinite(deliveryMs) &&
          deliveryMs > (part?.duration ?? frag.duration) * 1_000 + 500) {
        // A completed slow predictive transfer is also a real bandwidth
        // observation; do not leave the old estimate pinned indefinitely.
        this.bwEstimator.sample(deliveryMs, stats.loaded);
        stats.bwEstimate = this.bwEstimator.getEstimate();
      }
      return;
    }
    super.onFragBuffered(event, data);
  }
}
