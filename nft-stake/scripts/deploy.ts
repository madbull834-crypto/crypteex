import { ethers, network, upgrades } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

function isAddress(value: string | undefined): value is string {
  return Boolean(value && ethers.isAddress(value));
}

function optionalAddress(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!ethers.isAddress(value)) {
    throw new Error(`${name} is not a valid address: ${value}`);
  }
  return value;
}

function writeDeploymentFile(fileName: string, data: Record<string, unknown>) {
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  return filePath;
}

function frontendRpcForChain(chainId: number): string {
  if (process.env.FRONTEND_RPC_URL) return process.env.FRONTEND_RPC_URL;
  if (chainId === 11155111) return process.env.SEPOLIA_RPC_URL || "";
  if (chainId === 97) return process.env.BSC_TESTNET_RPC_URL || "";
  if (chainId === 56) return process.env.BSC_RPC_URL || "";
  if (chainId === 31337) return "http://127.0.0.1:8545";
  return "";
}

function explorerForChain(chainId: number): string {
  if (process.env.FRONTEND_BLOCK_EXPLORER) return process.env.FRONTEND_BLOCK_EXPLORER;
  if (chainId === 97) return "https://testnet.bscscan.com";
  if (chainId === 56) return "https://bscscan.com";
  if (chainId === 11155111) return "https://sepolia.etherscan.io";
  return "";
}

async function tokenDecimals(tokenAddress: string): Promise<number> {
  const token = new ethers.Contract(tokenAddress, ["function decimals() view returns (uint8)"], ethers.provider);
  return Number(await token.decimals());
}

function frontendChainName(chainId: number, networkName: string): string {
  if (process.env.FRONTEND_CHAIN_NAME) return process.env.FRONTEND_CHAIN_NAME;
  if (chainId === 56) return "BNB Smart Chain";
  if (chainId === 97) return "BNB Smart Chain Testnet";
  if (chainId === 11155111) return "Sepolia";
  return networkName;
}

function resolveBaseURI(isMainnet: boolean): string {
  const value = process.env.BASE_URI?.trim() || (isMainnet ? "" : "http://127.0.0.1:5173/metadata/");
  if (!value) {
    throw new Error("BASE_URI is required for mainnet. Use a public HTTPS metadata URL, for example https://your-domain.com/metadata/");
  }
  if (!value.endsWith("/")) {
    throw new Error("BASE_URI must end with /. Example: https://your-domain.com/metadata/");
  }
  if (isMainnet && value.includes("YOUR_DOMAIN")) {
    throw new Error("Replace the BASE_URI placeholder with your real public domain before mainnet deployment.");
  }
  return value;
}

