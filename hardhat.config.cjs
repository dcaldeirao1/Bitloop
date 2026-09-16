require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const privateKey = (process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "").replace(
  /^0x/,
  "",
);
const sepoliaUrl =
  process.env.SEPOLIA_RPC_URL ||
  process.env.VITE_ALCHEMY_SEPOLIA_ENDPOINT ||
  "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: sepoliaUrl.trim(),
      accounts: privateKey ? [privateKey] : [],
    },
  },
};
