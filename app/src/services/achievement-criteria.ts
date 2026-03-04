import criteriaData from "@/data/achievement-criteria.json";

const criteriaMap: Record<string, string> = criteriaData;

export function getCriteria(achievementId: string): string | undefined {
  return criteriaMap[achievementId];
}

export function getAllCriteria(): Record<string, string> {
  return criteriaMap;
}