export async function deployMetaCrown() {
  const [deployer] = await ethers.getSigners();
  const providerNetwork = await ethers.provider.getNetwork();
  const chainId = Number(providerNetwork.chainId);
  const networkName = network.name;
  const isMainnet = networkName === "bsc" || chainId === 56;

  console.log("Deploying Meta Crown NFT Stake Ecosystem");
  console.log("Network:", networkName, `(${chainId})`);
  console.log("Deployer:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const treasury = optionalAddress("TREASURY_ADDRESS") || deployer.address;
  const airdrop = optionalAddress("AIRDROP_ADDRESS") || deployer.address;
  const baseURI = resolveBaseURI(isMainnet);

  let deployedMockUSDT = false;
  let usdtAddress = optionalAddress("USDT_ADDRESS");
  let orbdSwapLockerAddress = ethers.ZeroAddress;

  if (!usdtAddress) {
    if (isMainnet) {
      throw new Error("USDT_ADDRESS is required on BSC mainnet. Refusing to deploy a mock token on mainnet.");
    }

    console.log("USDT_ADDRESS not set, deploying MockUSDT for this test network...");
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const mockUSDT = await MockUSDT.deploy();
    await mockUSDT.waitForDeployment();
    usdtAddress = await mockUSDT.getAddress();
    deployedMockUSDT = true;

    const mintAmount = ethers.parseUnits(process.env.ADMIN_MOCK_USDT || "1000000", 6);
    await (await mockUSDT.mint(deployer.address, mintAmount)).wait();
    console.log("MockUSDT:", usdtAddress);
    console.log("Minted admin MockUSDT:", ethers.formatUnits(mintAmount, 6));
  }

  if (!isAddress(usdtAddress)) {
    throw new Error("Could not resolve a valid USDT address.");
  }

  const usdtDecimals = await tokenDecimals(usdtAddress);

  console.log("Treasury:", treasury);
  console.log("Airdrop:", airdrop);
  console.log("USDT:", usdtAddress, deployedMockUSDT ? "(mock)" : "(external)");
  console.log("USDT decimals:", usdtDecimals);
  console.log("Base URI:", baseURI);

  if (isMainnet) {
    const orbdAddress = optionalAddress("ORBD_ADDRESS");
    const infinityRouterAddress = optionalAddress("PANCAKE_INFINITY_ROUTER_ADDRESS");
    const permit2Address = optionalAddress("PANCAKE_PERMIT2_ADDRESS");
    if (!orbdAddress || !infinityRouterAddress || !permit2Address) {
      throw new Error("BSC mainnet requires ORBD_ADDRESS, PANCAKE_INFINITY_ROUTER_ADDRESS, and PANCAKE_PERMIT2_ADDRESS.");
    }

    const OrbdSwapLocker = await ethers.getContractFactory("OrbdSwapLocker");
    const locker = await OrbdSwapLocker.deploy(usdtAddress, orbdAddress, infinityRouterAddress, permit2Address);
    await locker.waitForDeployment();
    orbdSwapLockerAddress = await locker.getAddress();
    console.log("OrbdSwapLocker:", orbdSwapLockerAddress);
    console.log("ORBD:", orbdAddress);
    console.log("Pancake Infinity Router:", infinityRouterAddress);
    console.log("Permit2:", permit2Address);
  }

  // All three contracts are upgradeable proxies. Deploy each one uninitialized first so
  // they can reference each other's proxy addresses, then initialize in dependency order.
  const Ecosystem = await ethers.getContractFactory("MetaCrownNFTStakeEcosystem");
  const ecosystem = await upgrades.deployProxy(Ecosystem, [], { initializer: false, kind: "transparent" });
  await ecosystem.waitForDeployment();
  const ecosystemAddress = await ecosystem.getAddress();

  const RewardPools = await ethers.getContractFactory("MetaCrownRewardPools");
  const rewardPools = await upgrades.deployProxy(RewardPools, [], { initializer: false, kind: "transparent" });
  await rewardPools.waitForDeployment();
  const rewardPoolsAddress = await rewardPools.getAddress();
  console.log("MetaCrownRewardPools (proxy):", rewardPoolsAddress);

  const usdtUnit = 10n ** BigInt(usdtDecimals);
  await (await rewardPools.initialize(ecosystemAddress, usdtUnit)).wait();
  await (await ecosystem.initialize(usdtAddress, treasury, airdrop, baseURI, orbdSwapLockerAddress, rewardPoolsAddress)).wait();

  if (orbdSwapLockerAddress !== ethers.ZeroAddress) {
    const locker = await ethers.getContractAt("OrbdSwapLocker", orbdSwapLockerAddress);
    await (await locker.updateEcosystem(ecosystemAddress)).wait();
  }

  const Marketplace = await ethers.getContractFactory("MetaCrownNFTMarketplace");
  const marketplace = await upgrades.deployProxy(Marketplace, [usdtAddress, ecosystemAddress], { kind: "transparent" });
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();

  await (await ecosystem.updateNFTMarketplace(marketplaceAddress)).wait();

  const deploymentInfo = {
    project: "Meta Crown NFT Stake Ecosystem",
    network: networkName,
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      usdt: usdtAddress,
      mockUSDT: deployedMockUSDT,
      orbdSwapLocker: orbdSwapLockerAddress,
      ecosystem: ecosystemAddress,
      rewardPools: rewardPoolsAddress,
      rewardPoolsUnit: usdtUnit.toString(),
      marketplace: marketplaceAddress,
    },
    wallets: {
      treasury,
      airdrop,
    },
    frontendEnv: {
      VITE_CHAIN_ID: String(chainId),
      VITE_CHAIN_NAME: frontendChainName(chainId, networkName),
      VITE_RPC_URL: frontendRpcForChain(chainId),
      VITE_BLOCK_EXPLORER: explorerForChain(chainId),
      VITE_USDT_ADDRESS: usdtAddress,
      VITE_USDT_DECIMALS: String(usdtDecimals),
      VITE_STAKE_ECOSYSTEM_ADDRESS: ecosystemAddress,
      VITE_REWARD_POOLS_ADDRESS: rewardPoolsAddress,
      VITE_MARKETPLACE_ADDRESS: marketplaceAddress,
      VITE_ORBD_ADDRESS: process.env.VITE_ORBD_ADDRESS || process.env.ORBD_ADDRESS || "",
      VITE_PANCAKE_INFINITY_CL_PATH: process.env.VITE_PANCAKE_INFINITY_CL_PATH || process.env.PANCAKE_INFINITY_CL_PATH || "",
      VITE_PANCAKE_INFINITY_AMOUNT_OUT_MIN: process.env.VITE_PANCAKE_INFINITY_AMOUNT_OUT_MIN || "1",
      VITE_EVENT_LOOKBACK_BLOCKS: process.env.VITE_EVENT_LOOKBACK_BLOCKS || "50000",
      VITE_EVENT_CHUNK_BLOCKS: process.env.VITE_EVENT_CHUNK_BLOCKS || "1000",
      VITE_PLATFORM_FIRST_TOKEN_ID: process.env.VITE_PLATFORM_FIRST_TOKEN_ID || "0",
      VITE_PLATFORM_LAST_TOKEN_ID: process.env.VITE_PLATFORM_LAST_TOKEN_ID || "0",
      VITE_ENABLE_RESALE_SCAN: process.env.VITE_ENABLE_RESALE_SCAN || "true",
    },
  };

  const networkFile = writeDeploymentFile(`${networkName}-${chainId}.json`, deploymentInfo);
  const latestFile = writeDeploymentFile(`${networkName}.latest.json`, deploymentInfo);

  console.log("\nDeployment completed.");
  console.log("MetaCrownNFTStakeEcosystem (proxy):", ecosystemAddress);
  console.log("MetaCrownRewardPools:", rewardPoolsAddress);
  console.log("MetaCrownNFTMarketplace:", marketplaceAddress);
  console.log("USDT:", usdtAddress);
  console.log("Saved:", networkFile);
  console.log("Saved:", latestFile);
  console.log("\nFrontend env values:");
  for (const [key, value] of Object.entries(deploymentInfo.frontendEnv)) {
    console.log(`${key}=${value}`);
  }

  if (networkName !== "hardhat" && networkName !== "localhost") {
    console.log("\nOptional verify commands after block explorer indexes the contracts:");
    if (orbdSwapLockerAddress !== ethers.ZeroAddress) {
      console.log(`npx hardhat verify --network ${networkName} ${orbdSwapLockerAddress} ${usdtAddress} ${process.env.ORBD_ADDRESS} ${process.env.PANCAKE_INFINITY_ROUTER_ADDRESS} ${process.env.PANCAKE_PERMIT2_ADDRESS}`);
    }
    console.log("(all three below are proxies; hardhat-upgrades auto-detects and verifies the implementation)");
    console.log(`npx hardhat verify --network ${networkName} ${ecosystemAddress}`);
    console.log(`npx hardhat verify --network ${networkName} ${rewardPoolsAddress}`);
    console.log(`npx hardhat verify --network ${networkName} ${marketplaceAddress}`);
  }
}

if (require.main === module) {
  deployMetaCrown().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
