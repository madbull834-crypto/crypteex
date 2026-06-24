import { NavLink, Outlet } from "react-router-dom";
import { WalletButton } from "./WalletButton";
import { contractsConfigured } from "../config/contracts";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/staking", label: "Staking" },
  { to: "/marketplace", label: "NFT Marketplace" },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {!contractsConfigured() && (
        <div className="bg-rose-600 px-4 py-2 text-center text-sm text-white">
          Contract addresses are not configured. Set VITE_USDT_ADDRESS, VITE_STAKE_ECOSYSTEM_ADDRESS and
          VITE_MARKETPLACE_ADDRESS in frontend/.env.local.
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="bg-gradient-to-r from-amber-500 via-yellow-500 to-emerald-600 bg-clip-text text-xl font-bold tracking-tight text-transparent">
              Crypteex
            </span>
            <nav className="hidden gap-6 sm:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `text-sm font-medium transition ${
                      isActive ? "text-emerald-600" : "text-neutral-500 hover:text-neutral-900"
                    }`
                  }
                  end={item.to === "/"}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <WalletButton />
        </div>
        <nav className="flex gap-4 border-t border-neutral-200 px-6 py-2 sm:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? "text-emerald-600" : "text-neutral-500"}`
              }
              end={item.to === "/"}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="border-t border-neutral-200 px-6 py-8 text-center text-sm text-neutral-500">
        Crypteex &middot; NFT Marketplace &amp; Staking
      </footer>
    </div>
  );
}
