import type { Contract, EventLog, Log } from "ethers";
import { EVENT_CHUNK_BLOCKS, EVENT_LOOKBACK_BLOCKS } from "../config/contracts";

export async function queryRecentEvents(contract: Contract, filter: unknown): Promise<Array<EventLog | Log>> {
  const provider = contract.runner?.provider;
  if (!provider) return [];

  const latestBlock = await provider.getBlockNumber();
  const lookback = Number.isFinite(EVENT_LOOKBACK_BLOCKS) && EVENT_LOOKBACK_BLOCKS > 0 ? EVENT_LOOKBACK_BLOCKS : 50_000;
  const fromBlock = Math.max(0, latestBlock - lookback);
  const chunkSize = Number.isFinite(EVENT_CHUNK_BLOCKS) && EVENT_CHUNK_BLOCKS > 0 ? EVENT_CHUNK_BLOCKS : 10;
  const events: Array<EventLog | Log> = [];

  for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
    const end = Math.min(latestBlock, start + chunkSize - 1);
    const chunk = await contract.queryFilter(filter as never, start, end);
    events.push(...chunk);
  }

  return events;
}
