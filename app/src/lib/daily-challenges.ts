import { getAdminClient } from "@/lib/supabase/admin";

export interface DailyChallenge {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  xpReward: number;
  category: string;
}

/** Deterministic daily pick: hash the date string and mod by pool size. */
function hashDate(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

/** Fetch the active quiz pool from Supabase and pick today's challenge. */
export async function getTodaysChallenge(): Promise<DailyChallenge | null> {
  const db = getAdminClient();
  if (!db) return null;

  const { data: pool } = await db
    .from("daily_challenges")
    .select("id, question, options, correct_index, xp_reward, category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!pool || pool.length === 0) return null;

  const today = new Date().toISOString().split("T")[0];
  const index = hashDate(today) % pool.length;
  const row = pool[index];

  return {
    id: row.id,
    question: row.question,
    options: typeof row.options === "string" ? JSON.parse(row.options) : row.options,
    correctIndex: row.correct_index,
    xpReward: row.xp_reward ?? 50,
    category: row.category ?? "fundamentals",
  };
}

export async function getChallengeById(id: string): Promise<DailyChallenge | null> {
  const db = getAdminClient();
  if (!db) return null;

  const { data } = await db
    .from("daily_challenges")
    .select("id, question, options, correct_index, xp_reward, category")
    .eq("id", id)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    question: data.question,
    options: typeof data.options === "string" ? JSON.parse(data.options) : data.options,
    correctIndex: data.correct_index,
    xpReward: data.xp_reward ?? 50,
    category: data.category ?? "fundamentals",
  };
}

export function checkAnswer(correctIndex: number, selectedIndex: number): boolean {
  return correctIndex === selectedIndex;
}
