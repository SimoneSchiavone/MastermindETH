import { expect } from "chai";
import {time, loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre, { ethers } from "hardhat";

describe("Game Contract", function(){
    const colors=4; 
    const codesize=10;
    const reward=5;

    async function onlyDeployFixture() {
        const [owner] =await hre.ethers.getSigners();

        const MastermindGame__factory = await hre.ethers.getContractFactory("MastermindGame");
        const MastermindGame = await MastermindGame__factory.deploy(colors, codesize, reward);

        return{ owner, MastermindGame}
    }

    async function deployAndMatchCreateFixture() {
        const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
        await MastermindGame.createMatch();
        return { owner, MastermindGame};
    }

    async function deployAndPrivateMatchCreateFixture() {
        const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
        const [own, addr1]= await ethers.getSigners();
        await MastermindGame.createPrivateMatch(addr1);
        return { owner, MastermindGame};
    }

    async function deployMatchCreateMatchJoinFixture() {
        const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
        const [own, addr1]= await ethers.getSigners();
        await MastermindGame.connect(addr1).joinMatchWithId(0);
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
        describe("Public match creation",function(){
            //Checks that the new match is created with the proper gameId
            it("Match has to be created with the proper gameId", async function () {
                const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
                expect(await MastermindGame.createMatch()).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address,0);
                expect(await MastermindGame.createMatch()).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address,1);
            })

            //Checks that the new match is created with the proper creator address and "joiner" address
            it("Match has to be created with the proper creator address", async function () {
                const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
                await MastermindGame.createMatch();
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWith("This game is waiting for an opponent!");
            })
        })
        describe("Private match creation", function(){
            //Checks that the new match is created with the proper gameId
            it("Match has to be created with the proper gameId", async function () {
                const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
                const [own, addr1]=await ethers.getSigners();
                expect(await MastermindGame.createPrivateMatch(addr1.address)).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address,0);
                expect(await MastermindGame.createPrivateMatch(addr1.address)).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address,1);
            })

            //Checks that the new match is created with the proper creator address and "joiner" address
            it("Match has to be created with the proper addresses", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndPrivateMatchCreateFixture);
                
                const [own, addr1]=await ethers.getSigners();
                
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })
        })
        
    })

    describe("Match join",function(){
        describe("Case ID given by the user", function(){
            it("Creator cannot join again in the same match", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
                //For the first match created the id will be surely 0
                await expect(MastermindGame.joinMatchWithId(0)).to.be.revertedWith("You cannot join a match created by yourself!");
            })
            
            it("Cannot join a match which doesn't exist", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
                //For the first match created the id will be surely 0 hence match with id 99 does not exits
                await expect(MastermindGame.joinMatchWithId(99)).to.be.revertedWith("There is no match with that id");
            })
            
            it("Fails to join a full match", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
                
                const [own, addr1,adrr2]= await ethers.getSigners();
                //first join OK
                await MastermindGame.connect(addr1).joinMatchWithId(0);
                //Second join from a different user should be reverted
                await expect(MastermindGame.connect(adrr2).joinMatchWithId(0)).to.be.revertedWith("This match is already full!");
            })
            
            it("Fails to join a private match where we are not invited", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndPrivateMatchCreateFixture);
                //private match created by own in order to play with addr1
                const [own, addr1,addr2]= await ethers.getSigners();
                await expect(MastermindGame.connect(addr2).joinMatchWithId(0)).to.be.revertedWith("You are not authorized to join this match!");
                await expect(MastermindGame.connect(addr1).joinMatchWithId(0)).not.to.be.reverted;
            })
            
            it("Correct join by a second user in a public match", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
                
                const [own, addr1]= await ethers.getSigners();
                //call done from another address
                await expect(MastermindGame.connect(addr1).joinMatchWithId(0)).not.to.be.reverted;
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })

            it("Correct join by a second user in a private match", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndPrivateMatchCreateFixture);
                
                const [own, addr1]= await ethers.getSigners();
                //call done from another address
                await expect(MastermindGame.connect(addr1).joinMatchWithId(0)).not.to.be.reverted;
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })
            
        })
        
        describe("Case ID NOT given by the user", function(){
            it("Revert in case of no matches available", async function () {
                const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);

                //No game has been created hence the call should fail
                await expect(MastermindGame.joinMatch()).to.revertedWith("Currently no matches are available, try to create a new one!");
            })
            
            it("Revert in case of join a match created by ourself", async function(){
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);  
                await expect(MastermindGame.joinMatch()).to.be.revertedWith("You cannot join a match created by yourself, try again!");
            })
            it("Correctly joins", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
                
                const [own, addr1]= await ethers.getSigners();
                //second player joins with success
                expect(await MastermindGame.connect(addr1).joinMatch()).to.emit(MastermindGame,"secondPlayerJoined").withArgs(addr1.address,0);
                
                //check right address assignments
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })
        })
    })

    describe("Match stake negotiation & deposit", function(){
        describe("Setting the stake value agreed",async function(){
            it("Should fail if called by someone not match creator", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
            
                const [own, addr1]= await ethers.getSigners();
                //Match id will be 0 for the fist one created
                await expect(MastermindGame.connect(addr1).setStakeValue(0,50)).to.revertedWith("Only the creator of that match can perform this operation!");
            })
            it("Should fail if the match stake is <=0", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
            
                //Match id will be 0 for the fist one created
                await expect(MastermindGame.setStakeValue(0,0)).to.be.revertedWith("The match stake has to be greater than zero!");                
            })
            it("Should fail if called more than once", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
            
                //Match id will be 0 for the fist one created
                expect(await MastermindGame.setStakeValue(0,5)).not.to.be.reverted;
                await expect(MastermindGame.setStakeValue(0,5)).to.be.revertedWith("The amount to put in stake has already been fixed by the match creator!");
            })
            it("Corretly sets the match stake",async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);

                expect(await MastermindGame.setStakeValue(0,5)).to.emit(MastermindGame,"matchStakeFixed").withArgs(0,5);
            })
        })
        describe("Send the wei used as match stake",function(){
            it("Fails if no wei is sent", async function(){
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);

                await expect(MastermindGame.depositStake(0)).to.revertedWith("The match stake has to be greater than zero!");
            })
            it("Fails if called by someone not participating in that game", async function () {
                const {owner, MastermindGame}=await loadFixture(deployMatchCreateMatchJoinFixture);
                const [own, addr1,addr2]= await ethers.getSigners();
                
                //Addr2 is not a member of that game
                await expect(MastermindGame.connect(addr2).depositStake(0, {value: 1})).to.revertedWith("You are not participating to this match!");
            })
            it("Fails if the amount sent differs from the one agreed by the players.", async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
                await MastermindGame.setStakeValue(0,5);
                //agreed 5 sent 1
                await expect(MastermindGame.depositStake(0, {value: 1})).to.revertedWith("You have sent an incorrect amout of WEI for this game");
            })
            it("Fails in case of multiple payments from the same user",async function () {
                const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
                const [own, addr1]=await ethers.getSigners();
                
                //The creators sets the agreed amount to send
                await MastermindGame.setStakeValue(0,5);
                //Creators sends its funds
                await expect(MastermindGame.depositStake(0, {value: 5})).not.to.be.reverted;
                //Player sends its funds
                await expect(MastermindGame.depositStake(0, {value: 5})).to.be.revertedWith("You have already sent the wei in stake for this match!");
            })
            it("Properly manages the payments from the players",async function () {
                const {owner, MastermindGame}=await loadFixture(deployMatchCreateMatchJoinFixture);
                const [own, addr1]=await ethers.getSigners();
                
                //The creators sets the agreed amount to send
                await MastermindGame.setStakeValue(0,5);
                //Creators sends its funds
                await expect(MastermindGame.depositStake(0, {value: 5})).to.changeEtherBalance(MastermindGame,5);
                //Player sends its funds
                await expect(MastermindGame.connect(addr1).depositStake(0, {value: 5})).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0);
            })
        })
        
        /*
        it("", async function () {
            const {owner, MastermindGame}=await loadFixture(deployAndMatchCreateFixture);
            
            const [own, addr1]= await ethers.getSigners();
            //second player joins with success
            expect(await MastermindGame.connect(addr1).joinMatch()).to.emit(MastermindGame,"secondPlayerJoined").withArgs(addr1.address,0);
                
            //check right address assignments
            expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
            expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);

        })
        */
    })
})
  