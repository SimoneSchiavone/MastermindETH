import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import 'solidity-coverage'
import "hardhat-gas-reporter"

const config: HardhatUserConfig = {
  //solidity: "0.8.24",
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  gasReporter: {
    enabled: false, //	Produce gas reports with hardhat test
    currencyDisplayPrecision: 2, //Decimal precision to show nation state currency costs in
    noColors: false,
    showMethodSig:true,
    coinmarketcap: "9b1725e3-552b-41fc-8c8e-521c1323e51e", //API key to use when fetching live token price data
    L1Etherscan: "G9PM2M59A9Q9K74EMPUEQJ12IN9U5NWJWX",
    currency: "EUR",
    outputFile: "gas-report.txt",
    //token: "MATIC",
  }
};

export default config;
