import { BrowserProvider, JsonRpcSigner, Contract } from "ethers";
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
  connect: () => Promise<void>;
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

function getInjectedMetaMaskProvider() {
  const ethereum = window.ethereum;
  if (!ethereum) return undefined;
  if (ethereum.providers?.length) {
    return ethereum.providers.find((provider) => provider.isMetaMask) ?? ethereum.providers[0];
  }
  return ethereum;
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const providerErrorMessage = (err: unknown) => {
    const error = err as { code?: number; message?: string; info?: { error?: { message?: string } } };
    const detail = `${error?.message || ""} ${error?.info?.error?.message || ""}`.toLowerCase();
    if (detail.includes("must has at least one account") || detail.includes("must have at least one account")) {
      return "No wallet account was exposed to this site. Unlock MetaMask, select an account for this website, and disable other wallet extensions if they are overriding MetaMask.";
    }
    if (error?.code === 4001) return "Wallet request was rejected in MetaMask.";
    if (error?.code === -32002) return "A MetaMask request is already open. Open MetaMask and complete it.";
    return error?.message || "MetaMask could not connect.";
  };

  const requestWalletAccounts = async (browserProvider: BrowserProvider, injectedProvider: EthereumProvider) => {
    try {
      await browserProvider.send("eth_requestAccounts", []);
    } catch (err) {
      const error = err as { message?: string; info?: { error?: { message?: string } } };
      const detail = `${error?.message || ""} ${error?.info?.error?.message || ""}`.toLowerCase();
      if (!detail.includes("must has at least one account") && !detail.includes("must have at least one account")) {
        throw err;
      }

      await injectedProvider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      await browserProvider.send("eth_requestAccounts", []);
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

  const connect = useCallback(async () => {
    const injectedProvider = getInjectedMetaMaskProvider();
    if (!injectedProvider) {
      setWalletError("MetaMask was not detected. Open this page in a browser with the MetaMask extension installed.");
      window.open("https://metamask.io/download/", "_blank");
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
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            }],
          });
        }
      }
      setProvider(browserProvider);
      await refreshSigner(browserProvider);
    } catch (err) {
      setWalletError(providerErrorMessage(err));
    } finally {
      setIsConnecting(false);
    }
  }, [refreshSigner]);

  const disconnect = useCallback(() => {
    setSigner(null);
    setAccount(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    const injectedProvider = getInjectedMetaMaskProvider();
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
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            },
          ],
        });
      } else {
        setWalletError(providerErrorMessage(err));
      }
    }
  }, []);

  useEffect(() => {
    const injectedProvider = getInjectedMetaMaskProvider();
    if (!injectedProvider) return;
    const browserProvider = new BrowserProvider(injectedProvider);
    setProvider(browserProvider);
    browserProvider.listAccounts().then((accounts) => {
      if (accounts.length > 0) refreshSigner(browserProvider);
      else browserProvider.getNetwork().then((n) => setChainId(Number(n.chainId)));
    });

    const handleAccountsChanged = () => refreshSigner(browserProvider);
    const handleChainChanged = () => window.location.reload();

    injectedProvider.on("accountsChanged", handleAccountsChanged);
    injectedProvider.on("chainChanged", handleChainChanged);
    return () => {
      injectedProvider.removeListener("accountsChanged", handleAccountsChanged);
      injectedProvider.removeListener("chainChanged", handleChainChanged);
    };
  }, [refreshSigner]);

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

  const ecosystemRead = useMemo(
    () => (provider && STAKE_ECOSYSTEM_ADDRESS ? new Contract(STAKE_ECOSYSTEM_ADDRESS, stakeEcosystemAbi, provider) : null),
    [provider]
  );
  const marketplaceRead = useMemo(
    () => (provider && MARKETPLACE_ADDRESS ? new Contract(MARKETPLACE_ADDRESS, marketplaceAbi, provider) : null),
    [provider]
  );
  const usdtRead = useMemo(
    () => (provider && USDT_ADDRESS ? new Contract(USDT_ADDRESS, usdtAbi, provider) : null),
    [provider]
  );

  const value: Web3State = {
    provider,
    signer,
    account,
    chainId,
    isConnecting,
    walletError,
    isWrongNetwork,
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
