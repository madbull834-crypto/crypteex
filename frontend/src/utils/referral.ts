import { isAddress } from "ethers";

const REFERRAL_STORAGE_KEY = "crypteex.referralSponsor";

export function referralFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const value = params.get("ref") || params.get("sponsor") || "";
  if (isAddress(value)) {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, value);
    return value;
  }
  const stored = window.localStorage.getItem(REFERRAL_STORAGE_KEY) || "";
  return isAddress(stored) ? stored : "";
}

export function clearStoredReferral() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
}

export function buildReferralLink(account: string, path?: string): string {
  if (typeof window === "undefined") return "";
  const targetPath = path ?? window.location.pathname ?? "/marketplace";
  const url = new URL(targetPath, window.location.origin);
  url.searchParams.set("ref", account);
  return url.toString();
}

export function isSelfReferral(sponsor: string, account: string | null | undefined): boolean {
  return Boolean(sponsor && account && sponsor.toLowerCase() === account.toLowerCase());
}
