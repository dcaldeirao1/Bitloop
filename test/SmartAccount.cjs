const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SmartAccount", function () {
  it("splits 20% of newly received USDC when processToken is called", async function () {
    const [owner, savings, sender, keeper] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("AccountFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    await (await factory.connect(owner).createAccount()).wait();
    const accountAddr = await factory.accountOf(await factory.userIdOf(owner.address));
    const account = await ethers.getContractAt("SmartAccount", accountAddr);

    const Mock = await ethers.getContractFactory("MockERC20");
    const usdc = await Mock.deploy();
    await usdc.waitForDeployment();

    await (await account.connect(owner).setSplit(await usdc.getAddress(), savings.address, 2000, true)).wait();

    await (await usdc.mint(sender.address, 1_000_000n)).wait(); // 1 USDC (6 decimals)
    await (await usdc.connect(sender).transfer(accountAddr, 1_000_000n)).wait();

    await (await account.connect(keeper).processToken(await usdc.getAddress())).wait();

    expect(await usdc.balanceOf(savings.address)).to.equal(200_000n);
    expect(await usdc.balanceOf(accountAddr)).to.equal(800_000n);

    await (await account.connect(keeper).processToken(await usdc.getAddress())).wait();
    expect(await usdc.balanceOf(savings.address)).to.equal(200_000n);
  });

  it("sends a fixed USDC amount on an interval via executeRecurring", async function () {
    const [owner, recipient, keeper] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("AccountFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    await (await factory.connect(owner).createAccount()).wait();
    const accountAddr = await factory.accountOf(await factory.userIdOf(owner.address));
    const account = await ethers.getContractAt("SmartAccount", accountAddr);

    const Mock = await ethers.getContractFactory("MockERC20");
    const usdc = await Mock.deploy();
    await usdc.waitForDeployment();
    const token = await usdc.getAddress();

    const amount = 500_000n; // 0.5 USDC
    const interval = 60; // 1 minute

    await (await usdc.mint(accountAddr, 2_000_000n)).wait();
    await (
      await account.connect(owner).setRecurring(token, recipient.address, amount, interval, true)
    ).wait();

    await (await account.connect(keeper).executeRecurring()).wait();
    expect(await usdc.balanceOf(recipient.address)).to.equal(amount);
    expect(await usdc.balanceOf(accountAddr)).to.equal(1_500_000n);

    await expect(account.connect(keeper).executeRecurring()).to.be.revertedWithCustomError(
      account,
      "RecurringNotDue",
    );

    await time.increase(interval);
    await (await account.connect(keeper).executeRecurring()).wait();
    expect(await usdc.balanceOf(recipient.address)).to.equal(amount * 2n);
  });
});
