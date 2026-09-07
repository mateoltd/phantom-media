import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { noticeEmail, siteConfig } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Legal disclaimer",
  description:
    "Phantom Stream stores no media library. This page sets out what the service is, the limits of responsibility for its operators, and the rules users are expected to follow.",
  alternates: { canonical: "/disclaimer" },
};

function Section({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="text-lg font-extrabold tracking-[-0.02em] text-text">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[14px] leading-7 text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export default function DisclaimerPage() {
  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader />

      <div className="app-shell max-w-3xl flex-1 pb-16 pt-8">
        <header>
          <p className="text-sm font-medium text-phantom">Legal</p>
          <h1 className="mt-3 text-[clamp(2rem,5vw,2.8rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-text">
            Legal disclaimer
          </h1>
          <p className="mt-6 text-[14px] leading-7 text-text-secondary">
            {siteConfig.name} is an independent search interface for publicly
            reachable media. It stores no media library and has no control over
            the third-party services it connects to. Most playback is direct;
            a constrained compatibility relay may transmit media bytes when a
            public source cannot be requested by a browser. This page sets out
            what the service does, what it does not do, and where responsibility
            sits.
          </p>
        </header>

        <div className="mt-10 space-y-7">
          <Section title="No stored media library">
            <p>
              {siteConfig.name} operates no media library or content delivery
              network and persistently stores no video or audio. It does not
              upload, mirror, transcode, re-encode, seed, or retain media files.
            </p>
            <p>
              When you ask for a title, the service queries publicly reachable
              third-party services and returns the addresses they publish.
              Browser-ready media is requested directly from the third party.
              For a public source whose media endpoints reject ordinary browser
              requests, the service may use a narrowly allowlisted compatibility
              relay that streams responses without persistent storage.
            </p>
            <p>
              This project does not select, review, approve, or moderate what
              third parties choose to make available. It supports no paid or
              authenticated media services and does not bypass DRM.
            </p>
          </Section>

          <Section title="No affiliation">
            <p>
              {siteConfig.name} is an independent project. It is not affiliated
              with, endorsed by, sponsored by, approved by, or connected with
              any studio, distributor, streaming platform, catalog provider, or
              media host, nor with any of their parents, subsidiaries, or
              affiliates.
            </p>
            <p>
              Titles, artwork, logos, brand names, service names, trade dress,
              and associated marks that appear here remain the property of their
              respective owners. They appear only to identify the works a user
              has asked about, and their appearance implies no sponsorship,
              partnership, endorsement, authorization, or source relationship.
            </p>
          </Section>

          <Section title="Authorized use only">
            <p>
              You may use this service only to reach content that you own,
              control, have explicit permission to access, or are otherwise
              legally entitled to access under the law that applies to you.
            </p>
            <p>
              You are solely responsible for confirming that your use complies
              with copyright law, licensing terms, platform rules, contractual
              obligations, and local regulations in your jurisdiction. Where a
              rights holder&apos;s licence, a platform&apos;s terms, or a
              contractual restriction prohibits access, copying, public
              performance, or redistribution, you must not use this service in a
              way that conflicts with those restrictions.
            </p>
          </Section>

          <Section title="Your responsibility">
            <p>
              By using {siteConfig.name} you represent that you hold every
              right, permission, and legal authority necessary for the content
              you reach through it, and you accept full responsibility for that
              use.
            </p>
            <p>
              You agree not to use the service for infringement, for
              circumvention of technical protection measures, for unauthorized
              redistribution, or for any unlawful purpose.
            </p>
          </Section>

          <Section title="Third-party services and availability">
            <p>
              Everything this interface returns originates from independent
              third parties over which this project has no control, no
              ownership, and no oversight. Their availability, accuracy,
              legality, safety, and conduct are their own. A link, a search
              result, or a successful playback attempt is not an endorsement of
              a third party or a representation about the legality of what it
              serves.
            </p>
            <p>
              Those services may change, break, restrict access, or disappear at
              any time, and this project may stop working in whole or in part as
              a result. Metadata is supplied by open catalogs and may be
              incomplete or wrong.
            </p>
          </Section>

          {noticeEmail && (
            <Section title="Reporting infringement">
              <p>
                Because no media is stored here, this project cannot remove a
                file from the internet. What it can remove is the ability of
                this interface to surface a particular work.
              </p>
              <p>
                If you are a rights holder or an authorized agent and you
                believe this interface is being used to reach material that
                infringes your rights, write to{" "}
                <a
                  href={`mailto:${noticeEmail}`}
                  className="font-medium text-text underline decoration-text-tertiary/40 decoration-1 underline-offset-[3px] transition-colors hover:decoration-text/60"
                >
                  {noticeEmail}
                </a>
                . Please identify the work, identify where in this interface it
                appears, state the basis for your claim, and include contact
                details and a statement of your authority to act. Notices that
                identify the work clearly are acted on promptly.
              </p>
            </Section>
          )}

          <Section title="No warranty">
            <p>
              {siteConfig.name} is provided on an &quot;as is&quot; and &quot;as
              available&quot; basis, without warranties of any kind, express or
              implied, including merchantability, fitness for a particular
              purpose, non-infringement, availability, or accuracy. No guarantee
              is made that the service will be uninterrupted, that any
              particular title will be reachable, or that any information shown
              is correct.
            </p>
          </Section>

          <Section title="Limitation of liability">
            <p>
              To the maximum extent permitted by law, the operators of{" "}
              {siteConfig.name} will not be liable for any direct, indirect,
              incidental, consequential, special, exemplary, or punitive damages
              arising out of or related to your use of, or inability to use, the
              service, or to anything obtained from a third party through it.
            </p>
            <p>
              This limitation applies regardless of the theory of liability and
              includes, without limitation, claims relating to copyright,
              trademark, misrepresentation, data loss, business interruption,
              third-party conduct, third-party claims, or reliance on anything
              shown here.
            </p>
            <p>
              Some jurisdictions do not allow certain exclusions of warranties
              or limitations of liability. Where that is the case, the
              exclusions and limitations above apply only to the fullest extent
              that jurisdiction permits, and nothing here removes a right you
              hold that cannot be waived.
            </p>
          </Section>

          <Section title="Changes and severability">
            <p>
              Access may be refused, restricted, or withdrawn, features may be
              removed, and this disclaimer may be updated at any time without
              notice. Continued use after a change means you accept the revised
              terms.
            </p>
            <p>
              If any provision of this disclaimer is found unenforceable, the
              remaining provisions stay in effect to the fullest extent
              permitted by law.
            </p>
          </Section>
        </div>
      </div>

      <div className="app-shell">
        <SiteFooter />
      </div>
    </main>
  );
}
