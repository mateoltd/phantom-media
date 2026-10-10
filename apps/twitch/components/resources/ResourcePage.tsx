import type { ReactNode } from "react";
import { WarningCircle, Tray } from "@phosphor-icons/react/ssr";
import { Footer } from "@/components/Footer";

export function ResourcePage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="twitch-main twitch-resource-page">
    <div className="media-content twitch-page">
      <header className="twitch-resource-heading"><h1>{title}</h1><p>{description}</p></header>
      {children}
      <Footer />
    </div>
  </main>;
}

export function ResourceNotice({ title, children, error = false }: { title: string; children?: ReactNode; error?: boolean }) {
  const Icon = error ? WarningCircle : Tray;
  return <div className="twitch-resource-notice" role={error ? "alert" : "status"}>
    <Icon size={18} aria-hidden="true" />
    <div><h3>{title}</h3>{children && <p>{children}</p>}</div>
  </div>;
}
