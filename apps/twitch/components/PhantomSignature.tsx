import { Logo } from "@phantom/ui";
import { siteConfig } from "@/lib/seo";

export function PhantomSignature() {
  return (
    <a href={siteConfig.repositoryUrl} className="still-family">
      <Logo size={18} tone="chalk" decorative className="still-family-mark" />
      <span>Part of <strong>Phantom Media</strong></span>
    </a>
  );
}
