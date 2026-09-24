"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChatCircle, VideoCamera } from "@phosphor-icons/react/ssr";
import { MediaTile, Button, ProgressRail } from "@phantom/ui";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { addToHistory, useHistory } from "@/components/History";
import { ChannelDiscovery } from "@/components/ChannelDiscovery";
import { Player } from "@/components/Player";
import { ChatPanel } from "@/components/ChatPanel";
import { WatchRail } from "@/components/WatchRail";
import { WatchLayout } from "@/components/WatchLayout";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareButton } from "@/components/ShareButton";
import { VodInfo } from "@/components/VodInfo";
import { formatTime } from "@/lib/format";
import {
  buildChannelPath,
  buildVodPath,
  parseStartTime,
} from "@/lib/validation";

interface Quality {
  key: string;
  name: string;
  resolution: string;
  frameRate: number;
  bandwidth: number;
  codec: string;
  playlistUrl: string;
}

const LIVE_QUALITIES: Quality[] = [];

interface VodData {
  vodId: string;
  channel: string;
  channelDisplayName?: string;
  channelProfileImageURL?: string;
  title?: string;
  previewThumbnailURL?: string;
  isLiveArchive?: boolean;
  broadcastType: string;
  qualities: Quality[];
}

interface ChannelVideo {
  id: string;
  title: string;
  createdAt: string;
  lengthSeconds: number;
  viewCount: number;
  broadcastType: string;
  previewThumbnailURL: string;
}

interface LiveStream {
  id: string;
  title: string;
  type: string;
  viewersCount: number;
  createdAt: string;
  game?: { name: string } | null;
}

interface ChannelData {
  id: string;
  login: string;
  displayName: string;
  description: string;
  profileImageURL: string;
  stream: LiveStream | null;
  videos: ChannelVideo[];
}

type AppState = "home" | "loading" | "video" | "channel" | "error";
function playbackKey(vodId: string) {
  return `phantom-playback:${vodId}`;
}

