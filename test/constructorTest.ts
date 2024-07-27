import { expect } from "chai";
import {time, loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre from "hardhat";

describe("Game Contract", function(){
    const colors=4; 
    const codesize=10;
    const reward=5;

    async function deployFixture() {
        const [owner, otherAccount] =await hre.ethers.getSigners();

        const MastermindGame__factory = await hre.ethers.getContractFactory("MastermindGame");
        const MastermindGame = await MastermindGame__factory.deploy(colors, codesize, reward);

        return{ owner, MastermindGame}
    }
    describe("Contract creation", function(){
        //Check that the assignment of the value is correct in case of right parameters
        it("Constructor should initialize the game parameters", async function () {
            const {owner, MastermindGame}=await loadFixture(deployFixture);
            expect(await MastermindGame.codeSize()).to.equal(codesize);
            expect(await MastermindGame.availableColors()).to.equal(colors);
            expect(await MastermindGame.noGuessedReward()).to.equal(reward);
            expect(await MastermindGame.gameManager()).to.equal(owner);
        })

        //Check the reversion in case of contract creation with incorrect paramenter
        it("Constructor should fails with color <=1", async function () {
            const [owner, otherAccount] =await hre.ethers.getSigners();
            
            const MastermindGame__factory = await hre.ethers.getContractFactory("MastermindGame");
            await expect(MastermindGame__factory.deploy(0, codesize, reward)).to.be.revertedWith("The number of available colors should be greater than 1!");
        })

        it("Constructor should fails with code size <=1", async function () {
            const [owner, otherAccount] =await hre.ethers.getSigners();
        
            const MastermindGame__factory = await hre.ethers.getContractFactory("MastermindGame");
            await expect(MastermindGame__factory.deploy(colors, 0, reward)).to.be.revertedWith("The code size should be greater than 1!");
        })

        it("Constructor should fails with reward <=0", async function () {
            const [owner, otherAccount] =await hre.ethers.getSigners();
        
            const MastermindGame__factory = await hre.ethers.getContractFactory("MastermindGame");
            await expect(MastermindGame__factory.deploy(colors, codesize, 0)).to.be.revertedWith("The extra reward for the code maker has to be greater than 0!");
        })
    })

    describe("New match creation",function(){
        //Check that the new match is created with the proper gameId
        it("Match has to be created with the proper gameId", async function () {
            const {owner, MastermindGame}=await loadFixture(deployFixture);
            const returnedId1 = await MastermindGame.createGame();
            console.log("Returned %s",returnedId1)
            expect(returnedId1.value).to.equal(0);

            const returnedId2 = await MastermindGame.createGame();
            console.log("Returned %s",returnedId2)
            expect(returnedId2.value).to.equal(1);
            
            //C'è qualcosa che non funziona nell'ottenere la risposta dalla transazione
            //I game sono registrati correttamente ma la risposta non è interpretata bene
        })
    })
  })
  