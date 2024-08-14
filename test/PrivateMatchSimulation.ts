import { expect } from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre, {ethers} from "hardhat";
const {utils} = require("ethers");
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { match } from "assert";

const CODE_SIZE=5;
const NUMBER_OF_GUESSES=5;
const NUMBER_OF_TURNS=4;
const EXTRA_REWARD=2;

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
    
    const MastermindGame = await MastermindGame_factory.deploy(CODE_SIZE, EXTRA_REWARD, NUMBER_OF_TURNS, NUMBER_OF_GUESSES);
    return{player1, player2, MastermindGame}
}

async function guess(contract:any, matchId: number, turnId: number, who:any, what:string){
        let tx=await contract.connect(who).guessTheCode(matchId, turnId, what);
        expect(tx).not.to.be.reverted;
        expect(tx).to.emit(contract,"newGuess").withArgs(matchId, turnId, what);
}

async function answer(contract:any, matchId: number, turnId: number, attempt:number,  who:any, CC:number, NC:number){
    let tx=await contract.connect(who).publishFeedback(matchId, turnId, CC, NC);
    expect(tx).not.to.be.reverted;
    //Event args: matchId, turnNum, attemptNum, corrPos, wrongPosCorrCol
    expect(tx).to.emit(contract,"feedbackProvided").withArgs(matchId, turnId, attempt, CC, NC);

    if(CC==CODE_SIZE){ //Code guessed
        expect(tx).to.emit(contract,"secretRequired").withArgs(matchId, turnId, true, who.address);
    }else{
        if(attempt==(NUMBER_OF_GUESSES-1)){ //Attempt bound reached
            expect(tx).to.emit(contract,"secretRequired").withArgs(matchId, turnId, false, who.address);
        }
    }
}

async function hashpublish(contract:any, matchId: number, turnId: number, who:any, what: string){
    let digest=await ethers.keccak256(ethers.toUtf8Bytes(what));
    let tx=await contract.connect(who).publishCodeHash(matchId, turnId, digest);
    expect(tx).not.to.be.reverted;
    expect(tx).to.emit(contract,"codeHashPublished").withArgs(matchId, turnId, digest);
}

async function secretcodepublish(contract:any, matchId: number, turnId: number, who:any, what: string){
    let tx=await contract.connect(who).publishSecret(matchId, turnId, what);
    expect(tx).not.to.be.reverted;
    //Third argument is the length of the dispute window
    expect(tx).to.emit(contract,"disputeWindowOpen").withArgs(matchId, turnId, anyValue);
}

//If the last parameter is specified the function does a check on the winner of the turn
async function endturn(contract:any, matchId: number, turnId: number, who:any, winner?:any){
    let tx=await contract.connect(who).endTurn(matchId, turnId);
    expect(tx).not.to.be.reverted;

    //third param: points earned by the codeMaker in this turn, fourth param: codeMaker address
    expect(tx).to.emit(contract,"turnCompleted").withArgs(matchId, turnId, anyValue, anyValue);
    if(turnId==(NUMBER_OF_TURNS-1)){
        if(typeof winner !== 'undefined'){
            //Second param of the event: address of the winner
            expect(tx).to.emit(contract,"matchCompleted").withArgs(matchId, winner);
        }else{
            expect(tx).to.emit(contract,"matchCompleted").withArgs(matchId, anyValue);
        }
    }else{
        //in the next turn the codeBreaker will become the new codeMaker
        expect(tx).emit(contract,"newTurnStarted").withArgs(matchId, turnId+1, who); 
    }
}

