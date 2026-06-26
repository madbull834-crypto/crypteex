const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..", "..");
const copies = [
  {
    artifact: path.join(
      projectRoot,
      "nft-stake",
      "artifacts",
      "contracts",
      "MetaCrownNFTStakeEcosystem.sol",
      "MetaCrownNFTStakeEcosystem.json"
    ),
    target: path.join(projectRoot, "frontend", "src", "abi", "MetaCrownNFTStakeEcosystem.json"),
  },
  {
    artifact: path.join(
      projectRoot,
      "nft-stake",
      "artifacts",
      "contracts",
      "MetaCrownNFTMarketplace.sol",
      "MetaCrownNFTMarketplace.json"
    ),
    target: path.join(projectRoot, "frontend", "src", "abi", "MetaCrownNFTMarketplace.json"),
  },
  {
    artifact: path.join(
      projectRoot,
      "nft-stake",
      "artifacts",
      "contracts",
      "mocks",
      "MockUSDT.sol",
      "MockUSDT.json"
    ),
    target: path.join(projectRoot, "frontend", "src", "abi", "MockUSDT.json"),
  },
];

for (const { artifact, target } of copies) {
  if (!fs.existsSync(artifact)) {
    throw new Error(`Artifact not found. Run npm run compile first: ${artifact}`);
  }

  const data = JSON.parse(fs.readFileSync(artifact, "utf8"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(data.abi, null, 2)}\n`);
  console.log(`Synced ABI: ${path.relative(projectRoot, target)}`);
}
