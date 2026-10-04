import Link from "next/link";

const FACTS = [
  { title: "Up to 1080p60", body: "Adaptive quality, H.264 and H.265." },
  { title: "Live streams and VODs", body: "Any channel, live or past broadcasts." },
  { title: "Chat alongside", body: "Live chat, and chat replay on VODs." },
  { title: "Resume where you stopped", body: "Your position is kept in this browser." },
];

export function HomeContent() {
  return (
    <section className="media-content twitch-about" aria-labelledby="twitch-seo-heading">
      <div className="twitch-about-inner">
        <header className="twitch-about-head">
          <h1 id="twitch-seo-heading" className="twitch-seo-title">
            Watch Twitch without the baggage
          </h1>
          <p className="twitch-seo-lede">
            Phantom Twitch is a web player for Twitch live streams and VODs. Search for
            a channel or paste a video link and it plays, with no account and nothing
            to install.
          </p>
        </header>

        <dl className="twitch-about-facts">
          {FACTS.map((fact) => (
            <div key={fact.title} className="twitch-about-fact">
              <dt className="twitch-seo-feature-title">{fact.title}</dt>
              <dd className="twitch-seo-feature-body">{fact.body}</dd>
            </div>
          ))}
        </dl>

        <footer className="twitch-about-foot">
          <p>Not affiliated with Twitch. For authorized use only.</p>
          <nav aria-label="Site">
            <Link href="/videos">Watch Twitch VODs</Link>
            <Link href="/disclaimer">Legal disclaimer</Link>
          </nav>
        </footer>
      </div>
    </section>
  );
}
