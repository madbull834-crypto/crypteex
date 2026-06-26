import { isAddress } from "ethers";

export function referralFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const value = params.get("ref") || params.get("sponsor") || "";
  return isAddress(value) ? value : "";
}

export function buildReferralLink(account: string, path = "/marketplace"): string {
  if (typeof window === "undefined") return "";
  const url = new URL(path, window.location.origin);
  url.searchParams.set("ref", account);
  return url.toString();
}

export function isSelfReferral(sponsor: string, account: string | null | undefined): boolean {
  return Boolean(sponsor && account && sponsor.toLowerCase() === account.toLowerCase());
}
