const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying AccountFactory with", deployer.address);

  const Factory = await hre.ethers.getContractFactory("AccountFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const address = await factory.getAddress();

  console.log("AccountFactory:", address);

  const oldVault = (process.env.OLD_VAULT_ADDRESS || "").trim();
  const usdcAddr = (
    process.env.VITE_USDC_ADDRESS ||
    "0xe8678d9669937Ed4beBF829f0953Be3C78Eeb212"
  ).trim();

  let newVault = null;
  let migrated = null;

  if (oldVault) {
    console.log("Migrating funds from old vault", oldVault);
    const usdc = await hre.ethers.getContractAt(
      ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)", "function decimals() view returns (uint8)"],
      usdcAddr,
    );
    const oldAccount = await hre.ethers.getContractAt(
      ["function owner() view returns (address)", "function withdrawToken(address,address,uint256)"],
      oldVault,
    );

    const owner = await oldAccount.owner();
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.warn("Skip migrate: deployer is not old vault owner");
    } else {
      const bal = await usdc.balanceOf(oldVault);
      if (bal > 0n) {
        await (await oldAccount.withdrawToken(usdcAddr, deployer.address, bal)).wait();
        console.log("Withdrew", bal.toString(), "from old vault to deployer");
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
