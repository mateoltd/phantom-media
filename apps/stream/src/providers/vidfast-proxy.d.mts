export declare const VIDFAST_PROXY_PATH: string;

export declare function vidfastMediaHosts(
  extra?: readonly string[],
): Set<string>;

export declare function assertVidfastMediaUrl(
  input: string | URL,
  allowedHosts?: ReadonlySet<string>,
): URL;

export declare function encodeVidfastProxyTarget(
  upstream: string | URL,
  proxyOrigin: string | URL,
  allowedHosts?: ReadonlySet<string>,
): string;

export declare function decodeVidfastProxyTarget(
  encoded: unknown,
  allowedHosts?: ReadonlySet<string>,
): URL;

export declare function primeVidfastMediaTarget(
  input: string | URL,
  options?: {
    fetchImpl?: typeof fetch;
    allowedHosts?: ReadonlySet<string>;
    extraHosts?: readonly string[];
    vidfastOrigin?: string;
    signal?: AbortSignal;
  },
): Promise<string>;

export declare function rewriteVidfastHls(
  manifest: string,
  upstream: string | URL,
  proxyOrigin: string | URL,
  allowedHosts?: ReadonlySet<string>,
): string;

export declare function proxyVidfastRequest(
  request: Request,
  options?: {
    fetchImpl?: typeof fetch;
    allowedHosts?: ReadonlySet<string>;
    extraHosts?: readonly string[];
    vidfastOrigin?: string;
  },
): Promise<Response>;
