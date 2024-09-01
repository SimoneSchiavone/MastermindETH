import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const LockModule = buildModule("UintNegotiation", (m) => {
  const Utils = m.contract("UintNegotiation");;

  return { Utils };
});

export default LockModule;
