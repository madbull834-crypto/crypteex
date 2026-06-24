import { useWeb3 } from "../context/Web3Context";
import { shortenAddress } from "../utils/format";
import { CHAIN_NAME } from "../config/contracts";

export function WalletButton() {
  const {
    account,
    isConnecting,
    walletError,
    isWrongNetwork,
    walletOptions,
    selectedWalletId,
    selectWallet,
    connect,
    disconnect,
    switchNetwork,
  } = useWeb3();

  if (!account) {
    return (
      <div className="flex flex-col items-end gap-1">
        {walletOptions.length > 1 && (
          <select
            value={selectedWalletId ?? ""}
            onChange={(event) => selectWallet(event.target.value)}
            className="max-w-44 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-700"
          >
            {walletOptions.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => connect(selectedWalletId ?? undefined)}
          disabled={isConnecting}
          className="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-neutral-900 shadow shadow-amber-300/50 transition hover:from-amber-300 hover:to-yellow-400 disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
        {walletError && <span className="max-w-xs text-right text-xs text-rose-600">{walletError}</span>}
      </div>
    );
  }

  if (isWrongNetwork) {
    return (
      <button
        onClick={switchNetwork}
        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
      >
        Switch to {CHAIN_NAME}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {shortenAddress(account)}
      </span>
      <button
        onClick={disconnect}
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-900"
      >
        Disconnect
      </button>
    </div>
  );
}