function readStoredPlayback(vodId: string) {
  try {
    const value = localStorage.getItem(playbackKey(vodId));
    if (!value) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

function storePlayback(vodId: string, time: number) {
  if (!Number.isFinite(time) || time < 5) return;
  try {
    localStorage.setItem(playbackKey(vodId), Math.floor(time).toString());
  } catch {}
}

export function VodApp() {
  const params = useParams<{ videoId?: string; channelName?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const routeVodId = params.videoId ?? searchParams.get("v") ?? "";
  const routeChannel = params.channelName ?? "";
  const routeStartTime = useMemo(
    () => parseStartTime(searchParams.get("t")),
    [searchParams]
  );

  const [state, setState] = useState<AppState>(
    routeVodId || routeChannel ? "loading" : "home"
  );
  const [vodData, setVodData] = useState<VodData | null>(null);
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [error, setError] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [startTime, setStartTime] = useState(routeStartTime);
  const [playerTime, setPlayerTime] = useState(0);

  const resetPlayback = useCallback(() => {
    setVodData(null);
    setChannelData(null);
    setMasterUrl("");
    setPlayerTime(0);
    setStartTime(0);
  }, []);

  const loadVod = useCallback(async (vodId: string, nextStartTime: number) => {
    setState("loading");
    setError("");
    setChannelData(null);

    const resumeTime = nextStartTime || readStoredPlayback(vodId);
    setStartTime(resumeTime);

    try {
      const resp = await fetch(
        `/api/vod/resolve?vodId=${encodeURIComponent(vodId)}`,
        { cache: "no-store" }
      );

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || `Error: ${resp.status}`);
      }

      const data: VodData = await resp.json();
      setVodData(data);
      setMasterUrl(`/api/vod/master.m3u8?vodId=${data.vodId}`);
      setPlayerTime(resumeTime);
      setState("video");

      addToHistory({
        vodId: data.vodId,
        channel: data.channel,
        broadcastType: data.broadcastType,
        title: data.title,
        previewThumbnailURL: data.previewThumbnailURL,
      });
    } catch (err) {
      resetPlayback();
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, [resetPlayback]);

  const loadChannel = useCallback(async (channel: string) => {
    setState("loading");
    setError("");
    setVodData(null);
    setStartTime(0);
    setPlayerTime(0);

    try {
      const resp = await fetch(
        `/api/channel/resolve?channel=${encodeURIComponent(channel)}`
      );

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || `Error: ${resp.status}`);
      }

      const data: ChannelData = await resp.json();
      setChannelData(data);
      setMasterUrl(
        data.stream
          ? `/api/live/master.m3u8?channel=${encodeURIComponent(data.login)}`
          : ""
      );
      setState("channel");
    } catch (err) {
      resetPlayback();
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, [resetPlayback]);

  useEffect(() => {
    if (routeVodId) {
      void loadVod(routeVodId, routeStartTime);
      return;
    }

    if (routeChannel) {
      void loadChannel(routeChannel);
      return;
    }

    resetPlayback();
    setError("");
    setState("home");
  }, [loadChannel, loadVod, resetPlayback, routeChannel, routeStartTime, routeVodId]);

  const onVodTimeUpdate = useCallback(
    (time: number) => {
      setPlayerTime(time);
      if (vodData?.vodId) {
        storePlayback(vodData.vodId, time);
      }
    },
    [vodData]
  );

  return (
    <main className="workspace-canvas twitch-main relative">
      {state === "home" && (
        <HomeView
          onVideo={(vodId) => router.push(buildVodPath(vodId))}
        />
      )}

      {state === "loading" && <LoadingView />}

      {state === "error" && (
        <div className="app-shell relative pt-20">
          <ErrorDisplay message={error} onRetry={() => router.push("/")} />
        </div>
      )}

      {state === "video" && vodData && (
        <VideoView
          vodData={vodData}
          masterUrl={masterUrl}
          startTime={startTime}
          playerTime={playerTime}
          onTimeUpdate={onVodTimeUpdate}
        />
      )}

      {state === "channel" && channelData && (
        <ChannelView
          channel={channelData}
          masterUrl={masterUrl}
          onVideo={(vodId) => router.push(buildVodPath(vodId))}
        />
      )}
    </main>
  );
}

function HomeView({
  onVideo,
}: {
  onVideo: (vodId: string) => void;
}) {
  const history = useHistory();

  return (
    <div className="twitch-home" data-has-history={history.length > 0}>
      <div className="twitch-home-bottom">
        <ChannelDiscovery entries={history} onVideo={onVideo} footer={<Footer />} />
      </div>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="relative mx-auto flex min-h-[calc(100svh-var(--media-header-height))] max-w-sm flex-col items-center justify-center px-4">
      <ProgressRail percent={0} indeterminate label="Loading Twitch source" className="w-full" />
      <p className="mt-4 text-sm text-text-tertiary">Loading Twitch source...</p>
    </div>
  );
}

function VideoView({ vodData, masterUrl, startTime, playerTime, onTimeUpdate }: {
  vodData: VodData;
  masterUrl: string;
  startTime: number;
  playerTime: number;
  onTimeUpdate: (time: number) => void;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const toggleChat = () => setChatOpen((open) => !open);
  const closeChat = () => {
    setChatOpen(false);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".twitch-watch-rail [aria-controls='watch-chat']")?.focus();
    });
  };
  return (
    <div className="app-shell twitch-watch relative pb-8">
      <div className="pt-2">
        <WatchLayout chatOpen={chatOpen}
          video={<Player src={masterUrl} title={vodData.title || `Video ${vodData.vodId}`} subtitle={vodData.channelDisplayName || vodData.channel}
            qualities={vodData.qualities} startTime={startTime} isLive={Boolean(vodData.isLiveArchive)} dvrMode={Boolean(vodData.isLiveArchive)}
            onTimeUpdate={onTimeUpdate} chatOpen={chatOpen} onChatToggle={toggleChat} />}
          rail={<WatchRail channel={vodData.channel} displayName={vodData.channelDisplayName} image={vodData.channelProfileImageURL}
            broadcastType={vodData.isLiveArchive ? "Live" : vodData.broadcastType.toLowerCase() === "highlight" ? "Highlight" : vodData.broadcastType.toLowerCase() === "upload" ? "Upload" : "Past broadcast"}
            actions={[
              <button key="chat" type="button" className="twitch-rail-action" onClick={toggleChat} aria-label={chatOpen ? "Hide chat" : "Show chat"} aria-expanded={chatOpen} aria-controls="watch-chat"><ChatCircle size={21} /></button>,
              <DownloadButton key="download" iconOnly qualities={vodData.qualities} channel={vodData.channel} vodId={vodData.vodId} />,
              <ShareButton key="share" iconOnly vodId={vodData.vodId} currentTime={playerTime} />,
            ]} />}
          chat={<ChatPanel channel={vodData.channel} vodId={vodData.vodId} time={playerTime} onClose={closeChat} />}
        >
        <div className="twitch-watch-details">
          <VodInfo channel={vodData.channel} channelDisplayName={vodData.channelDisplayName} channelProfileImageURL={vodData.channelProfileImageURL}
            broadcastType={vodData.broadcastType} title={vodData.title} titleOnly />
        </div>
        </WatchLayout>
      </div>
      <Footer />
    </div>
  );
}

function ChannelView({ channel, masterUrl, onVideo }: {
  channel: ChannelData;
  masterUrl: string;
  onVideo: (vodId: string) => void;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const stream = channel.stream;
  const liveArchive = stream
    ? channel.videos.find((video) => isLikelyLiveArchive(video, stream)) ?? channel.videos.find((video) => video.broadcastType.toLowerCase() === "archive")
    : null;
  const toggleChat = () => setChatOpen((open) => !open);
  const closeChat = () => {
    setChatOpen(false);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".twitch-watch-rail [aria-controls='watch-chat'], [aria-controls='channel-chat']")?.focus();
    });
  };
  const chat = <ChatPanel channel={channel.login} onClose={closeChat} />;

  const details = (
    <div className="twitch-watch-details">
      {stream ? <VodInfo channel={channel.login} channelDisplayName={channel.displayName} channelProfileImageURL={channel.profileImageURL} title={stream.title} broadcastType="live" isLive titleOnly />
        : <div><div className="flex items-center gap-4"><ChannelHeader channel={channel} /><span className="twitch-broadcast-type">Offline</span></div>
          <p className="mt-4 text-sm leading-6 text-text-secondary">Watch recent broadcasts from {channel.displayName} while the channel is offline.</p></div>}
      {!stream && <div className="twitch-watch-actions">
        <Button variant="secondary" onClick={toggleChat} aria-expanded={chatOpen} aria-controls="channel-chat"><ChatCircle weight="regular" size={17} />{chatOpen ? "Hide chat" : "Show chat"}</Button>
      </div>}
    </div>
  );

  return (
    <div className={`app-shell ${stream ? "twitch-watch" : ""} relative pb-8`}>
      <section className="pt-2">
        {stream && masterUrl && <WatchLayout chatOpen={chatOpen}
          video={<Player src={masterUrl} qualities={LIVE_QUALITIES} isLive title={stream.title} subtitle={channel.displayName} chatOpen={chatOpen} onChatToggle={toggleChat} />}
          rail={<WatchRail channel={channel.login} displayName={channel.displayName} image={channel.profileImageURL} broadcastType="Live" actions={[
            <button key="chat" type="button" className="twitch-rail-action" onClick={toggleChat} aria-label={chatOpen ? "Hide chat" : "Show chat"} aria-expanded={chatOpen} aria-controls="watch-chat"><ChatCircle size={21} /></button>,
            ...(liveArchive ? [<button key="archive" type="button" className="twitch-rail-action" onClick={() => onVideo(liveArchive.id)} aria-label="Open archive"><VideoCamera size={21} /></button>] : []),
          ]} />}
          chat={chat}
        >{details}</WatchLayout>}
        {!stream && details}
        {!stream && chatOpen && <div id="channel-chat" className="twitch-standalone-chat">{chat}</div>}
      </section>
      {channel.videos.length > 0 && <section className="mt-8">
        <h2 className="mb-4 text-2xl font-semibold tracking-tight text-text">Recent broadcasts</h2>
        <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
          {channel.videos.map((video) => <button key={video.id} onClick={() => onVideo(video.id)} className="media-tile-hit group min-w-0 text-left">
            <MediaTile title={video.title || `Video ${video.id}`} imageUrl={video.previewThumbnailURL} sizes="(max-width: 640px) 100vw, 33vw" badge={formatTime(video.lengthSeconds)}
              meta={<><span>{video.viewCount.toLocaleString()} views</span><span>{new Date(video.createdAt).toLocaleDateString()}</span></>} />
          </button>)}
        </div>
      </section>}
      <Footer />
    </div>
  );
}

