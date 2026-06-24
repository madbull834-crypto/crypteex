import { network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type DeploymentInfo = {
  chainId: number;
  network: string;
  contracts: {
    usdt: string;
    mockUSDT: boolean;
    ecosystem: string;
    marketplace: string;
  };
  wallets: {
    treasury: string;
    airdrop: string;
  };
};

function loadDeployment(): DeploymentInfo {
  const filePath =
    process.env.DEPLOYMENT_FILE ||
    path.join(__dirname, "..", "deployments", "sepolia.latest.json");

  if (!fs.existsSync(filePath)) {
    throw new Error(`Deployment file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as DeploymentInfo;
}

async function verifyContract(contractName: string, address: string, constructorArguments: unknown[]) {
  console.log(`\nVerifying ${contractName}: ${address}`);

  try {
    await run("verify:verify", {
      address,
      constructorArguments,
    });
    console.log(`Verified ${contractName}`);
  } catch (error: any) {
    const message = String(error?.message || error);
    if (message.toLowerCase().includes("already verified")) {
      console.log(`${contractName} is already verified`);
      return;
    }
    throw error;
  }
}

async function main() {
  if (network.name !== "sepolia") {
    throw new Error("This script is for Sepolia only. Run: npm run verify:sepolia");
  }

  if (!process.env.ETHERSCAN_API_KEY) {
    throw new Error("ETHERSCAN_API_KEY is missing in .env");
  }

  const deployment = loadDeployment();
  if (deployment.chainId !== 11155111) {
    throw new Error(`Deployment file is not Sepolia. Expected chainId 11155111, got ${deployment.chainId}`);
  }

  const baseURI = process.env.BASE_URI || "https://api.dicebear.com/9.x/adventurer/svg?seed=metacrown-";

  console.log("Using deployment:");
  console.log("USDT:", deployment.contracts.usdt, deployment.contracts.mockUSDT ? "(MockUSDT)" : "(external)");
  console.log("Ecosystem:", deployment.contracts.ecosystem);
  console.log("Marketplace:", deployment.contracts.marketplace);
  console.log("Treasury:", deployment.wallets.treasury);
  console.log("Airdrop:", deployment.wallets.airdrop);
  console.log("Base URI:", baseURI);

  if (deployment.contracts.mockUSDT) {
    await verifyContract("MockUSDT", deployment.contracts.usdt, []);
  } else {
    console.log("\nSkipping USDT verification because deployment uses an external token.");
  }

  await verifyContract("MetaCrownNFTStakeEcosystem", deployment.contracts.ecosystem, [
    deployment.contracts.usdt,
    deployment.wallets.treasury,
    deployment.wallets.airdrop,
    baseURI,
  ]);

  await verifyContract("MetaCrownNFTMarketplace", deployment.contracts.marketplace, [
    deployment.contracts.usdt,
    deployment.contracts.ecosystem,
  ]);

  console.log("\nSepolia verification completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
