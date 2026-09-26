import Link from "next/link";
import { FEATURED_CHANNELS } from "@/lib/featured-channels";
import { buildChannelPath } from "@/lib/validation";

const FEATURES = [
  {
    title: "Adaptive quality up to 1080p60",
    body: "Pick a quality yourself or let the player ride the bandwidth. H.264 and H.265 sources are both handled where Twitch offers them.",
  },
  {
    title: "Live and past broadcasts",
    body: "Open a live channel, or work through a channel's recent broadcasts and past broadcasts without hunting for a player.",
  },
  {
    title: "Chat and playback memory",
    body: "Live chat sits next to the player, and your position is remembered per video so you can pick a long stream back up where you stopped.",
  },
  {
    title: "No install, no account",
    body: "Everything runs in the browser tab you already have open. There is nothing to sign up for and nothing to configure.",
  },
];

const FAQ = [
  {
    question: "What can Phantom Twitch do?",
    answer:
      "Phantom Twitch lets you search Twitch channels, watch live streams, browse recent VODs, and play Twitch videos in a modern adaptive web player.",
  },
  {
    question: "Which video formats are supported?",
    answer:
      "Phantom Twitch supports HLS adaptive streaming with multiple quality options including 1080p60, 720p60, 480p, 360p, and 160p, with both H.264 and H.265 codec support where available.",
  },
  {
    question: "Is Phantom Twitch affiliated with Twitch?",
    answer:
      "No. Phantom Twitch is an independent tool and is not endorsed by or affiliated with Twitch or Amazon.",
  },
];

export function HomeContent() {
  return (
    <section className="twitch-seo" aria-labelledby="twitch-seo-heading">
      <div className="twitch-seo-inner">
        <header>
          <h1 id="twitch-seo-heading" className="twitch-seo-title">
            Watch Twitch without the baggage
          </h1>
          <p className="twitch-seo-lede">
            Phantom Twitch is a browser-based Twitch client. Open a live channel, browse
            a streamer&apos;s recent broadcasts, and play past broadcasts in an adaptive
            player with chat alongside it. Nothing to install, no account, and no
            clutter between you and the stream.
          </p>
        </header>

        <div className="twitch-seo-block">
          <h3 className="twitch-seo-subheading">What you get</h3>
          <dl className="twitch-seo-features">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="twitch-seo-feature">
                <dt className="twitch-seo-feature-title">{feature.title}</dt>
                <dd className="twitch-seo-feature-body">{feature.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="twitch-seo-block">
          <h3 className="twitch-seo-subheading">Popular channels</h3>
          <p className="twitch-seo-body">
            Every channel has a Phantom Twitch page. Open one to watch it live or to
            work through its recent broadcasts.
          </p>
          <ul className="twitch-seo-links">
            {FEATURED_CHANNELS.map((channel) => (
              <li key={channel.login}>
                <Link
                  href={buildChannelPath(channel.login)}
                  className="twitch-seo-link"
                >
                  {channel.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="twitch-seo-block">
          <h3 className="twitch-seo-subheading">Common questions</h3>
          <dl className="twitch-seo-faq">
            {FAQ.map((item) => (
              <div key={item.question} className="twitch-seo-faq-item">
                <dt className="twitch-seo-faq-question">{item.question}</dt>
                <dd className="twitch-seo-faq-answer">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="twitch-seo-body">
          <Link href="/videos" className="twitch-seo-link">
            Watch Twitch VODs
          </Link>
          {" · "}
          <Link href="/disclaimer" className="twitch-seo-link">
            Legal disclaimer
          </Link>
        </p>
      </div>
    </section>
  );
}
