import { AbiCoder, getAddress, ZeroAddress } from "ethers";
import { ACTIONS, ACTION_CONSTANTS, ActionsPlanner } from "@pancakeswap/infinity-sdk";
import { CHAIN_ID, ORBD_ADDRESS, PANCAKE_INFINITY_CL_PATH, USDT_ADDRESS } from "../config/contracts";

export type OrbdRoute = {
  minimumOrbdOut: bigint;
  commands: string;
  inputs: string[];
};

type InfinityPathHop = {
  intermediateCurrency: `0x${string}`;
  fee: number;
  hooks: `0x${string}`;
  poolManager: `0x${string}`;
  hookData: `0x${string}`;
  parameters: `0x${string}`;
};

const abi = AbiCoder.defaultAbiCoder();

function orbdSwapBps(packageId: number) {
  if (packageId === 1) return 500;
  if (packageId === 2) return 1000;
  if (packageId === 3) return 200;
  throw new Error("Unknown NFT package for ORBD swap route.");
}

function asAddress(value: string, label: string): `0x${string}` {
  if (value.toLowerCase() === ZeroAddress.toLowerCase()) return ZeroAddress as `0x${string}`;
  try {
    return getAddress(value) as `0x${string}`;
  } catch {
    throw new Error(`${label} is not a valid address.`);
  }
}

function parsePancakeInfinityClPath(pathConfig: string): InfinityPathHop[] {
  const hops = pathConfig
    .split(";")
    .map((hop) => hop.trim())
    .filter(Boolean);

  if (hops.length === 0) {
    throw new Error("VITE_PANCAKE_INFINITY_CL_PATH is empty.");
  }

  return hops.map((hop, index) => {
    const [intermediateCurrency, fee, hooks, poolManager, parameters] = hop.split(",").map((part) => part.trim());
    if (!intermediateCurrency || !fee || !hooks || !poolManager || !parameters) {
      throw new Error(`VITE_PANCAKE_INFINITY_CL_PATH hop ${index + 1} is invalid.`);
    }

    return {
      intermediateCurrency: asAddress(intermediateCurrency, `CL path hop ${index + 1} intermediateCurrency`),
      fee: Number(fee),
      hooks: asAddress(hooks, `CL path hop ${index + 1} hooks`),
      poolManager: asAddress(poolManager, `CL path hop ${index + 1} poolManager`),
      hookData: "0x",
      parameters: parameters as `0x${string}`,
    };
  });
}

export async function getOrbdRouteForPlatformBuy(
  tokenId: bigint,
  usdtAmount: bigint,
  packageId: number
): Promise<OrbdRoute> {
  void tokenId;

  if (CHAIN_ID !== 56) {
    return { minimumOrbdOut: 0n, commands: "0x", inputs: [] };
  }

  if (!USDT_ADDRESS || !ORBD_ADDRESS || !PANCAKE_INFINITY_CL_PATH) {
    throw new Error("BSC ORBD route is not configured. Set VITE_ORBD_ADDRESS and VITE_PANCAKE_INFINITY_CL_PATH.");
  }

  const swapBps = orbdSwapBps(packageId);
  const swapAmount = (usdtAmount * BigInt(swapBps)) / 10000n;
  if (swapAmount === 0n) {
    throw new Error("ORBD swap amount is zero.");
  }

  const planner = new ActionsPlanner();
  planner.add(ACTIONS.SETTLE, [asAddress(USDT_ADDRESS, "VITE_USDT_ADDRESS"), swapAmount, false]);
  planner.add(ACTIONS.CL_SWAP_EXACT_IN, [
    {
      currencyIn: asAddress(USDT_ADDRESS, "VITE_USDT_ADDRESS"),
      path: parsePancakeInfinityClPath(PANCAKE_INFINITY_CL_PATH),
      amountIn: swapAmount,
      amountOutMinimum: 0n,
    },
  ]);
  planner.add(ACTIONS.TAKE, [
    asAddress(ORBD_ADDRESS, "VITE_ORBD_ADDRESS"),
    ACTION_CONSTANTS.MSG_SENDER as `0x${string}`,
    ACTION_CONSTANTS.OPEN_DELTA,
  ]);

  return {
    minimumOrbdOut: 0n,
    commands: "0x10",
    inputs: [abi.encode(["bytes", "bytes[]"], [planner.encodeActions(), planner.encodePlans()])],
  };
}
