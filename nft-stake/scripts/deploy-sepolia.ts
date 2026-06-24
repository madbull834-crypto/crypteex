import { network } from "hardhat";
import { deployMetaCrown } from "./deploy";

async function main() {
  if (network.name !== "sepolia") {
    throw new Error("This script is for Sepolia only. Run: npx hardhat run scripts/deploy-sepolia.ts --network sepolia");
  }

  await deployMetaCrown();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
