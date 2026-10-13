import { FetchLoader } from "hls.js";
import type Hls from "hls.js";
import type { FragmentLoaderContext, LoaderCallbacks, LoaderConfiguration, LoaderContext } from "hls.js";

/** Small progressive batches with one timestamp origin for a whole fMP4 segment. */
export function createLiveFragmentLoader(hls: Hls) {
  return class LiveFragmentLoader extends FetchLoader {
    declare context: FragmentLoaderContext | null;
    load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
      let chunks = 0;
      super.load(context, {
        ...config,
        highWaterMark: Number.isFinite(config.highWaterMark) ? 32 * 1024 : config.highWaterMark,
      }, {
        ...callbacks,
        onProgress: callbacks.onProgress && ((stats, loadedContext, data, response) => {
          const frag = (loadedContext as FragmentLoaderContext).frag;
          const details = frag && hls.levels[frag.level]?.details;
          const continuingMp4 = chunks++ > 0 && frag?.initSegment && details?.live;
          const known = details?.PTSKnown;
          // hls.js otherwise compares each chunk's DTS with the segment start
          // and resets initPTS once they differ by >1s, overlapping frames.
          // The first chunk still establishes the normal timestamp origin.
          if (continuingMp4) details.PTSKnown = false;
          try {
            callbacks.onProgress!(stats, loadedContext, data, response);
          } finally {
            if (continuingMp4) details.PTSKnown = known!;
          }
        }),
      });
    }
  };
}
