import { formatUnits, parseUnits } from "ethers";
import { USDT_DECIMALS } from "../config/contracts";

export function formatUsdt(value: bigint | number | string, fractionDigits = 2): string {
  const formatted = formatUnits(value, USDT_DECIMALS);
  const num = Number(formatted);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

export function parseUsdt(value: string): bigint {
  return parseUnits(value || "0", USDT_DECIMALS);
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0d";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatTimestamp(timestamp: bigint | number): string {
  const ms = Number(timestamp) * 1000;
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

export function bpsToPercent(bps: bigint | number): string {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}
