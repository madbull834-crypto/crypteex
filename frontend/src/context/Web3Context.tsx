import { BrowserProvider, JsonRpcProvider, JsonRpcSigner, Contract } from "ethers";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  CHAIN_ID,
  CHAIN_ID_HEX,
  CHAIN_NAME,
  MARKETPLACE_ADDRESS,
  NATIVE_CURRENCY,
  RPC_URL,
  STAKE_ECOSYSTEM_ADDRESS,
  USDT_ADDRESS,
} from "../config/contracts";
import stakeEcosystemAbi from "../abi/MetaCrownNFTStakeEcosystem.json";
import marketplaceAbi from "../abi/MetaCrownNFTMarketplace.json";
import usdtAbi from "../abi/MockUSDT.json";

interface Web3State {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  walletError: string | null;
  isWrongNetwork: boolean;
  walletOptions: { id: string; name: string }[];
  selectedWalletId: string | null;
  selectWallet: (walletId: string) => void;
  connect: (walletId?: string) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  ecosystem: Contract | null;
  marketplace: Contract | null;
  usdt: Contract | null;
  ecosystemRead: Contract | null;
  marketplaceRead: Contract | null;
  usdtRead: Contract | null;
}

const Web3Ctx = createContext<Web3State | undefined>(undefined);

type InjectedWallet = {
  id: string;
  name: string;
  provider: EthereumProvider;
};

function injectedWalletName(provider: EthereumProvider) {
  if (provider.isMetaMask) return "MetaMask";
  if (provider.isRabby) return "Rabby";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isBraveWallet) return "Brave Wallet";
  if (provider.isOkxWallet) return "OKX Wallet";
  if (provider.isTrust) return "Trust Wallet";
  return "Browser Wallet";
}

function legacyInjectedWallets(): InjectedWallet[] {
  const ethereum = window.ethereum;
  if (!ethereum) return [];
  if (ethereum.providers?.length) {
    return ethereum.providers.map((provider, index) => ({
      id: `legacy-${index}-${injectedWalletName(provider)}`,
      name: injectedWalletName(provider),
      provider,
    }));
  }
  return [{ id: "legacy-window-ethereum", name: injectedWalletName(ethereum), provider: ethereum }];
}

