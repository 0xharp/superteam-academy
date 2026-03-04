/**
 * Count on-chain credentials (Metaplex Core NFTs) across track collections
 * using Helius DAS `getAssetsByGroup`.
 */
export async function countOnChainCredentials(
  collectionAddresses: string[],
): Promise<number> {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!rpcUrl || collectionAddresses.length === 0) return 0;

  try {
    const counts = await Promise.all(
      collectionAddresses.map(async (collection) => {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `credential-count-${collection}`,
            method: "getAssetsByGroup",
            params: {
              groupKey: "collection",
              groupValue: collection,
              page: 1,
              limit: 1,
            },
          }),
        });
        const json = await response.json();
        return json?.result?.total ?? json?.result?.items?.length ?? 0;
      }),
    );
    return counts.reduce((sum, c) => sum + c, 0);
  } catch {
    return 0;
  }
}
