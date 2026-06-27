import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
import { deployMetaCrown } from "./deploy";

dotenv.config();

const BSC_CHAIN_ID = 56n;
const REQUIRED_CONTRACT_ADDRESS_ENVS = [
  "USDT_ADDRESS",
  "ORBD_ADDRESS",
  "PANCAKE_INFINITY_ROUTER_ADDRESS",
  "PANCAKE_PERMIT2_ADDRESS",
] as const;

const REQUIRED_WALLET_ADDRESS_ENVS = [
  "TREASURY_ADDRESS",
  "AIRDROP_ADDRESS",
] as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing in nft-stake/.env`);
  return value;
}

function requireAddressEnv(name: string): string {
  const value = requireEnv(name);
  if (!ethers.isAddress(value)) throw new Error(`${name} is not a valid address: ${value}`);
  return value;
}

async function requireContractCode(name: string, address: string) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${name} has no contract code on BSC mainnet: ${address}`);
  console.log(`${name}: ${address} codeBytes=${(code.length - 2) / 2}`);
}

async function assertBscMainnetReady() {
  const providerNetwork = await ethers.provider.getNetwork();
  if (network.name !== "bsc" || providerNetwork.chainId !== BSC_CHAIN_ID) {
    throw new Error("This script only deploys to BSC mainnet. Run: npm run deploy:bsc:mainnet");
  }

  if (process.env.CONFIRM_BSC_MAINNET_DEPLOY !== "true") {
    throw new Error("Set CONFIRM_BSC_MAINNET_DEPLOY=true to confirm you are intentionally deploying to BSC mainnet.");
  }

  requireEnv("PRIVATE_KEY");
  requireEnv("BSC_RPC_URL");

  const baseURI = requireEnv("BASE_URI");
  if (!baseURI.startsWith("https://")) throw new Error("BASE_URI must be a public HTTPS URL for mainnet.");
  if (!baseURI.endsWith("/")) throw new Error("BASE_URI must end with /.");
  if (baseURI.includes("localhost") || baseURI.includes("127.0.0.1") || baseURI.includes("YOUR_DOMAIN")) {
    throw new Error("BASE_URI must not use localhost, 127.0.0.1, or a placeholder domain on mainnet.");
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const minBalance = ethers.parseEther(process.env.MIN_DEPLOYER_BNB || "0.03");

  console.log("BSC mainnet deployment preflight");
  console.log("Network:", network.name, `(${providerNetwork.chainId.toString()})`);
  console.log("Deployer:", deployer.address);
  console.log("Deployer BNB:", ethers.formatEther(balance));
  if (balance < minBalance) {
    throw new Error(`Deployer needs at least ${ethers.formatEther(minBalance)} BNB for deployment gas.`);
  }

  const addresses = new Map<string, string>();
  for (const name of REQUIRED_CONTRACT_ADDRESS_ENVS) {
    const address = requireAddressEnv(name);
    addresses.set(name, address);
    await requireContractCode(name, address);
  }
  for (const name of REQUIRED_WALLET_ADDRESS_ENVS) {
    const address = requireAddressEnv(name);
    addresses.set(name, address);
    console.log(`${name}: ${address}`);
  }

  if (addresses.get("TREASURY_ADDRESS")!.toLowerCase() === deployer.address.toLowerCase()) {
    throw new Error("TREASURY_ADDRESS must be separate from the deployer wallet for production.");
  }
  if (addresses.get("AIRDROP_ADDRESS")!.toLowerCase() === deployer.address.toLowerCase()) {
    throw new Error("AIRDROP_ADDRESS must be separate from the deployer wallet for production.");
  }

  const usdt = new ethers.Contract(addresses.get("USDT_ADDRESS")!, ["function decimals() view returns (uint8)"], ethers.provider);
  const usdtDecimals = Number(await usdt.decimals());
  console.log("USDT decimals:", usdtDecimals);
  if (usdtDecimals !== 18) throw new Error("BSC mainnet USDT should use 18 decimals. Check USDT_ADDRESS.");

  const clPath = requireEnv("PANCAKE_INFINITY_CL_PATH");
  if (!clPath.includes(";")) {
    throw new Error("PANCAKE_INFINITY_CL_PATH must include two hops for USDT -> BNB -> ORBD.");
  }
  if (!clPath.toLowerCase().includes(addresses.get("ORBD_ADDRESS")!.toLowerCase())) {
    throw new Error("PANCAKE_INFINITY_CL_PATH must include ORBD_ADDRESS.");
  }

  if (!process.env.ETHERSCAN_API_KEY?.trim()) {
    console.log("Warning: ETHERSCAN_API_KEY is missing. Deploy can continue, but verification will fail later.");
  }

  console.log("BSC mainnet preflight passed.\n");
}

async function main() {
  await assertBscMainnetReady();
  await deployMetaCrown();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
