import { ethers, network } from "hardhat";
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

async function main() {
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
  const baseURI = process.env.BASE_URI || "https://api.dicebear.com/9.x/adventurer/svg?seed=metacrown-";

  let deployedMockUSDT = false;
  let usdtAddress = optionalAddress("USDT_ADDRESS");

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

  console.log("Treasury:", treasury);
  console.log("Airdrop:", airdrop);
  console.log("USDT:", usdtAddress, deployedMockUSDT ? "(mock)" : "(external)");
  console.log("Base URI:", baseURI);

  const Ecosystem = await ethers.getContractFactory("MetaCrownNFTStakeEcosystem");
  const ecosystem = await Ecosystem.deploy(usdtAddress, treasury, airdrop, baseURI);
  await ecosystem.waitForDeployment();
  const ecosystemAddress = await ecosystem.getAddress();

  const Marketplace = await ethers.getContractFactory("MetaCrownNFTMarketplace");
  const marketplace = await Marketplace.deploy(usdtAddress, ecosystemAddress);
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
      ecosystem: ecosystemAddress,
      marketplace: marketplaceAddress,
    },
    wallets: {
      treasury,
      airdrop,
    },
    frontendEnv: {
      VITE_CHAIN_ID: String(chainId),
      VITE_CHAIN_NAME: networkName,
      VITE_RPC_URL: frontendRpcForChain(chainId),
      VITE_BLOCK_EXPLORER: explorerForChain(chainId),
      VITE_USDT_ADDRESS: usdtAddress,
      VITE_STAKE_ECOSYSTEM_ADDRESS: ecosystemAddress,
      VITE_MARKETPLACE_ADDRESS: marketplaceAddress,
    },
  };

  const networkFile = writeDeploymentFile(`${networkName}-${chainId}.json`, deploymentInfo);
  const latestFile = writeDeploymentFile(`${networkName}.latest.json`, deploymentInfo);

  console.log("\nDeployment completed.");
  console.log("MetaCrownNFTStakeEcosystem:", ecosystemAddress);
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
    console.log(`npx hardhat verify --network ${networkName} ${ecosystemAddress} ${usdtAddress} ${treasury} ${airdrop} "${baseURI}"`);
    console.log(`npx hardhat verify --network ${networkName} ${marketplaceAddress} ${usdtAddress} ${ecosystemAddress}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
