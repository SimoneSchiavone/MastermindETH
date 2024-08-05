import { expect } from "chai";
import {time, loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre, {ethers} from "hardhat";
const {utils} = require("ethers");
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("MastermindGame Contract", function(){
    const FIVE_MINUTES_IN_SECONDS=300;
    const colors=4; 
    const codesize=5;
    const reward=5;

    async function onlyDeployFixture() {
        const [owner] =await hre.ethers.getSigners();
        
        const Lib = await ethers.getContractFactory("Utils");
        const lib = await Lib.deploy();
        let add:string=await lib.getAddress();
        const MastermindGame_factory = await ethers.getContractFactory("MastermindGame", {
            libraries: {
                Utils: add,
            },
        });
        
        //const MastermindGame = await MastermindGame_factory.deploy(colors, codesize, reward)
        const MastermindGame = await MastermindGame_factory.deploy(codesize, reward);

        return{ owner, MastermindGame}
    }

    async function publicMatchCreated() {
        const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
        await MastermindGame.createMatch();
        return { owner, MastermindGame};
    }

    async function privateMatchCreated() {
        const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
        const [own, addr1]= await ethers.getSigners();
        await MastermindGame.createPrivateMatch(addr1);
        return { owner, MastermindGame};
    }

    async function publicMatchBothJoined() {
        const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
        const [own, joiner]= await ethers.getSigners();
        await MastermindGame.connect(joiner).joinMatchWithId(0);
        return { owner, joiner, MastermindGame};
    }
 
    async function publicMatchCreatorDeposited() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicMatchBothJoined);
        await MastermindGame.setStakeValue(0,5);
        await MastermindGame.depositStake(0, {value: 5});
        return { owner, joiner, MastermindGame};
    }

    async function publicMatchStarted() {
        const {owner, joiner,MastermindGame}=await loadFixture(publicMatchBothJoined);
        await MastermindGame.setStakeValue(0,5);
        await MastermindGame.depositStake(0, {value: 5});
        await MastermindGame.connect(joiner).depositStake(0, {value: 5});
        return {owner, joiner, MastermindGame};
    }

    async function publicTurnHashPublished() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
        const code="ARBGR";
        const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
        if((await MastermindGame.getCodeMaker(0,0))==owner.address){
            await MastermindGame.publishCodeHash(0,0,digest);
        }else{
            await MastermindGame.connect(joiner).publishCodeHash(0,0,digest);
        }
        return { owner, joiner, MastermindGame};
    }

    describe("Contract creation", function(){
        //Check that the assignment of the value is correct in case of right parameters
        it("Constructor should initialize the game parameters", async function () {
            const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
            expect(await MastermindGame.codeSize()).to.equal(codesize);
            //expect(await MastermindGame.availableColors()).to.equal(colors);
            expect(await MastermindGame.extraReward()).to.equal(reward);
            expect(await MastermindGame.gameManager()).to.equal(owner);
        })

        //Check the reversion in case of contract creation with incorrect parameter
        /*
        it("Constructor should fails with color <=1", async function () {
            const [owner, otherAccount] =await hre.ethers.getSigners();
            
            const Lib = await ethers.getContractFactory("Utils");
            const lib = await Lib.deploy();
            let add:string=await lib.getAddress();
            const MastermindGame_factory = await ethers.getContractFactory("MastermindGame", {
                libraries: {
                    Utils: add,
                },
            });
            await expect(MastermindGame_factory.deploy(0, codesize, reward)).to.be.revertedWith("The number of available colors should be greater than 1!");
        })*/

        it("Constructor should fails with code size <=1", async function () {
            const [owner, otherAccount] =await hre.ethers.getSigners();
        
            const Lib = await ethers.getContractFactory("Utils");
            const lib = await Lib.deploy();
            let add:string=await lib.getAddress();
            const MastermindGame_factory = await ethers.getContractFactory("MastermindGame", {
                libraries: {
                    Utils: add,
                },
            });
            //await expect(MastermindGame_factory.deploy(0, reward)).to.be.revertedWithCustomError(MastermindGame_factory,"InvalidParameter");
            await expect(MastermindGame_factory.deploy( 0, reward)).to.be.revertedWith("The code size should be greater than 1!");
        })

        it("Constructor should fails with reward <=0", async function () {
            const [owner, otherAccount] =await hre.ethers.getSigners();
        
            const Lib = await ethers.getContractFactory("Utils");
            const lib = await Lib.deploy();
            let add:string=await lib.getAddress();
            const MastermindGame_factory = await ethers.getContractFactory("MastermindGame", {
                libraries: {
                    Utils: add,
                },
            });
            
            //await expect(MastermindGame_factory.deploy(colors, codesize, 0)).to.be.revertedWith("The extra reward for the code maker has to be greater than 0!");
            await expect(MastermindGame_factory.deploy(codesize, 0)).to.be.revertedWith("The extra reward for the code maker has to be greater than 0!");
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
                const {owner, MastermindGame}=await loadFixture(privateMatchCreated);
                
                const [own, addr1]=await ethers.getSigners();
                
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })
        })
        
    })

    describe("Match join",function(){
        describe("Case ID given by the user", function(){
            it("Creator cannot join again in the same match", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                //For the first match created the id will be surely 0
                await expect(MastermindGame.joinMatchWithId(0)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("You cannot join a match you have created");
            })
            
            it("Cannot join a match which doesn't exist", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                //For the first match created the id will be surely 0 hence match with id 99 does not exits
                await expect(MastermindGame.joinMatchWithId(99)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(99);
            })
            
            it("Fails to join a full match", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                
                const [own, addr1,adrr2]= await ethers.getSigners();
                //first join OK
                await MastermindGame.connect(addr1).joinMatchWithId(0);
                //Second join from a different user should be reverted
                await expect(MastermindGame.connect(adrr2).joinMatchWithId(0)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("Full match");
            })
            
            it("Fails to join a private match where we are not invited", async function () {
                const {owner, MastermindGame}=await loadFixture(privateMatchCreated);
                //private match created by own in order to play with addr1
                const [own, addr1,addr2]= await ethers.getSigners();
                await expect(MastermindGame.connect(addr2).joinMatchWithId(0)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("You cannot join this private match");
                await expect(MastermindGame.connect(addr1).joinMatchWithId(0)).not.to.be.reverted;
            })
            
            it("Correct join by a second user in a public match", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                
                const [own, addr1]= await ethers.getSigners();
                //call done from another address
                await expect(MastermindGame.connect(addr1).joinMatchWithId(0)).not.to.be.reverted;
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })

            it("Correct join by a second user in a private match", async function () {
                const {owner, MastermindGame}=await loadFixture(privateMatchCreated);
                
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
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);  
                await expect(MastermindGame.joinMatch()).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("You cannot join a match you have created");
            })
            it("Correctly joins", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                
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
        describe("Set the stake value agreed",async function(){
            it("Should fail if called by someone not match creator", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
            
                const [own, addr1]= await ethers.getSigners();
                //Match id will be 0 for the fist one created
                await expect(MastermindGame.connect(addr1).setStakeValue(0,50)).to.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("You are not the creator of the match");
            })
            it("Should fail if the match stake is <=0", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
            
                //Match id will be 0 for the fist one created
                await expect(MastermindGame.setStakeValue(0,0)).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("stakeValue","=0");               
            })
            it("Should fail if called more than once", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
            
                //Match id will be 0 for the fist one created
                expect(await MastermindGame.setStakeValue(0,5)).not.to.be.reverted;
                await expect(MastermindGame.setStakeValue(0,5)).to.be.revertedWithCustomError(MastermindGame,"DuplicateOperation").withArgs("Stake already fixed for that match");
            })
            it("Corretly sets the match stake",async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);

                expect(await MastermindGame.setStakeValue(0,5)).to.emit(MastermindGame,"matchStakeFixed").withArgs(0,5);
            })
        })
        describe("Send the wei used as match stake",function(){
            it("Fails if no wei is sent", async function(){
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);

                await expect(MastermindGame.depositStake(0)).to.be.revertedWithCustomError(MastermindGame,"InvalidParameter").withArgs("WEI sent", "=0");
            })
            it("Fails if called by someone not participating in that game", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchBothJoined);
                const [own, addr1,addr2]= await ethers.getSigners();
                
                //Addr2 is not a member of that game
                await expect(MastermindGame.connect(addr2).depositStake(0, {value: 1})).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("You are not a participant of the match");
            })
            it("Fails if the amount sent differs from the one agreed by the players.", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                await MastermindGame.setStakeValue(0,5);
                //agreed 5 sent 1
                await expect(MastermindGame.depositStake(0, {value: 1})).to.be.revertedWithCustomError(MastermindGame,"InvalidParameter").withArgs("WEI sent", "!= agreed stake");
            })
            it("Fails in case of multiple payments from the same user",async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                const [own, addr1]=await ethers.getSigners();
                
                //The creators sets the agreed amount to send
                await MastermindGame.setStakeValue(0,5);
                //Creators sends its funds
                await expect(MastermindGame.depositStake(0, {value: 5})).not.to.be.reverted;
                //Player sends its funds
                await expect(MastermindGame.depositStake(0, {value: 5})).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("WEI already sent");
            })
            it("Properly manages the payments from the players",async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchBothJoined);
                
                //The creators sets the agreed amount to send
                await MastermindGame.setStakeValue(0,5);
                //Creators sends its funds
                await expect(MastermindGame.depositStake(0, {value: 5})).to.changeEtherBalance(MastermindGame,5);
                //Player sends its funds
                await expect(MastermindGame.connect(joiner).depositStake(0, {value: 5})).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0);
            })
            it("Properly creates a new match as soon as both have deposited the stake",async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchBothJoined);
                
                //The creators sets the agreed amount to send
                await MastermindGame.setStakeValue(0,5);
                //Creators sends its funds
                await expect(MastermindGame.depositStake(0, {value: 5})).to.changeEtherBalance(MastermindGame,5);
                //Player sends its funds
                await expect(MastermindGame.connect(joiner).depositStake(0, {value: 5})).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0).and.to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            })
        })
        describe("Allow to request the refund of the stake payed in case one of the player doesn't pay within the deadline", async function () {
            it("Fails if called by someone not participating in that game", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                const [own, addr1,addr2]= await ethers.getSigners();
                
                //Addr2 is not a member of that game
                await expect(MastermindGame.connect(addr2).requestRefundMatchStake(0)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("You are not a participant of the match");
            })
            it("Fails if a wrong matchId is passed", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                const [own, addr1,addr2]= await ethers.getSigners();
                
                //Addr2 is not a member of that game
                await expect(MastermindGame.connect(addr2).requestRefundMatchStake(55)).to.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(55);
            })
            it("Fails if both players have already paid", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                const [own, addr1]= await ethers.getSigners();
                
                //Addr 1 paid the stake
                await expect(MastermindGame.connect(addr1).depositStake(0,{value: 5})).not.to.be.reverted;
                await expect(MastermindGame.requestRefundMatchStake(0)).to.revertedWith("Both players have put their funds in stake!");
            })
            it("Fails if requested before the deadline", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                const [own, addr1]= await ethers.getSigners();
                //Addr 1 did not pay the stake, owner request the refund before the 5 minutes deadline
                await expect(MastermindGame.requestRefundMatchStake(0)).to.revertedWith("You cannot request the refund until the deadline for the payments is expired!");
            })
            it("Properly do the refund when the pre-requisites are met", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                const [own, addr1]= await ethers.getSigners();
                //Addr 1 did not pay the stake, owner request the refund after the 5 minutes deadline
                await time.increase(FIVE_MINUTES_IN_SECONDS+2);            
                await expect(MastermindGame.requestRefundMatchStake(0)).to.changeEtherBalance(owner,5);
            })
        })
    })

    describe("Code hash publication by the codeMaker", function(){
        
        it("Should fail if the code hash is published by someone not partecipating in the game",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            const [own, addr1, addr2]= await ethers.getSigners();
            
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            //Turn 0 of match 0
            await expect(MastermindGame.connect(addr2).publishCodeHash(0,0,digest)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("You are not a participant of the match");
        })

        it("Should fail if the match is not started yet",async function(){
            const {owner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
            const [own, addr1]= await ethers.getSigners();
            
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            //Turn 0 of match 0
            await expect(MastermindGame.connect(addr1).publishCodeHash(0,0,digest)).to.be.revertedWithCustomError(MastermindGame,"MatchNotStarted").withArgs(0);
        })

        it("Should fail if the matchId does not exists",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            //Turn 0 of match 0
            await expect(MastermindGame.publishCodeHash(4,0,digest)).to.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(4);
        })

        it("Should fail if the caller is not the codemaker of the turn",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //The codemaker is 'owner' hence 'joiner' cannot set the hashCode
                await expect(MastermindGame.connect(joiner).publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedOperation").withArgs("You are not the codeMaker of this turn");
            }else{
                //The codemaker is 'joiner' hence 'owner' cannot set the hashCode
                await expect(MastermindGame.publishCodeHash(0,0,digest)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedOperation").withArgs("You are not the codeMaker of this turn");               
            }   
        })

        it("Should fail if the the code hash is changed more than once",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            let code="ARBGR";
            let digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                await expect(MastermindGame.publishCodeHash(0, 0, digest)).not.to.be.reverted;
                code="RRBVG";
                digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
                await expect(MastermindGame.publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame,"DuplicateOperation").withArgs("Secret code digest published");
            }else{
                await expect(MastermindGame.connect(joiner).publishCodeHash(0, 0, digest)).not.to.be.reverted;
                code="RRBVG";
                digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
                await expect(MastermindGame.connect(joiner).publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame,"DuplicateOperation").withArgs("Secret code digest published");               
            }   
        })

        it("Correctly sets the codeHash and emits the event",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //The codemaker is 'owner' hence he can set the hashCode
                await expect(MastermindGame.publishCodeHash(0,0,digest)).to.emit(MastermindGame,"codeHashPublished").withArgs(0, 0, digest);
            }else{
                //The codemaker is 'joiner' hence he can set the hashCode
                await expect(MastermindGame.connect(joiner).publishCodeHash(0,0,digest)).to.emit(MastermindGame,"codeHashPublished").withArgs(0, 0, digest);
            }
        })
    })
    
    describe("Guess publication by the codeBreaker",function(){
        it("Should fail if the guess of the code is published by someone not partecipating in the game",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const [own, addr1, addr2]= await ethers.getSigners();
            const guess="BBRAV";
            await expect(MastermindGame.connect(addr2).guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("You are not a participant of the match");
        })

        it("Should fail if the match is not started yet",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
            const guess="BBRAV";
            await expect(MastermindGame.connect(joiner).guessTheCode(0,0,guess)).to.be.revertedWithCustomError(MastermindGame,"MatchNotStarted").withArgs(0);
        })

        it("Should fail if the matchId does not exists",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="BBRAV";
            await expect(MastermindGame.guessTheCode(4,0,guess)).to.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(4);
        })

        it("Should fail if the caller is not the codeBreaker of the turn",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="BBRAV";
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //The codemaker is 'owner' hence it cannot guess
                await expect(MastermindGame.guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedOperation").withArgs("You are not the codeBreaker of this turn");
            }else{
                //The codemaker is 'joiner' hence it cannot guess
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedOperation").withArgs("You are not the codeBreaker of this turn");                
            }
        })

        it("Should fail if a guess is sent before getting the feedback of the previous one",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="BBRAV";
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //The codemaker is 'owner' hence 'joiner' has to guess
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRAVG")).to.revertedWith("You need to wait the feedback from the codeMaker regarding the last code you have proposed!");
            }else{
                //The codemaker is 'joiner' hence 'owner' has guess
                await expect(MastermindGame.guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, "BRAVG")).to.revertedWith("You need to wait the feedback from the codeMaker regarding the last code you have proposed!");             
            }
        })

        it("Should fail if the caller provides a code with a wrong color",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="ZZZZZ";
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //The codemaker is 'owner' hence it cannot guess
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame,"InvalidParameter").withArgs("codeProponed","Invalid color in the code");
            }else{
                //The codemaker is 'joiner' hence it cannot guess
                await expect(MastermindGame.guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame,"InvalidParameter").withArgs("codeProponed","Invalid color in the code");
            }
        })

        it("It should fail the limit of attempts is reached",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //codeMaker 'owner', codeBreaker 'joiner'; numguesses is a constant of the contract (5)
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
                await expect(MastermindGame.provideFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
                await expect(MastermindGame.provideFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
                await expect(MastermindGame.provideFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
                await expect(MastermindGame.provideFeedback(0, 0, 1, 2)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
                await expect(MastermindGame.provideFeedback(0, 0, 1, 2)).to.emit(MastermindGame,"turnCompleted").withArgs(0, 0, owner.address);
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "GRATT")).to.be.revertedWith("This turn is already finished!");
            }else{
                //codeMaker 'owner', codeBreaker 'joiner'; numguesses is a constant of the contract (5)
                await expect(MastermindGame.guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 1, 2)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 1, 2)).to.emit(MastermindGame,"turnCompleted").withArgs(0, 0, joiner.address);
                await expect(MastermindGame.guessTheCode(0, 0, "GRATT")).to.be.revertedWith("This turn is already finished!");
            }
        })

        it("Correctly sets the guess in the turn state and emits the event",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="BBRAV";
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //The codemaker is 'owner' hence 'joiner' has to guess
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).to.emit(MastermindGame,"newGuess").withArgs(0, 0, guess);
            }else{
                //The codemaker is 'joiner' hence 'owner' has to guess
                await expect(MastermindGame.guessTheCode(0, 0, guess)).to.emit(MastermindGame,"newGuess").withArgs(0, 0, guess);
            }
            
        })
    })
    
    describe("Feedback publication by the codeMaker", function(){
        it("Should fail if the guess of the code is published by someone not partecipating in the game",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const [own, addr1, addr2]= await ethers.getSigners();
            await expect(MastermindGame.connect(addr2).provideFeedback(0, 0, 2, 0)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedAccess").withArgs("You are not a participant of the match");
        })

        it("Should fail if the match is not started yet",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
            await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 2, 0)).to.be.revertedWithCustomError(MastermindGame,"MatchNotStarted").withArgs(0);
        })

        it("Should fail if the matchId does not exists",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            await expect(MastermindGame.provideFeedback(4, 0, 2, 0)).to.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(4);
        })

        it("Should fail if the caller is not the codeMaker of the turn",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //The codemaker is 'owner' hence it cannot guess
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 2, 0)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedOperation").withArgs("You are not the codeMaker of this turn");   
            }else{
                //The codemaker is 'joiner' hence it cannot guess
                await expect(MastermindGame.provideFeedback(0, 0, 2, 0)).to.be.revertedWithCustomError(MastermindGame,"UnauthorizedOperation").withArgs("You are not the codeMaker of this turn");              
            }
        })

        it("Should fail if the feedback is invalid (ex numer of positions returned > code size)",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                await expect(MastermindGame.provideFeedback(0, 0, codesize+1, 0)).to.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("correctPositions",">codeSize");
                await expect(MastermindGame.provideFeedback(0, 0, 0, codesize+1)).to.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("wrongPositionCorrectColors",">codeSize");
            }else{
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, codesize+1, 0)).to.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("correctPositions",">codeSize");
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 0, codesize+1)).to.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("wrongPositionCorrectColors",">codeSize");                
            }
        })

        it("It should fail if the codeBreaker has not sent a guess",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //codeMaker 'owner', codeBreaker 'joiner'
                //Case: 0 guesses sent
                await expect(MastermindGame.provideFeedback(0, 0, 0, 1)).to.revertedWith("The codeBreakers has not yet provided a guess!");
                //Case: some guesses previously sent but not for the current attempt 
                const guess="BBRAV";
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.provideFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.provideFeedback(0, 0, 0, 3)).to.be.revertedWith("Feedback already provided for this attempt, wait for another guess of the codeBreaker!");
            }else{
                //codeMaker 'joiner', codeBreaker 'owner'
                //Case: 0 guesses sent
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 0, 1)).to.revertedWith("The codeBreakers has not yet provided a guess!");
                //Case: some guesses previously sent but not for the current attempt 
                const guess="BBRAV";
                await expect(MastermindGame.guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 0, 3)).to.be.revertedWith("Feedback already provided for this attempt, wait for another guess of the codeBreaker!");
            }
        })

        it("Correctly registers the feedback in the turn state and emits the event",async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0,0))==owner.address){
                //The codemaker is 'owner' hence 'joiner' has to guess
                const guess="BBRAV";
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.provideFeedback(0, 0, 0, 3)).to.emit(MastermindGame,"feedbackProvided").withArgs(0, 0, 0, 0, 3);
            }else{
                //The codemaker is 'joiner' hence 'owner' has to guess
                const guess="BBRAV";
                await expect(MastermindGame.guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).provideFeedback(0, 0, 0, 3)).to.emit(MastermindGame,"feedbackProvided").withArgs(0, 0, 0, 0, 3);
            }
            
        })       
    })
})
