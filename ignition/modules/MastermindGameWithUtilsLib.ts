import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const codesize=5;
const turns=4;
const guesses=5;
const reward=5;

const LockModule = buildModule("MastermindGame", (m) => {
  const _codeSize = m.getParameter("_codeSize", codesize);
  const _extraReward =m.getParameter("_extraReward",reward);
  const _numberTurns = m.getParameter("_numberTurns", turns);
  const _numberGuesses =m.getParameter("_numberGuesses",guesses);
  
  const lib=m.library("Utils");
  const MastermindGame = m.contract("MastermindGame", [_codeSize, _extraReward, _numberTurns, _numberGuesses], {
    libraries: {
      Utils: lib,
    },
  });
    

  return { MastermindGame };
});

export default LockModule;
