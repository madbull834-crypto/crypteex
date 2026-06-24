export const USDT_DECIMALS = 6;

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 11155111);
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME ?? "Sepolia";
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? "https://rpc.sepolia.org";
export const BLOCK_EXPLORER = import.meta.env.VITE_BLOCK_EXPLORER ?? "https://sepolia.etherscan.io";

export const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS ?? "";
export const STAKE_ECOSYSTEM_ADDRESS = import.meta.env.VITE_STAKE_ECOSYSTEM_ADDRESS ?? "";
export const MARKETPLACE_ADDRESS = import.meta.env.VITE_MARKETPLACE_ADDRESS ?? "";

export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

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
