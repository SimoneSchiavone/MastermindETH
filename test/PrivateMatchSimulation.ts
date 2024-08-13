import { expect } from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre, {ethers} from "hardhat";
const {utils} = require("ethers");
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

async function Deployment() {
    const [owner, player1, player2]=await ethers.getSigners();
    
    /*The Utils library is an "external library", so its contract will be deployed
    independently from the MastermindGame contract.*/
    const Lib = await ethers.getContractFactory("Utils");
    const lib = await Lib.deploy();
    let add:string=await lib.getAddress();
    const MastermindGame_factory = await ethers.getContractFactory("MastermindGame", {
        libraries: {
            Utils: add,
        },
    });
    
    const MastermindGame = await MastermindGame_factory.deploy(5, 2, 4, 5);
    
    return{player1, player2, MastermindGame}
}

describe("REGULAR PRIVATE MATCH SIMULATION", function(){
/** In this use case scenario we would like to test the correctness of the procedures
 * invoked during the execution of a private match. A 'private match' is a match in which
 * the creator has specified the address of his contender, hence only him can join in that match. */

    async function PrivateMatchCreation() {
        const [owner, player1, player2]=await ethers.getSigners();
        
        /*The Utils library is an "external library", so its contract will be deployed
        independently from the MastermindGame contract.*/
        const Lib = await ethers.getContractFactory("Utils");
        const lib = await Lib.deploy();
        let add:string=await lib.getAddress();
        const MastermindGame_factory = await ethers.getContractFactory("MastermindGame", {
            libraries: {
                Utils: add,
            },
        });
        const MastermindGame = await MastermindGame_factory.deploy(5, 2, 4, 5);
        await MastermindGame.connect(player1).createPrivateMatch(player2.address);
        return{player1, player2, MastermindGame}
    }

    /**We assume that the contract which manages the game, MastermindGame.sol, has been deployed by
    * an account which is the "owner" of the game. This account is responsible for setting up the
    * game parameters - such as the codeSize, the number of turns, the number of available guesses in each
    * turn, the time slots for the disputes/AFK and so on- but it cannot control the matches between 
    * the users. In this case we assume that: codeSize=5, extraReward=2, numberTurns=4, numberGuesses=5*/
    it("Contract deployment", async function() {
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
    })
    
    /**Let's suppose that 'player1' wants to play with 'player2' so it creates a private match
     * through the invocation of the function createPrivateMatch(addressOfPlayer2); By using this function
     * nobody apart from 'player2' can join this privateMatch. The matchId is simple a progressive number
     * hence we can expect the first call to this function to return a match with id 0. The creator of the
     * game will be registered as the 'player1' of the match, while the 'player2' of the match will be the
     * address of the chosen opponent.
    */
    it("Private match creation by 'player1'", async function() {
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
        const tx=await MastermindGame.connect(player1).createPrivateMatch(player2.address);
        expect(tx).not.to.be.reverted.and.to.equal(0);
        expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
    })

    /*Now 'player2' has to join the private match created by 'player1'. The function invoked is 
    joinMatchWithId() with the input parameter 0, the matchId. */
    it("Now 'player2' joins the match", async function() {
        const {player1, player2, MastermindGame}=await loadFixture(PrivateMatchCreation);
        const tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        expect(tx).not.to.be.reverted;
        expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
    })

    async function PrivateMatchBothJoined() {
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
        await MastermindGame.connect(player1).createPrivateMatch(player2.address);
        const tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        return {player1, player2, MastermindGame};
    }

    /*When both player have joined the match, they have to deposit the stake. Here we assume that
    the amount of wei to send is agreed offchain by the 2 parties. Let's suppose that they have chosen
    to put in stake 3 WEI. The match creator is responsible for setting this information inside the state
    of the match through the function call setStakeValue(0, 4).*/
    it("Stake amount fixed", async function() {
        const {player1, player2, MastermindGame}=await loadFixture(PrivateMatchBothJoined);
        const tx=await MastermindGame.connect(player1).setStakeValue(0, 4);
        expect(tx).not.to.be.reverted;
        expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(player2.address, 0, 4);
    })

    async function PrivateMatchDepositRequired() {
        const {player1, player2, MastermindGame}=await loadFixture(PrivateMatchBothJoined);
        await MastermindGame.connect(player1).setStakeValue(0, 4);
        return {player1, player2, MastermindGame};
    }

    /*When both player have joined the match, they have to deposit the stake. Here we assume that
    the amount of wei to send is agreed offchain by the 2 parties. Let's suppose that they have chosen
    to put in stake 3 WEI. The match creator is responsible for setting this information inside the state
    of the match through the function call setStakeValue(0, 4). An event is emitted whenever both player
    have deposited the stake.*/
    it("Both have deposited the stake", async function() {
        //TODO: Continua da qui
        const {player1, player2, MastermindGame}=await loadFixture(PrivateMatchDepositRequired);
        const tx_1=await MastermindGame.connect(player1).depositStake(0, {value:4});
        expect(tx_1).not.to.be.reverted;
        expect(tx_1).to.changeEtherBalance(player1.address, -4);
        const tx_2=await MastermindGame.connect(player2).depositStake(0, {value:4});
        expect(tx_2).not.to.be.reverted;
        expect(tx_2).to.changeEtherBalance(player1.address, -4);
        expect(tx_2).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0);
    })
})