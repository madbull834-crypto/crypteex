/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID: string;
  readonly VITE_CHAIN_NAME: string;
  readonly VITE_RPC_URL: string;
  readonly VITE_BLOCK_EXPLORER: string;
  readonly VITE_USDT_ADDRESS: string;
  readonly VITE_STAKE_ECOSYSTEM_ADDRESS: string;
  readonly VITE_MARKETPLACE_ADDRESS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  isOkxWallet?: boolean;
  isTrust?: boolean;
  _metamask?: {
    isUnlocked?: () => Promise<boolean>;
  };
  providers?: EthereumProvider[];
}

interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EthereumProvider;
}

type EIP6963AnnounceProviderEvent = CustomEvent<EIP6963ProviderDetail>;

interface Window {
  ethereum?: EthereumProvider;
}
