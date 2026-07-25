import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { StructuredData } from "@/components/structured-data";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Legal Disclaimer",
  description:
    "Read the Phantom YouTube legal disclaimer, permitted-use guidance, copyright notice, and limitation of liability terms.",
  path: "/disclaimer",
  keywords: ["legal disclaimer", "copyright notice", "terms of use"],
  locale: "en",
  languagePaths: {
    en: "/disclaimer",
    es: "/es/disclaimer",
  },
});

function Section({
  title,
  children,
}: Readonly<{
  title: string;
  children: ReactNode;
}>) {
  return (
    <section className="border-t border-black/[0.08] pt-6">
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
  const pageUrl = new URL("/disclaimer", getBaseUrl()).toString();

  return (
    <main className="flex min-h-screen flex-col">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${siteConfig.name} Legal Disclaimer`,
          inLanguage: "en-US",
          description:
            "Legal disclaimer and permitted-use guidance for Phantom YouTube.",
          url: pageUrl,
        }}
      />

      <AppHeader
        englishHref="/disclaimer"
        spanishHref="/es/disclaimer"
      />

      <div className="app-shell max-w-3xl flex-1 pb-16 pt-6">
        <header>
          <p className="font-mono text-[10px] font-bold uppercase text-phantom">
            Legal
          </p>
          <h1 className="mt-3 text-[clamp(2.2rem,6vw,3rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-text">
            Legal disclaimer
          </h1>
          <span className="ink-underline block" aria-hidden="true" />
          <p className="mt-6 max-w-2xl text-[14px] leading-7 text-text-secondary">
            Phantom YouTube is an independent software tool. This page sets out
            the intended use of the site, the limits of responsibility for its
            operators, and the intellectual-property boundaries users are
            expected to respect before using any download or media-processing
            feature.
          </p>
        </header>

        <div className="mt-10 space-y-7">
          <Section title="No affiliation">
            <p>
              Phantom YouTube is an independent project and is not affiliated
              with, endorsed by, sponsored by, approved by, or connected with
              YouTube, Google, or any of their parents, subsidiaries, or
              affiliates. Any reference to YouTube or related products is made
              solely to describe compatibility with third-party content or URLs.
            </p>
            <p>
              The terms &quot;YouTube,&quot; related brand names, logos, service
              names, trade dress, and associated marks remain the property of
              their respective owners. Use of those names on this site is
              nominative and descriptive only to identify the platform that
              users reference when they submit links or search queries, and does
              not imply any sponsorship, partnership, endorsement,
              authorization, or source relationship.
            </p>
          </Section>

          <Section title="Authorized use only">
            <p>
              You may only use this service to access or download content that
              you own, control, have explicit permission to use, or are
              otherwise legally entitled to download under applicable law.
            </p>
            <p>
              You are solely responsible for verifying that your use of the
              service complies with copyright law, licensing terms, platform
              rules, contractual obligations, and local regulations in your
              jurisdiction.
            </p>
            <p>
              If a platform&apos;s terms, a creator&apos;s license, a contractual
              restriction, or a rights holder&apos;s instructions prohibit copying,
              downloading, redistribution, public performance, or derivative
              use, then you must not use this service in a way that conflicts
              with those restrictions.
            </p>
          </Section>

          <Section title="User responsibility">
            <p>
              By using Phantom YouTube, you represent and warrant that you have
              all rights, permissions, and legal authority necessary for the
              content you process through the service.
            </p>
            <p>
              You agree not to use the service for infringement, circumvention,
              unauthorized redistribution, or any unlawful purpose.
            </p>
            <p>
              You also agree not to use the service in a way that infringes
              trademarks, passes off your activity as endorsed by a third party,
              removes attribution or proprietary notices when such removal is
              prohibited, or misleads others about the ownership or origin of
              media, metadata, branding, or services.
            </p>
          </Section>

          <Section title="Trademark and naming context">
            <p>
              Any use of the word &quot;YouTube&quot; on this site or in the
              product name is intended only to describe the subject matter of
              the service, namely that users may submit or inspect content
              originating from the YouTube platform. The name is used in a
              descriptive, referential sense only, not as a claim of brand
              ownership, partnership, official status, or endorsement.
            </p>
            <p>
              Where applicable under relevant law, that referential use is
              intended as nominative fair use: only so much of the mark is used
              as is reasonably necessary to identify the third-party platform,
              and not to suggest that this service is operated, licensed, or
              approved by that platform owner.
            </p>
            <p>
              This site does not use YouTube&apos;s logos, brand styling, or
              trade dress as source identifiers for the service itself. To the
              extent third-party marks appear in user-requested results,
              previews, titles, channel names, or metadata, they remain the
              property of their respective owners and appear only as incidental
              references tied to user-requested content.
            </p>
            <p>
              Nothing on this site grants any user a license to use third-party
              trademarks, media, branding, or other protected material outside
              whatever rights that user already has under applicable law.
            </p>
          </Section>

          <Section title="Availability and warranties">
            <p>
              Phantom YouTube is provided on an &quot;as is&quot; and &quot;as
              available&quot; basis without warranties of any kind, express or
              implied, including merchantability, fitness for a particular
              purpose, non-infringement, availability, or accuracy.
            </p>
            <p>
              We do not guarantee uninterrupted service, compatibility with any
              third-party platform, or that any requested media or metadata will
              remain accessible.
            </p>
            <p>
              Features, supported formats, extraction methods, and external
              platform behavior may change at any time without notice, and the
              service may stop working in whole or in part due to technical,
              legal, operational, or third-party changes.
            </p>
          </Section>

          <Section title="Limitation of liability">
            <p>
              To the maximum extent permitted by law, the operators of Phantom
              YouTube will not be liable for any direct, indirect, incidental,
              consequential, special, exemplary, or punitive damages arising out
              of or related to your use of, or inability to use, the service.
            </p>
            <p>
              This limitation applies regardless of the theory of liability and
              includes, without limitation, claims relating to copyright,
              trademark, misrepresentation, business interruption, data loss,
              download failures, third-party claims, or reliance on site
              content.
            </p>
          </Section>

          <Section title="Enforcement and updates">
            <p>
              We may refuse service, restrict access, block abusive usage,
              remove features, or update this disclaimer at any time without
              notice. Continued use of the site after changes means you accept
              the revised disclaimer.
            </p>
            <p>
              If any provision of this disclaimer is found unenforceable, the
              remaining provisions will remain in effect to the fullest extent
              permitted by law.
            </p>
          </Section>
        </div>
      </div>

      <div className="app-shell mt-auto">
        <SiteFooter />
      </div>
    </main>
  );
}