describe("MATCH SIMULATIONS", function(){
    it("REGULAR PRIVATE MATCH SIMULATION", async function(){
        /** In this use case scenario we would like to test the correctness of the procedures
         * invoked during the execution of a private match. A 'private match' is a match in which
         * the creator has specified the address of his contender, hence only him can join in that match. */
        
        /**We assume that the contract which manages the game, MastermindGame.sol, has been deployed by
        * an account which is the "owner" of the game. This account is responsible for setting up the
        * game parameters - such as the codeSize, the number of turns, the number of available guesses in each
        * turn, the time slots for the disputes/AFK and so on- but it cannot control the matches between 
        * the users. In this case we assume that: codeSize=5, extraReward=2, numberTurns=4, numberGuesses=5*/
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
                
        /*---PRIVATE MATCH CREATION---
        * Let's suppose that 'player1' wants to play with 'player2' so it creates a private match
        * through the invocation of the function createPrivateMatch(addressOfPlayer2); By using this function
        * nobody apart from 'player2' can join this privateMatch. The matchId is a simple progressive number
        * hence we can expect the first call to this function to return a match with id 0. The creator of the
        * game will be registered as the 'player1' of the match, while the 'player2' of the match will be the
        * address of the chosen opponent.*/
        let tx=await MastermindGame.connect(player1).createPrivateMatch(player2.address);
        expect(tx).not.to.be.reverted.and.to.equal(0);
        expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
    
        /*Now 'player2' has to join the private match created by 'player1'. The function invoked is 
        joinMatchWithId() with the input parameter 0, the matchId. */
        tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        expect(tx).not.to.be.reverted;
        expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
        
        /*When both player have joined the match, they have to deposit the stake. Here we assume that
        the amount of wei to send is agreed offchain by the 2 parties. Let's suppose that they have chosen
        to put in stake 20 WEI. The match creator is responsible for setting this information inside the state
        of the match through the function call setStakeValue(0, 4).*/
        tx=await MastermindGame.connect(player1).setStakeValue(0, 20);
        expect(tx).not.to.be.reverted;
        expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(player2.address, 0, 20);
        
        /*When both player have joined the match, they have to deposit the stake. Here we assume that
        the amount of wei to send is agreed offchain by the 2 parties. Let's suppose that they have chosen
        to put in stake 20 WEI. The match creator is responsible for setting this information inside the state
        of the match through the function call setStakeValue(0, 20). An event is emitted whenever both player
        have deposited the stake and the first turn of the match will be automatically created. In that case
        the codeMaker role will be randomly assigned between the 2 players.*/
            
        tx=await MastermindGame.connect(player1).depositStake(0, {value:20});
        expect(tx).not.to.be.reverted;
        expect(tx).to.changeEtherBalance(player1.address, -20);
        tx=await MastermindGame.connect(player2).depositStake(0, {value:20});
        expect(tx).not.to.be.reverted;
        expect(tx).to.changeEtherBalance(player1.address, -20);
        expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0);
        //Initialization of the turn 0 of the match 0
        expect(tx).to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            
        //************************************************************
        //---TURN 0: Ended in 3 attempts (CODE GUESSED)---
        {
            /*As soon as the new turn starts the codeMaker randomly chosen has to provide the hash image of the 
            secret code it has generated. After the publication an informative event will be emitted.
            Let's suppose that the codeMaker has chosen the secret code "TARTA"*/
            let code="TARTA";
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await hashpublish(MastermindGame, 0, 0, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 0, player2, code);
            } 
            
            /* Now the codeBreaker has to provide a guess. After the publication an informative event will be emitted.
            Let's suppose that the codeBreaker sends the code "BARBA". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [3, 0] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="BARBA";
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await answer(MastermindGame, 0, 0, 0, player1, 3, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 0, player2, 3, 0);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="BATCA"
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 0, 1, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 0, 1, player2, 2, 1);
            }
                    
            //---GUESS #2 [GUESSED]---
            codeGuess="TARTA"
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 0, 2, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 2, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            /*The codeMaker publish the secret code in clear so that the contract can check that it has not
            changed that code during the turn. If all the check are passed the function will emit an event which
            informs the codeBreaker about the possibility to open a dispute within a certain time.*/ 
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 0, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 0, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            /*Whenever the codeMaker has published the secret code, the codeBreaker can confirm that the codeMaker
            has behaved correctly during the turn by calling the EndTurn function, or may open a dispute withing a
            certain time window in order to report a maliciuos behavior and trigger the punishment procedure.
            The codemaker has earned 2 points*/
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 0, player2);
            }else{
                await endturn(MastermindGame, 0, 0, player1);
            }

            //The codeBreaker has earned 2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 0]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([0, 2]);
            }
        }
        
        
        
        //************************************************************
        //TURN 1: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="YAPTR";
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                await hashpublish(MastermindGame, 0, 1, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 1, player2, code);
            } 
            
            /* Let's suppose that the codeBreaker sends the code "PCGVY". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [0, 1] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="PCGVY";
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await answer(MastermindGame, 0, 1, 0, player1, 0, 1);            
            }else{
                await answer(MastermindGame, 0, 1, 0, player2, 0, 1);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="WBATR"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 1, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 1, 1, player2, 2, 1);
            }
                    
            //---GUESS #2 [FAILED]---
            codeGuess="BACTR"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 2, player1, 3, 0);            
            }else{
                await answer(MastermindGame, 0, 1, 2, player2, 3, 0);
            }

            //---GUESS #3 [FAILED]---
            codeGuess="VYCTR"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 3, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 1, 3, player2, 2, 1);
            }

            //---GUESS #4 [FAILED]---
            codeGuess="PATRY"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            }  
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 4, player1, 1, 4);            
            }else{
                await answer(MastermindGame, 0, 1, 4, player2, 1, 4);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 1, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 1, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 1, player2);
            }else{
                await endturn(MastermindGame, 0, 1, player1);
            }

            //The codeBreaker has earned 5+2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 2]);
            }
        }
        

        //************************************************************
        //TURN 2: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="PVCRW";
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await hashpublish(MastermindGame, 0, 2, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 2, player2, code);
            } 
            
            /* Let's suppose that the codeBreaker sends the code "PCGVY". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [0, 1] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="GVRPY";
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await answer(MastermindGame, 0, 2, 0, player1, 1, 2);            
            }else{
                await answer(MastermindGame, 0, 2, 0, player2, 1, 2);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="WCAGV"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 1, player1, 0, 3);            
            }else{
                await answer(MastermindGame, 0, 2, 1, player2, 0, 3);
            }
                    
            //---GUESS #2 [FAILED]---
            codeGuess="RTYWB"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 2, player1, 0, 2);            
            }else{
                await answer(MastermindGame, 0, 2, 2, player2, 0, 2);
            }

            //---GUESS #3 [FAILED]---
            codeGuess="GPVRY"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 3, player1, 1, 2);            
            }else{
                await answer(MastermindGame, 0, 2, 3, player2, 1, 2);
            }

            //---GUESS #4 [FAILED]---
            codeGuess="ACWBR"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            }  
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 4, player1, 0, 3);            
            }else{
                await answer(MastermindGame, 0, 2, 4, player2, 0, 3);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 2, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 2, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 2, player2);
            }else{
                await endturn(MastermindGame, 0, 2, player1);
            }

            //The codeBreaker has earned 5+2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([9, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 9]);
            }
        }

        //************************************************************
        //TURN 3: Ended in 2 attempts (CODE GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="PRYVA";
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await hashpublish(MastermindGame, 0, 3, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 3, player2, code);
            } 
            
            /* Let's suppose that the codeBreaker sends the code "PCGVY". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [0, 1] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="TRYVA";
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await guess(MastermindGame, 0, 3, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 3, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await answer(MastermindGame, 0, 3, 0, player1, 4, 0);            
            }else{
                await answer(MastermindGame, 0, 3, 0, player2, 4, 0);
            }
            
            //---GUESS #1 [GUESSED]---
            codeGuess="PRYVA"
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await guess(MastermindGame, 0, 3, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 3, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 3, 1, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 3, 1, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the code has been discovered
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 3, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 3, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 3, player2, player1);
            }else{
                await endturn(MastermindGame, 0, 3, player1, player2);
            }
        }    
            
    })

    it("REGULAR PUBLIC MATCH SIMULATION", async function(){
        /** In this use case scenario we would like to test the correctness of the procedures
         * invoked during the execution of a public match. A 'public match' is a match in which
         * the creator has not specified the address of his contender, hence any other player can
         * yoin that match. The turn operations are the same of the case above.*/
        
        /**We assume that the contract which manages the game, MastermindGame.sol, has been deployed by
        * an account which is the "owner" of the game. This account is responsible for setting up the
        * game parameters - such as the codeSize, the number of turns, the number of available guesses in each
        * turn, the time slots for the disputes/AFK and so on- but it cannot control the matches between 
        * the users. In this case we assume that: codeSize=5, extraReward=2, numberTurns=4, numberGuesses=5*/
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
                
        /*---PUBLIC MATCH CREATION---
        * Let's suppose that 'player1' creates a new public match through the invocation of the function 
        * createPrivateMatch(addressOfPlayer2); By using this function any player can join this match. The matchId 
        * is a simple progressive number hence we can expect the first call to this function to return a match with
        * id 0. The creator of the game will be registered as the 'player1' of the match, while the 'player2' of the
        * match will be the the address zero.*/
        let tx=await MastermindGame.connect(player1).createMatch();
        expect(tx).not.to.be.reverted.and.to.equal(0);
        expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        await expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWithCustomError(MastermindGame,"Player2NotJoinedYet");
    
        /*Now 'player2' has to join the private match created by 'player1'. The function invoked is 
        joinMatchWithId() with the input parameter 0, the matchId. */
        tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        expect(tx).not.to.be.reverted;
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
        expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
        
        /*When both player have joined the match, they have to deposit the stake. Here we assume that
        the amount of wei to send is agreed offchain by the 2 parties. Let's suppose that they have chosen
        to put in stake 20 WEI. The match creator is responsible for setting this information inside the state
        of the match through the function call setStakeValue(0, 4).*/
        tx=await MastermindGame.connect(player1).setStakeValue(0, 20);
        expect(tx).not.to.be.reverted;
        expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(player2.address, 0, 20);
        
        /*When both player have joined the match, they have to deposit the stake. Here we assume that
        the amount of wei to send is agreed offchain by the 2 parties. Let's suppose that they have chosen
        to put in stake 20 WEI. The match creator is responsible for setting this information inside the state
        of the match through the function call setStakeValue(0, 20). An event is emitted whenever both player
        have deposited the stake and the first turn of the match will be automatically created. In that case
        the codeMaker role will be randomly assigned between the 2 players.*/
            
        tx=await MastermindGame.connect(player1).depositStake(0, {value:20});
        expect(tx).not.to.be.reverted;
        expect(tx).to.changeEtherBalance(player1.address, -20);
        tx=await MastermindGame.connect(player2).depositStake(0, {value:20});
        expect(tx).not.to.be.reverted;
        expect(tx).to.changeEtherBalance(player1.address, -20);
        expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0);
        //Initialization of the turn 0 of the match 0
        expect(tx).to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            
        //************************************************************
        //---TURN 0: Ended in 3 attempts (CODE GUESSED)---
        {
            /*As soon as the new turn starts the codeMaker randomly chosen has to provide the hash image of the 
            secret code it has generated. After the publication an informative event will be emitted.
            Let's suppose that the codeMaker has chosen the secret code "TARTA"*/
            let code="TARTA";
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await hashpublish(MastermindGame, 0, 0, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 0, player2, code);
            } 
            
            /* Now the codeBreaker has to provide a guess. After the publication an informative event will be emitted.
            Let's suppose that the codeBreaker sends the code "BARBA". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [3, 0] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="BARBA";
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await answer(MastermindGame, 0, 0, 0, player1, 3, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 0, player2, 3, 0);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="BATCA"
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 0, 1, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 0, 1, player2, 2, 1);
            }
                    
            //---GUESS #2 [GUESSED]---
            codeGuess="TARTA"
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 0, 2, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 2, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            /*The codeMaker publish the secret code in clear so that the contract can check that it has not
            changed that code during the turn. If all the check are passed the function will emit an event which
            informs the codeBreaker about the possibility to open a dispute within a certain time.*/ 
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 0, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 0, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            /*Whenever the codeMaker has published the secret code, the codeBreaker can confirm that the codeMaker
            has behaved correctly during the turn by calling the EndTurn function, or may open a dispute withing a
            certain time window in order to report a maliciuos behavior and trigger the punishment procedure.
            The codemaker has earned 2 points*/
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 0, player2);
            }else{
                await endturn(MastermindGame, 0, 0, player1);
            }

            //The codeBreaker has earned 2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 0]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([0, 2]);
            }
        }
        
        
        
        //************************************************************
        //TURN 1: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="YAPTR";
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                await hashpublish(MastermindGame, 0, 1, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 1, player2, code);
            } 
            
            /* Let's suppose that the codeBreaker sends the code "PCGVY". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [0, 1] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="PCGVY";
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await answer(MastermindGame, 0, 1, 0, player1, 0, 1);            
            }else{
                await answer(MastermindGame, 0, 1, 0, player2, 0, 1);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="WBATR"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 1, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 1, 1, player2, 2, 1);
            }
                    
            //---GUESS #2 [FAILED]---
            codeGuess="BACTR"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 2, player1, 3, 0);            
            }else{
                await answer(MastermindGame, 0, 1, 2, player2, 3, 0);
            }

            //---GUESS #3 [FAILED]---
            codeGuess="VYCTR"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 3, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 1, 3, player2, 2, 1);
            }

            //---GUESS #4 [FAILED]---
            codeGuess="PATRY"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            }  
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 4, player1, 1, 4);            
            }else{
                await answer(MastermindGame, 0, 1, 4, player2, 1, 4);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 1, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 1, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 1, player2);
            }else{
                await endturn(MastermindGame, 0, 1, player1);
            }

            //The codeBreaker has earned 5+2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 2]);
            }
        }
        

        //************************************************************
        //TURN 2: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="PVCRW";
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await hashpublish(MastermindGame, 0, 2, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 2, player2, code);
            } 
            
            /* Let's suppose that the codeBreaker sends the code "PCGVY". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [0, 1] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="GVRPY";
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await answer(MastermindGame, 0, 2, 0, player1, 1, 2);            
            }else{
                await answer(MastermindGame, 0, 2, 0, player2, 1, 2);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="WCAGV"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 1, player1, 0, 3);            
            }else{
                await answer(MastermindGame, 0, 2, 1, player2, 0, 3);
            }
                    
            //---GUESS #2 [FAILED]---
            codeGuess="RTYWB"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 2, player1, 0, 2);            
            }else{
                await answer(MastermindGame, 0, 2, 2, player2, 0, 2);
            }

            //---GUESS #3 [FAILED]---
            codeGuess="GPVRY"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 3, player1, 1, 2);            
            }else{
                await answer(MastermindGame, 0, 2, 3, player2, 1, 2);
            }

            //---GUESS #4 [FAILED]---
            codeGuess="ACWBR"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            }  
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 4, player1, 0, 3);            
            }else{
                await answer(MastermindGame, 0, 2, 4, player2, 0, 3);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 2, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 2, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 2, player2);
            }else{
                await endturn(MastermindGame, 0, 2, player1);
            }

            //The codeBreaker has earned 5+2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([9, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 9]);
            }
        }

        //************************************************************
        //TURN 3: Ended in 2 attempts (CODE GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="PRYVA";
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await hashpublish(MastermindGame, 0, 3, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 3, player2, code);
            } 
            
            /* Let's suppose that the codeBreaker sends the code "PCGVY". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [0, 1] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="TRYVA";
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await guess(MastermindGame, 0, 3, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 3, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await answer(MastermindGame, 0, 3, 0, player1, 4, 0);            
            }else{
                await answer(MastermindGame, 0, 3, 0, player2, 4, 0);
            }
            
            //---GUESS #1 [GUESSED]---
            codeGuess="PRYVA"
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await guess(MastermindGame, 0, 3, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 3, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 3, 1, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 3, 1, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the code has been discovered
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 3, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 3, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 3, player2, player1);
            }else{
                await endturn(MastermindGame, 0, 3, player1, player2);
            }
        }    
            
    })

    it("TIE MATCH SIMULATION", async function(){
        /** In this use case scenario we would like to test the correctness of the procedures
         * invoked during the execution of a public match. A 'public match' is a match in which
         * the creator has not specified the address of his contender, hence any other player can
         * yoin that match. The turn operations are the same of the case above.*/
        
        /**We assume that the contract which manages the game, MastermindGame.sol, has been deployed by
        * an account which is the "owner" of the game. This account is responsible for setting up the
        * game parameters - such as the codeSize, the number of turns, the number of available guesses in each
        * turn, the time slots for the disputes/AFK and so on- but it cannot control the matches between 
        * the users. In this case we assume that: codeSize=5, extraReward=2, numberTurns=4, numberGuesses=5*/
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
                
        /*---PUBLIC MATCH CREATION---
        * Let's suppose that 'player1' creates a new public match through the invocation of the function 
        * createPrivateMatch(addressOfPlayer2); By using this function any player can join this match. The matchId 
        * is a simple progressive number hence we can expect the first call to this function to return a match with
        * id 0. The creator of the game will be registered as the 'player1' of the match, while the 'player2' of the
        * match will be the the address zero.*/
        let tx=await MastermindGame.connect(player1).createMatch();
        expect(tx).not.to.be.reverted.and.to.equal(0);
        expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        await expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWithCustomError(MastermindGame,"Player2NotJoinedYet");
    
        /*Now 'player2' has to join the private match created by 'player1'. The function invoked is 
        joinMatchWithId() with the input parameter 0, the matchId. */
        tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        expect(tx).not.to.be.reverted;
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
        expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
        
        /*When both player have joined the match, they have to deposit the stake. Here we assume that
        the amount of wei to send is agreed offchain by the 2 parties. Let's suppose that they have chosen
        to put in stake 20 WEI. The match creator is responsible for setting this information inside the state
        of the match through the function call setStakeValue(0, 4).*/
        tx=await MastermindGame.connect(player1).setStakeValue(0, 20);
        expect(tx).not.to.be.reverted;
        expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(player2.address, 0, 20);
        
        /*When both player have joined the match, they have to deposit the stake. Here we assume that
        the amount of wei to send is agreed offchain by the 2 parties. Let's suppose that they have chosen
        to put in stake 20 WEI. The match creator is responsible for setting this information inside the state
        of the match through the function call setStakeValue(0, 20). An event is emitted whenever both player
        have deposited the stake and the first turn of the match will be automatically created. In that case
        the codeMaker role will be randomly assigned between the 2 players.*/
            
        tx=await MastermindGame.connect(player1).depositStake(0, {value:20});
        expect(tx).not.to.be.reverted;
        expect(tx).to.changeEtherBalance(player1.address, -20);
        tx=await MastermindGame.connect(player2).depositStake(0, {value:20});
        expect(tx).not.to.be.reverted;
        expect(tx).to.changeEtherBalance(player1.address, -20);
        expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0);
        //Initialization of the turn 0 of the match 0
        expect(tx).to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            
        //************************************************************
        //---TURN 0: Ended in 3 attempts (CODE GUESSED)---
        {
            /*As soon as the new turn starts the codeMaker randomly chosen has to provide the hash image of the 
            secret code it has generated. After the publication an informative event will be emitted.
            Let's suppose that the codeMaker has chosen the secret code "TARTA"*/
            let code="TARTA";
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await hashpublish(MastermindGame, 0, 0, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 0, player2, code);
            } 
            
            /* Now the codeBreaker has to provide a guess. After the publication an informative event will be emitted.
            Let's suppose that the codeBreaker sends the code "BARBA". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [3, 0] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="BARBA";
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await answer(MastermindGame, 0, 0, 0, player1, 3, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 0, player2, 3, 0);
            }
            
                    
            //---GUESS #1 [GUESSED]---
            codeGuess="TARTA"
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 0, 1, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 1, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            /*The codeMaker publish the secret code in clear so that the contract can check that it has not
            changed that code during the turn. If all the check are passed the function will emit an event which
            informs the codeBreaker about the possibility to open a dispute within a certain time.*/ 
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 0, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 0, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            /*Whenever the codeMaker has published the secret code, the codeBreaker can confirm that the codeMaker
            has behaved correctly during the turn by calling the EndTurn function, or may open a dispute withing a
            certain time window in order to report a maliciuos behavior and trigger the punishment procedure.
            The codemaker has earned 1 point*/
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 0, player2);
            }else{
                await endturn(MastermindGame, 0, 0, player1);
            }

            //The codeBreaker has earned 1 point
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 0]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([0, 2]);
            }
        }
        
        
        
        //************************************************************
        //TURN 1: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="YAPTR";
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                await hashpublish(MastermindGame, 0, 1, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 1, player2, code);
            } 
            
            /* Let's suppose that the codeBreaker sends the code "PCGVY". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [0, 1] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="PCGVY";
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await answer(MastermindGame, 0, 1, 0, player1, 0, 1);            
            }else{
                await answer(MastermindGame, 0, 1, 0, player2, 0, 1);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="WBATR"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 1, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 1, 1, player2, 2, 1);
            }
                    
            //---GUESS #2 [FAILED]---
            codeGuess="BACTR"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 2, player1, 3, 0);            
            }else{
                await answer(MastermindGame, 0, 1, 2, player2, 3, 0);
            }

            //---GUESS #3 [FAILED]---
            codeGuess="VYCTR"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 3, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 1, 3, player2, 2, 1);
            }

            //---GUESS #4 [FAILED]---
            codeGuess="PATRY"
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await guess(MastermindGame, 0, 1, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 1, player1, codeGuess);
            }  
                
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 1, 4, player1, 1, 4);            
            }else{
                await answer(MastermindGame, 0, 1, 4, player2, 1, 4);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 1, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 1, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 1, player2);
            }else{
                await endturn(MastermindGame, 0, 1, player1);
            }

            //The codeBreaker has earned 5+2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 2]);
            }
        }
        

        //************************************************************
        //TURN 2: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="PVCRW";
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await hashpublish(MastermindGame, 0, 2, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 2, player2, code);
            } 
            
            /* Let's suppose that the codeBreaker sends the code "PCGVY". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [0, 1] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="GVRPY";
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await answer(MastermindGame, 0, 2, 0, player1, 1, 2);            
            }else{
                await answer(MastermindGame, 0, 2, 0, player2, 1, 2);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="WCAGV"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 1, player1, 0, 3);            
            }else{
                await answer(MastermindGame, 0, 2, 1, player2, 0, 3);
            }
                    
            //---GUESS #2 [FAILED]---
            codeGuess="RTYWB"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 2, player1, 0, 2);            
            }else{
                await answer(MastermindGame, 0, 2, 2, player2, 0, 2);
            }

            //---GUESS #3 [FAILED]---
            codeGuess="GPVRY"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 3, player1, 1, 2);            
            }else{
                await answer(MastermindGame, 0, 2, 3, player2, 1, 2);
            }

            //---GUESS #4 [FAILED]---
            codeGuess="ACWBR"
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await guess(MastermindGame, 0, 2, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 2, player1, codeGuess);
            }  
                
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 2, 4, player1, 0, 3);            
            }else{
                await answer(MastermindGame, 0, 2, 4, player2, 0, 3);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 2, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 2, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 2, player2);
            }else{
                await endturn(MastermindGame, 0, 2, player1);
            }

            //The codeBreaker has earned 5+2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([9, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 9]);
            }
        }

        //************************************************************
        //TURN 3: Ended in 2 attempts (CODE GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="PRYVA";
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await hashpublish(MastermindGame, 0, 3, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 3, player2, code);
            } 
            
            /* Let's suppose that the codeBreaker sends the code "PCGVY". As we can see the number of perfect matches is 3
            while the number of partial matches (right color but wrong position is 0). So the codeMaker will answer that event
            by providing the feedback [0, 1] */
            
            //---GUESS #0 [FAILED]---
                    
            let codeGuess="TRYVA";
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await guess(MastermindGame, 0, 3, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 3, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await answer(MastermindGame, 0, 3, 0, player1, 4, 0);            
            }else{
                await answer(MastermindGame, 0, 3, 0, player2, 4, 0);
            }
            
            //---GUESS #1 [GUESSED]---
            codeGuess="PRYVA"
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await guess(MastermindGame, 0, 3, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 3, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await answer(MastermindGame, 0, 3, 1, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 3, 1, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the code has been discovered
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await secretcodepublish(MastermindGame, 0, 3, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 3, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 1 point.
            //The match ends with a TIE, check the condition
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //PublishFeedback (matchId, turnId, correctPos, correctColors)
                await endturn(MastermindGame, 0, 3, player2, 0);
            }else{
                await endturn(MastermindGame, 0, 3, player1, 0);
            }
        }    
            
    })

    //TODO: AFK SIMULATION, NO STAKE DEPOSITED SIMULATION, CHEATING OF THE CODE SIMULATION, CHEATING ON THE FEEDBACK, MULTIPLE MATCHES
})
