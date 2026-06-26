import { network, run } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

type DeploymentInfo = {
  chainId: number;
  network: string;
  contracts: {
    usdt: string;
    mockUSDT: boolean;
    orbdSwapLocker?: string;
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
    path.join(__dirname, "..", "deployments", `${network.name}.latest.json`);

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
  if (!process.env.ETHERSCAN_API_KEY) {
    throw new Error("ETHERSCAN_API_KEY is missing in nft-stake/.env");
  }

  const deployment = loadDeployment();
  const baseURI = process.env.BASE_URI?.trim();
  if (!baseURI) {
    throw new Error("BASE_URI is missing in nft-stake/.env. It must match the value used during deployment.");
  }
  if (!baseURI.endsWith("/")) {
    throw new Error("BASE_URI must end with /. It must match the value used during deployment.");
  }
  const zero = "0x0000000000000000000000000000000000000000";

  console.log("Using deployment:");
  console.log("Network:", deployment.network, `(${deployment.chainId})`);
  console.log("USDT:", deployment.contracts.usdt, deployment.contracts.mockUSDT ? "(MockUSDT)" : "(external)");
  console.log("ORBD locker:", deployment.contracts.orbdSwapLocker || zero);
  console.log("Ecosystem:", deployment.contracts.ecosystem);
  console.log("Marketplace:", deployment.contracts.marketplace);
  console.log("Treasury:", deployment.wallets.treasury);
  console.log("Airdrop:", deployment.wallets.airdrop);
  console.log("Base URI:", baseURI);

  if (deployment.network !== network.name) {
    throw new Error(`Deployment file is for ${deployment.network}, but Hardhat network is ${network.name}`);
  }

  if (deployment.contracts.mockUSDT) {
    await verifyContract("MockUSDT", deployment.contracts.usdt, []);
  } else {
    console.log("\nSkipping USDT verification because deployment uses an external token.");
  }

  const locker = deployment.contracts.orbdSwapLocker || zero;
  if (locker !== zero) {
    await verifyContract("OrbdSwapLocker", locker, [
      deployment.contracts.usdt,
      process.env.ORBD_ADDRESS,
      process.env.PANCAKE_INFINITY_ROUTER_ADDRESS,
      process.env.PANCAKE_PERMIT2_ADDRESS,
    ]);
  }

  await verifyContract("MetaCrownNFTStakeEcosystem", deployment.contracts.ecosystem, [
    deployment.contracts.usdt,
    deployment.wallets.treasury,
    deployment.wallets.airdrop,
    baseURI,
    locker,
  ]);

  await verifyContract("MetaCrownNFTMarketplace", deployment.contracts.marketplace, [
    deployment.contracts.usdt,
    deployment.contracts.ecosystem,
  ]);

  console.log(`\n${network.name} verification completed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
