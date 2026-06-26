import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

type DeploymentInfo = {
  contracts?: {
    ecosystem?: string;
  };
};

function readDeploymentAddress(chainId: string): string | undefined {
  const candidates = [
    process.env.DEPLOYMENT_FILE,
    path.join(__dirname, "..", "deployments", `${network.name}.latest.json`),
    path.join(__dirname, "..", "deployments", `${network.name}-${chainId}.json`),
  ].filter(Boolean) as string[];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as DeploymentInfo;
    if (data.contracts?.ecosystem && ethers.isAddress(data.contracts.ecosystem)) {
      return data.contracts.ecosystem;
    }
  }

  return undefined;
}

function getPackageId(index: number): number {
  const packageId = process.env.PACKAGE_ID ? Number(process.env.PACKAGE_ID) : 0;
  if (packageId) {
    if (![1, 2, 3].includes(packageId)) {
      throw new Error("PACKAGE_ID must be 1, 2, or 3.");
    }
    return packageId;
  }
  return (index % 3) + 1;
}

async function main() {
  const [admin] = await ethers.getSigners();
  const providerNetwork = await ethers.provider.getNetwork();
  const count = Number(process.env.NFT_COUNT || "100");
  const ecosystemAddress = process.env.STAKE_ECOSYSTEM_ADDRESS || readDeploymentAddress(providerNetwork.chainId.toString());

  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error("NFT_COUNT must be an integer from 1 to 1000.");
  }

  if (!ecosystemAddress || !ethers.isAddress(ecosystemAddress)) {
    throw new Error(
      "Set STAKE_ECOSYSTEM_ADDRESS or run the deploy script first so deployments/<network>.latest.json exists."
    );
  }

  const code = await ethers.provider.getCode(ecosystemAddress);
  if (code === "0x") {
    throw new Error(
      `No contract code found at STAKE_ECOSYSTEM_ADDRESS=${ecosystemAddress} on ${network.name}. ` +
      "Use the deployed MetaCrownNFTStakeEcosystem address from deployments/<network>.latest.json, not the deployer wallet."
    );
  }

  const ecosystem = await ethers.getContractAt("MetaCrownNFTStakeEcosystem", ecosystemAddress, admin);
  const owner = await ecosystem.owner();
  if (owner.toLowerCase() !== admin.address.toLowerCase()) {
    throw new Error(`Connected wallet ${admin.address} is not contract owner ${owner}. Use the admin PRIVATE_KEY.`);
  }

  console.log("Admin minting fixed NFTs for sale");
  console.log("Network:", network.name, `(${providerNetwork.chainId.toString()})`);
  console.log("Admin:", admin.address);
  console.log("Ecosystem:", ecosystemAddress);
  console.log("NFT_COUNT:", count);
  console.log("Package mode:", process.env.PACKAGE_ID ? `only package ${process.env.PACKAGE_ID}` : "round-robin Silver/Gold/Diamond");

  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const mintedTokenIds: string[] = [];

  for (let i = 0; i < count; i += 1) {
    counts[getPackageId(i)] += 1;
  }

  let minted = 0;
  for (const packageId of [1, 2, 3]) {
    const packageCount = counts[packageId];
    if (packageCount === 0) continue;

    const tx = await ecosystem.adminBulkMintFixedNFTsForSale(packageId, packageCount);
    const receipt = await tx.wait();
    minted += packageCount;

    for (const log of receipt?.logs || []) {
      try {
        const parsed = ecosystem.interface.parseLog(log);
        if (parsed?.name === "NFTListed") {
          mintedTokenIds.push(parsed.args.tokenId.toString());
        }
      } catch {
        // Ignore non-ecosystem logs.
      }
    }

    console.log(`Minted ${minted}/${count}`);
  }

  console.log("\nAdmin mint completed.");
  console.log(`Silver: ${counts[1]}, Gold: ${counts[2]}, Diamond: ${counts[3]}`);
  console.log("First token:", mintedTokenIds[0] || "n/a");
  console.log("Last token:", mintedTokenIds[mintedTokenIds.length - 1] || "n/a");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
