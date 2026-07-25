import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { StructuredData } from "@/components/structured-data";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

const description =
  "Aviso legal de Phantom, condiciones de uso autorizado, propiedad intelectual y límites de responsabilidad.";

export const metadata = buildMetadata({
  title: "Aviso legal",
  description,
  path: "/es/disclaimer",
  locale: "es",
  keywords: [
    "aviso legal",
    "uso autorizado",
    "propiedad intelectual",
    "condiciones de uso",
  ],
  languagePaths: {
    en: "/disclaimer",
    es: "/es/disclaimer",
  },
});

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
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

export default function SpanishDisclaimerPage() {
  const pageUrl = new URL("/es/disclaimer", getBaseUrl()).toString();

  return (
    <main className="flex min-h-screen flex-col">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${siteConfig.name}: Aviso legal`,
          description,
          url: pageUrl,
          inLanguage: "es-ES",
          isPartOf: new URL("/es", getBaseUrl()).toString(),
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
            Aviso legal
          </h1>
          <span className="ink-underline block" aria-hidden="true" />
          <p className="mt-6 max-w-2xl text-[14px] leading-7 text-text-secondary">
            Phantom es una herramienta independiente. Estas condiciones explican
            el uso permitido del servicio y las responsabilidades que aceptas al
            procesar o descargar contenido.
          </p>
        </header>

        <div className="mt-10 space-y-7">
          <Section title="Sin afiliación">
            <p>
              Phantom no está afiliado, patrocinado, autorizado ni respaldado
              por YouTube, Google o sus empresas relacionadas. Las referencias a
              YouTube sirven únicamente para describir la compatibilidad con
              enlaces y contenido de terceros.
            </p>
            <p>
              YouTube, sus marcas, logotipos y nombres de servicio pertenecen a
              sus respectivos titulares. Su mención no implica colaboración ni
              relación comercial.
            </p>
          </Section>

          <Section title="Solo para usos autorizados">
            <p>
              Solo puedes utilizar Phantom con contenido propio, contenido para
              el que tengas permiso expreso o material que la ley aplicable te
              permita descargar.
            </p>
            <p>
              Eres responsable de respetar los derechos de autor, las licencias,
              las condiciones de la plataforma, los contratos y la normativa de
              tu jurisdicción.
            </p>
          </Section>

          <Section title="Responsabilidad del usuario">
            <p>
              Al utilizar el servicio declaras que cuentas con los derechos y
              permisos necesarios. No puedes usarlo para infringir derechos,
              eludir restricciones, redistribuir contenido sin autorización ni
              realizar actividades ilegales.
            </p>
          </Section>

          <Section title="Disponibilidad">
            <p>
              Phantom se ofrece tal cual y según disponibilidad. No garantizamos
              el funcionamiento ininterrumpido, la compatibilidad permanente con
              servicios de terceros ni la disponibilidad futura de un formato o
              contenido concreto.
            </p>
          </Section>

          <Section title="Limitación de responsabilidad">
            <p>
              En la máxima medida permitida por la ley, los operadores de
              Phantom no responderán por daños derivados del uso o la
              imposibilidad de uso del servicio, incluidas pérdidas de datos,
              fallos de descarga, reclamaciones de terceros o usos no
              autorizados.
            </p>
          </Section>

          <Section title="Cambios y cumplimiento">
            <p>
              Podemos limitar usos abusivos, retirar funciones o actualizar
              estas condiciones. Si una disposición no resulta aplicable, las
              restantes continuarán vigentes.
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
