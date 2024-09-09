import { expect } from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre, {ethers} from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

/*
****************************************
*          MASTERMINDGAME.SOL          *
****************************************
*/

describe("MastermindGame Contract", function(){
    const codesize=5;
    const turns=4;
    const guesses=5;
    const reward=5;

    /*
        ****************************************
        *               Fixtures               *
        ****************************************
    */

    //In all the test it's assumed that the gameManager is the user that creates the match

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
        
        const MastermindGame = await MastermindGame_factory.deploy(codesize, reward, turns, guesses);
        return{ owner, MastermindGame}
    }
    
    async function publicMatchCreated() {
        const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
        await MastermindGame.createMatch();
        return {owner, MastermindGame};
    }

    async function privateMatchCreated() {
        const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
        const [own, addr1]= await ethers.getSigners();
        await MastermindGame.createPrivateMatch(addr1);
        return {owner, MastermindGame};
    }

    //Second player is joined
    async function publicMatchBothJoined() {
        const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
        const [own, joiner]= await ethers.getSigners();
        await MastermindGame.connect(joiner).joinMatchWithId(0);
        return {owner, joiner, MastermindGame};
    }
 
    async function publicMatchCreatorDeposited() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicMatchBothJoined);
        await MastermindGame.setStakeValue(0, 5);
        await MastermindGame.depositStake(0, {value: 5});
        return { owner, joiner, MastermindGame};
    }

    //Both have deposited the stake
    async function publicMatchStarted() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicMatchBothJoined);
        await MastermindGame.setStakeValue(0, 5);
        await MastermindGame.depositStake(0, {value: 5});
        await MastermindGame.connect(joiner).depositStake(0, {value: 5});
        return {owner, joiner, MastermindGame};
    }

    //Hash published by the codeMaker
    async function publicTurnHashPublished() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
        const code="ARBGR";
        const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
        if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
            await MastermindGame.publishCodeHash(0, 0, digest);
        }else{
            await MastermindGame.connect(joiner).publishCodeHash(0, 0, digest);
        }
        return {owner, joiner, MastermindGame};
    }

    //Wait the secret publication after an immediate guess at the first attept
    async function publicTurnAlmostConcluded_Guessed() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);       
        if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
            //codeMaker 'owner', codeBreaker 'joiner', secret 'ARBGR'
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "ARBGR")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 5, 0)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 0, 5, 0).
                and.to.emit(MastermindGame, "secretRequired").withArgs(0, 0, true, owner.address);
        }else{
            //codeMaker 'joiner', codeBreaker 'owner', secret 'ARBGR'
            await expect(MastermindGame.guessTheCode(0, 0, "ARBGR")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 5, 0)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 0, 5, 0).
                and.to.emit(MastermindGame, "secretRequired").withArgs(0, 0, true, joiner.address);
        }
        return { owner, joiner, MastermindGame};
    }

    //Wait the secret publication after a maximal sequence of failed guesses
    async function publicTurnAlmostConcluded_NotGuessed() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
        if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
            //codeMaker 'owner', codeBreaker 'joiner', secret code 'ARBGR'
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 1, 2)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 4, 1, 2).
                and.to.emit(MastermindGame, "secretRequired").withArgs(0, 0, false, owner.address);
        }else{
            //codeMaker 'joiner', codeBreaker 'joiner', secret 'ARBGR'
            await expect(MastermindGame.guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 2)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 4, 1, 2).
                and.to.emit(MastermindGame, "secretRequired").withArgs(0, 0, false, joiner.address);
        }
        return {owner, joiner, MastermindGame};    
    }
    
    //Open a dispute because the codeMaker has provided a wrong full match feedback 
    async function publicTurnDisputeOpen_Guessed_WrongCC() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
        if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
            //codeMaker 'owner', codeBreaker 'joiner', secret 'ARBGR'
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "ARBGR")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 4, 1)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 4, 4, 1).
                and.to.emit(MastermindGame, "secretRequired").withArgs(0, 0, false, owner.address);
                //This is a wrong feedback (the correct one should be CC=5 NC=0 since it has guessed the code)
            await expect(MastermindGame.publishSecret(0, 0, "ARBGR")).not.to.be.reverted;
        }else{
            //codeMaker 'joiner', codeBreaker 'owner', secret 'ARBGR'
            await expect(MastermindGame.guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "ARBGR")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 4, 1)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 4, 4, 1).
                and.to.emit(MastermindGame, "secretRequired").withArgs(0, 0, false, joiner.address);
                //This is a wrong feedback (the correct one should be CC=5 NC=0 since it has guessed the code)
            await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGR")).not.to.be.reverted;
        }
        return {owner, joiner, MastermindGame};
    }

    //Open a dispute because the codeMaker has provided a wrong partial match feedback (correct color-wrong position)
    async function publicTurnDisputeOpen_NotGuessed_WrongNC() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
        if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
            //codeMaker 'owner', codeBreaker 'joiner', secret 'ARBGR'
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "TABAC")).not.to.be.reverted;
            await expect(MastermindGame.publishFeedback(0, 0, 1, 0)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 4, 1, 0).
                and.to.emit(MastermindGame, "secretRequired").withArgs(0, 0, false, owner.address);
                //This is a wrong feedback (the correct one should be CC=1 NC=1 [for the 'A'])
            await expect(MastermindGame.publishSecret(0, 0, "ARBGR")).not.to.be.reverted;
        }else{
            //codeMaker 'joiner', codeBreaker 'owner', secret 'ARBGR'
            await expect(MastermindGame.guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
            await expect(MastermindGame.guessTheCode(0, 0, "TABAC")).not.to.be.reverted;
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 0)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 4, 1, 0).
                and.to.emit(MastermindGame, "secretRequired").withArgs(0, 0, false, joiner.address);
                //This is a wrong feedback (the correct one should be CC=1 NC=1 [for the 'A'])
            await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGR")).not.to.be.reverted;
        }
        return { owner, joiner, MastermindGame};
    }

    //CodeMaker provides a correct secret at the end of a turn
    async function publicTurnSuspendedSecretPublished() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_NotGuessed);       
        if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
            //codeMaker 'owner', codeBreaker 'joiner', secret 'ARBGR'
            await expect(MastermindGame.publishSecret(0, 0, "ARBGR")).not.to.be.reverted;  
        }else{
            //codeMaker 'joiner', codeBreaker 'owner', secret 'ARBGR'
            await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGR")).not.to.be.reverted;
        }
        return { owner, joiner, MastermindGame};
    }

    //End turn --> confirmation of a "correct" turn without cheaters
    async function firstTurnConcluded() {
        const {owner, joiner, MastermindGame}=await loadFixture(publicTurnSuspendedSecretPublished);       
        if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
            await expect(MastermindGame.connect(joiner).endTurn(0, 0)).to.emit(MastermindGame, "turnCompleted").withArgs(0, anyValue, anyValue, anyValue);
        }else{
            await expect(MastermindGame.endTurn(0, 0)).to.emit(MastermindGame, "turnCompleted").withArgs(0, anyValue, anyValue, anyValue);
        }
        return { owner, joiner, MastermindGame};
    }
    
    /*
        ****************************************
        *             Constructor              *
        ****************************************
    */

    describe("Contract creation", function(){
        it("Constructor should initialize the game parameters", async function () {
            //Check that the assignment of the value is correct in case of right parameters
            const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
            expect(await MastermindGame.getGameParam()).to.deep.equal([codesize, reward, turns, guesses]);
        })

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
            await expect(MastermindGame_factory.deploy( 0, reward, turns, guesses)).to.be.revertedWithCustomError(MastermindGame_factory, "InvalidParameter").withArgs("codeSize<=1");
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
            await expect(MastermindGame_factory.deploy(codesize, 0, turns, guesses)).to.be.revertedWithCustomError(MastermindGame_factory, "InvalidParameter").withArgs("extraReward=0");
        })

        it("Constructor should fails with numberTurns <=0", async function () {
            const [owner, otherAccount] =await hre.ethers.getSigners();
            const Lib = await ethers.getContractFactory("Utils");
            const lib = await Lib.deploy();
            let add:string=await lib.getAddress();
            const MastermindGame_factory = await ethers.getContractFactory("MastermindGame", {
                libraries: {
                    Utils: add, 
                }, 
            });
            await expect(MastermindGame_factory.deploy(codesize, reward, 0, guesses)).to.be.revertedWithCustomError(MastermindGame_factory, "InvalidParameter").withArgs("numberTurns=0");
        })

        it("Constructor should fails with numberGuesses <=0", async function () {
            const [owner, otherAccount] =await hre.ethers.getSigners();
            const Lib = await ethers.getContractFactory("Utils");
            const lib = await Lib.deploy();
            let add:string=await lib.getAddress();
            const MastermindGame_factory = await ethers.getContractFactory("MastermindGame", {
                libraries: {
                    Utils: add, 
                }, 
            });
            await expect(MastermindGame_factory.deploy(codesize, reward, turns, 0)).to.be.revertedWithCustomError(MastermindGame_factory, "InvalidParameter").withArgs("numberGuesses=0");
        })
    })

    /*
        ****************************************
        *            Match creation            *
        ****************************************
    */

    describe("New match creation", function(){
        describe("Public match creation", function(){
            it("Match has to be created with the proper matchId", async function () {
                const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
                expect(await MastermindGame.createMatch()).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address, 0);
                expect(await MastermindGame.createMatch()).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address, 1);
            })

            it("Match has to be created with the participant address", async function () {
                const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
                await MastermindGame.createMatch();
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWith("This match is waiting for an opponent!");
            })
        })

        describe("Private match creation", function(){
            it("Match has to be created with the proper matchId", async function () {
                const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
                const [own, addr1]=await ethers.getSigners();
                expect(await MastermindGame.createPrivateMatch(addr1.address)).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address, 0);
                expect(await MastermindGame.createPrivateMatch(addr1.address)).to.emit(MastermindGame, "newGameCreated").withArgs(owner.address, 1);
            })

            it("Match has to be created with the proper participant addresses", async function () {
                const {owner, MastermindGame}=await loadFixture(privateMatchCreated);
                const [own, addr1]=await ethers.getSigners();
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })

            it("It should fail if a wrong opponent address is passed", async function () {
                const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
                //Case address zero
                await expect(MastermindGame.createPrivateMatch(ethers.ZeroAddress)).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("opponent=0");
                //Case private match with ourself
                await expect(MastermindGame.createPrivateMatch(owner.address)).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("opponent=yourself");
            })
        })
        
    })


    /*
        ****************************************
        *              Match join              *
        ****************************************
    */
    describe("Match join", function(){
        describe("Case ID given by the user", function(){
            it("Creator cannot join again in the same match", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                //For the first match created the id will be surely 0
                await expect(MastermindGame.joinMatchWithId(0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You cannot join a match you have created");
            })
            
            it("Cannot join a match which doesn't exist", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                //For the first match created the id will be surely 0 hence match with id 99 does not exits
                await expect(MastermindGame.joinMatchWithId(99)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(99);
            })
            
            it("Fails to join a full match", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                const [own, addr1, adrr2]= await ethers.getSigners();
                await MastermindGame.connect(addr1).joinMatchWithId(0);
                await expect(MastermindGame.connect(adrr2).joinMatchWithId(0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("Full match");
            })
            
            it("Fails to join a private match where we are not invited", async function () {
                const {owner, MastermindGame}=await loadFixture(privateMatchCreated);
                //private match created by own in order to play with addr1
                const [own, addr1, addr2]= await ethers.getSigners();
                await expect(MastermindGame.connect(addr2).joinMatchWithId(0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You cannot join this private match");
                await expect(MastermindGame.connect(addr1).joinMatchWithId(0)).not.to.be.reverted;
            })
            
            it("Correct join by a second user in a public match", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                const [own, addr1]= await ethers.getSigners();
                await expect(MastermindGame.connect(addr1).joinMatchWithId(0)).not.to.be.reverted;
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })

            it("Correct join by a second user in a private match", async function () {
                const {owner, MastermindGame}=await loadFixture(privateMatchCreated);
                const [own, addr1]= await ethers.getSigners();
                await expect(MastermindGame.connect(addr1).joinMatchWithId(0)).not.to.be.reverted;
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })
            
        })
        
        describe("Case ID NOT given by the user", function(){
            it("Revert in case of no matches available", async function () {
                const {owner, MastermindGame}=await loadFixture(onlyDeployFixture);
                //No match has been created hence the call should fail
                await expect(MastermindGame.joinMatch()).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("No matches available");
            })
            
            it("Revert in case of join a match created by ourself", async function(){
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);  
                await expect(MastermindGame.joinMatch()).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You cannot join a match you have created");
            })

            it("Correctly joins", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                const [own, addr1]= await ethers.getSigners();
                //second player joins with success
                expect(await MastermindGame.connect(addr1).joinMatch()).to.emit(MastermindGame, "secondPlayerJoined").withArgs(addr1.address, 0);
                expect(await MastermindGame.getMatchCreator(0)).to.equal(owner.address);
                expect(await MastermindGame.getSecondPlayer(0)).to.equal(addr1.address);
            })
        })
    })


    /*
        ****************************************
        *        Match stake management        *
        ****************************************
     */
    //In this test we check the situation in which the match stake is negotiated using off-chain systems
    //See stakeNegotiation.ts for tests regarding the UintNegotiation contract

    describe("Match stake setting & deposit", function(){
        describe("Set the stake value agreed", async function(){
            it("Should fail if called by someone not match creator", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                const [own, addr1]= await ethers.getSigners();
                await expect(MastermindGame.connect(addr1).setStakeValue(0, 50)).to.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not the creator of the match");
            })

            it("Should fail if the match stake is <=0", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                await expect(MastermindGame.setStakeValue(0, 0)).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("stakeValue=0");               
            })

            it("Should fail if the match does not exists", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                await expect(MastermindGame.setStakeValue(5, 5)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);               
            }) 

            it("Should fail if called more than once", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                expect(await MastermindGame.setStakeValue(0, 5)).not.to.be.reverted;
                await expect(MastermindGame.setStakeValue(0, 5)).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("Stake already fixed");
            })

            it("Corretly sets the match stake", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                expect(await MastermindGame.setStakeValue(0, 5)).to.emit(MastermindGame, "matchStakeFixed").withArgs(0, 5);
            })
        })

        describe("Send the wei agreed as match stake", function(){
            it("Fails if no wei is sent", async function(){
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                await expect(MastermindGame.depositStake(0)).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("WEI sent=0");
            })

            it("Fails if called by someone not participating in that match", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchBothJoined);
                const [own, addr1, addr2]= await ethers.getSigners();                
                //Addr2 is not a member of that match
                await expect(MastermindGame.connect(addr2).depositStake(0, {value: 1})).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");
            })

            it("Fails if the amount sent differs from the one agreed by the players.", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                await MastermindGame.setStakeValue(0, 5);
                //Stake agreed 5 but sent 1
                await expect(MastermindGame.depositStake(0, {value: 1})).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("WEI sent!= agreed stake");
            })

            it("Fails in case of multiple payments from the same user", async function () {
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                const [own, addr1]=await ethers.getSigners();
                await MastermindGame.setStakeValue(0, 5);
                await expect(MastermindGame.depositStake(0, {value: 5})).not.to.be.reverted;
                //Duplicate operation
                await expect(MastermindGame.depositStake(0, {value: 5})).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("WEI already sent");
            })

            it("Properly manages the payments from the players", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchBothJoined);
                //The creators sets the agreed amount to send
                await MastermindGame.setStakeValue(0, 5);

                //Creators sends its funds
                let tx=await MastermindGame.depositStake(0, {value: 5});
                await expect(tx).to.changeEtherBalance(MastermindGame, 5);
                await expect(tx).to.emit(MastermindGame, "matchStakeDeposited").withArgs(0, owner.address);

                //Player sends its funds
                tx=await MastermindGame.connect(joiner).depositStake(0, {value: 5});
                await expect(tx).to.changeEtherBalance(MastermindGame, 5);
                await expect(tx).to.emit(MastermindGame, "matchStakeDeposited").withArgs(0, joiner.address);
            })

            it("Properly creates a new match as soon as both have deposited the stake", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchBothJoined);
                
                //The creators sets the agreed amount to send
                await MastermindGame.setStakeValue(0, 5);
                //Creators sends its funds
                await expect(MastermindGame.depositStake(0, {value: 5})).to.changeEtherBalance(MastermindGame, 5);
                //Player sends its funds
                await expect(MastermindGame.connect(joiner).depositStake(0, {value: 5})).to.emit(MastermindGame, "newTurnStarted").withArgs(0, 0, anyValue);
            })
        })

        describe("Allow to request the refund of the stake paid in case one of the player doesn't pay within the deadline", async function () {
            it("Fails if called by someone not participating in that match", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                const [own, addr1, addr2]= await ethers.getSigners();
                //Addr2 is not a member of that match
                await expect(MastermindGame.connect(addr2).requestRefundMatchStake(0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");
            })
            
            it("Fails if a wrong matchId is passed", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                const [own, addr1, addr2]= await ethers.getSigners();
                //Addr2 is not a member of that match
                await expect(MastermindGame.connect(addr2).requestRefundMatchStake(55)).to.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(55);
            })
            
            it("Fails if both players have already paid", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                //Creator paid in the fixture, Joiner pays here
                await expect(MastermindGame.connect(joiner).depositStake(0, {value: 5})).not.to.be.reverted;
                await expect(MastermindGame.requestRefundMatchStake(0)).to.revertedWith("Both players have deposited the stake");
            })

            it("Fails if requested before the deadline", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                //Joiner did not pay the stake, owner request the refund before the 5 minutes deadline (25 blocks)
                await expect(MastermindGame.requestRefundMatchStake(0)).to.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Deadline not expired");
            })
            
            it("Properly do the refund when the pre-requisites are met", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
                //Joiner did not pay the stake, owner request the refund after the 5 minutes deadline 
                await hre.network.provider.send("hardhat_mine", ["0x19"]); //mine 25 "dummy" blocks       
                await expect(MastermindGame.requestRefundMatchStake(0)).to.changeEtherBalance(owner, 5);
            })
        })
    })


    /*
        ****************************************
        *        Code hash publication         *
        ****************************************
     */

    describe("Code hash publication by the codeMaker", function(){
        it("Should fail if the code hash is published by someone not partecipating in the match", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            const [own, addr1, addr2]= await ethers.getSigners();
            
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            //Turn 0 of match 0
            await expect(MastermindGame.connect(addr2).publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");
        })

        it("Should fail if the match does not exists", async function(){
            const {owner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
            const [own, addr1]= await ethers.getSigners();
            
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            //Turn 0 of match 0
            await expect(MastermindGame.connect(addr1).publishCodeHash(5, 0, digest)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);
        })

        it("Should fail if the match is not started yet", async function(){
            const {owner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
            const [own, addr1]= await ethers.getSigners();
            
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            //Turn 0 of match 0
            await expect(MastermindGame.connect(addr1).publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame, "MatchNotStarted").withArgs(0);
        })

        it("Should fail if the match is already finished", async function(){
            const {owner, MastermindGame}=await loadFixture(firstTurnConcluded);
            const [own, addr1]= await ethers.getSigners();
            
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            if(await MastermindGame.getCodeMaker(0, 0)==owner.address){
                await expect(MastermindGame.publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame, "TurnEnded").withArgs(0);
            }else{
                await expect(MastermindGame.connect(addr1).publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame, "TurnEnded").withArgs(0);
            }
        })

        it("Should fail if the matchId does not exists", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            await expect(MastermindGame.publishCodeHash(4, 0, digest)).to.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(4);
        })

        it("Should fail if the caller is not the codemaker of the turn", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //The codemaker is 'owner' hence 'joiner' cannot set the hashCode
                await expect(MastermindGame.connect(joiner).publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeMaker of this turn");
            }else{
                //The codemaker is 'joiner' hence 'owner' cannot set the hashCode
                await expect(MastermindGame.publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeMaker of this turn");               
            }   
        })

        it("Should fail if the the code hash is changed more than once", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);

            let code="ARBGR";
            let digest=await ethers.keccak256(ethers.toUtf8Bytes(code));

            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //codeMaker 'owner', codeBreaker 'joiner';
                await expect(MastermindGame.publishCodeHash(0, 0, digest)).not.to.be.reverted;
                code="RRBVG";
                digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
                await expect(MastermindGame.publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("Secret code digest published");
            }else{
                //codeMaker 'joiner', codeBreaker 'owner';
                await expect(MastermindGame.connect(joiner).publishCodeHash(0, 0, digest)).not.to.be.reverted;
                code="RRBVG";
                digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
                await expect(MastermindGame.connect(joiner).publishCodeHash(0, 0, digest)).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("Secret code digest published");               
            }   
        })

        it("Correctly sets the codeHash and emits the event", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            const code="ARBGR";
            const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //The codemaker is 'owner' hence he can set the hashCode
                await expect(MastermindGame.publishCodeHash(0, 0, digest)).to.emit(MastermindGame, "codeHashPublished").withArgs(0, 0, digest);
            }else{
                //The codemaker is 'joiner' hence he can set the hashCode
                await expect(MastermindGame.connect(joiner).publishCodeHash(0, 0, digest)).to.emit(MastermindGame, "codeHashPublished").withArgs(0, 0, digest);
            }
        })
    })
    

    /*
        ****************************************
        *          Guess publication           *
        ****************************************
    */

    describe("Guess publication by the codeBreaker", function(){
        it("Should fail if the guess of the code is published by someone not partecipating in the match", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const [own, addr1, addr2]= await ethers.getSigners();
            const guess="BBRAV";
            await expect(MastermindGame.connect(addr2).guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");
        })

        it("Should fail if the match is not started yet", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
            const guess="BBRAV";
            await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame, "MatchNotStarted").withArgs(0);
        })

        it("Should fail if the match is already finished", async function(){
            const {owner, MastermindGame}=await loadFixture(firstTurnConcluded);
            const [own, addr1]= await ethers.getSigners();
            const guess="BBRAV";
            if(await MastermindGame.getCodeMaker(0, 0)==owner.address){
                await expect(MastermindGame.connect(addr1).guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame, "TurnEnded").withArgs(0);
            }else{
                await expect(MastermindGame.guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame, "TurnEnded").withArgs(0);
            }
        })

        it("Should fail if the matchId does not exists", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="BBRAV";
            await expect(MastermindGame.guessTheCode(4, 0, guess)).to.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(4);
        })

        it("Should fail if the match is already suspended", async function(){
            //A match is suspended when the code is guessed or the attempts bound is reached
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed);
            const guess="BBRAV";
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).to.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Turn suspended");
            }else{
                await expect(MastermindGame.guessTheCode(0, 0, guess)).to.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Turn suspended");
            }
        })

        it("Should fail if the caller is not the codeBreaker of the turn", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="BBRAV";
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //The codemaker is 'owner' hence it cannot guess
                await expect(MastermindGame.guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeBreaker of this turn");
            }else{
                //The codemaker is 'joiner' hence it cannot guess
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeBreaker of this turn");                
            }
        })

        it("Should fail if a guess is sent before getting the feedback of the previous one", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="BBRAV";
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //The codemaker is 'owner' hence 'joiner' has to guess
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).to.revertedWithCustomError(MastermindGame, "UnauthorizedOperation", ).withArgs("Wait the feedback");
            }else{
                //The codemaker is 'joiner' hence 'owner' has guess
                await expect(MastermindGame.guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, guess)).to.revertedWithCustomError(MastermindGame, "UnauthorizedOperation", ).withArgs("Wait the feedback");
            }
        })

        it("Should fail if the caller provides a code with a wrong color", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="ZZZZZ"; //Available colors: "ABCGPRTVWY"
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("Invalid color in the code");
            }else{
                await expect(MastermindGame.guessTheCode(0, 0, guess)).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("Invalid color in the code");
            }
        })

        it("It should fail the limit of attempts is reached", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //codeMaker 'owner', codeBreaker 'joiner', secret 'ARBGR'
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
                await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
                await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
                await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
                await expect(MastermindGame.publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
                await expect(MastermindGame.publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
                //Limit reached -> turn suspended
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "GRATT")).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Turn suspended");
            }else{
                //codeMaker 'joiner', codeBreaker 'owner', secret 'ARBGR'
                await expect(MastermindGame.guessTheCode(0, 0, "BBRAV")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, "BRAVA")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, "BARBA")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
                await expect(MastermindGame.guessTheCode(0, 0, "BRACC")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 1, 2)).not.to.be.reverted;
                //Limit reached --> turn suspended
                await expect(MastermindGame.guessTheCode(0, 0, "GRATT")).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Turn suspended");
            }
        })

        it("Correctly sets the guess in the turn state and emits the event", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const guess="BBRAV";
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).to.emit(MastermindGame, "newGuess").withArgs(0, 0, guess);
            }else{
                await expect(MastermindGame.guessTheCode(0, 0, guess)).to.emit(MastermindGame, "newGuess").withArgs(0, 0, guess);
            }
        })
    })
    
    /*
        ****************************************
        *         Feedback publication         *
        ****************************************
    */

    describe("Feedback publication by the codeMaker", function(){
        it("Should fail if the guess of the code is published by someone not partecipating in the match", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            const [own, addr1, addr2]= await ethers.getSigners();
            await expect(MastermindGame.connect(addr2).publishFeedback(0, 0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");
        })

        it("Should fail if the match is not started yet", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchCreatorDeposited);
            await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "MatchNotStarted").withArgs(0);
        })

        it("Should fail if the match is already finished", async function(){
            const {owner, MastermindGame}=await loadFixture(firstTurnConcluded);
            const [own, addr1]= await ethers.getSigners();
            const guess="BBRAV";
            if(await MastermindGame.getCodeMaker(0, 0)==owner.address){
                await expect(MastermindGame.publishFeedback(0, 0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "TurnEnded").withArgs(0);
            }else{
                await expect(MastermindGame.connect(addr1).publishFeedback(0, 0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "TurnEnded").withArgs(0);
            }
        })

        it("Should fail if the matchId does not exists", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            await expect(MastermindGame.publishFeedback(4, 0, 0, 0)).to.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(4);
        })

        it("Should fail if the caller is not the codeMaker of the turn", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //The codemaker is 'owner' hence it cannot publish the feedback
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeMaker of this turn");   
            }else{
                //The codemaker is 'joiner' hence it cannot publish the feedback
                await expect(MastermindGame.publishFeedback(0, 0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeMaker of this turn");              
            }
        })

        it("Should fail if the feedback is invalid (ex numer of positions returned > code size)", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            //publishFeedback(matchId, turnId, CC, NC)
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishFeedback(0, 0, codesize+1, 0)).to.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("correctPositions>codeSize");
                await expect(MastermindGame.publishFeedback(0, 0, 0, codesize+1)).to.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("wrongPositionCorrectColors>codeSize");
            }else{
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, codesize+1, 0)).to.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("correctPositions>codeSize");
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, codesize+1)).to.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("wrongPositionCorrectColors>codeSize");                
            }
        })

        it("It should fail if the codeBreaker has not sent a guess", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //codeMaker 'owner', codeBreaker 'joiner'
                //Case: No guesses sent
                await expect(MastermindGame.publishFeedback(0, 0, 0, 1)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("No guesses available");
                //Case: some guesses previously sent but not for the current attempt 
                const guess="BBRAV";
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("Feedback already provided");
            }else{
                //codeMaker 'joiner', codeBreaker 'owner'
                //Case: No guesses sent
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 1)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("No guesses available");
                //Case: some guesses previously sent but not for the current attempt 
                const guess="BBRAV";
                await expect(MastermindGame.guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("Feedback already provided");
            }
        })

        it("Correctly registers the feedback in the turn state and emits the event", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //codeMaker 'owner', codeBreaker 'joiner'
                const guess="BBRAV";
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.publishFeedback(0, 0, 0, 3)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 0, 0, 3);
            }else{
                //codeMaker 'joiner', codeBreaker 'owner'
                const guess="BBRAV";
                await expect(MastermindGame.guessTheCode(0, 0, guess)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).publishFeedback(0, 0, 0, 3)).to.emit(MastermindGame, "feedbackProvided").withArgs(0, 0, 0, 0, 3);
            }
            
        })

        it("Correctly emits the secret publication request in case of code guessed", async function () {
            await loadFixture(publicTurnAlmostConcluded_Guessed);
        })

        it("Correctly emits the secret publication request in case of code not guessed", async function () {
            await loadFixture(publicTurnAlmostConcluded_NotGuessed);
        })  
    })


    /*
        ****************************************
        *          Secret publication          *
        ****************************************
    */

    describe("Secret publication by the codeMaker and dispute window opening", function(){
        it("Should fail if the guess of the code is published by someone not partecipating in the match", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed);
            const [own, addr1, addr2]= await ethers.getSigners();
            await expect(MastermindGame.connect(addr2).publishSecret(0, 0, "ARBGR")).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");
        })
        
        it("Should fail if the turn is not ended", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished);
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishSecret(0, 0, "ARBGR")).to.be.revertedWithCustomError(MastermindGame, "TurnNotEnded").withArgs(0);
            }else{
                await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGR")).to.be.revertedWithCustomError(MastermindGame, "TurnNotEnded").withArgs(0);
            }
        })
        
        it("Should fail if the match does not exists", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed);
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishSecret(5, 0, "ARBGR")).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);
            }else{
                await expect(MastermindGame.connect(joiner).publishSecret(5, 0, "ARBGR")).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);
            }
        })

        it("Should fail if the match turn does not exists", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed);
            //Turn #0 executed
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishSecret(0, 5, "ARBGR")).to.be.revertedWithCustomError(MastermindGame, "TurnNotFound").withArgs(5);
            }else{
                await expect(MastermindGame.connect(joiner).publishSecret(0, 5, "ARBGR")).to.be.revertedWithCustomError(MastermindGame, "TurnNotFound").withArgs(5);
            }
        })

        it("Should fail if the secret code is invalid", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed);
            //Z is not an available color
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishSecret(0, 0, "ARBGZ")).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("Invalid color in the secret");
            }else{
                await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGZ")).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("Invalid color in the secret");
            }
        })

        it("Should fail if the secret code is the empty string", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed);
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishSecret(0, 0, "")).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("Secret-Empty string");
            }else{
                await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "")).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("Secret-Empty string");
            }
        })
        
        it("Should detect the cheating in case of wrong secret provided", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed);
            //secret 'ARBGR'
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                let tx= MastermindGame.publishSecret(0, 0, "BARBA");
                await expect(tx).to.emit(MastermindGame, "cheatingDetected").withArgs(0, 0, owner.address).
                    and.to.emit(MastermindGame, "matchDeleted").withArgs(0);
                await expect(tx).to.changeEtherBalance(joiner, 10); //match stake was 5
            }else{
                let tx= MastermindGame.connect(joiner).publishSecret(0, 0, "BARBA");
                await expect(tx).to.emit(MastermindGame, "cheatingDetected").withArgs(0, 0, joiner.address).
                    and.to.emit(MastermindGame, "matchDeleted").withArgs(0);
                await expect(tx).to.changeEtherBalance(owner, 10); //match stake was 5
            }
        })

        it("Should emit the correct event of dispute window opening in case of code guessed", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed);
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishSecret(0, 0, "ARBGR")).to.emit(MastermindGame, "disputeWindowOpen").withArgs(0, 0, 10);
            }else{
                await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGR")).to.emit(MastermindGame, "disputeWindowOpen").withArgs(0, 0, 10);
            }
        })

        it("Should emit the correct event of dispute window opening in case of code not guessed", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_NotGuessed);
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishSecret(0, 0, "ARBGR")).to.emit(MastermindGame, "disputeWindowOpen").withArgs(0, 0, 10);
            }else{
                await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGR")).to.emit(MastermindGame, "disputeWindowOpen").withArgs(0, 0, 10);
            }
        })
    })


    /*
        ****************************************
        *           Dispute opening            *
        ****************************************
    */

    describe("Dispute opening", function (){
        it("Should fail if the caller is not a participant", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed); 
            const [a, b, unknown] = await ethers.getSigners();
            await expect(MastermindGame.connect(unknown).openDispute(0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");  
        })

        it("Should fail if the caller is not the codeBreaker of the turn", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed); 
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.openDispute(0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeBreaker of this turn");  
            }else{
                await expect(MastermindGame.connect(joiner).openDispute(0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeBreaker of this turn");
            }
        })

        it("Should fail if wrong parameters are passed", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed); 
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishSecret(0, 0, "ARBGR")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).openDispute(1, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(1);  
                await expect(MastermindGame.connect(joiner).openDispute(0, 1, 0)).to.be.revertedWithCustomError(MastermindGame, "TurnNotFound").withArgs(1);  
                //In the fixture the codeBreaker sends only 1 guess and immediately get the secret code.
                await expect(MastermindGame.connect(joiner).openDispute(0, 0, 1)).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("feedbackNum>#guesses emitted"); 
            }else{
                await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGR")).not.to.be.reverted;
                await expect(MastermindGame.openDispute(1, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(1);
                await expect(MastermindGame.openDispute(0, 1, 0)).to.be.revertedWithCustomError(MastermindGame, "TurnNotFound").withArgs(1);
                //In the fixture the codeBreaker sends only 1 guess and immediately get the secret code.
                await expect(MastermindGame.openDispute(0, 0, 1)).to.be.revertedWithCustomError(MastermindGame, "InvalidParameter").withArgs("feedbackNum>#guesses emitted");
            }
        })

        it("Should fail if the match is not suspended due to a code breaking or for reaching the bound on the attempts", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished); 
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.connect(joiner).guessTheCode(0, 0, "ARBGR")).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).openDispute(0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "TurnNotEnded").withArgs(0);
            }else{
                await expect(MastermindGame.guessTheCode(0, 0, "ARBGR")).not.to.be.reverted;
                await expect(MastermindGame.openDispute(0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "TurnNotEnded").withArgs(0);
            }
        })

        it("Should fail if the codeMaker has not provided the secret code", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed); 
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.connect(joiner).openDispute(0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Secret code not provided");
            }else{
                await expect(MastermindGame.openDispute(0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Secret code not provided");
            }
        })

        it("Should fail if the disputeWindow is already closed", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed);
            //Dispute window length is set to 10 blocks (2 min) 
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.publishSecret(0, 0, "ARBGR")).to.emit(MastermindGame, "disputeWindowOpen").withArgs(0, 0, 10);
                await hre.network.provider.send("hardhat_mine", ["0xA"]); //mine 10 "dummy" blocks 
                await expect(MastermindGame.connect(joiner).openDispute(0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Dispute window closed");
            }else{
                await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGR")).to.emit(MastermindGame, "disputeWindowOpen").withArgs(0, 0, 10);
                await hre.network.provider.send("hardhat_mine", ["0xA"]); //mine 10 "dummy" blocks 
                await expect(MastermindGame.openDispute(0, 0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Dispute window closed");
            }
        })

        it("Should punish the codeBreaker who opens useless disputes", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed); 
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //Correct secret publication
                await expect(MastermindGame.publishSecret(0, 0, "ARBGR")).to.emit(MastermindGame, "disputeWindowOpen").withArgs(0, 0, 10);

                //Useless dispute
                let tx = MastermindGame.connect(joiner).openDispute(0, 0, 0);
                await expect(tx).to.emit(MastermindGame, "cheatingDetected").withArgs(0, 0, joiner.address).
                    and.to.emit(MastermindGame, "matchDeleted").withArgs(0);
                await expect(tx).to.changeEtherBalance(owner, 10);
            }else{
                //Correct secret publication
                await expect(MastermindGame.connect(joiner).publishSecret(0, 0, "ARBGR")).to.emit(MastermindGame, "disputeWindowOpen").withArgs(0, 0, 10);
                
                //Useless dispute
                let tx = MastermindGame.openDispute(0, 0, 0);
                await expect(tx).to.emit(MastermindGame, "cheatingDetected").withArgs(0, 0, owner.address).
                    and.to.emit(MastermindGame, "matchDeleted").withArgs(0);
                await expect(tx).to.changeEtherBalance(joiner, 10);
            }
        })

        describe("Should correctly punish the cheating of the codeMaker", function(){
            it("Case of wrong feedback about the correct colors and positions", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicTurnDisputeOpen_Guessed_WrongCC); 
                //In the last attempt (4) the codeBreaker has guessed the secret but the codeMaker has provided a wrong feedback

                if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                    let tx=MastermindGame.connect(joiner).openDispute(0, 0, 4);
                    await expect(tx).to.emit(MastermindGame, "cheatingDetected").withArgs(0, 0, owner.address).
                        and.to.emit(MastermindGame, "matchDeleted").withArgs(0);
                    await expect(tx).to.changeEtherBalance(joiner, 10);
                }else{
                    let tx=MastermindGame.openDispute(0, 0, 4);
                    await expect(tx).to.emit(MastermindGame, "cheatingDetected").withArgs(0, 0, joiner.address).
                        and.to.emit(MastermindGame, "matchDeleted").withArgs(0);
                    await expect(tx).to.changeEtherBalance(owner, 10);
                }
            })

            it("Case of wrong feedback about the good colors but in wrong positions", async function () {
                const {owner, joiner, MastermindGame}=await loadFixture(publicTurnDisputeOpen_NotGuessed_WrongNC); 
                //In the last attempt (4) the codeMaker has provided a wrong feedback

                if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                    let tx=MastermindGame.connect(joiner).openDispute(0, 0, 4);
                    await expect(tx).to.emit(MastermindGame, "cheatingDetected").withArgs(0, 0, owner.address).
                        and.to.emit(MastermindGame, "matchDeleted").withArgs(0);
                    await expect(tx).to.changeEtherBalance(joiner, 10);
                }else{
                    let tx=MastermindGame.openDispute(0, 0, 4);
                    await expect(tx).to.emit(MastermindGame, "cheatingDetected").withArgs(0, 0, joiner.address).
                        and.to.emit(MastermindGame, "matchDeleted").withArgs(0);
                    await expect(tx).to.changeEtherBalance(owner, 10);
                }
            })
        })   
    })


    /*
        ****************************************
        *             Turn ending              *
        ****************************************
    */

    describe("End of a turn", function(){
        it("Should fail if it is called by someone not participating the match", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnSuspendedSecretPublished); 
            const [a1, a2, a3]=await ethers.getSigners();
            await expect(MastermindGame.connect(a3).endTurn(0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");
        })

        it("Should fail if the caller is not the codeBreaker", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnSuspendedSecretPublished); 
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.endTurn(0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeBreaker of this turn");
            }else{
                await expect(MastermindGame.connect(joiner).endTurn(0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You are not the codeBreaker of this turn");
            }
        })

        it("Should fail if wrong parameter are passed (unexisting match/turn)", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnSuspendedSecretPublished); 
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.connect(joiner).endTurn(9, 0)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(9);
                await expect(MastermindGame.connect(joiner).endTurn(0, 1)).to.be.revertedWithCustomError(MastermindGame, "TurnNotFound").withArgs(1);
            }else{
                await expect(MastermindGame.endTurn(9, 0)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(9);
                await expect(MastermindGame.endTurn(0, 1)).to.be.revertedWithCustomError(MastermindGame, "TurnNotFound").withArgs(1);
            }
        })

        it("Should fail if the turn is not suspended", async function(){
            //The match is suspended when the code is guessed or when the attempts bound is reached
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnHashPublished); 
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.connect(joiner).endTurn(0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Turn not terminable");
            }else{
                await expect(MastermindGame.endTurn(0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Turn not terminable");
            }
        })

        it("Should fail if the secret code has not been published", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnAlmostConcluded_Guessed); 
            //Turn represented in the fixture is waiting for the secret code from the codeMaker
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.connect(joiner).endTurn(0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Turn not terminable");
            }else{
                await expect(MastermindGame.endTurn(0, 0)).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Turn not terminable");
            }
        })

        it("Should correctly set the points of each player, emit the event and create a new turn", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnSuspendedSecretPublished); 

            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                //Codemaker gains 10 points (5 failed guesses + 5 for extra) represented in the third param of the event
                await expect(MastermindGame.connect(joiner).endTurn(0, 0)).to.emit(MastermindGame, "turnCompleted").withArgs(0, 0, 10, owner.address).
                    and.to.emit(MastermindGame, "newTurnStarted").withArgs(0, 1, joiner.address); //roles swapped)
                expect(await MastermindGame.getActualPoints(0)).to.deep.equal([10, 0]);
            }else{
                await expect(MastermindGame.endTurn(0, 0)).to.emit(MastermindGame, "turnCompleted").withArgs(0, 0, 10, joiner.address).
                    and.to.emit(MastermindGame, "newTurnStarted").withArgs(0, 1, owner.address); //roles
                expect(await MastermindGame.getActualPoints(0)).to.deep.equal([0, 10]);
            }
        })

        it("Should fail if called twice on the same turn", async function(){
            const {owner, joiner, MastermindGame}=await loadFixture(publicTurnSuspendedSecretPublished); 

            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect(MastermindGame.connect(joiner).endTurn(0, 0)).not.to.be.reverted;
                await expect(MastermindGame.connect(joiner).endTurn(0, 0)).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("Turn already ended");
            }else{
                await expect(MastermindGame.endTurn(0, 0)).not.to.be.reverted;
                await expect(MastermindGame.endTurn(0, 0)).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("Turn already ended");
            }
        })

        it("Should end the entire match when the number of turns bound is reached", async function () {
            //Test performed in the MatchSimulation.ts test file
        })
    })


    /*
        ****************************************
        *            AFK reporting             *
        ****************************************
    */

    describe("AFK reporting", function(){
        it("Should fail if the AFKreport comes by someone not participating the match", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted); 
            const [a1, a2, a3]=await ethers.getSigners();
            await expect((MastermindGame.connect(a3).reportOpponentAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");
        })

        it("Should fail if the AFKreport is called twice", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            //In the fixture state the CodeMaker has to publish the code hash
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect((MastermindGame.connect(joiner).reportOpponentAFK(0))).not.to.be.reverted;
                await expect((MastermindGame.connect(joiner).reportOpponentAFK(0))).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("AFK Already reported");
            }else{
                await expect((MastermindGame.reportOpponentAFK(0))).not.to.be.reverted;
                await expect((MastermindGame.reportOpponentAFK(0))).to.be.revertedWithCustomError(MastermindGame, "DuplicateOperation").withArgs("AFK Already reported");
            }
        })

        it("Should fail if it is called instead of doing the required operation for that turn", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted); 
            //In the fixture state the CodeMaker has to publish the code hash
            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect((MastermindGame.reportOpponentAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Please do the next operation of the turn");
            }else{
                await expect((MastermindGame.connect(joiner).reportOpponentAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("Please do the next operation of the turn");
            }
        })

        it("Should correcly emit the event", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted); 
            //In the fixture state the CodeMaker has to publish the code hash

            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect((MastermindGame.connect(joiner).reportOpponentAFK(0))).to.emit(MastermindGame, "AFKreported").withArgs(0, owner.address);  
            }else{
                await expect((MastermindGame.reportOpponentAFK(0))).to.emit(MastermindGame, "AFKreported").withArgs(0, joiner.address);
            }
        })
    })


    /*
        ****************************************
        *            Refund for AFK            *
        ****************************************
    */

    describe("Refund for AFK", async function () {
        it("Should fail if the AFKreport comes by someone not participating the match", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted); 
            const [a1, a2, a3]=await ethers.getSigners();
            await expect((MastermindGame.connect(a3).requestRefundForAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedAccess").withArgs("You are not a participant of the match");
        })

        it("Should fail if no AFK have been reported", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted); 
            //In the fixture state the CodeMaker has to publish the code hash

            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect((MastermindGame.connect(joiner).requestRefundForAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You have not reported an AFK");
            }else{
                await expect((MastermindGame.requestRefundForAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("You have not reported an AFK");
            }
        })

        it("Should fail if the AFK window is still open, hence you need to wait for a move", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            //In the fixture state the CodeMaker has to publish the code hash

            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect((MastermindGame.connect(joiner).reportOpponentAFK(0))).not.to.be.reverted;
                await expect((MastermindGame.connect(joiner).requestRefundForAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("AFK window still open");
            }else{
                await expect((MastermindGame.reportOpponentAFK(0))).not.to.be.reverted;
                await expect((MastermindGame.requestRefundForAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("AFK window still open");
            }
        })

        it("Should fail if the AFK has been closed due to an action of the opponent", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted);
            //In the fixture state the CodeMaker has to publish the code hash

            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect((MastermindGame.connect(joiner).reportOpponentAFK(0))).not.to.be.reverted;

                //codeMaker "wakes up"
                const code="ARBGR";
                const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
                await expect(MastermindGame.publishCodeHash(0, 0, digest)).not.to.be.reverted;

                await expect((MastermindGame.connect(joiner).requestRefundForAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("AFK window closed");
            }else{
                await expect((MastermindGame.reportOpponentAFK(0))).not.to.be.reverted;

                //codeMaker "wakes up"
                const code="ARBGR";
                const digest=await ethers.keccak256(ethers.toUtf8Bytes(code));
                await expect(MastermindGame.connect(joiner).publishCodeHash(0, 0, digest)).not.to.be.reverted;

                await expect((MastermindGame.requestRefundForAFK(0))).to.be.revertedWithCustomError(MastermindGame, "UnauthorizedOperation").withArgs("AFK window closed");
            }
        })

        it("Should correctly emit the event and perform the punishment", async function () {
            const {owner, joiner, MastermindGame}=await loadFixture(publicMatchStarted); 
            //In the fixture state the CodeMaker has to publish the code hash

            if((await MastermindGame.getCodeMaker(0, 0))==owner.address){
                await expect((MastermindGame.connect(joiner).reportOpponentAFK(0))).not.to.be.reverted;

                await hre.network.provider.send("hardhat_mine", ["0xA"]); //mine 10 "dummy" blocks   
                let tx= await MastermindGame.connect(joiner).requestRefundForAFK(0);
                expect (tx).not.to.be.reverted;
                expect (tx).to.emit(MastermindGame, "AFKconfirmed").withArgs(0, owner.address);
                expect (tx).to.emit(MastermindGame, "matchDeleted").withArgs(0);
                expect (tx).to.changeEtherBalance(joiner, 10); //match stake was 5
            }else{
                await expect((MastermindGame.reportOpponentAFK(0))).not.to.be.reverted;

                await hre.network.provider.send("hardhat_mine", ["0xA"]); //mine 10 "dummy" blocks   
                let tx= await MastermindGame.requestRefundForAFK(0);
                expect (tx).not.to.be.reverted;
                expect (tx).to.emit(MastermindGame, "AFKconfirmed").withArgs(0, joiner.address);
                expect (tx).to.emit(MastermindGame, "matchDeleted").withArgs(0);
                expect (tx).to.changeEtherBalance(owner, 10); //match stake was 5
            }
        })
    })


    /*
        ****************************************
        *               Getters                *
        ****************************************
    */

    describe("Getters", async function () {
        describe("GetCodeMaker", async function() {
            it("Should fail if the match does not exists", async function (){
               const {owner, MastermindGame}=await loadFixture(publicMatchStarted);
               await expect(MastermindGame.getCodeMaker(5, 0)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);
            })

            it("Should fail if the turn does not exists", async function (){
                const {owner, MastermindGame}=await loadFixture(publicMatchStarted);
                await expect(MastermindGame.getCodeMaker(0, 5)).to.be.revertedWithCustomError(MastermindGame, "TurnNotFound").withArgs(5);
            })

            it("Should fail if the turn is not started", async function (){
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                await expect(MastermindGame.getCodeMaker(0, 0)).to.be.revertedWithCustomError(MastermindGame, "MatchNotStarted").withArgs(0);
            })
        })

        describe("GetCodeBreaker", async function() {
            it("Should fail if the match does not exists", async function (){
               const {owner, MastermindGame}=await loadFixture(publicMatchStarted);
               await expect(MastermindGame.getCodeBreaker(5, 0)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);
            })

            it("Should fail if the turn does not exists", async function (){
                const {owner, MastermindGame}=await loadFixture(publicMatchStarted);
                await expect(MastermindGame.getCodeBreaker(0, 5)).to.be.revertedWithCustomError(MastermindGame, "TurnNotFound").withArgs(5);
            })

            it("Should fail if the turn is not started", async function (){
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                await expect(MastermindGame.getCodeBreaker(0, 0)).to.be.revertedWithCustomError(MastermindGame, "MatchNotStarted").withArgs(0);
            })
        })

        describe("GetMatchCreator", async function() {
            it("Should fail if the match does not exists", async function (){
               const {owner, MastermindGame}=await loadFixture(publicMatchStarted);
               await expect(MastermindGame.getMatchCreator(5)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);
            })
        })

        describe("GetActualPoints", async function() {
            it("Should fail if the match does not exists", async function (){
               const {owner, MastermindGame}=await loadFixture(publicMatchStarted);
               await expect(MastermindGame.getActualPoints(5)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);
            })
        })
        
        describe("GetSecondPlayer", async function() {
            it("Should fail if the match does not exists", async function (){
               const {owner, MastermindGame}=await loadFixture(publicMatchStarted);
               await expect(MastermindGame.getSecondPlayer(5)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);
            })

            it("Should fail if the second player has not already joined that match", async function (){
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                await expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWithCustomError(MastermindGame, "Player2NotJoinedYet").withArgs(0);
             })
        })

        describe("isEnded", async function() {
            it("Should fail if the match does not exists", async function (){
               const {owner, MastermindGame}=await loadFixture(publicMatchStarted);
               await expect(MastermindGame.isEnded(5)).to.be.revertedWithCustomError(MastermindGame, "MatchNotFound").withArgs(5);
            })

            it("Says if the match is ended", async function (){
                const {owner, MastermindGame}=await loadFixture(publicMatchCreated);
                expect(await MastermindGame.isEnded(0)).to.be.equal(false);
             })
        })
    })
})

