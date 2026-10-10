import Link from "next/link";
import { siteConfig } from "@/lib/seo";
import { PhantomSignature } from "../PhantomSignature";

const FACTS = [
  { title: "Ad-free Twitch playback", body: "Watch live streams and VODs without Twitch ad breaks." },
  { title: "Subscriber-only VODs", body: "Play sub-only broadcasts when their source playlists are available. No Twitch login required." },
  { title: "Rewind a live stream", body: "Open the current broadcast’s archive to seek back and catch up while the channel is still live, when an archive is available." },
  { title: "Anonymous viewing", body: "No account, app analytics, or tracking cookies. History and playback preferences stay in your browser." },
  { title: "Control your player", body: "Choose quality and playback speed, use keyboard shortcuts or picture-in-picture, and download VODs." },
  { title: "Chat and playback memory", body: "Read live chat or synchronized VOD replay, and resume where you stopped." },
];

const QUESTIONS = [
  { title: "How do I watch Twitch without an account?", body: "Search for a Twitch channel or paste a Twitch video URL or VOD ID into Still. Playback needs no sign-up, extension, or installation." },
  { title: "Can I watch subscriber-only Twitch VODs?", body: "Still can resolve subscriber-only VODs from available source playlists without a Twitch login. It cannot recover a deleted video or guarantee playback when Twitch no longer serves the media." },
  { title: "Can I rewind Twitch while a stream is live?", body: "Yes, when the current broadcast has an accessible archive. Open the archive from the channel controls to seek through the recorded portion while the stream continues. Availability and how close the archive gets to live depend on Twitch and the channel." },
  { title: "What does Still store?", body: "Watch history, resume positions, and player preferences are stored locally in your browser. The app has no analytics or tracking cookies and requires no Twitch account. Media and chat still use third-party services; hosting providers may process request data." },
];

export function HomeContent() {
  return (
    <section className="media-content still-about" aria-labelledby="still-seo-heading">
      <div className="still-about-inner">
        <header className="still-about-head">
          <h1 id="still-seo-heading" className="still-seo-title">
            An ad-free Twitch player with live rewind
          </h1>
          <p className="still-seo-lede">
            Still is a free, open-source alternative Twitch client for
            live streams and VODs, including available subscriber-only broadcasts.
            Watch without an account, rewind live broadcasts through their archives,
            and choose how you play. No app analytics or tracking cookies.
          </p>
        </header>

        <dl className="still-about-facts">
          {FACTS.map((fact) => (
            <div key={fact.title} className="still-about-fact">
              <dt className="still-seo-feature-title">{fact.title}</dt>
              <dd className="still-seo-feature-body">{fact.body}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="still-questions-heading">
          <h2 id="still-questions-heading" className="still-seo-subheading">Watching Twitch with Still</h2>
          {QUESTIONS.map((question) => (
            <section key={question.title} className="still-seo-block">
              <h3 className="still-seo-feature-title">{question.title}</h3>
              <p className="still-seo-feature-body">{question.body}</p>
            </section>
          ))}
        </section>

        <footer className="still-about-foot">
          <PhantomSignature />
          <p>Not affiliated with Twitch. For authorized use only.</p>
          <nav aria-label="Site">
            <Link href="/videos">Watch Twitch VODs</Link>
            <a href={siteConfig.repositoryUrl}>Source on GitHub</a>
            <Link href="/disclaimer">Legal disclaimer</Link>
          </nav>
        </footer>
      </div>
    </section>
  );
}
