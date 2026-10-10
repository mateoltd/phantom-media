import type { ReactNode } from "react";
import { WarningCircle, Tray } from "@phosphor-icons/react/ssr";
import { Footer } from "@/components/Footer";

/** `heading` stands in for the title and description, for a page that introduces itself in its own way. */
export function ResourcePage({ title, description, heading, children }: { title?: string; description?: string; heading?: ReactNode; children: ReactNode }) {
  return <main className="still-main still-resource-page">
    <div className="media-content still-page">
      {heading ?? <header className="still-resource-heading"><h1>{title}</h1><p>{description}</p></header>}
      {children}
      <Footer />
    </div>
  </main>;
}

export function ResourceNotice({ title, children, error = false }: { title: string; children?: ReactNode; error?: boolean }) {
  const Icon = error ? WarningCircle : Tray;
  return <div className="still-resource-notice" role={error ? "alert" : "status"}>
    <Icon size={18} aria-hidden="true" />
    <div><h3>{title}</h3>{children && <p>{children}</p>}</div>
  </div>;
}
