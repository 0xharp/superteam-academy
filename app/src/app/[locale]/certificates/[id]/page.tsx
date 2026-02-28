"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Share2,
  Link2,
  ExternalLink,
  GraduationCap,
  Download,
  Copy,
  Check,
} from "lucide-react";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Extract attributes from DAS response — tries JSON metadata first, falls back to on-chain plugins */
function extractAttributes(asset: Record<string, unknown>): Array<{ trait_type: string; value: string }> {
  const content = asset.content as Record<string, unknown> | undefined;
  const metadata = content?.metadata as Record<string, unknown> | undefined;
  const jsonAttrs = (metadata?.attributes as Array<{ trait_type: string; value: string }>) ?? [];
  if (jsonAttrs.length > 0) return jsonAttrs;

  const plugins = asset.plugins as Record<string, unknown> | undefined;
  const attrPlugin = plugins?.attributes as { data?: { attribute_list?: Array<{ key: string; value: string }> } } | undefined;
  const pluginList = attrPlugin?.data?.attribute_list ?? [];
  return pluginList.map((a) => ({ trait_type: a.key, value: a.value }));
}

interface CertificateData {
  id: string;
  trackName: string;
  ownerAddress: string;
  completedDate: string;
  level: number;
  xpEarned: number;
  coursesCompleted: number;
  imageUrl: string | null;
  solanaExplorerUrl: string;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("certificates");
  return (
    <button
      className="inline-flex items-center justify-center h-5 w-5 shrink-0 rounded hover:bg-muted transition-colors"
      title={label}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(t("copied"));
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}

export default function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("certificates");
  const tc = useTranslations("common");
  const certRef = useRef<HTMLDivElement>(null);

  const [cert, setCert] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (!rpcUrl) {
      setCert({
        id,
        trackName: "Superteam Academy",
        ownerAddress: "",
        completedDate: new Date().toISOString(),
        level: 0,
        xpEarned: 0,
        coursesCompleted: 0,
        imageUrl: null,
        solanaExplorerUrl: `https://explorer.solana.com/address/${id}?cluster=devnet`,
      });
      setLoading(false);
      return;
    }

    fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "get-asset",
        method: "getAsset",
        params: { id },
      }),
    })
      .then((res) => res.json())
      .then(async (json) => {
        const asset = json?.result;
        if (!asset) throw new Error("Asset not found");

        const attributes = extractAttributes(asset);

        let trackName = attributes.find((a) => a.trait_type === "track_name")?.value ?? "";
        const trackIdStr = attributes.find((a) => a.trait_type === "track_id")?.value;
        const levelStr = attributes.find((a) => a.trait_type === "level")?.value;
        const level = levelStr ? parseInt(levelStr, 10) || 0 : 0;
        const coursesCompleted = parseInt(attributes.find((a) => a.trait_type === "courses_completed")?.value ?? "0", 10);
        const totalXp = parseInt(attributes.find((a) => a.trait_type === "total_xp")?.value ?? "0", 10);

        if ((!trackName || trackName.startsWith("Track ")) && trackIdStr) {
          try {
            const tracksRes = await fetch("/api/tracks");
            if (tracksRes.ok) {
              const tracks: { trackId?: number; name: string }[] = await tracksRes.json();
              const trackId = parseInt(trackIdStr, 10);
              const match = tracks.find((t) => t.trackId === trackId);
              if (match) trackName = match.name;
            }
          } catch { /* use fallback */ }
        }
        if (!trackName) trackName = "Unknown";

        const ownerAddress = (asset.ownership as Record<string, unknown>)?.owner as string ?? "";
        const content = asset.content as Record<string, unknown> | undefined;
        const links = content?.links as Record<string, unknown> | undefined;
        const imageUrl = (links?.image as string) ?? null;

        setCert({
          id,
          trackName,
          ownerAddress,
          completedDate: (asset.created_at as string) ?? new Date().toISOString(),
          level,
          xpEarned: totalXp,
          coursesCompleted,
          imageUrl,
          solanaExplorerUrl: `https://explorer.solana.com/address/${id}?cluster=devnet`,
        });
      })
      .catch(() => {
        setCert({
          id,
          trackName: "Superteam Academy",
          ownerAddress: "",
          completedDate: new Date().toISOString(),
          level: 1,
          xpEarned: 0,
          coursesCompleted: 0,
          imageUrl: null,
          solanaExplorerUrl: `https://explorer.solana.com/address/${id}?cluster=devnet`,
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownload = useCallback(async () => {
    const el = certRef.current;
    if (!el) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `certificate-${cert?.trackName.toLowerCase().replace(/\s+/g, "-") ?? "credential"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error(t("downloadError"));
    }
  }, [cert, t]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardContent className="p-8 sm:p-12 space-y-4">
            <Skeleton className="mx-auto h-20 w-20 rounded-full" />
            <Skeleton className="mx-auto h-8 w-48" />
            <Skeleton className="mx-auto h-6 w-32" />
            <Skeleton className="mx-auto h-6 w-64" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!cert) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Certificate Visual */}
      <Card className="overflow-hidden" ref={certRef}>
        <div className="bg-gradient-to-br from-primary/20 via-gold/20 to-green-accent/20 p-1">
          <CardContent className="rounded-lg bg-card p-8 sm:p-12">
            <div className="text-center">
              {/* NFT Image */}
              <div className="mx-auto h-32 w-32 overflow-hidden rounded-xl border border-primary/20 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cert.imageUrl || "/images/credentials/sample.png"}
                  alt={`${cert.trackName} Credential`}
                  className="h-full w-full object-cover"
                />
              </div>

              <h1 className="mt-6 text-3xl font-bold text-primary">
                {t("title")}
              </h1>

              <div className="mx-auto mt-2 h-0.5 w-24 bg-primary/30" />

              <p className="mt-6 text-sm text-muted-foreground">
                {t("issuedTo")}
              </p>
              <p className="mt-1 font-mono text-sm font-semibold break-all px-4">
                {cert.ownerAddress || "Unknown"}
              </p>

              <p className="mt-6 text-sm text-muted-foreground">
                {t("forCompleting")}
              </p>
              <p className="mt-1 text-xl font-semibold">{t("trackLabel", { track: cert.trackName })}</p>

              <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
                <Badge variant="outline">{cert.trackName}</Badge>
                {cert.level > 0 && (
                  <Badge variant="secondary">{t("level", { level: cert.level })}</Badge>
                )}
                {cert.xpEarned > 0 && (
                  <Badge variant="secondary">{cert.xpEarned.toLocaleString()} XP</Badge>
                )}
                {cert.coursesCompleted > 0 && (
                  <Badge variant="secondary">{t("coursesCount", { count: cert.coursesCompleted })}</Badge>
                )}
              </div>

              <p className="mt-6 text-sm text-muted-foreground">
                {t("completedOn")}{" "}
                {new Date(cert.completedDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>

              <div className="mx-auto mt-6 h-0.5 w-24 bg-primary/30" />

              <p className="mt-4 text-xs text-muted-foreground">
                {tc("appName")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground break-all px-4">
                {t("mintAddress")}: <span className="font-mono">{cert.id}</span>
              </p>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* Actions */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="outline" className="gap-2" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          {t("download")}
        </Button>
        <Button variant="outline" className="gap-2" asChild>
          <a href={cert.solanaExplorerUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            {t("verifyOnChain")}
          </a>
        </Button>
      </div>

      {/* On-Chain Details */}
      <Card className="mt-6">
        <CardContent className="p-6 space-y-4">
          <h3 className="text-sm font-semibold">{t("onChainDetails")}</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mintAddress")}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <p className="font-mono text-sm break-all">{cert.id}</p>
                <CopyButton text={cert.id} label="Copy mint address" />
              </div>
            </div>
            {cert.ownerAddress && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("ownerAddress")}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <p className="font-mono text-sm break-all">{cert.ownerAddress}</p>
                  <CopyButton text={cert.ownerAddress} label="Copy owner address" />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Share */}
      <Card className="mt-6">
        <CardContent className="p-6">
          <h3 className="flex items-center gap-2 font-semibold">
            <Share2 className="h-4 w-4" />
            {t("share")}
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                const text = `I earned a Level ${cert.level} credential in ${cert.trackName} on @SuperteamAcademy!`;
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`, "_blank");
              }}
            >
              <XIcon className="h-4 w-4" />
              {t("shareX")}
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success(t("linkCopied"));
              }}
            >
              <Link2 className="h-4 w-4" />
              {t("copyLink")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