/**
****************************************
*              UTILS.SOL               *
****************************************
 */

describe("Utils Contract", function(){
    async function onlyDeployFixture() {
        const Lib = await ethers.getContractFactory("Utils");
        const lib = await Lib.deploy();
        return lib;
    }

    describe("RandNo", function(){
        it("Should not revert", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            expect((await lib).randNo(5)).not.to.be.reverted;
        })    
    })        

    describe("uintArrayFind", function(){
        it("Should revert if the searched element is not present", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let array:number[]=[0, 1, 2, 3, 4, 5];
            await expect(lib.uintArrayFind(array, 8)).to.be.revertedWith("Value not found in the array!");
        })  
        
        it("Should return the position of the searched element", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let array:number[]=[0, 1, 2, 3, 4, 5];
            expect(await lib.uintArrayFind(array, 2)).to.equal(2);
        })  
    }) 
    
    describe("uintArrayContains", function(){
        it("Should return false if the searched element is not present", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let array:number[]=[0, 1, 2, 3, 4, 5];
            expect(await lib.uintArrayContains(array, 8)).to.be.equal(false);
        })  
        
        it("Should return true if the searched element is present", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let array:number[]=[0, 1, 2, 3, 4, 5];
            expect(await lib.uintArrayContains(array, 5)).to.be.equal(true);
        })  
    }) 

    describe("strcmp", function(){
        it("Should return false if the compared strings differs", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            expect(await lib.strcmp("HELLO", "HOLA")).to.be.equal(false);
        })  
        
        it("Should return true if the compared strings are equal", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            expect(await lib.strcmp("HELLO", "HELLO")).to.be.equal(true);
        })  
    })
    
    describe("matchCount", function(){
        it("Should return 0 if there are there are no char matches between the strings", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let s1:string="HELLO";
            let s2:string="CIAOS";
            expect(await lib.matchCount(s1, s2)).to.be.equal(0);
        })  
        
        it("Should return the correct number of matches between the strings", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let s1:string="HELLO";
            let s2:string="HOLAS";
            expect(await lib.matchCount(s1, s2)).to.be.equal(2);
        })  
    })

    describe("semiMatchCount", function(){
        //Semi match: correct letter but wrong position
        it("Should return the correct number of semi-matches between the strings", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let s1:string="AECBD";
            let s2:string="CEBAA";
            let alphabet:string="ABCDE";
            expect(await lib.semiMatchCount(s1, s2, alphabet)).to.be.equal(3);
        })  
        
        it("Should return 0 if the strings are equal", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let s1:string="CEDDA";
            let s2:string="CEDDA";
            let alphabet:string="ABCDE";
            expect(await lib.semiMatchCount(s1, s2, alphabet)).to.be.equal(0);
        })  
    })

    describe("containsCharsOf", function(){
        it("Should return true if the string contains characters of the defined alphabet", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let s1:string="TOPOLINO";
            let alphabet:string="OILNOPT";
            expect(await lib.containsCharsOf(s1, alphabet)).to.be.equal(true);
        })  
        
        it("Should return true if the string contains at least a character that is not in the defined alphabet", async function () {
            const lib=await loadFixture(onlyDeployFixture);
            let s1:string="PLUTO";
            let alphabet:string="OILNOPT";
            expect(await lib.containsCharsOf(s1, alphabet)).to.be.equal(false);
        })  
    })
})
