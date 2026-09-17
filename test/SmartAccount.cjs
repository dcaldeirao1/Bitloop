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

    await (await usdc.mint(sender.address, 1_000_000n)).wait();
    await (await usdc.connect(sender).transfer(accountAddr, 1_000_000n)).wait();

    await (await account.connect(keeper).processToken(await usdc.getAddress())).wait();

    expect(await usdc.balanceOf(savings.address)).to.equal(200_000n);
    expect(await usdc.balanceOf(accountAddr)).to.equal(800_000n);
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

    const amount = 500_000n;
    const interval = 60;

    await (await usdc.mint(accountAddr, 2_000_000n)).wait();
    await (
      await account.connect(owner).setRecurring(token, recipient.address, amount, interval, true)
    ).wait();

    await (await account.connect(keeper).executeRecurring()).wait();
    expect(await usdc.balanceOf(recipient.address)).to.equal(amount);

    await expect(account.connect(keeper).executeRecurring()).to.be.revertedWithCustomError(
      account,
      "RecurringNotDue",
    );

    await time.increase(interval);
    await (await account.connect(keeper).executeRecurring()).wait();
    expect(await usdc.balanceOf(recipient.address)).to.equal(amount * 2n);
  });

  it("DCAs USDC into ETH on an interval", async function () {
    const [owner, keeper] = await ethers.getSigners();

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

    const rate = 3_000n * 10n ** 6n;
    const Router = await ethers.getContractFactory("MockDcaRouter");
    const router = await Router.deploy(rate, ethers.ZeroAddress);
    await router.waitForDeployment();
    await (await owner.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("1") })).wait();

    const amount = 30n * 10n ** 6n;
    const interval = 60;
    await (await usdc.mint(accountAddr, amount * 3n)).wait();

    await (
      await account
        .connect(owner)
        .setDca(token, ethers.ZeroAddress, await router.getAddress(), amount, interval, 0, true)
    ).wait();

    const ethBefore = await ethers.provider.getBalance(accountAddr);
    await (await account.connect(keeper).executeDca()).wait();
    const ethAfter = await ethers.provider.getBalance(accountAddr);

    expect(ethAfter - ethBefore).to.equal(ethers.parseEther("0.01"));
    expect(await usdc.balanceOf(accountAddr)).to.equal(amount * 2n);
  });

  it("DCAs ETH into a custom ERC-20 token", async function () {
    const [owner, keeper] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("AccountFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();
    await (await factory.connect(owner).createAccount()).wait();
    const accountAddr = await factory.accountOf(await factory.userIdOf(owner.address));
    const account = await ethers.getContractAt("SmartAccount", accountAddr);

    const Mock = await ethers.getContractFactory("MockERC20");
    const outToken = await Mock.deploy();
    await outToken.waitForDeployment();

    const Router = await ethers.getContractFactory("MockDcaRouter");
    const router = await Router.deploy(3_000n * 10n ** 6n, ethers.ZeroAddress);
    await router.waitForDeployment();

    const ethAmount = ethers.parseEther("0.05");
    await (await owner.sendTransaction({ to: accountAddr, value: ethAmount * 2n })).wait();

    await (
      await account
        .connect(owner)
        .setDca(
          ethers.ZeroAddress,
          await outToken.getAddress(),
          await router.getAddress(),
          ethAmount,
          60,
          0,
          true,
        )
    ).wait();

    await (await account.connect(keeper).executeDca()).wait();
    expect(await ethers.provider.getBalance(accountAddr)).to.equal(ethAmount);
    expect(await outToken.balanceOf(accountAddr)).to.equal(ethAmount);
  });
});
