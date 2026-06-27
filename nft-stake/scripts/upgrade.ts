import { ethers, network, upgrades } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

type DeploymentInfo = {
  network: string;
  chainId: number;
  contracts: {
    ecosystem: string;
    rewardPools: string;
    marketplace: string;
  };
};

const TARGETS = {
  ecosystem: "MetaCrownNFTStakeEcosystem",
  rewardPools: "MetaCrownRewardPools",
  marketplace: "MetaCrownNFTMarketplace",
} as const;

type TargetName = keyof typeof TARGETS;

function loadDeployment(): DeploymentInfo {
  const filePath =
    process.env.DEPLOYMENT_FILE || path.join(__dirname, "..", "deployments", `${network.name}.latest.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Deployment file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as DeploymentInfo;
}

async function upgradeOne(name: TargetName, proxyAddress: string) {
  console.log(`\n${TARGETS[name]}`);
  console.log("Proxy:", proxyAddress);

  const previousImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("Current implementation:", previousImplementation);

  const Factory = await ethers.getContractFactory(TARGETS[name]);
  const upgraded = await upgrades.upgradeProxy(proxyAddress, Factory);
  await upgraded.waitForDeployment();

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation:", newImplementation);

  if (newImplementation === previousImplementation) {
    console.log("Bytecode unchanged; no new implementation was deployed.");
  } else {
    console.log("Upgraded. Proxy address is unchanged.");
  }
}

async function main() {
  const deployment = loadDeployment();
  if (deployment.network !== network.name) {
    throw new Error(`Deployment file is for ${deployment.network}, but Hardhat network is ${network.name}`);
  }

  // UPGRADE_CONTRACT=ecosystem|rewardPools|marketplace upgrades just that proxy.
  // Omit it (default) to upgrade all three.
  const requested = process.env.UPGRADE_CONTRACT?.trim() as TargetName | undefined;
  const targets: TargetName[] = requested ? [requested] : (Object.keys(TARGETS) as TargetName[]);

  for (const name of targets) {
    if (!(name in TARGETS)) {
      throw new Error(`Unknown UPGRADE_CONTRACT "${name}". Expected one of: ${Object.keys(TARGETS).join(", ")}`);
    }
  }

  console.log("Network:", network.name, `(${deployment.chainId})`);

  for (const name of targets) {
    await upgradeOne(name, deployment.contracts[name]);
  }

  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nOptional verify commands once the block explorer indexes the new implementation(s):");
    for (const name of targets) {
      console.log(`npx hardhat verify --network ${network.name} ${deployment.contracts[name]}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
