"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { toast } from "sonner";
import type { OnchainAcademy } from "@/lib/solana/types";
import IDL from "@/lib/solana/idl.json";
import { getCoursePDA, getEnrollmentPDA } from "@/lib/solana/enrollments";
import { parseEnrollError } from "@/hooks/use-enrollment";
import { CredentialModal, type CredentialModalData } from "@/components/credential-modal";
import { Coins, X, Loader2, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ClosableEnrollment {
  courseId: string;
  title: string;
  /** True when course is finalized (all lessons done / completedAt set) */
  isFinalized?: boolean;
}

export function RentReclaimBanner({ courses }: { courses: ClosableEnrollment[] }) {
  const t = useTranslations("dashboard");
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const [dismissed, setDismissed] = useState(false);
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set());
  const [closingId, setClosingId] = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [credentialModal, setCredentialModal] = useState<CredentialModalData | null>(null);

  // Only show finalized courses (completed ones that need credential collection)
  const visible = courses.filter((c) => !closedIds.has(c.courseId) && c.isFinalized);

  if (dismissed || visible.length === 0) return null;

  async function handleClose(courseId: string) {
    if (!publicKey || !signTransaction || !signAllTransactions) return;
    setClosingId(courseId);
    try {
      const provider = new AnchorProvider(
        connection,
        { publicKey, signTransaction, signAllTransactions },
        { commitment: "confirmed" },
      );
      const prog = new Program<OnchainAcademy>(IDL as OnchainAcademy, provider);
      await prog.methods
        .closeEnrollment()
        .accountsPartial({
          learner: publicKey,
          course: getCoursePDA(courseId),
          enrollment: getEnrollmentPDA(courseId, publicKey),
        })
        .rpc();
      setClosedIds((prev) => new Set([...prev, courseId]));
      toast.success(t("rentReclaimSuccess"));
    } catch (err) {
      toast.error(parseEnrollError(err));
    } finally {
      setClosingId(null);
    }
  }

  async function handleCollectAndClose(courseId: string) {
    setCollectingId(courseId);
    try {
      const res = await fetch("/api/credentials/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Credential collection failed");
      }
      const data = await res.json();
      // Auto-trigger close enrollment while showing celebration modal
      handleClose(courseId);
      setCredentialModal({
        credentialAsset: data.credentialAsset,
        signature: data.signature,
        trackName: data.trackName,
        level: data.level,
        coursesCompleted: data.coursesCompleted,
        totalXp: data.totalXp,
        isUpgrade: data.isUpgrade,
        imageUrl: data.imageUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to collect credential";
      toast.error(message);
    } finally {
      setCollectingId(null);
    }
  }

  function handleCredentialModalClose() {
    setCredentialModal(null);
  }

  return (
    <>
      <div className="mb-6">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t("collectCredentialNfts")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("collectCredentialDescription")}
                </p>
                <div className="mt-3 space-y-2">
                  {visible.map((c) => (
                    <div
                      key={c.courseId}
                      className="flex items-center justify-between gap-4 rounded-md bg-background/60 px-3 py-2"
                    >
                      <span className="truncate text-sm">{c.title}</span>
                      <Button
                        size="sm"
                        className="h-7 shrink-0 gap-1 text-xs"
                        disabled={collectingId === c.courseId || closingId === c.courseId}
                        onClick={() => handleCollectAndClose(c.courseId)}
                      >
                        {collectingId === c.courseId ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            {t("collecting")}
                          </>
                        ) : closingId === c.courseId ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            {t("closing")}
                          </>
                        ) : (
                          <>
                            <GraduationCap className="h-3 w-3" />
                            {t("collectAndClose")}
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <CredentialModal
        open={!!credentialModal}
        onClose={handleCredentialModalClose}
        data={credentialModal}
      />
    </>
  );
}
