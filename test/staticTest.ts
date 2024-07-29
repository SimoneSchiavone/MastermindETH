import { expect } from "chai";
import {time, loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre from "hardhat";

describe("Game Contract", function(){
    const colors=4; 
    const codesize=10;
    const reward=5;

    async function onlyDeployFixture() {
        const [owner, otherAccount] =await hre.ethers.getSigners();

        const MastermindGame__factory = await hre.ethers.getContractFactory("MastermindGame");
        const MastermindGame = await MastermindGame__factory.deploy(colors, codesize, reward);

        return{ owner, MastermindGame}
    }

    async function deployAndMatchCreateFixture() {
        const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
        expect(await MastermindGame.createGame());
        return { owner, MastermindGame};
    }

    describe("Contract creation", function(){
        //Check that the assignment of the value is correct in case of right parameters
        it("Constructor should initialize the game parameters", async function () {
            const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
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
        //Checks that the new match is created with the proper gameId
        it("Match has to be created with the proper gameId", async function () {
            const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
            expect(await MastermindGame.createGame()).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address,0);
            expect(await MastermindGame.createGame()).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address,1);
        })

        //Checks that the new match is created with the proper creator address and "joiner" address
        it("Match has to be created with the proper creator address", async function () {
            const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
            await MastermindGame.createGame();
            expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
            expect(MastermindGame.getMatchJoiner(0)).to.be.revertedWith("This game is waiting for an opponent!");
        })
    })

    describe("Match join",function(){
        describe("Case ID given by the user", function(){
            it("Creator cannot join again in the same match", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
                //For the first match created the id will be surely 0
                await expect(MastermindGame.joinMatchWithId(0)).to.be.revertedWith("You cannot join a match created by yourself!");
            })
            
        })
    })
  })
  