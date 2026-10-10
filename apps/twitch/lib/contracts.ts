export interface TwitchLiveStream {
  id: string;
  title: string;
  type: string;
  viewersCount: number;
  createdAt: string;
  game?: { name: string } | null;
  archiveVideo?: { id: string } | null;
}

export interface TwitchChannelData {
  id: string;
  login: string;
  displayName: string;
  description: string;
  profileImageURL: string;
  bannerImageURL?: string | null;
  followers?: { totalCount?: number | null } | null;
  /** Twitch's verified mark is the partner role. */
  roles?: { isPartner?: boolean | null } | null;
  stream: TwitchLiveStream | null;
}

export type ResourceRef =
  | { kind: "vod"; id: string }
  | { kind: "archive"; channel: string; streamId: string; startedAt: string }
  | { kind: "channel"; login: string }
  | { kind: "clip"; slug: string };

export type Lifecycle = "complete" | "growing" | "unknown";

interface MediaVariantBase {
  key: string;
  name: string;
  playlistUrl: string;
  bandwidth?: number;
  codec?: string;
  metadata: "observed" | "unknown";
}

export type MediaVariant = MediaVariantBase & (
  | { kind: "video"; isAudioOnly: false; resolution?: string; frameRate?: number }
  | { kind: "audio"; isAudioOnly: true; resolution?: never; frameRate?: never }
) & ({ delivery: "hls" } | { delivery: "file"; identity: string });

export interface Chapter {
  id: string;
  start: number;
  end: number;
  title: string;
  gameId?: string;
}

export interface Classification {
  broadcastType?: string;
  game?: string;
  labels: { id: string; name: string }[];
}

export interface PlaybackDiagnostics {
  source: "usher";
  subscriberOnly?: boolean;
  qualityCapReasons: string[];
  maximumBitrateKbps?: number;
  geoReason?: string;
}
