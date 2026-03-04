import { Connection } from "@solana/web3.js";
import type { ConfirmedSignatureInfo } from "@solana/web3.js";
import { XP_MINT, PROGRAM_ID } from "@/lib/solana/on-chain";

// --- Types ---

export interface XpMintRecord {
  walletAddress: string;
  amount: number;
  source: "lesson" | "course" | "creator_reward" | "achievement" | "reward";
  courseId: string | null;
  achievementId: string | null;
  signature: string;
  timestamp: number;
}

interface HeliusTokenBalanceChange {
  mint: string;
  rawTokenAmount: { tokenAmount: string; decimals: number };
  userAccount: string;
}

interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  accountData: Array<{
    account: string;
    tokenBalanceChanges: HeliusTokenBalanceChange[];
  }>;
  instructions: Array<{
    programId: string;
    accounts: string[];
    data: string;
    innerInstructions: Array<{
      programId: string;
      accounts: string[];
      data: string;
    }>;
  }>;
}

export interface OnChainSyncService {
  syncXpTransactions(lastSignature?: string): Promise<{
    records: XpMintRecord[];
    latestSignature: string | null;
  }>;
}

class HeliusSyncService implements OnChainSyncService {
  private connection: Connection;
  private apiKey: string;

  constructor(rpcUrl: string, apiKey: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.apiKey = apiKey;
  }

  async syncXpTransactions(lastSignature?: string): Promise<{
    records: XpMintRecord[];
    latestSignature: string | null;
  }> {
    // Build reverse maps for PDA → courseId / achievementId
    const pdaToCourseId = new Map<string, string>();
    const pdaToAchievementId = new Map<string, string>();

    try {
      const { program } = await import("@/lib/solana/program");
      const [courseAccounts, achAccounts] = await Promise.all([
        program.account.course.all(),
        program.account.achievementType.all(),
      ]);
      for (const c of courseAccounts) {
        pdaToCourseId.set(c.publicKey.toBase58(), c.account.courseId);
      }
      for (const a of achAccounts) {
        pdaToAchievementId.set(a.publicKey.toBase58(), a.account.achievementId);
      }
    } catch {
      // If program fetch fails, records will have null courseId/achievementId
    }

    const allRecords: XpMintRecord[] = [];
    let cursor: string | undefined;
    let latestSignature: string | null = null;

    while (true) {
      const sigInfos: ConfirmedSignatureInfo[] =
        await this.connection.getSignaturesForAddress(
          XP_MINT,
          {
            before: cursor,
            until: lastSignature || undefined,
            limit: 1000,
          },
        );

      if (sigInfos.length === 0) break;

      if (!latestSignature) {
        latestSignature = sigInfos[0].signature;
      }

      const signatures = sigInfos.map((s) => s.signature);
      const txs = await this.fetchEnhancedTransactions(signatures);

      for (const tx of txs) {
        const records = this.parseTransaction(tx, pdaToCourseId, pdaToAchievementId);
        allRecords.push(...records);
      }

      if (sigInfos.length < 1000) break;
      cursor = sigInfos[sigInfos.length - 1].signature;
    }

    return { records: allRecords, latestSignature };
  }

  private async fetchEnhancedTransactions(
    signatures: string[],
  ): Promise<HeliusEnhancedTransaction[]> {
    if (signatures.length === 0) return [];

    const results: HeliusEnhancedTransaction[] = [];
    const CHUNK_SIZE = 100;
    const THROTTLE_MS = 1000;

    const isDevnet = this.connection.rpcEndpoint.includes("devnet");
    const baseUrl = isDevnet
      ? "api-devnet.helius.xyz"
      : "api.helius.xyz";

    for (let i = 0; i < signatures.length; i += CHUNK_SIZE) {
      const chunk = signatures.slice(i, i + CHUNK_SIZE);
      const url = `https://${baseUrl}/v0/transactions?api-key=${this.apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: chunk }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Helius REST API ${response.status}: ${errorText}`);
      }

      const data: HeliusEnhancedTransaction[] = await response.json();
      results.push(...data);

      if (i + CHUNK_SIZE < signatures.length) {
        await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
      }
    }

    return results;
  }

  private parseTransaction(
    tx: HeliusEnhancedTransaction,
    pdaToCourseId: Map<string, string>,
    pdaToAchievementId: Map<string, string>,
  ): XpMintRecord[] {
    const xpMint = XP_MINT.toBase58();
    const progId = PROGRAM_ID.toBase58();
    const records: XpMintRecord[] = [];

    // Detect instruction type by account count and xp_mint position per IDL:
    //   reward_xp:         6 accounts, accounts[2] = xpMint
    //   complete_lesson:    8 accounts, accounts[5] = xpMint
    //   finalize_course:   10 accounts, accounts[7] = xpMint
    //   award_achievement: 14 accounts, accounts[8] = xpMint
    let source: XpMintRecord["source"] = "reward";
    let coursePda: string | null = null;
    let achievementTypePda: string | null = null;
    let creatorAta: string | null = null;

    for (const inst of tx.instructions) {
      if (inst.programId !== progId) continue;

      if (inst.accounts.length === 6 && inst.accounts[2] === xpMint) {
        source = "reward";
        break;
      }
      if (inst.accounts.length === 8 && inst.accounts[5] === xpMint) {
        source = "lesson";
        coursePda = inst.accounts[1];
        break;
      }
      if (inst.accounts.length === 10 && inst.accounts[7] === xpMint) {
        source = "course";
        coursePda = inst.accounts[1];
        creatorAta = inst.accounts[5];
        break;
      }
      if (inst.accounts.length >= 14 && inst.accounts[8] === xpMint) {
        source = "achievement";
        achievementTypePda = inst.accounts[1];
        break;
      }
    }

    const resolvedCourseId = coursePda ? (pdaToCourseId.get(coursePda) ?? null) : null;
    const resolvedAchievementId = achievementTypePda ? (pdaToAchievementId.get(achievementTypePda) ?? null) : null;

    // Extract XP amounts from tokenBalanceChanges
    for (const account of tx.accountData) {
      for (const change of account.tokenBalanceChanges) {
        if (change.mint !== xpMint) continue;

        const rawAmount = parseFloat(change.rawTokenAmount.tokenAmount);
        const decimals = change.rawTokenAmount.decimals;
        const amount = rawAmount / Math.pow(10, decimals);

        if (amount > 0) {
          // For finalize_course, distinguish learner XP from creator reward
          const recordSource = (source === "course" && creatorAta && change.userAccount === creatorAta)
            ? "creator_reward" as const
            : source;

          records.push({
            walletAddress: change.userAccount,
            amount,
            source: recordSource,
            courseId: resolvedCourseId,
            achievementId: resolvedAchievementId,
            signature: tx.signature,
            timestamp: tx.timestamp,
          });
        }
      }
    }

    // Deduplicate by wallet+amount within the same transaction
    const seen = new Set<string>();
    return records.filter((r) => {
      const key = `${r.walletAddress}-${r.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// Singleton
let syncServiceInstance: OnChainSyncService | null = null;

export function getSyncService(): OnChainSyncService {
  if (syncServiceInstance) return syncServiceInstance;

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const apiKey = process.env.HELIUS_API_KEY;

  if (!rpcUrl) throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL not configured");
  if (!apiKey) throw new Error("HELIUS_API_KEY not configured");

  syncServiceInstance = new HeliusSyncService(rpcUrl, apiKey);
  return syncServiceInstance;
}
