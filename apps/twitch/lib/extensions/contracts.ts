export interface ExtensionEntry { catalogId: string; clientId: string; version: string; name: string; author: string; summary: string; iconUrl?: string }
export interface HostedExtension { clientId: string; version: string; packageHash: string; viewerUrl: string; root: string }
export interface CollectedAsset { url: string; contentType: string; bytes: number; base64: string }
export interface AssetCollection { location: HostedExtension; assets: CollectedAsset[]; totalBytes: number; skipped: string[]; failures: { url: string; reason: string }[]; coverage: "static-references-only"; stop: "finished" | "budget" }
