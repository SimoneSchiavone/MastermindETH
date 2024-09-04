import { HardhatUserConfig, vars } from "hardhat/config";
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
    enabled: true, //	Produce gas reports with hardhat test
    currencyDisplayPrecision: 2, //Decimal precision to show nation state currency costs in
    noColors: false,
    reportFormat:"terminal",
    showMethodSig:true,
    coinmarketcap: vars.get("CoinMarketCap"), //API key to use when fetching live token price data
    L1Etherscan: vars.get("EtherScan"),
    currency: "EUR",
    outputFile: "gas-report.txt",
  }
};

export default config;
