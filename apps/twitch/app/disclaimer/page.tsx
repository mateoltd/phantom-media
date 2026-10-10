import type { ReactNode } from "react";
import { StructuredData } from "@/components/structured-data";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Legal Disclaimer",
  description:
    "Read the Still legal disclaimer, permitted-use guidance, copyright notice, and limitation of liability terms.",
  path: "/disclaimer",
  keywords: ["legal disclaimer", "copyright notice", "terms of use"],
});

function Section({
  title,
  children,
}: Readonly<{
  title: string;
  children: ReactNode;
}>) {
  return (
    <section>
      <h2 className="text-base font-semibold tracking-tight text-text sm:text-lg">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-text-secondary sm:text-[15px]">
        {children}
      </div>
    </section>
  );
}

export default function DisclaimerPage() {
  const pageUrl = new URL("/disclaimer", getBaseUrl()).toString();

  return (
    <main className="min-h-screen">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${siteConfig.name} Legal Disclaimer`,
          description:
            "Legal disclaimer and permitted-use guidance for Still.",
          url: pageUrl,
        }}
      />

      <div className="media-content pb-16 pt-4">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            Legal disclaimer
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-text-secondary sm:text-[15px]">
            Still is an independent software tool. This page sets out
            the intended use of the site, the limits of responsibility for its
            operators, and the intellectual-property boundaries users are
            expected to respect before using any streaming, playback, or
            download feature.
          </p>
        </header>

        <div className="mt-8 max-w-3xl space-y-6">
          <Section title="No affiliation">
            <p>
              Still is an independent project and is not affiliated
              with, endorsed by, sponsored by, approved by, or connected with
              Twitch, Amazon, or any of their parents, subsidiaries, or
              affiliates. Any reference to Twitch or related products is made
              solely to describe compatibility with third-party content or URLs.
            </p>
            <p>
              The terms &quot;Twitch,&quot; related brand names, logos, service
              names, trade dress, and associated marks remain the property of
              their respective owners. Use of those names on this site is
              nominative and descriptive only to identify the platform that
              users reference when they submit links or VOD IDs, and does
              not imply any sponsorship, partnership, endorsement,
              authorization, or source relationship.
            </p>
          </Section>

          <Section title="Authorized use only">
            <p>
              You may only use this service to access, stream, or download
              content that you own, control, have explicit permission to use,
              or are otherwise legally entitled to access under applicable law.
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
              By using Still, you represent and warrant that you have
              all rights, permissions, and legal authority necessary for the
              content you access or process through the service.
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
              Any use of the word &quot;Twitch&quot; on this site or in the
              product name is intended only to describe the subject matter of
              the service, namely that users may submit or inspect content
              originating from the Twitch platform. The name is used in a
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
              This site does not use Twitch&apos;s logos, brand styling, or
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
              Still is provided on an &quot;as is&quot; and &quot;as
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
              Features, supported formats, streaming methods, and external
              platform behavior may change at any time without notice, and the
              service may stop working in whole or in part due to technical,
              legal, operational, or third-party changes.
            </p>
          </Section>

          <Section title="Limitation of liability">
            <p>
              To the maximum extent permitted by law, the operators of Still
              will not be liable for any direct, indirect, incidental,
              consequential, special, exemplary, or punitive damages arising out
              of or related to your use of, or inability to use, the service.
            </p>
            <p>
              This limitation applies regardless of the theory of liability and
              includes, without limitation, claims relating to copyright,
              trademark, misrepresentation, business interruption, data loss,
              streaming failures, third-party claims, or reliance on site
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
    </main>
  );
}