function dedupeWallets(wallets: InjectedWallet[]) {
  const byProvider = new Map<EthereumProvider, InjectedWallet>();
  for (const wallet of wallets) {
    if (!byProvider.has(wallet.provider)) byProvider.set(wallet.provider, wallet);
  }
  return [...byProvider.values()];
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);
  const [activeWallet, setActiveWallet] = useState<InjectedWallet | null>(null);

  const walletOptions = useMemo(
    () => wallets.map((wallet) => ({ id: wallet.id, name: wallet.name })),
    [wallets]
  );

  const selectWallet = useCallback((walletId: string) => {
    const wallet = wallets.find((candidate) => candidate.id === walletId);
    if (wallet) setActiveWallet(wallet);
  }, [wallets]);

  const providerErrorMessage = (err: unknown) => {
    const error = err as { code?: number; message?: string; info?: { error?: { message?: string } } };
    const detail = `${error?.message || ""} ${error?.info?.error?.message || ""}`.toLowerCase();
    if (detail.includes("must has at least one account") || detail.includes("must have at least one account")) {
      return "No wallet account was exposed to this site. Unlock your wallet, connect this domain, and select at least one account.";
    }
    if (error?.code === 4001) return "Wallet request was rejected.";
    if (error?.code === -32002) return "A wallet request is already open. Open your wallet and complete it.";
    return error?.message || "Wallet could not connect.";
  };

  const requestWalletAccounts = async (browserProvider: BrowserProvider, injectedProvider: EthereumProvider) => {
    try {
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      if (Array.isArray(accounts) && accounts.length > 0) return;
    } catch (err) {
      const error = err as { code?: number; message?: string; info?: { error?: { message?: string } } };
      const detail = `${error?.message || ""} ${error?.info?.error?.message || ""}`.toLowerCase();
      if (error?.code === 4001 || error?.code === -32002) throw err;
      if (!detail.includes("must has at least one account") && !detail.includes("must have at least one account")) {
        throw err;
      }
    }

    try {
      await injectedProvider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch (err) {
      const error = err as { code?: number; message?: string; info?: { error?: { message?: string } } };
      const detail = `${error?.message || ""} ${error?.info?.error?.message || ""}`.toLowerCase();
      if (error?.code === 4001) throw err;
      if (!detail.includes("already pending") && !detail.includes("request already pending")) {
        throw err;
      }
    }

    const accounts = await browserProvider.send("eth_requestAccounts", []);
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error("Wallet must have at least one account selected for this site.");
    }
  };

  const refreshSigner = useCallback(async (browserProvider: BrowserProvider) => {
    const network = await browserProvider.getNetwork();
    setChainId(Number(network.chainId));
    const accounts = await browserProvider.listAccounts();
    if (accounts.length === 0) {
      setSigner(null);
      setAccount(null);
      return;
    }
    const activeSigner = await browserProvider.getSigner();
    setSigner(activeSigner);
    setAccount(await activeSigner.getAddress());
  }, []);

  const connect = useCallback(async (walletId?: string) => {
    const wallet =
      (walletId ? wallets.find((candidate) => candidate.id === walletId) : undefined) ??
      activeWallet ??
      wallets[0] ??
      legacyInjectedWallets()[0];
    const injectedProvider = wallet?.provider;
    if (!wallet || !injectedProvider) {
      setWalletError("No browser wallet was detected. Install MetaMask, Rabby, Coinbase Wallet, OKX Wallet, or another injected EVM wallet.");
      return;
    }
    setWalletError(null);
    setIsConnecting(true);
    try {
      const browserProvider = new BrowserProvider(injectedProvider, "any");
      await requestWalletAccounts(browserProvider, injectedProvider);
      const network = await browserProvider.getNetwork();
      if (Number(network.chainId) !== CHAIN_ID) {
        try {
          await injectedProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN_ID_HEX }],
          });
        } catch (err: unknown) {
          if ((err as { code?: number })?.code !== 4902) throw err;
          await injectedProvider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: CHAIN_ID_HEX,
              chainName: CHAIN_NAME,
              rpcUrls: [RPC_URL],
              nativeCurrency: NATIVE_CURRENCY,
            }],
          });
        }
      }
      setActiveWallet(wallet);
      setProvider(browserProvider);
      await refreshSigner(browserProvider);
    } catch (err) {
      setWalletError(providerErrorMessage(err));
    } finally {
      setIsConnecting(false);
    }
  }, [activeWallet, wallets, refreshSigner]);

  const disconnect = useCallback(() => {
    setSigner(null);
    setAccount(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    const injectedProvider = activeWallet?.provider ?? wallets[0]?.provider ?? legacyInjectedWallets()[0]?.provider;
    if (!injectedProvider) return;
    setWalletError(null);
    try {
      await injectedProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        await injectedProvider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: CHAIN_NAME,
              rpcUrls: [RPC_URL],
              nativeCurrency: NATIVE_CURRENCY,
            },
          ],
        });
      } else {
        setWalletError(providerErrorMessage(err));
      }
    }
  }, [activeWallet, wallets]);

  useEffect(() => {
    const discovered = new Map<string, InjectedWallet>();
    const addWallet = (wallet: InjectedWallet) => {
      discovered.set(wallet.id, wallet);
      setWallets(dedupeWallets([...discovered.values(), ...legacyInjectedWallets()]));
    };

    for (const wallet of legacyInjectedWallets()) addWallet(wallet);

    const handleAnnounceProvider = (event: Event) => {
      const { detail } = event as EIP6963AnnounceProviderEvent;
      addWallet({
        id: detail.info.uuid,
        name: detail.info.name,
        provider: detail.provider,
      });
    };

    window.addEventListener("eip6963:announceProvider", handleAnnounceProvider);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => window.removeEventListener("eip6963:announceProvider", handleAnnounceProvider);
  }, []);

  useEffect(() => {
    const wallet = activeWallet ?? wallets[0];
    const injectedProvider = wallet?.provider;
    if (!injectedProvider) return;
    const browserProvider = new BrowserProvider(injectedProvider);
    setProvider(browserProvider);
    browserProvider
      .listAccounts()
      .then((accounts) => {
        if (accounts.length > 0) refreshSigner(browserProvider);
        else browserProvider.getNetwork().then((n) => setChainId(Number(n.chainId))).catch(() => undefined);
      })
      .catch(() => undefined);

    const handleAccountsChanged = () => refreshSigner(browserProvider);
    const handleChainChanged = () => window.location.reload();

    injectedProvider.on("accountsChanged", handleAccountsChanged);
    injectedProvider.on("chainChanged", handleChainChanged);
    return () => {
      injectedProvider.removeListener("accountsChanged", handleAccountsChanged);
      injectedProvider.removeListener("chainChanged", handleChainChanged);
    };
  }, [activeWallet, wallets, refreshSigner]);

  const isWrongNetwork = Boolean(account) && chainId !== null && chainId !== CHAIN_ID;

  const ecosystem = useMemo(
    () => (signer && STAKE_ECOSYSTEM_ADDRESS ? new Contract(STAKE_ECOSYSTEM_ADDRESS, stakeEcosystemAbi, signer) : null),
    [signer]
  );
  const marketplace = useMemo(
    () => (signer && MARKETPLACE_ADDRESS ? new Contract(MARKETPLACE_ADDRESS, marketplaceAbi, signer) : null),
    [signer]
  );
  const usdt = useMemo(
    () => (signer && USDT_ADDRESS ? new Contract(USDT_ADDRESS, usdtAbi, signer) : null),
    [signer]
  );

  const readProvider = useMemo(() => new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true }), []);

  const ecosystemRead = useMemo(
    () => (STAKE_ECOSYSTEM_ADDRESS ? new Contract(STAKE_ECOSYSTEM_ADDRESS, stakeEcosystemAbi, readProvider) : null),
    [readProvider]
  );
  const marketplaceRead = useMemo(
    () => (MARKETPLACE_ADDRESS ? new Contract(MARKETPLACE_ADDRESS, marketplaceAbi, readProvider) : null),
    [readProvider]
  );
  const usdtRead = useMemo(
    () => (USDT_ADDRESS ? new Contract(USDT_ADDRESS, usdtAbi, readProvider) : null),
    [readProvider]
  );

  const value: Web3State = {
    provider,
    signer,
    account,
    chainId,
    isConnecting,
    walletError,
    isWrongNetwork,
    walletOptions,
    selectedWalletId: activeWallet?.id ?? wallets[0]?.id ?? null,
    selectWallet,
    connect,
    disconnect,
    switchNetwork,
    ecosystem,
    marketplace,
    usdt,
    ecosystemRead,
    marketplaceRead,
    usdtRead,
  };

  return <Web3Ctx.Provider value={value}>{children}</Web3Ctx.Provider>;
}

export function useWeb3() {
  const ctx = useContext(Web3Ctx);
  if (!ctx) throw new Error("useWeb3 must be used inside Web3Provider");
  return ctx;
}
