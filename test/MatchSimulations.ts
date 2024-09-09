import { expect } from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre, {ethers} from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

const CODE_SIZE=5;
const NUMBER_OF_GUESSES=5;
const NUMBER_OF_TURNS=4;
const EXTRA_REWARD=2;

const STAKE=20;
//Deployment fixture
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

/*
****************************************
*    Functions for match operations    *
****************************************
*/
async function guess(contract:any, matchId: number, turnId: number, who:any, what:string){
        let tx=await contract.connect(who).guessTheCode(matchId, turnId, what);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(contract,"newGuess").withArgs(matchId, turnId, what);
}

async function answer(contract:any, matchId: number, turnId: number, attempt:number,  who:any, CC:number, NC:number){
    let tx=await contract.connect(who).publishFeedback(matchId, turnId, CC, NC);
    await expect(tx).not.to.be.reverted;
    //Event args: matchId, turnNum, attemptNum, corrPos, wrongPosCorrCol
    await expect(tx).to.emit(contract,"feedbackProvided").withArgs(matchId, turnId, attempt, CC, NC);

    if(CC==CODE_SIZE){ //Code guessed
        await expect(tx).to.emit(contract,"secretRequired").withArgs(matchId, turnId, true, who.address);
    }else{
        if(attempt==(NUMBER_OF_GUESSES-1)){ //Attempt bound reached
            await expect(tx).to.emit(contract,"secretRequired").withArgs(matchId, turnId, false, who.address);
        }
    }
}

async function hashpublish(contract:any, matchId: number, turnId: number, who:any, what: string){
    let digest=await ethers.keccak256(ethers.toUtf8Bytes(what));
    let tx=await contract.connect(who).publishCodeHash(matchId, turnId, digest);
    await expect(tx).not.to.be.reverted;
    await expect(tx).to.emit(contract,"codeHashPublished").withArgs(matchId, turnId, digest);
}

async function secretcodepublish(contract:any, matchId: number, turnId: number, who:any, what: string){
    let tx=await contract.connect(who).publishSecret(matchId, turnId, what);
    await expect(tx).not.to.be.reverted;
    //Third argument is the length of the dispute window
    await expect(tx).to.emit(contract,"disputeWindowOpen").withArgs(matchId, turnId, anyValue);
}

//If the last parameter is specified (address of the winner) the function does a check on the winner of the turn
async function endturn(contract:any, matchId: number, turnId: number, who:any, winner?:any){
    let tx=await contract.connect(who).endTurn(matchId, turnId);
    await expect(tx).not.to.be.reverted;

    //third param: points earned by the codeMaker in this turn, fourth param: codeBreaker address, fifth optional parameter is the match winner
    await expect(tx).to.emit(contract,"turnCompleted").withArgs(matchId, turnId, anyValue, anyValue);
    if(turnId==(NUMBER_OF_TURNS-1)){
        if(typeof winner !== 'undefined'){ //Case of NOT TIE
            //Second param of the event: address of the winner
            await expect(tx).to.emit(contract,"matchCompleted").withArgs(matchId, winner);
            await expect(tx).to.changeEtherBalances([winner, contract] ,[(STAKE*2), -(STAKE*2)]);
        }else{
            await expect(tx).to.emit(contract,"matchCompleted").withArgs(matchId, anyValue);
            await expect(tx).to.changeEtherBalance(contract, -(STAKE*2));
            await expect(tx).to.changeEtherBalance(who, STAKE);
        }
    }else{
        //in the next turn the codeBreaker will become the new codeMaker
        await expect(tx).emit(contract,"newTurnStarted").withArgs(matchId, turnId+1, who.address); 
    }
}

