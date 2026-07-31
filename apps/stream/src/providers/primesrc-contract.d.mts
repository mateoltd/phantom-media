import type { MediaType } from "../../lib/types";

export interface PrimeSrcContractMedia {
  type: MediaType;
  tmdbId?: number;
  imdbId?: string;
  season?: number;
  episode?: number;
}

export interface PrimeSrcInventoryServer {
  readonly key: string;
  readonly name: string;
  readonly audioLanguage: string;
  readonly audioType: string | null;
  readonly fileName: string | null;
  readonly fileSize: string | null;
  readonly quality: string | null;
}

export interface PrimeSrcInventory {
  readonly info: {
    readonly type: MediaType | null;
    readonly title: string | null;
    readonly imdbId: string | null;
  } | null;
  readonly servers: readonly PrimeSrcInventoryServer[];
}

export declare const PRIMESRC_ORIGIN: "https://primesrc.me";
export declare function primeSrcInventoryUrl(
  media: PrimeSrcContractMedia,
): URL;
export declare function primeSrcLinkExchangeUrl(key: string): URL;
export declare function parsePrimeSrcInventory(
  payload: unknown,
): PrimeSrcInventory;
export declare function classifyPrimeSrcLinkResponse(
  response: Pick<Response, "status" | "headers">,
): "challenge-required" | "json" | "invalid";
export declare function classifyPrimeSrcResolvedLink(payload: unknown): {
  readonly classification: "native" | "external" | "invalid";
  readonly url: string | null;
};
