import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const REQUIRED_ADDRESSES = [
  "USDT_ADDRESS",
  "ORBD_ADDRESS",
  "PANCAKE_INFINITY_ROUTER_ADDRESS",
  "PANCAKE_PERMIT2_ADDRESS",
];

const OPTIONAL_ADDRESSES = [
  "TREASURY_ADDRESS",
  "AIRDROP_ADDRESS",
];

async function requireContractCode(name: string, address: string) {
  if (!ethers.isAddress(address)) throw new Error(`${name} is not a valid address: ${address}`);
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${name} has no contract code on BSC mainnet: ${address}`);
  console.log(`${name}: ${address} codeBytes=${(code.length - 2) / 2}`);
}

async function main() {
  const providerNetwork = await ethers.provider.getNetwork();
  if (network.name !== "bsc" || providerNetwork.chainId !== 56n) {
    throw new Error(`Run on BSC mainnet only: npm run preflight:bsc`);
  }

  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is missing in nft-stake/.env");
  if (!process.env.BSC_RPC_URL) throw new Error("BSC_RPC_URL is missing in nft-stake/.env");

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Network:", network.name, `(${providerNetwork.chainId.toString()})`);
  console.log("Deployer:", deployer.address);
  console.log("Deployer BNB:", ethers.formatEther(balance));
  if (balance === 0n) throw new Error("Deployer has no BNB for gas.");

  for (const name of REQUIRED_ADDRESSES) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is missing in nft-stake/.env`);
    await requireContractCode(name, value);
  }

  for (const name of OPTIONAL_ADDRESSES) {
    const value = process.env[name];
    if (value && !ethers.isAddress(value)) throw new Error(`${name} is not a valid address: ${value}`);
  }

  const usdt = new ethers.Contract(process.env.USDT_ADDRESS!, ["function decimals() view returns (uint8)"], ethers.provider);
  const decimals = Number(await usdt.decimals());
  console.log("USDT decimals:", decimals);
  if (decimals !== 18) {
    console.log("Warning: expected BSC mainnet USDT to use 18 decimals. Confirm this token before deployment.");
  }

  const clPath = process.env.PANCAKE_INFINITY_CL_PATH || process.env.VITE_PANCAKE_INFINITY_CL_PATH;
  if (!clPath) {
    throw new Error("PANCAKE_INFINITY_CL_PATH is missing in nft-stake/.env");
  }
  if (!clPath.includes(";")) {
    console.log("Warning: PANCAKE_INFINITY_CL_PATH has one hop. Expected USDT -> BNB -> ORBD to use two hops.");
  }

  console.log("\nBSC mainnet preflight passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
