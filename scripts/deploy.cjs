const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Official Uniswap V2 on Ethereum Sepolia
const SEPOLIA_UNISWAP_V2_ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with", deployer.address);

  const usdcAddr = (
    process.env.VITE_USDC_ADDRESS ||
    "0xe8678d9669937Ed4beBF829f0953Be3C78Eeb212"
  ).trim();

  const usdc = await hre.ethers.getContractAt(
    [
      "function decimals() view returns (uint8)",
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)",
    ],
    usdcAddr,
  );
  const decimals = Number(await usdc.decimals());
  const rate = 3000n * 10n ** BigInt(decimals);

  const uniRouter =
    hre.network.name === "sepolia"
      ? (process.env.UNISWAP_V2_ROUTER || SEPOLIA_UNISWAP_V2_ROUTER)
      : hre.ethers.ZeroAddress;

  const Router = await hre.ethers.getContractFactory("MockDcaRouter");
  const router = await Router.deploy(rate, uniRouter);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("MockDcaRouter:", routerAddress, "rate", rate.toString(), "uni", uniRouter);

  const fundEth = hre.ethers.parseEther(process.env.DCA_ROUTER_ETH || "0.2");
  await (await deployer.sendTransaction({ to: routerAddress, value: fundEth })).wait();
  console.log("Funded router with", hre.ethers.formatEther(fundEth), "ETH");

  const Factory = await hre.ethers.getContractFactory("AccountFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const address = await factory.getAddress();
  console.log("AccountFactory:", address);

  const oldVault = (process.env.OLD_VAULT_ADDRESS || "").trim();
  let newVault = null;
  let migrated = null;

  if (oldVault) {
    console.log("Migrating funds from old vault", oldVault);
    const oldAccount = await hre.ethers.getContractAt(
      [
        "function owner() view returns (address)",
        "function withdrawToken(address,address,uint256)",
        "function withdraw(address,uint256)",
      ],
      oldVault,
    );

    const owner = await oldAccount.owner();
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.warn("Skip migrate: deployer is not old vault owner");
    } else {
      const bal = await usdc.balanceOf(oldVault);
      if (bal > 0n) {
        await (await oldAccount.withdrawToken(usdcAddr, deployer.address, bal)).wait();
        console.log("Withdrew", bal.toString(), "USDC from old vault");
      }
      const ethBal = await hre.ethers.provider.getBalance(oldVault);
      if (ethBal > 0n) {
        await (await oldAccount.withdraw(deployer.address, ethBal)).wait();
        console.log("Withdrew", ethBal.toString(), "wei ETH from old vault");
      }

      await (await factory.getOrCreateAccount()).wait();
      const userId = await factory.userIdOf(deployer.address);
      newVault = await factory.accountOf(userId);
      console.log("New vault:", newVault);

      const walletBal = await usdc.balanceOf(deployer.address);
      if (walletBal > 0n) {
        await (await usdc.transfer(newVault, walletBal)).wait();
        migrated = walletBal.toString();
        console.log("Deposited", migrated, "USDC into new vault");
      }
    }
  }

  const out = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    factory: address,
    dcaRouter: routerAddress,
    uniswapRouter: uniRouter,
    dcaRate: rate.toString(),
    usdc: usdcAddr,
    deployer: deployer.address,
    newVault,
    migrated,
    oldVault: oldVault || null,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);
  console.log("\nAdd to .env:");
  console.log(`VITE_ACCOUNT_FACTORY_ADDRESS=${address}`);
  console.log(`FACTORY_ADDRESS=${address}`);
  console.log(`VITE_DCA_ROUTER_ADDRESS=${routerAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
