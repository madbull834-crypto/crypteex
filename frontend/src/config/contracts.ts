export const USDT_DECIMALS = Number(import.meta.env.VITE_USDT_DECIMALS ?? 6);

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 11155111);
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME ?? "Sepolia";
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? "https://rpc.sepolia.org";
export const BLOCK_EXPLORER = import.meta.env.VITE_BLOCK_EXPLORER ?? "https://sepolia.etherscan.io";

export const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS ?? "";
export const STAKE_ECOSYSTEM_ADDRESS = import.meta.env.VITE_STAKE_ECOSYSTEM_ADDRESS ?? "";
export const MARKETPLACE_ADDRESS = import.meta.env.VITE_MARKETPLACE_ADDRESS ?? "";
export const ORBD_ADDRESS = import.meta.env.VITE_ORBD_ADDRESS ?? "";
export const PANCAKE_INFINITY_CL_PATH = import.meta.env.VITE_PANCAKE_INFINITY_CL_PATH ?? "";
export const EVENT_LOOKBACK_BLOCKS = Number(import.meta.env.VITE_EVENT_LOOKBACK_BLOCKS ?? 50_000);
export const EVENT_CHUNK_BLOCKS = Number(import.meta.env.VITE_EVENT_CHUNK_BLOCKS ?? 10);
export const PLATFORM_FIRST_TOKEN_ID = Number(import.meta.env.VITE_PLATFORM_FIRST_TOKEN_ID ?? 0);
export const PLATFORM_LAST_TOKEN_ID = Number(import.meta.env.VITE_PLATFORM_LAST_TOKEN_ID ?? 0);
export const ENABLE_RESALE_SCAN = (import.meta.env.VITE_ENABLE_RESALE_SCAN ?? "false") === "true";

export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
export const NATIVE_CURRENCY =
  CHAIN_ID === 56 || CHAIN_ID === 97
    ? { name: "BNB", symbol: "BNB", decimals: 18 }
    : { name: "Ether", symbol: "ETH", decimals: 18 };

export const PACKAGE_NAMES: Record<number, string> = {
  1: "Silver",
  2: "Gold",
  3: "Diamond",
};

export const POSITION_NAMES: Record<number, string> = {
  0: "None",
  1: "Fixed Package",
  2: "Stake Package",
};

export function explorerAddressUrl(address: string) {
  return `${BLOCK_EXPLORER}/address/${address}`;
}

export function explorerTxUrl(hash: string) {
  return `${BLOCK_EXPLORER}/tx/${hash}`;
}

export function contractsConfigured() {
  return Boolean(USDT_ADDRESS && STAKE_ECOSYSTEM_ADDRESS && MARKETPLACE_ADDRESS);
}