function ChannelHeader({
  channel,
  compact = false,
}: {
  channel: ChannelData;
  compact?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${compact ? "" : "animate-fade-in"}`}>
      <Image
        src={channel.profileImageURL}
        alt=""
        width={compact ? 48 : 56}
        height={compact ? 48 : 56}
        unoptimized
        className={compact ? "h-12 w-12 rounded-2xl" : "h-14 w-14 rounded-2xl"}
      />
      <div className="min-w-0">
        <h1 className={compact ? "truncate text-lg font-semibold text-text" : "truncate text-2xl font-semibold text-text"}>
          {channel.displayName}
        </h1>
        <p className="truncate text-sm text-text-tertiary">@{channel.login}</p>
      </div>
    </div>
  );
}

function isLikelyLiveArchive(video: ChannelVideo, stream: LiveStream) {
  if (video.broadcastType.toLowerCase() !== "archive") return false;

  const videoStart = Date.parse(video.createdAt);
  const streamStart = Date.parse(stream.createdAt);
  if (!Number.isFinite(videoStart) || !Number.isFinite(streamStart)) return false;

  return Math.abs(videoStart - streamStart) < 20 * 60 * 1000;
}

function Footer() {
  return (
    <footer className="twitch-footer py-5 text-center">
      <p className="text-[11px] text-text-tertiary">
        Not affiliated with Twitch. For authorized use only.{" "}
        <Link href="/disclaimer" className="underline underline-offset-4 transition-colors hover:text-text">
          Legal disclaimer
        </Link>
      </p>
    </footer>
  );
}
