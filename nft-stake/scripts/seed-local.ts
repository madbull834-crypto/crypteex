import { ethers } from "hardhat";

const DEFAULT_ECOSYSTEM = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const DEFAULT_USDT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  const signers = await ethers.getSigners();
  const owner = signers[0];
  const network = await ethers.provider.getNetwork();
  const isLocal = network.chainId === 31337n || network.chainId === 1337n;
  const ecosystemAddress = isLocal ? DEFAULT_ECOSYSTEM : (process.env.STAKE_ECOSYSTEM_ADDRESS || DEFAULT_ECOSYSTEM);
  const usdtAddress = isLocal ? DEFAULT_USDT : (process.env.USDT_ADDRESS || DEFAULT_USDT);

  const ecosystem = await ethers.getContractAt(
    "MetaCrownNFTStakeEcosystem",
    ecosystemAddress,
    owner
  );
  const usdt = await ethers.getContractAt("MockUSDT", usdtAddress, owner);

  const nftCount = Number(process.env.NFT_COUNT || "200");
  if (!Number.isInteger(nftCount) || nftCount < 1 || nftCount > 300) {
    throw new Error("NFT_COUNT must be an integer from 1 to 300");
  }

  const counts = [0, 0, 0, 0];
  for (let i = 0; i < nftCount; ++i) {
    const packageId = (i % 3) + 1;
    counts[packageId] += 1;
  }
  for (let packageId = 1; packageId <= 3; ++packageId) {
    if (counts[packageId] > 0) {
      await (await ecosystem.adminBulkMintFixedNFTsForSale(packageId, counts[packageId])).wait();
    }
  }

  const testBalance = ethers.parseUnits("100000", 6);
  for (const account of signers.slice(1, 6)) {
    await (await usdt.mint(account.address, testBalance)).wait();
  }

  const rewardFunding = ethers.parseUnits("500000", 6);
  await (await usdt.approve(ecosystemAddress, rewardFunding)).wait();
  await (await ecosystem.fundRewardPool(rewardFunding)).wait();

  console.log(`Seeded ${nftCount} NFTs (${counts[1]} Silver, ${counts[2]} Gold, ${counts[3]} Diamond).`);
  console.log("Funded accounts #1-#5 with 100,000 mock USDT each.");
  console.log("Funded the ecosystem reward pool with 500,000 mock USDT.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
