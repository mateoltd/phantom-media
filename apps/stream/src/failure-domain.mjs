const KNOWN_HEALTH_SEEDS = Object.freeze({
  va: "media:claritybusinessacademy|origin:nextgencloudfabric",
  p6: "media:claritybusinessacademy|origin:nextgencloudfabric",
  b5: "resolver:speedracelight|provider:videasy",
  f8: "media:rotating-ncw|token-shape:auth-key-expire",
  n1: "vidsrc:vsembed:cloudorchestranova:verdantvagary",
  u9: "cinesrc:index:challenge:media-origin",
});

const KNOWN_CAPACITY_SEEDS = Object.freeze({
  va: ["media:claritybusinessacademy|origin:nextgencloudfabric"],
  p6: ["media:claritybusinessacademy|origin:nextgencloudfabric"],
  b5: ["resolver:speedracelight|provider:videasy"],
  f8: ["media:rotating-ncw|token-shape:auth-key-expire"],
  n1: ["vidsrc:vsembed:cloudorchestranova:verdantvagary"],
  u9: ["cinesrc:index:challenge:media-origin"],
  vf: ["resolver:cinemaos|adapter:vf", "platform:vidfast-family"],
  vc: ["resolver:cinemaos|adapter:vc", "platform:vidfast-family"],
});

const CINEMAOS_IDS = new Set([
  "q4",
  "k9",
  "va",
  "b5",
  "p6",
  "vf",
  "f8",
  "s3",
  "z2",
  "s7",
  "fc",
  "vc",
  "h0",
  "v2",
]);

function hash(seed) {
  let value = 0x811c9dc5;
  for (const character of seed) {
    value ^= character.codePointAt(0);
    value = Math.imul(value, 0x01000193);
  }
  return `fd-${(value >>> 0).toString(16).padStart(8, "0")}`;
}

export function fingerprintFailureLayer(seed) {
  return hash(String(seed ?? ""));
}

export function failureDomainFor(sourceId) {
  const id = String(sourceId ?? "");
  if (id.startsWith("fd-")) return id;
  const seed =
    KNOWN_HEALTH_SEEDS[id] ??
    (CINEMAOS_IDS.has(id) ? `resolver:cinemaos|adapter:${id}` : `provider:${id}`);
  return hash(seed);
}

export function capacityDomainsFor(sourceId) {
  const id = String(sourceId ?? "");
  const domains = (KNOWN_CAPACITY_SEEDS[id] ?? [])
    .map(hash);
  const failureDomain = failureDomainFor(id);
  return Object.freeze([
    failureDomain,
    ...domains.filter((domain) => domain !== failureDomain),
  ]);
}

export function shareFailureCapacity(left, right) {
  const rightDomains = new Set(capacityDomainsFor(right));
  return capacityDomainsFor(left).some((domain) => rightDomains.has(domain));
}

export function failureDomainLayers(sourceIds) {
  const pending = [...sourceIds];
  const ordered = [];
  const layerSizes = [];

  while (pending.length > 0) {
    const occupied = new Set();
    const layer = [];
    const deferred = [];
    for (const sourceId of pending) {
      const domains = capacityDomainsFor(sourceId);
      if (domains.some((domain) => occupied.has(domain))) {
        deferred.push(sourceId);
        continue;
      }
      layer.push(sourceId);
      for (const domain of domains) occupied.add(domain);
    }
    ordered.push(...layer);
    layerSizes.push(layer.length);
    pending.splice(0, pending.length, ...deferred);
  }

  return { ordered, layerSizes };
}

export function independentWave(sourceIds, requestedWave) {
  if (sourceIds.length === 0) return { ordered: [], wave: 0 };
  const { ordered, layerSizes } = failureDomainLayers(sourceIds);
  const wave = Math.max(
    1,
    Math.min(Number(requestedWave) || 1, layerSizes[0] ?? 1),
  );
  return { ordered, wave };
}

export async function* asSettledByFailureDomain(
  sourceIds,
  limit,
  task,
) {
  const pending = [...sourceIds];
  const inFlight = new Map();
  let key = 0;

  const occupied = () => {
    const domains = new Set();
    for (const entry of inFlight.values()) {
      for (const domain of entry.domains) domains.add(domain);
    }
    return domains;
  };

  const fill = () => {
    while (inFlight.size < Math.max(1, limit) && pending.length > 0) {
      const activeDomains = occupied();
      const index = pending.findIndex((sourceId) =>
        capacityDomainsFor(sourceId).every(
          (domain) => !activeDomains.has(domain),
        ),
      );
      if (index < 0) break;
      const [sourceId] = pending.splice(index, 1);
      const entryKey = key++;
      const promise = Promise.resolve()
        .then(() => task(sourceId))
        .then(
          (value) => ({ key: entryKey, item: sourceId, value }),
          (error) => ({ key: entryKey, item: sourceId, error }),
        );
      inFlight.set(entryKey, {
        domains: capacityDomainsFor(sourceId),
        promise,
      });
    }
  };

  fill();
  while (inFlight.size > 0) {
    const settled = await Promise.race(
      [...inFlight.values()].map((entry) => entry.promise),
    );
    inFlight.delete(settled.key);
    fill();
    yield settled;
  }
}
