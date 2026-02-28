"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, ExternalLink, Copy, Check, Star } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { Link } from "@/i18n/routing";
import { CREDENTIAL_IMAGE_FALLBACK } from "@/services/track-images";

export interface CredentialModalData {
  credentialAsset: string;
  signature: string;
  trackName: string;
  level: number;
  coursesCompleted: number;
  totalXp: number;
  isUpgrade: boolean;
  imageUrl: string;
}

interface CredentialModalProps {
  open: boolean;
  onClose: () => void;
  data: CredentialModalData | null;
}

export function CredentialModal({ open, onClose, data }: CredentialModalProps) {
  const t = useTranslations("credentials");
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!data) return null;

  const explorerUrl = `https://explorer.solana.com/address/${data.credentialAsset}?cluster=devnet`;
  const truncatedMint = `${data.credentialAsset.slice(0, 6)}...${data.credentialAsset.slice(-4)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(data.credentialAsset);
    setCopied(true);
    toast.success(t("mintAddressCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            {data.isUpgrade
              ? t("upgradedTitle")
              : t("mintedTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Glow effect around image */}
          <div className="credential-glow relative">
            <div className="relative h-40 w-40 overflow-hidden rounded-xl border-2 border-primary/30">
              <Image
                src={imgError ? CREDENTIAL_IMAGE_FALLBACK : data.imageUrl}
                alt={`${data.trackName} Credential`}
                fill
                className="object-cover"
                onError={() => setImgError(true)}
              />
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-bold">{data.trackName}</h3>
            <Badge variant="secondary" className="mt-1 gap-1">
              <Star className="h-3 w-3" />
              {data.level > 0 ? t("level", { level: data.level }) : ""} {t("credential")}
            </Badge>
          </div>

          {/* Stats */}
          <div className="grid w-full grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-lg font-bold">{data.coursesCompleted}</p>
              <p className="text-xs text-muted-foreground">
                {t("coursesCompleted")}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-lg font-bold">
                {data.totalXp.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{t("totalXp")}</p>
            </div>
          </div>

          {/* Mint address */}
          <div className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 font-mono text-xs">{truncatedMint}</span>
            <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground">
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Actions */}
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5 text-sm"
              asChild
            >
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {t("viewOnExplorer")}
              </a>
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-1.5 text-sm"
              asChild
            >
              <Link href={`/certificates/${data.credentialAsset}`}>
                <GraduationCap className="h-3.5 w-3.5" />
                {t("viewCertificate")}
              </Link>
            </Button>
            <Button className="flex-1 text-sm" onClick={onClose}>
              {tc("close")}
            </Button>
          </div>
        </div>

        {/* CSS-only glow animation */}
        <style jsx global>{`
          .credential-glow {
            animation: credential-pulse 2s ease-in-out 3;
          }
          @keyframes credential-pulse {
            0%, 100% { filter: drop-shadow(0 0 4px hsl(var(--primary) / 0.2)); }
            50% { filter: drop-shadow(0 0 16px hsl(var(--primary) / 0.5)); }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