describe("MATCH SIMULATIONS", function(){
    /*
        ****************************************
        *      Regular private match sim.      *
        ****************************************
    */

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
        await expect(tx).not.to.be.reverted.and.to.equal(0);
        await expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
    
        /*Now 'player2' has to join the private match created by 'player1'. The function invoked is 
        joinMatchWithId() with the input parameter 0, the matchId. */
        tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
        
        /*When both player have joined the match, they have to deposit the stake. Here we assume that
        the amount of wei to send is agreed offchain by the 2 parties. Let's suppose that they have chosen
        to put in stake 20 WEI. The match creator is responsible for setting this information inside the state
        of the match through the function call setStakeValue(0, 20).*/
        tx=await MastermindGame.connect(player1).setStakeValue(0, 20);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(0, 20);
        
        /*An event is emitted when the match stake is fixed and then the two players have to pay the agreed amout of WEI.
        An event is emitted whenever a payment is performed. When both players have deposited the stake the first turn 
        of the match will be automatically created. In that case the codeMaker role will be randomly assigned between the 2 players.*/

        tx=await MastermindGame.connect(player1).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player1, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player1.address);

        tx=await MastermindGame.connect(player2).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player2, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player2.address);

        //Initialization of the turn 0 of the match 0
        await expect(tx).to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            
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
                await answer(MastermindGame, 0, 0, 2, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 2, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            /*The codeMaker publish the secret code in clear so that the contract can check that it has not
            changed that code during the turn. If all the checks are passed the function will emit an event which
            informs the codeBreaker about the possibility to open a dispute within a certain time.*/ 
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await secretcodepublish(MastermindGame, 0, 0, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 0, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            /*Whenever the codeMaker has published the secret code, the codeBreaker:
            ---> can confirm that the codeMaker has behaved correctly during the turn by calling the EndTurn function
            ---> can open a dispute within a certain time window in order to report a maliciuos behavior and trigger 
                 the punishment procedure.*/
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await endturn(MastermindGame, 0, 0, player2);
            }else{
                await endturn(MastermindGame, 0, 0, player1);
            }

            //The codeMaker has earned 2 points because the codeBreaker has failed twice
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 0]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([0, 2]);
            }
        }    
        
        //************************************************************
        //TURN 1: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            //All the function calls in this block will have as parameters matchId=0 turnId=1
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
                await answer(MastermindGame, 0, 1, 4, player1, 1, 4);            
            }else{
                await answer(MastermindGame, 0, 1, 4, player2, 1, 4);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await secretcodepublish(MastermindGame, 0, 1, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 1, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                await endturn(MastermindGame, 0, 1, player2);
            }else{
                await endturn(MastermindGame, 0, 1, player1);
            }

            //The codeMaker has earned 5+2 points
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
                await answer(MastermindGame, 0, 2, 4, player1, 0, 3);            
            }else{
                await answer(MastermindGame, 0, 2, 4, player2, 0, 3);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await secretcodepublish(MastermindGame, 0, 2, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 2, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await endturn(MastermindGame, 0, 2, player2);
            }else{
                await endturn(MastermindGame, 0, 2, player1);
            }

            //The codeMaker has earned 5+2 points
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
                await answer(MastermindGame, 0, 3, 1, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 3, 1, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the code has been discovered
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await secretcodepublish(MastermindGame, 0, 3, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 3, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The winner will be the last codeBreaker with final score [9, 8]
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await endturn(MastermindGame, 0, 3, player2, player2.address);
            }else{
                await endturn(MastermindGame, 0, 3, player1, player1.address);
            }
        }         
    })

    /*
        ****************************************
        *      Regular public match sim.       *
        ****************************************
    */

    it("REGULAR PUBLIC MATCH SIMULATION", async function(){
        /** In this use case scenario we would like to test the correctness of the procedures
         * invoked during the execution of a public match. A 'public match' is a match in which
         * the creator has not specified the address of his contender, hence any other player can
         * join that match. The turn operations are the same of the case above so repetitive comments
         * are omitted .*/
        
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
                
        /*---PUBLIC MATCH CREATION---
        * Let's suppose that 'player1' creates a new public match through the invocation of the function 
        * createPublicMatch(); By using this function any player can join this match. The matchId 
        * is a simple progressive number hence we can expect the first call to this function to return a match with
        * id 0. The creator of the game will be registered as the 'player1' of the match, while the 'player2' of the
        * match will be the the address zero.*/
        let tx=await MastermindGame.connect(player1).createMatch();
        await expect(tx).not.to.be.reverted.and.to.equal(0);
        await expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        await expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWithCustomError(MastermindGame,"Player2NotJoinedYet");
    
        //---SECOND PLAYER JOINS---
        tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        await expect(tx).not.to.be.reverted;
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
        await expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
        
        //---STAKE FIXED---
        tx=await MastermindGame.connect(player1).setStakeValue(0, STAKE);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(0, STAKE);
        
        //---STAKE DEPOSIT---        
        tx=await MastermindGame.connect(player1).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player1, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player1.address);

        tx=await MastermindGame.connect(player2).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player2, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player2.address);

        //Initialization of the turn 0 of the match 0
        await expect(tx).to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            
        //************************************************************
        //---TURN 0: Ended in 3 attempts (CODE GUESSED)---
        {
            let code="TARTA";
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await hashpublish(MastermindGame, 0, 0, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 0, player2, code);
            } 
            
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
                await answer(MastermindGame, 0, 0, 2, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 2, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await secretcodepublish(MastermindGame, 0, 0, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 0, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await endturn(MastermindGame, 0, 0, player2);
            }else{
                await endturn(MastermindGame, 0, 0, player1);
            }

            //The codeMaker has earned 2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 0]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([0, 2]);
            }
        }  
        
        //************************************************************
        //TURN 1: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            let code="YAPTR";
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                await hashpublish(MastermindGame, 0, 1, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 1, player2, code);
            }
            
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
                await answer(MastermindGame, 0, 1, 4, player1, 1, 4);            
            }else{
                await answer(MastermindGame, 0, 1, 4, player2, 1, 4);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await secretcodepublish(MastermindGame, 0, 1, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 1, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                await endturn(MastermindGame, 0, 1, player2);
            }else{
                await endturn(MastermindGame, 0, 1, player1);
            }

            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 2]);
            }
        }

        //************************************************************
        //TURN 2: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            let code="PVCRW";
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await hashpublish(MastermindGame, 0, 2, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 2, player2, code);
            } 

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
                await secretcodepublish(MastermindGame, 0, 2, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 2, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await endturn(MastermindGame, 0, 2, player2);
            }else{
                await endturn(MastermindGame, 0, 2, player1);
            }

            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([9, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 9]);
            }
        }

        //************************************************************
        //TURN 3: Ended in 2 attempts (CODE GUESSED)   
        {   
            let code="PRYVA";
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await hashpublish(MastermindGame, 0, 3, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 3, player2, code);
            } 

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
                await answer(MastermindGame, 0, 3, 1, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 3, 1, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the code has been discovered
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await secretcodepublish(MastermindGame, 0, 3, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 3, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await endturn(MastermindGame, 0, 3, player2, player2.address);
            }else{
                await endturn(MastermindGame, 0, 3, player1, player1.address);
            }

        }      
    })

    /*
        ****************************************
        *            Tie match sim.            *
        ****************************************
    */

    it("TIE MATCH SIMULATION", async function(){
         /** In this use case scenario we would like to test the correctness of the procedures
         * invoked during the execution of a public match which ends with a tie. The operations
         * are pretty like those in the first/second simulation, so repetitive comments are omitted.*/
        
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
                
        //--PUBLIC MATCH CREATION---
        let tx=await MastermindGame.connect(player1).createMatch();
        await expect(tx).not.to.be.reverted.and.to.equal(0);
        await expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        await expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWithCustomError(MastermindGame,"Player2NotJoinedYet");
    
        //---SECOND PLAYER JOINS---
        tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        await expect(tx).not.to.be.reverted;
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
        await expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
        
        //---STAKE FIXED---
        tx=await MastermindGame.connect(player1).setStakeValue(0, 20);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(0, 20);
        
        //---STAKE DEPOSIT---
        tx=await MastermindGame.connect(player1).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player1, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player1.address);

        tx=await MastermindGame.connect(player2).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player2, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player2.address);
        //Initialization of the turn 0 of the match 0
        await expect(tx).to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            
        //************************************************************
        //---TURN 0: Ended in 2 attempts (CODE GUESSED)---
        {
            let code="TARTA";
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await hashpublish(MastermindGame, 0, 0, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 0, player2, code);
            } 
            
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
                await answer(MastermindGame, 0, 0, 1, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 1, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await secretcodepublish(MastermindGame, 0, 0, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 0, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await endturn(MastermindGame, 0, 0, player2);
            }else{
                await endturn(MastermindGame, 0, 0, player1);
            }

            //The codeMaker has earned 2 points
            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 0]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([0, 2]);
            }
        }     
        
        //************************************************************
        //TURN 1: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            let code="YAPTR";
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                await hashpublish(MastermindGame, 0, 1, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 1, player2, code);
            }
            
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
                await answer(MastermindGame, 0, 1, 4, player1, 1, 4);            
            }else{
                await answer(MastermindGame, 0, 1, 4, player2, 1, 4);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0,1))==player1.address){
                await secretcodepublish(MastermindGame, 0, 1, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 1, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 1))==player1.address){
                await endturn(MastermindGame, 0, 1, player2);
            }else{
                await endturn(MastermindGame, 0, 1, player1);
            }

            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([2, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 2]);
            }
        }

        //************************************************************
        //TURN 2: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            let code="PVCRW";
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await hashpublish(MastermindGame, 0, 2, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 2, player2, code);
            } 

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
                await answer(MastermindGame, 0, 2, 4, player1, 0, 3);            
            }else{
                await answer(MastermindGame, 0, 2, 4, player2, 0, 3);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the bound on the attempts has been reached. 
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await secretcodepublish(MastermindGame, 0, 2, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 2, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 2))==player1.address){
                await endturn(MastermindGame, 0, 2, player2);
            }else{
                await endturn(MastermindGame, 0, 2, player1);
            }

            if(await MastermindGame.getCodeMaker(0,0)==player1.address){
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([9, 7]);
            }else{
                expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([7, 9]);
            }
        }

        //************************************************************
        //TURN 3: Ended in 2 attempts (CODE GUESSED)   
        {   
            let code="PRYVA";
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await hashpublish(MastermindGame, 0, 3, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 3, player2, code);
            } 

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
                await answer(MastermindGame, 0, 3, 1, player1, 5, 0);            
            }else{
                await answer(MastermindGame, 0, 3, 1, player2, 5, 0);
            }
            
            //---SECRET PUBLICATION---
            //The turn is ended because the code has been discovered
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                await secretcodepublish(MastermindGame, 0, 3, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 3, player2, code);
            }
            
            //---TURN ENDS WITHOUT DISPUTES---
            //The codeMaker has earned 5 (attemtps) + 2 (extra) = 7 points
            if((await MastermindGame.getCodeMaker(0, 3))==player1.address){
                //The last parameter set to zero represents the fact that the match should end with a tie
                await endturn(MastermindGame, 0, 3, player2);
            }else{
                //The last parameter set to zero represents the fact that the match should end with a tie
                await endturn(MastermindGame, 0, 3, player1);
            }
        }       
    })

    /*
        ****************************************
        *       Stake not deposited sim.       *
        ****************************************
     */

    it("STAKE NOT DEPOSITED SIMULATION", async function(){
        /** In this use case scenario we would like to test the correctness of the procedures
        * invoked during the execution of a public match in which the match stake is not deposited. The operations
        * are pretty like those in the first/second simulation, so repetitive comments are omitted.*/
       
       const {player1, player2, MastermindGame}=await loadFixture(Deployment);
               
       //--PUBLIC MATCH CREATION---
       let tx=await MastermindGame.connect(player1).createMatch();
       await expect(tx).not.to.be.reverted.and.to.equal(0);
       await expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
       expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
       await expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWithCustomError(MastermindGame,"Player2NotJoinedYet");
   
       //---SECOND PLAYER JOINS---
       tx=await MastermindGame.connect(player2).joinMatchWithId(0);
       await expect(tx).not.to.be.reverted;
       expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
       await expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
       
       //---STAKE FIXED---
       tx=await MastermindGame.connect(player1).setStakeValue(0, STAKE);
       await expect(tx).not.to.be.reverted;
       await expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(0, STAKE);
       
       //---STAKE DEPOSIT BY PLAYER1---        
       tx=await MastermindGame.connect(player1).depositStake(0, {value:STAKE});
       await expect(tx).not.to.be.reverted;
       await expect(tx).to.changeEtherBalance(player1, -STAKE);
       
       /*---PLAYER 2 DO NOT DEPOSIT THE MATCH STAKE---
       * The other player does not deposit the required match stake within a certain time window that, in this
       * contract is fixed to 25 blocks (a block each 12 secs on average, hence in total approximately 5 minutes).
       * The player who has already paid can request the contract to be refunded. The amount of wei will be sent
       * back to player1 and the game will deleted. */
       await hre.network.provider.send("hardhat_mine", ["0x19"]); //mine 25 "dummy" blocks
       tx=await MastermindGame.connect(player1).requestRefundMatchStake(0);
       await expect(tx).not.to.be.reverted;
       await expect(tx).to.changeEtherBalances([player1, MastermindGame], [STAKE, -STAKE]);
       await expect(tx).to.emit(MastermindGame,"matchDeleted").withArgs(0);
    })

    /*
        ****************************************
        *           AFK player sim.            *
        ****************************************
    */

    it("AFK SIMULATION", async function(){
        /** In this use case scenario we would like to test the correctness of the procedures
        * invoked during the execution of a public match in case of one of the 2 players who goes AFK.
        * The player who thinks that the opponent has gone AFK should invoke the proper method to report that
        * to the Mastermind contract. This will trigger the emission of a specific event and the presumed AFK 
        * player should answer to that by performing the required action within a fixed time window. If no
        * action is taken the reporter will receive all the stake for that match and the match will be deleted.*/
    
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
        
                
        //--PUBLIC MATCH CREATION---
        let tx=await MastermindGame.connect(player1).createMatch();
        await expect(tx).not.to.be.reverted.and.to.equal(0);
        await expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        await expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWithCustomError(MastermindGame,"Player2NotJoinedYet");

        //---SECOND PLAYER JOINS---
        tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        await expect(tx).not.to.be.reverted;
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
        await expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
        
        //---STAKE FIXED---
        tx=await MastermindGame.connect(player1).setStakeValue(0, STAKE);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(0, STAKE);
        
        //---STAKE DEPOSIT---        
        tx=await MastermindGame.connect(player1).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player1, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player1.address);
        tx=await MastermindGame.connect(player2).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player2, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player2.address);
        //Initialization of the turn 0 of the match 0
        await expect(tx).to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            
        //************************************************************
        //---TURN 0: Ended in 2 attempts due to AFK from the codeBreaker---
        {
            let code="TARTA";
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await hashpublish(MastermindGame, 0, 0, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 0, player2, code);
            } 
            
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
                    
            //---GUESS #1 [AFK]---
            /* The codeBreaker doesn't send his guess for a long time so the codeMaker of this turn 
            * reports that situation to the contract. */
            
            //...no actions...
            //...no actions...
            //...no actions...

            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await expect(MastermindGame.connect(player1).reportOpponentAFK(0)).to.emit(MastermindGame,"AFKreported").withArgs(0, player2.address);
            }else{
                await expect(MastermindGame.connect(player2).reportOpponentAFK(0)).to.emit(MastermindGame,"AFKreported").withArgs(0, player1.address);
            }
            
            /*The AFK reporter has to wait for a fixed amount of time in order to redeem all the game stake. In the
            * Mastermind contract this amount of time is of 10 blocks (1 block each 12 secs on average, hence approximately 2 minutes).*/
            
            await hre.network.provider.send("hardhat_mine", ["0xA"]); //mine 10 "dummy" blocks
            
            /*The amount that will be refunded is the double of the match stake (hence also the wei deposited by the
            AFK player.)*/
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                tx=await MastermindGame.connect(player1).requestRefundForAFK(0);
                await expect(tx).to.emit(MastermindGame,"AFKconfirmed").withArgs(0, player2.address);
                await expect(tx).to.changeEtherBalances([player1, MastermindGame], [2*STAKE, -2*STAKE]);
                await expect(tx).to.emit(MastermindGame, "matchDeleted").withArgs(0);
            }else{
                tx=await MastermindGame.connect(player2).requestRefundForAFK(0);
                await expect(tx).to.emit(MastermindGame,"AFKconfirmed").withArgs(0, player1.address);
                await expect(tx).to.changeEtherBalances([player2, MastermindGame], [2*STAKE, -2*STAKE]);
                await expect(tx).to.emit(MastermindGame, "matchDeleted").withArgs(0);
            }
        }
    })

    /*
    ****************************************
    *       Secret code changed sim.       *
    ****************************************
    */

    it("CHEATING SIMULATION: secret code changed", async function(){
        /** In this use case scenario we would like to test the correctness of the procedures
        * invoked during the execution of a public match in case of an uncorrect behavior of the codeMaker. In
        * particular in this scenario we will try the case in which the codeMaker of a turn changes the code initially
        * published during the execution of that turn. The codeMaker who provides a code whose hash does not correspond to
        * the one stored at the beginning of the turn, will be punished. The punishment procedure will send all the match stake
        * to the codeBreaker of that turn and the match will be deleted.*/
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
                
        //--PUBLIC MATCH CREATION---
        let tx=await MastermindGame.connect(player1).createMatch();
        await expect(tx).not.to.be.reverted.and.to.equal(0);
        await expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        await expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWithCustomError(MastermindGame,"Player2NotJoinedYet");

        //---SECOND PLAYER JOINS---
        tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        await expect(tx).not.to.be.reverted;
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
        await expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
        
        //---STAKE FIXED---
        tx=await MastermindGame.connect(player1).setStakeValue(0, STAKE);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(0, STAKE);
        
        //---STAKE DEPOSIT---        
        tx=await MastermindGame.connect(player1).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player1, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player1.address);
        tx=await MastermindGame.connect(player2).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player2, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player2.address);
        //Initialization of the turn 0 of the match 0
        await expect(tx).to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            
        //************************************************************
        //TURN 0: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="YAPTR";
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await hashpublish(MastermindGame, 0, 0, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 0, player2, code);
            } 
            
            //---GUESS #0 [FAILED]---
            let codeGuess="PCGVY";
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await answer(MastermindGame, 0, 0, 0, player1, 0, 1);            
            }else{
                await answer(MastermindGame, 0, 0, 0, player2, 0, 1);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="WBATR"
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await answer(MastermindGame, 0, 0, 1, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 0, 1, player2, 2, 1);
            }
                    
            //---GUESS #2 [FAILED]---
            codeGuess="BACTR"
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await answer(MastermindGame, 0, 0, 2, player1, 3, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 2, player2, 3, 0);
            }

            //---GUESS #3 [FAILED]---
            codeGuess="VYCTR"
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await answer(MastermindGame, 0, 0, 3, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 0, 3, player2, 2, 1);
            }

            //---GUESS #4 [FAILED]---
            codeGuess="PATRY"
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            }  
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await answer(MastermindGame, 0, 0, 4, player1, 1, 4);            
            }else{
                await answer(MastermindGame, 0, 0, 4, player2, 1, 4);
            }
            
            //---SECRET PUBLICATION---
            /* The turn is ended because the bound on the attempts has been reached. The codeBreaker provides
            * a secret code which has been modified during the match.*/
            code="TARTY" //Secret code was YAPTR
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                let tx=await MastermindGame.connect(player1).publishSecret(0, 0, code);
                await expect(tx).not.to.be.reverted;
                await expect(tx).to.emit(MastermindGame,"cheatingDetected").withArgs(0, 0, player1.address);
                await expect(tx).to.changeEtherBalances([player2, MastermindGame], [2*STAKE, -2*STAKE]);
                await expect(tx).to.emit(MastermindGame, "matchDeleted").withArgs(0);
            }else{
                let tx=await MastermindGame.connect(player2).publishSecret(0, 0, code);
                await expect(tx).not.to.be.reverted;
                await expect(tx).to.emit(MastermindGame,"cheatingDetected").withArgs(0, 0, player2.address);
                await expect(tx).to.changeEtherBalances([player1, MastermindGame], [2*STAKE, -2*STAKE]);
                await expect(tx).to.emit(MastermindGame, "matchDeleted").withArgs(0);
            }
        }
    })

    /*
        ****************************************
        *         Wrong feedback sim.          *
        ****************************************
    */
    it("CHEATING SIMULATION: wrong feedback", async function(){
        /** In this use case scenario we would like to test the correctness of the procedures
        * invoked during the execution of a public match in case of an uncorrect behavior of the codeMaker. In
        * particular in this scenario we will try the case in which the codeMaker of a turn provides one ore more
        * misleading feedbacks. When the codeMaker has published the secret code the codeBreaker can open a dispute
        * regarding one of the feedback provided by the codeMaker during the turn. The conctract code will check whether
        * the codeMaker has acted maliciously and in this case it will apply the punishment against him. If the codeBreaker
        * has opened a useless dispute it will be punished. In both cases, whenever a dispute is open, the match will be surely closed
        * with the punishment of one between the 2 players.*/
        const {player1, player2, MastermindGame}=await loadFixture(Deployment);
                
        //--PUBLIC MATCH CREATION---
        let tx=await MastermindGame.connect(player1).createMatch();
        await expect(tx).not.to.be.reverted.and.to.equal(0);
        await expect(tx).to.emit(MastermindGame,"newMatchCreated").withArgs(player1.address, 0);
        expect(await MastermindGame.getMatchCreator(0)).to.equal(player1.address);
        await expect(MastermindGame.getSecondPlayer(0)).to.be.revertedWithCustomError(MastermindGame,"Player2NotJoinedYet");

        //---SECOND PLAYER JOINS---
        tx=await MastermindGame.connect(player2).joinMatchWithId(0);
        await expect(tx).not.to.be.reverted;
        expect(await MastermindGame.getSecondPlayer(0)).to.equal(player2.address);
        await expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(player2.address, 0);
        
        //---STAKE FIXED---
        tx=await MastermindGame.connect(player1).setStakeValue(0, STAKE);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(0, STAKE);
        
        //---STAKE DEPOSIT---        
        tx=await MastermindGame.connect(player1).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player1, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player1.address);

        tx=await MastermindGame.connect(player2).depositStake(0, {value:STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([player2, MastermindGame] ,[-STAKE, STAKE]);
        await expect(tx).to.emit(MastermindGame,"matchStakeDeposited").withArgs(0, player2.address);
        //Initialization of the turn 0 of the match 0
        await expect(tx).to.emit(MastermindGame,"newTurnStarted").withArgs(0, 0, anyValue);
            
        //************************************************************
        //TURN 0: Ended in 5 attempts (CODE NOT GUESSED)   
        {   
            //All the fuction calls in this block will have as parameters matchId=0 turnId=1
            let code="YAPTR";
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await hashpublish(MastermindGame, 0, 0, player1, code);
            }else{
                await hashpublish(MastermindGame, 0, 0, player2, code);
            } 
            
            //---GUESS #0 [FAILED]---
            let codeGuess="PCGVY";
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await answer(MastermindGame, 0, 0, 0, player1, 0, 1);            
            }else{
                await answer(MastermindGame, 0, 0, 0, player2, 0, 1);
            }
            
            //---GUESS #1 [FAILED]---
            codeGuess="WBATR"
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                //Code:YAPTR Guess:WBATR Correct answer is [CC=2 NC=1]
                await answer(MastermindGame, 0, 0, 1, player1, 0, 1);            
            }else{
                await answer(MastermindGame, 0, 0, 1, player2, 0, 1);
            }
                    
            //---GUESS #2 [FAILED]---
            codeGuess="BACTR"
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await answer(MastermindGame, 0, 0, 2, player1, 3, 0);            
            }else{
                await answer(MastermindGame, 0, 0, 2, player2, 3, 0);
            }

            //---GUESS #3 [FAILED]---
            codeGuess="VYCTR"
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            } 
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await answer(MastermindGame, 0, 0, 3, player1, 2, 1);            
            }else{
                await answer(MastermindGame, 0, 0, 3, player2, 2, 1);
            }

            //---GUESS #4 [FAILED]---
            codeGuess="PATRY"
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await guess(MastermindGame, 0, 0, player2, codeGuess);
            }else{
                await guess(MastermindGame, 0, 0, player1, codeGuess);
            }  
                
            if((await MastermindGame.getCodeMaker(0, 0))==player1.address){
                await answer(MastermindGame, 0, 0, 4, player1, 1, 4);            
            }else{
                await answer(MastermindGame, 0, 0, 4, player2, 1, 4);
            }
            
            //---SECRET PUBLICATION---
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                await secretcodepublish(MastermindGame, 0, 0, player1, code);
            }else{
                await secretcodepublish(MastermindGame, 0, 0, player2, code);
            }

            //DISPUTE OPENING
            if((await MastermindGame.getCodeMaker(0,0))==player1.address){
                //Third parameter is the feedback that the codeBreaker wants to dispute
                tx= await MastermindGame.connect(player2).openDispute(0, 0, 1);
                await expect(tx).not.to.be.reverted;
                await expect(tx).to.emit(MastermindGame,"cheatingDetected").withArgs(0, 0, player1.address);
                await expect(tx).to.changeEtherBalances([player2, MastermindGame], [2*STAKE, -2*STAKE]);
                await expect(tx).to.emit(MastermindGame, "matchDeleted").withArgs(0);
            }else{
                tx= await MastermindGame.connect(player1).openDispute(0, 0, 1);
                await expect(tx).not.to.be.reverted;
                await expect(tx).to.emit(MastermindGame,"cheatingDetected").withArgs(0, 0, player2.address);
                await expect(tx).to.changeEtherBalances([player1, MastermindGame], [2*STAKE, -2*STAKE]);
                await expect(tx).to.emit(MastermindGame, "matchDeleted").withArgs(0);
            }
        }
    })

    /*
        ****************************************
        *        Multiple matches sim.         *
        ****************************************
    */

    it("MULTIPLE MATCH SIMULATION", async function () {
        /** In this use case scenario we would like to test the correctness of the procedures
        * invoked during the execution of multiple simultaneous matches, possibly involving the same user
        * in more than one game. In this context the contract is deployed by specifying only 2 turns and
        * 3 guesses per turn.*/
        const Lib = await ethers.getContractFactory("Utils");
        const lib = await Lib.deploy();
        let add:string=await lib.getAddress();
        const MastermindGame_factory = await ethers.getContractFactory("MastermindGame", {
            libraries: {
                Utils: add,
            },
        });
    
        const MastermindGame = await MastermindGame_factory.deploy(CODE_SIZE, EXTRA_REWARD, 2, 3);

        let [owner, user1, user2, user3]= await ethers.getSigners();

        //User1 creates a private match with User2. The match will have the matchId=0
        let tx=await MastermindGame.connect(user1).createPrivateMatch(user2.address);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "newMatchCreated").withArgs(user1.address, 0);

        //We expect to have 2 active matches managed by the contract
        expect(await MastermindGame.activeMatchesNum()).to.equal(1);

        //User1 creates a public match match. The match will have the matchId=1
        tx=await MastermindGame.connect(user1).createMatch();
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "newMatchCreated").withArgs(user1.address, 1);

        //We expect to have 2 active matches managed by the contract
        expect(await MastermindGame.activeMatchesNum()).to.equal(2);

        //User2 joins the private match with id 0
        tx=await MastermindGame.connect(user2).joinMatchWithId(0);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(user2.address, 0);

        //User3 would like to find an open match that is waiting for an opponent, so he join the match with id 1
        tx=await MastermindGame.connect(user3).joinMatch();
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "secondPlayerJoined").withArgs(user3.address, 1);

        //The match creators of both matches et the matchStake value that has been decided offchain
        tx=await MastermindGame.connect(user1).setStakeValue(0, STAKE);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(0, STAKE);
        tx=await MastermindGame.connect(user1).setStakeValue(1, STAKE);
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.emit(MastermindGame, "matchStakeFixed").withArgs(1, STAKE);
        expect((await MastermindGame.matchesMap(0)).stake).to.equal(STAKE);
        expect((await MastermindGame.matchesMap(1)).stake).to.equal(STAKE);

        //Stake deposit by players of match with id 0
        tx=await MastermindGame.connect(user1).depositStake(0, {value: STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([MastermindGame, user1], [STAKE, -STAKE]);
        await expect(tx).to.emit(MastermindGame, "matchStakeDeposited").withArgs(0, user1.address);

        tx=await MastermindGame.connect(user2).depositStake(0, {value: STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([MastermindGame, user2], [STAKE, -STAKE]);
        await expect(tx).to.emit(MastermindGame, "matchStakeDeposited").withArgs(0, user2.address);
        await expect(tx).to.emit(MastermindGame, "newTurnStarted").withArgs(0, 0, anyValue);

        expect((await MastermindGame.matchesMap(0)).deposit1).to.equal(true);
        expect((await MastermindGame.matchesMap(0)).deposit2).to.equal(true);

        //Stake deposit by players of match with id 1
        tx=await MastermindGame.connect(user1).depositStake(1, {value: STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([MastermindGame, user1], [STAKE, -STAKE]);
        await expect(tx).to.emit(MastermindGame, "matchStakeDeposited").withArgs(1, user1.address);

        tx=await MastermindGame.connect(user3).depositStake(1, {value: STAKE});
        await expect(tx).not.to.be.reverted;
        await expect(tx).to.changeEtherBalances([MastermindGame, user3], [STAKE, -STAKE]);
        await expect(tx).to.emit(MastermindGame, "matchStakeDeposited").withArgs(1, user3.address); //both have deposited the stake
        await expect(tx).to.emit(MastermindGame, "newTurnStarted").withArgs(1, 0, anyValue);

        expect((await MastermindGame.matchesMap(1)).deposit1).to.equal(true);
        expect((await MastermindGame.matchesMap(1)).deposit2).to.equal(true);

        //----------First turn of both matches----------
        //hash publication phase match with id 0 between User1 & User2
        if(await MastermindGame.getCodeMaker(0, 0)==user1.address){
            await hashpublish(MastermindGame, 0, 0, user1, "ABCTV");
        }else{
            await hashpublish(MastermindGame, 0, 0, user2, "ABCTV");
        }
        
        //hash publication phase match with id 1 between User1 & User3
        if(await MastermindGame.getCodeMaker(1, 0)==user1.address){
            await hashpublish(MastermindGame, 1, 0, user1, "WYCAR");
        }else{
            await hashpublish(MastermindGame, 1, 0, user3, "WYCAR");
        }

        {
            //MATCH 0 TURN 0 GUESS 0 (FAILED)
            expect((await MastermindGame.getTurn(0, 0)).codeProposals.length).to.equal(0);
            if(await MastermindGame.getCodeMaker(0, 0)==user1.address){
                await guess(MastermindGame, 0, 0, user2, "ABCAB");
                await answer(MastermindGame, 0, 0, 0, user1, 3, 0);
            }else{
                await guess(MastermindGame, 0, 0, user1, "ABCAB");
                await answer(MastermindGame, 0, 0, 0, user2, 3, 0);
            }

            //MATCH 1 TURN 0 GUESS 0 (FAILED)
            if(await MastermindGame.getCodeMaker(1, 0)==user1.address){
                await guess(MastermindGame, 1, 0, user3, "BYCAR");
                await answer(MastermindGame, 1, 0, 0, user1, 4, 0);
            }else{
                await guess(MastermindGame, 1, 0, user1, "BYCAR");
                await answer(MastermindGame, 1, 0, 0, user3, 4, 0);
            }

            //MATCH 1 TURN 0 GUESS 1 (FAILED)
            if(await MastermindGame.getCodeMaker(1, 0)==user1.address){
                await guess(MastermindGame, 1, 0, user3, "BYCAT");
                await answer(MastermindGame, 1, 0, 1, user1, 4, 0);
            }else{
                await guess(MastermindGame, 1, 0, user1, "BYCAT");
                await answer(MastermindGame, 1, 0, 1, user3, 4, 0);
            }

            //MATCH 0 TURN 0 GUESS 1 (GUESSED)
            expect((await MastermindGame.getTurn(0, 0)).isSuspended).to.equal(false);
            expect((await MastermindGame.getTurn(0, 0)).codeGuessed).to.equal(false);
            if(await MastermindGame.getCodeMaker(0, 0)==user1.address){
                await guess(MastermindGame, 0, 0, user2, "ABCTV");
                await answer(MastermindGame, 0, 0, 1, user1, 5, 0);
            }else{
                await guess(MastermindGame, 0, 0, user1, "ABCTV");
                await answer(MastermindGame, 0, 0, 1, user2, 5, 0);
            }
            expect((await MastermindGame.getTurn(0, 0)).isSuspended).to.equal(true);
            expect((await MastermindGame.getTurn(0, 0)).codeGuessed).to.equal(true);

            //MATCH 1 TURN 0 GUESS 2 (FAILED)
            if(await MastermindGame.getCodeMaker(1, 0)==user1.address){
                await guess(MastermindGame, 1, 0, user3, "BABCT");
                await answer(MastermindGame, 1, 0, 2, user1, 0, 1);
            }else{
                await guess(MastermindGame, 1, 0, user1, "BABCT");
                await answer(MastermindGame, 1, 0, 2, user3, 0, 1);
            }
        }

        //secret publication by the codeMaker and acceptance by the codeBreaker
        if(await MastermindGame.getCodeMaker(0, 0)==user1.address){
            await secretcodepublish(MastermindGame, 0, 0, user1, "ABCTV");
            await endturn(MastermindGame, 0, 0, user2);
        }else{
            await secretcodepublish(MastermindGame, 0, 0, user2, "ABCTV");
            await endturn(MastermindGame, 0, 0, user1);
        }
        
        //secret publication by the codeMaker and acceptance by the codeBreaker
        if(await MastermindGame.getCodeMaker(1, 0)==user1.address){
            await secretcodepublish(MastermindGame, 1, 0, user1, "WYCAR");
            await endturn(MastermindGame, 1, 0, user3);
        }else{
            await secretcodepublish(MastermindGame, 1, 0, user3, "WYCAR");
            await endturn(MastermindGame, 1, 0, user1);
        }

        if(await MastermindGame.getCodeMaker(0, 0)==user1.address){
            expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([1, 0]);
        }else{
            expect(await MastermindGame.getActualPoints(0)).not.to.be.reverted.and.to.equal([0, 1]);
        }

        if(await MastermindGame.getCodeMaker(1, 0)==user1.address){
            expect(await MastermindGame.getActualPoints(1)).not.to.be.reverted.and.to.equal([5, 0]);
        }else{
            expect(await MastermindGame.getActualPoints(1)).not.to.be.reverted.and.to.equal([0, 5]);
        }

        //----------Second turn of both matches----------
        //hash publication phase match with id 0 between User1 & User2
        if(await MastermindGame.getCodeMaker(0, 1)==user1.address){
            await hashpublish(MastermindGame, 0, 1, user1, "RVVPA");
        }else{
            await hashpublish(MastermindGame, 0, 1, user2, "RVVPA");
        }
        
        //hash publication phase match with id 1 between User1 & User3
        if(await MastermindGame.getCodeMaker(1, 1)==user1.address){
            await hashpublish(MastermindGame, 1, 1, user1, "BRTGA");
        }else{
            await hashpublish(MastermindGame, 1, 1, user3, "BRTGA");
        }
        
        {
            //MATCH 0 TURN 1 GUESS 0 (FAILED)
            if(await MastermindGame.getCodeMaker(0, 1)==user1.address){
                await guess(MastermindGame, 0, 1, user2, "RATAP");
                await answer(MastermindGame, 0, 1, 0, user1, 1, 2);
            }else{
                await guess(MastermindGame, 0, 1, user1, "RATAP");
                await answer(MastermindGame, 0, 1, 0, user2, 1, 2);
            }

            //MATCH 1 TURN 1 GUESS 0 (FAILED)
            if(await MastermindGame.getCodeMaker(1, 1)==user1.address){
                await guess(MastermindGame, 1, 1, user3, "BRYWA");
                await answer(MastermindGame, 1, 1, 0, user1, 2, 1);
            }else{
                await guess(MastermindGame, 1, 1, user1, "BRYWA");
                await answer(MastermindGame, 1, 1, 0, user3, 2, 1);
            }

            //MATCH 0 TURN 1 GUESS 1 (FAILED)
            if(await MastermindGame.getCodeMaker(0, 1)==user1.address){
                await guess(MastermindGame, 0, 1, user2, "GATAC");
                await answer(MastermindGame, 0, 1, 1, user1, 0, 1);
            }else{
                await guess(MastermindGame, 0, 1, user1, "GATAC");
                await answer(MastermindGame, 0, 1, 1, user2, 0, 1);
            } 

            //MATCH 1 TURN 1 GUESS 1 (FAILED)
            if(await MastermindGame.getCodeMaker(1, 1)==user1.address){
                await guess(MastermindGame, 1, 1, user3, "BYCAT");
                await answer(MastermindGame, 1, 1, 1, user1, 4, 0);
            }else{
                await guess(MastermindGame, 1, 1, user1, "BYCAT");
                await answer(MastermindGame, 1, 1, 1, user3, 4, 0);
            }

            //MATCH 1 TURN 1 GUESS 2 (FAILED)
            if(await MastermindGame.getCodeMaker(1, 1)==user1.address){
                await guess(MastermindGame, 1, 1, user3, "BABCT");
                await answer(MastermindGame, 1, 1, 2, user1, 0, 1);
            }else{
                await guess(MastermindGame, 1, 1, user1, "BABCT");
                await answer(MastermindGame, 1, 1, 2, user3, 0, 1);
            }

            //MATCH 0 TURN 1 GUESS 2 (FAILED)
            if(await MastermindGame.getCodeMaker(0, 1)==user1.address){
                await guess(MastermindGame, 0, 1, user2, "TTTTT");
                await answer(MastermindGame, 0, 1, 2, user1, 1, 0);
            }else{
                await guess(MastermindGame, 0, 1, user1, "TTTTT");
                await answer(MastermindGame, 0, 1, 2, user2, 1, 0);
            } 
        }
        
        //secret publication by the codeMaker and acceptance by the codeBreaker (Match 0 Turn 1)
        //The winner is the codeMaker of turn 1 [1, 5]
        if(await MastermindGame.getCodeMaker(0, 1)==user1.address){
            await secretcodepublish(MastermindGame, 0, 1, user1, "RVVPA");
            let tx=await MastermindGame.connect(user2).endTurn(0, 1);
            await expect(tx).not.to.be.reverted;
            await expect(tx).to.emit(MastermindGame,"turnCompleted").withArgs(0, 1, 5, user1);
            expect(await MastermindGame.getActualPoints(0)).to.deep.equal([5, 1]);
            await expect(tx).to.emit(MastermindGame,"matchCompleted").withArgs(0, user1);
        }else{
            await secretcodepublish(MastermindGame, 0, 1, user2, "RVVPA");
            let tx=await MastermindGame.connect(user1).endTurn(0, 1);
            await expect(tx).not.to.be.reverted;
            await expect(tx).to.emit(MastermindGame,"turnCompleted").withArgs(0, 1, 5, user2);
            expect(await MastermindGame.getActualPoints(0)).to.deep.equal([1, 5]);
            await expect(tx).to.emit(MastermindGame,"matchCompleted").withArgs(0, user2);
        }

        //secret publication by the codeMaker and acceptance by the codeBreaker (Match 1 Turn 1)
        //The winner is the codeMaker of turn 1 [1, 5]
        if(await MastermindGame.getCodeMaker(1, 1)==user1.address){
            await secretcodepublish(MastermindGame, 1, 1, user1, "BRTGA");
            let tx=await MastermindGame.connect(user3).endTurn(1, 1);
            await expect(tx).not.to.be.reverted;
            await expect(tx).to.emit(MastermindGame,"turnCompleted").withArgs(1, 1, 5, user1);
            expect(await MastermindGame.getActualPoints(1)).to.deep.equal([5, 5]);
            await expect(tx).to.emit(MastermindGame,"matchCompleted").withArgs(1, ethers.ZeroAddress);
        }else{
            await secretcodepublish(MastermindGame, 1, 1, user3, "BRTGA");
            let tx=await MastermindGame.connect(user1).endTurn(1, 1);
            await expect(tx).not.to.be.reverted;
            await expect(tx).to.emit(MastermindGame,"turnCompleted").withArgs(1, 1, 5, user3);
            expect(await MastermindGame.getActualPoints(1)).to.deep.equal([5, 5]);
            await expect(tx).to.emit(MastermindGame,"matchCompleted").withArgs(1, ethers.ZeroAddress);
        }
    })

})

