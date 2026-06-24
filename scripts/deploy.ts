import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("Starting deployment...");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const isBscMainnet = network.chainId === 56n;
  console.log("Deploying with account:", deployer.address);

  // Configuration
  const USDT_ADDRESS = process.env.USDT_ADDRESS || ethers.ZeroAddress;
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
  const AIRDROP_ADDRESS = process.env.AIRDROP_ADDRESS || deployer.address;
  let ORBD_ADDRESS = process.env.ORBD_ADDRESS || (isBscMainnet
    ? "0x4E24C684a90f2c1f9030a5608A6c3A6fa4E854f5"
    : ethers.ZeroAddress);
  let INFINITY_ROUTER_ADDRESS = process.env.PANCAKE_INFINITY_ROUTER_ADDRESS || (isBscMainnet
    ? "0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB"
    : ethers.ZeroAddress);
  let PERMIT2_ADDRESS = process.env.PANCAKE_PERMIT2_ADDRESS || (isBscMainnet
    ? "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768"
    : ethers.ZeroAddress);
  const BASE_URI = "https://metadata.metacrown.io/";

  console.log("Configuration:");
  console.log("  USDT Address:", USDT_ADDRESS);
  console.log("  Treasury Address:", TREASURY_ADDRESS);
  console.log("  Airdrop Address:", AIRDROP_ADDRESS);
  console.log("  ORBD Address:", ORBD_ADDRESS);
  console.log("  Infinity Router Address:", INFINITY_ROUTER_ADDRESS);
  console.log("  Permit2 Address:", PERMIT2_ADDRESS);
  console.log("  Base URI:", BASE_URI);

  // If USDT is not deployed on this chain, deploy a mock
  let usdtAddress = USDT_ADDRESS;
  if (USDT_ADDRESS === ethers.ZeroAddress) {
    console.log("\nDeploying mock USDT token...");
    const TestToken = await ethers.getContractFactory("TestToken");
    const usdt = await TestToken.deploy("Tether USD", "USDT", 6);
    await usdt.waitForDeployment();
    usdtAddress = await usdt.getAddress();
    console.log("Mock USDT deployed at:", usdtAddress);
  }

  if (ORBD_ADDRESS === ethers.ZeroAddress) {
    const TestToken = await ethers.getContractFactory("TestToken");
    const orbd = await TestToken.deploy("OrbitX Token", "ORBD", 18);
    await orbd.waitForDeployment();
    ORBD_ADDRESS = await orbd.getAddress();
  }

  if (PERMIT2_ADDRESS === ethers.ZeroAddress) {
    const MockPermit2 = await ethers.getContractFactory("MockPermit2");
    const permit2 = await MockPermit2.deploy();
    await permit2.waitForDeployment();
    PERMIT2_ADDRESS = await permit2.getAddress();
  }

  if (INFINITY_ROUTER_ADDRESS === ethers.ZeroAddress) {
    const MockInfinityRouter = await ethers.getContractFactory("MockInfinityRouter");
    const router = await MockInfinityRouter.deploy(
      PERMIT2_ADDRESS,
      usdtAddress,
      ORBD_ADDRESS,
      10n ** 12n
    );
    await router.waitForDeployment();
    INFINITY_ROUTER_ADDRESS = await router.getAddress();
    const orbd = await ethers.getContractAt("TestToken", ORBD_ADDRESS);
    await orbd.mint(INFINITY_ROUTER_ADDRESS, ethers.parseUnits("1000000000", 18));
  }

  // Deploy MetaCrownNFT
  console.log("\nDeploying MetaCrownNFT contract...");
  const MetaCrownNFT = await ethers.getContractFactory("MetaCrownNFT");

  const contract = await MetaCrownNFT.deploy(
    usdtAddress,
    TREASURY_ADDRESS,
    AIRDROP_ADDRESS,
    ORBD_ADDRESS,
    INFINITY_ROUTER_ADDRESS,
    PERMIT2_ADDRESS,
    BASE_URI
  );

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("MetaCrownNFT deployed at:", contractAddress);

  // Log package configuration
  console.log("\nPackage Configuration:");
  const silverPkg = await contract.getPackage(1);
  const goldPkg = await contract.getPackage(2);
  const diamondPkg = await contract.getPackage(3);

  console.log("  Silver:", {
    nftValue: ethers.formatUnits(silverPkg.nftValue, 6),
    platformFee: ethers.formatUnits(silverPkg.platformFee, 6),
  });

  console.log("  Gold:", {
    nftValue: ethers.formatUnits(goldPkg.nftValue, 6),
    platformFee: ethers.formatUnits(goldPkg.platformFee, 6),
  });

  console.log("  Diamond:", {
    nftValue: ethers.formatUnits(diamondPkg.nftValue, 6),
    platformFee: ethers.formatUnits(diamondPkg.platformFee, 6),
  });

  // Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      MetaCrownNFT: contractAddress,
      USDT: usdtAddress,
      ORBD: ORBD_ADDRESS,
      InfinityRouter: INFINITY_ROUTER_ADDRESS,
      Permit2: PERMIT2_ADDRESS,
    },
    config: {
      treasury: TREASURY_ADDRESS,
      airdrop: AIRDROP_ADDRESS,
      baseURI: BASE_URI,
    },
  };

  console.log("\nDeployment completed successfully!");
  console.log("Deployment Info:", JSON.stringify(deploymentInfo, null, 2));

  // Return addresses for scripting
  return {
    metaCrownNFT: contractAddress,
    usdt: usdtAddress,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
