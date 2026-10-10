"use client";

import { useEffect, useState } from "react";
import { loadStoryboard } from "@/lib/previews/storyboard-resource";
import type { Storyboard } from "@/lib/previews/storyboards";

export function useStoryboard(url: string | undefined, active: boolean) {
  const [resource, setResource] = useState<{ url: string; board?: Storyboard; error?: string }>();
  useEffect(() => {
    if (!url || !active) return;
    const controller = new AbortController();
    void loadStoryboard(url, controller.signal).then(
      board => { if (!controller.signal.aborted) setResource({ url, board }); },
      () => { if (!controller.signal.aborted) setResource({ url, error: "Recording frames unavailable" }); },
    );
    return () => controller.abort();
  }, [url, active]);
  return resource?.url === url ? resource : undefined;
}
