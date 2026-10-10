import { parseStartTime } from "@/lib/validation";
import { ClipView } from "@/components/watch/ClipView";
import { notFound } from "next/navigation";
export default async function ClipPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string | string[] }> }) {
  const { slug } = await params;
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(slug)) notFound();
  const { t } = await searchParams;
  return <ClipView key={`${slug}:${t ?? ""}`} slug={slug} requestedTime={parseStartTime(t ?? null)} />;
}
