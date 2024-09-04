// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "hardhat/console.sol";
import "./Utils.sol";
import "./GameUtils.sol";

/**
 * @title Mastermind Game Contract
 * @author Simone Schiavone <s.schiavone3@studenti.unipi.it>
 * @notice This smart conctract manages the matches between users for the code breaking game Mastermind.
 */
contract MastermindGame {
    address private gameManager;
    address public negotiationContract; //address of the contract that may be used to negotiate the match stake

    //---GAME PARAMETERS---
    //Typically in the real game there are 10 colors, here they are Amber, Black, Cyan, Green, Pink, Red, Turquoise, Violet, White, Yellow
    string public availableColors="ABCGPRTVWY"; //Colors usable in the code
    uint private codeSize;
    uint private extraReward;  //extra reward for the code maker if the code breaker is not able to guess the code.
    uint private numberTurns;
    uint private numberGuesses;

    //---DEADLINES---
    uint constant STAKEPAYMENTDEADLINE = 25; //25 blocks, about 5 minutes
    uint constant DISPUTEWINDOWLENGTH= 10; //10 blocks, about 2 minutes
    uint constant AFKWINDOWLENGTH= 10; //10 blocks, about 2 minutes

    //---MATCH MANAGEMENT---
    struct Match{
        address player1; //creator of the match
        address player2; //second player
        bool ended; //match ended

        //---Match stake management---
        uint stake; //amount in wei to put in stake for this match
        uint stakePaymentsOpening; //blocknum of the block in which the stake is fixed
        bool deposit1; //indicates that player1 has payed the stake amount
        bool deposit2;

        //---Turns management---
        uint score1;
        uint score2;
        Turn[] turns;

        //---AFK management---
        uint lastAFKreport;
        address whoReportedTheLastAFK;
        address whoHasToDoTheNextOp; 
    }

    struct Turn{
        bytes32 codeHash; //published at the beginning of the turn
        string secret; //initially empty then filled at the end of the turn
        address codeMaker; //address of the codeMaker of this turn

        string[] codeProposals; //guesses of the code breaker at each attempt (max numberGuesses)
        uint[] correctColorAndPosition; //replies of the codeMaker regarding a full match (color&position match)
        uint[] correctColor; //replies of the codeMaker regarding a partial match (color ok but wrong position)

        bool codeGuessed; //indicates that the code has been guessed by the codeBreaker
        bool isSuspended; //indicates wether the turn is sospended due to the attempt bound or by the guessing of the secret
        uint disputeWindowOpening; //block number of the block in which the dispute window is opened.
    }

    mapping(uint => Match) public activeMatches; //matchId => Struct
    uint[] public publicMatchesWaitingForAnOpponent; 
    //array of IDs of matches, where "player2" field is not specified, waiting for a player
    uint[] public privateMatchesWaitingForAnOpponent; 
    //array of IDs of matches, having "player2" field specified, waiting for a specific player

    uint public activeMatchesNum=0; //counts active matches
    uint private nextMatchId=0; //matchId generation


    constructor(uint _codeSize, uint _extraReward, uint _numberTurns, uint _numberGuesses){
        if(_codeSize<1)
            revert GameUtils.InvalidParameter("codeSize<=1");
        if(_extraReward==0)
            revert GameUtils.InvalidParameter("extraReward=0");
        if(_numberTurns==0)
            revert GameUtils.InvalidParameter("numberTurns=0");
        if(_numberGuesses==0)
            revert GameUtils.InvalidParameter("numberGuesses=0");

        codeSize=_codeSize;
        extraReward=_extraReward;
        numberTurns=_numberTurns;
        numberGuesses=_numberGuesses;
        gameManager=msg.sender;
    }

    /*  
        ****************************************
        *          MATCHMAKING PHASE           *
        **************************************** 
    */

    /** @notice Function invoked in order to create a new game without setting
     * the address of the opponent. */ 
    function createMatch() public returns (uint matchId) {
        //Initialize a new match
        Match storage newMatch=activeMatches[nextMatchId];
        newMatch.player1=msg.sender;
        newMatch.player2=address(0);
        newMatch.ended=false;

        newMatch.stake=0;
        newMatch.deposit1=false;
        newMatch.deposit2=false;

        newMatch.score1=0;
        newMatch.score2=0;

        publicMatchesWaitingForAnOpponent.push(nextMatchId);

        emit GameUtils.newMatchCreated(newMatch.player1,(nextMatchId));
        
        nextMatchId++; //counter for the next new matchId
        activeMatchesNum++; //counter for the current active matches
        
        return (nextMatchId-1);
    }

    /**
     * @notice Function invoked in order to create a new game and setting
     * the address of the opponent.
     */ 
    function createPrivateMatch(address opponent) public returns (uint matchId) {
        if(opponent==address(0))
            revert GameUtils.InvalidParameter("opponent=0");
 
        if(opponent==msg.sender)
            revert GameUtils.InvalidParameter("opponent=yourself");

        //Initialize a new match
        Match storage newMatch=activeMatches[nextMatchId];
        newMatch.player1=msg.sender;
        newMatch.player2=opponent;

        privateMatchesWaitingForAnOpponent.push(nextMatchId);

        emit GameUtils.newMatchCreated(newMatch.player1, nextMatchId);
        
        nextMatchId++; //counter for the next new matchId
        activeMatchesNum++; //counter for the current active matches
        
        return (nextMatchId-1);
    }

    /** @notice Function that allow to join the match with a specified "id". */
    function joinMatchWithId(uint matchId) public{
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);

        if(activeMatches[matchId].player1==msg.sender)
            revert GameUtils.UnauthorizedAccess("You cannot join a match you have created");

        Match storage m=activeMatches[matchId];
        if(m.player2!=address(0)){ //second address not zero --> Private match
            if(Utils.uintArrayContains(privateMatchesWaitingForAnOpponent, matchId)){ //Available match
                //check that I'm the authorized opponent
                if(m.player2!=msg.sender)
                    revert GameUtils.UnauthorizedAccess("You cannot join this private match");

                m.player2=msg.sender; //add the second player

                uint idToDelete=Utils.uintArrayFind(privateMatchesWaitingForAnOpponent, matchId); //index in the array of the waiting matches
                popByIndex(privateMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status

                emit GameUtils.secondPlayerJoined(msg.sender, matchId);
            }else{ 
                //second address is specified and that match is not in the list of the available ones
                revert GameUtils.UnauthorizedAccess("Full match");
            }
        }else{ 
            //blank second address means that everyone can join this game
            m.player2=msg.sender; //add the second player

            uint idToDelete=Utils.uintArrayFind(publicMatchesWaitingForAnOpponent, matchId); //index in the array of the waiting matches
            popByIndex(publicMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status

            emit GameUtils.secondPlayerJoined(msg.sender, matchId);
        }
    }

    /** @notice Function that allow to join one of the available matches that are still
     * waiting for a second player. It will fail if there is no match available. */
    function joinMatch() public{
        if(publicMatchesWaitingForAnOpponent.length==0)
            revert GameUtils.UnauthorizedOperation("No matches available");

        uint randIdx=Utils.randNo(publicMatchesWaitingForAnOpponent.length); //generate a number in [0, current number of available matches)
        uint id=publicMatchesWaitingForAnOpponent[randIdx]; //get the id of the waiting match associated to the idx generated above

        if(activeMatches[id].player1==msg.sender)
            revert GameUtils.UnauthorizedAccess("You cannot join a match you have created");
        //it may happen that player1 creates a public match, then he decides to join another game but the "random" procedure
        //provides the id of the same match he has created.
        
        activeMatches[id].player2=msg.sender;
        uint idToDelete=Utils.uintArrayFind(publicMatchesWaitingForAnOpponent,id);
        popByIndex(publicMatchesWaitingForAnOpponent,idToDelete);
    
        emit GameUtils.secondPlayerJoined(msg.sender, id);
    }

    /*
        ****************************************
        *       MATCH STAKE NEGOTIATION        *
        ****************************************
    */
    /*Here it is assumed that the match creator sets the match stake parameter when the two 
    players agree on the stake value. The negotiation phase can be carried out by using 
    off-chain tools or by using a specific contract, whose address, if any, is provided by the
    negotiationContract variable of the contract; */

    /** @notice Function callable once only by the creator of the match in order to fix the amount put in stake.
     * @param matchId id of the match for which we are setting this parameter
     * @param value amount to put in stake, >0. */
    function setStakeValue(uint matchId, uint value) onlyMatchCreator(matchId) public{
        if(value==0)
            revert GameUtils.InvalidParameter("stakeValue=0");
        if(activeMatches[matchId].stake!=0)
            revert GameUtils.DuplicateOperation("Stake already fixed");

        Match storage m=activeMatches[matchId];
        m.stake=value;
        m.stakePaymentsOpening=block.number;

        emit GameUtils.matchStakeFixed(matchId, value);
    }

    /** @notice Function callable by the participants of a match in order to deposit the amount to put in stake. */
    function depositStake(uint matchId) onlyMatchParticipant(matchId) payable public{
        if(msg.value==0)
            revert GameUtils.InvalidParameter("WEI sent=0");
        if(msg.value!=activeMatches[matchId].stake)
            revert GameUtils.InvalidParameter("WEI sent!= agreed stake");
        Match storage m=activeMatches[matchId];
        if(msg.sender==m.player1){
            if(!m.deposit1){
                m.deposit1=true;
            }else{
                revert GameUtils.DuplicateOperation("WEI already sent");
            }
        }else{
            if(!m.deposit2){
                m.deposit2=true;
            }else{
                revert GameUtils.DuplicateOperation("WEI already sent");
            }
        }
        
        emit GameUtils.matchStakeDeposited(matchId,  msg.sender);
        //If both players have put in stake the right amount of wei the match can start so emit an event
        if(m.deposit1&&m.deposit2)
            initializeTurn(matchId,0);
    }

    /** @notice Function callable by the participants of a match in order to retire the amount of wei they have put in stake.
     * This works only if the phase of wei collection takes more than STAKEPAYMENTDEADLINE blocks. This action will nullify the match.*/
    function requestRefundMatchStake(uint matchId) onlyMatchParticipant(matchId) public {
        Match storage m=activeMatches[matchId];
        require((!m.deposit1)||(!m.deposit2),"Both players have deposited the stake");

        //The caller must have done the payment before
        if(msg.sender==m.player1){
            if(!m.deposit1)
                revert GameUtils.UnauthorizedOperation("Stake not deposited");
        }else{
            if(!m.deposit2)
                revert GameUtils.UnauthorizedOperation("Stake not deposited");
        }

        //Check if the deadline for the payments of the stake amount is already expired
        if(block.number<(m.stakePaymentsOpening+STAKEPAYMENTDEADLINE))
            revert GameUtils.UnauthorizedOperation("Deadline not expired");

        address who=msg.sender;
        uint howMuch=m.stake;

        dropTheMatch(matchId);
        emit GameUtils.matchDeleted(matchId);
        
        payable(who).transfer(howMuch);
    }
    
    /** @notice Function invoked by the Game Manager to set the address of the optional negotiation contract.
     * @param addr address of the negotiation contract. */
    function setNegotiationContract(address addr) onlyGameOwner public {
        if(addr==address(0))
            revert GameUtils.InvalidParameter("Address=0");
        negotiationContract=addr;
    }

    /*
        ****************************************
        *         TURN INITIALIZATION          *
        ****************************************
    */

    /** @notice Match creation automatically invoked whenever the contract receives
     * the stake payment from both the game participant.*/
    function initializeTurn(uint matchId, uint turnId) internal{
        //no param checks since this function is invoked from other "safe" functions
        Match storage m=activeMatches[matchId]; 
        
        address _codeMaker;
        //codeMaker selection
        if(turnId==0){ //first turn
            _codeMaker= (uint(Utils.randNo(2))==0) ? m.player1 : m.player2;
        }else{ //swap the roles
            _codeMaker= (m.turns[turnId-1].codeMaker==m.player2)? m.player1 : m.player2;
        }
        
        //New turn creation and insertion in the associated match
        uint[] memory whatever; //empty array
        string[] memory _whatever;
        string memory __whatever;
        Turn memory t= Turn({codeMaker: _codeMaker, codeHash: 0,codeProposals: _whatever,correctColorAndPosition: whatever,
            correctColor: whatever, codeGuessed: false, isSuspended: false, disputeWindowOpening: 0, secret: __whatever});
        m.turns.push(t);
        
        //Notifies the completion of this phase and request the codeMaker to start this turn
        emit GameUtils.newTurnStarted(matchId, turnId, t.codeMaker);

        //AFK parameters management
        m.whoHasToDoTheNextOp=t.codeMaker;
        m.lastAFKreport=0;
    }

    /*
        ****************************************
        *             TURN ACTIONS             *
        ****************************************
    */

    /** @notice Function invoked by the player who has the role of codeMaker of the turn
     * in order to load the digest of the secret. The hash is stored to guarantee that
     * he cannot change the code he has initially produced as a consequence of the guesses
     * of the codeBreaker.
     * @param matchId id of the match
     * @param turnId id of the current turn
     * @param codeDigest digest of the code produced by the codeMaker */
    function publishCodeHash(uint matchId, uint turnId, bytes32 codeDigest) onlyCodeMaker(matchId, turnId) public{ 
        Match storage m=activeMatches[matchId];
        if((m.turns.length)-1!=turnId) //Check that this turn is not already finished.
            revert GameUtils.TurnEnded(turnId);
        if(m.turns[turnId].codeHash!=0)
            revert GameUtils.DuplicateOperation("Secret code digest published");
        
        m.turns[turnId].codeHash=codeDigest;
        emit GameUtils.codeHashPublished(matchId, turnId, codeDigest);

        //AFK parameters management
        m.lastAFKreport=0; //reset the AFK timer if it was started by an AFK report
        m.whoHasToDoTheNextOp=getCodeBreaker(matchId, turnId); //next move should be a guess from the codeBreaker
    }
    
    /** @notice Function invoked by the player who has the role of codeBreaker of the turn in
     * order to send a candidateCode that the codeMaker will evaluate.
     * @param matchId id of the match
     * @param turnId id of the turn of that march
     * @param codeProposed attempt of finding the code by the codeBreaker */
    function guessTheCode(uint matchId, uint turnId, string memory codeProposed) onlyCodeBreaker(matchId, turnId) public{ 
        Match storage m=activeMatches[matchId];
        if((m.turns.length)-1!=turnId) //Check that this turn is not already finished.
            revert GameUtils.TurnEnded(turnId);

        Turn storage t=m.turns[turnId];
        if(t.isSuspended){
            revert GameUtils.UnauthorizedOperation("Turn suspended");
        }
        //Should wait the feedback regarding the last guess before emitting a new one
        if((t.codeProposals.length!=t.correctColor.length)||(t.codeProposals.length!=t.correctColorAndPosition.length)){
            revert GameUtils.UnauthorizedOperation("Wait the feedback");
        }

        /*The string received by the contract is like "BCRTA", where each char (in uppercase) represents one of the
        colors available in this game. Before pushing in the array of guessed check its correctness*/
        if(!Utils.containsCharsOf(availableColors,codeProposed))
            revert GameUtils.InvalidParameter("Invalid color in the code");
     
        t.codeProposals.push(codeProposed);
        emit GameUtils.newGuess(matchId, turnId, codeProposed);

        //AFK parameters management
        m.lastAFKreport=0; //reset the AFK timer if it was started by an AFK report
        m.whoHasToDoTheNextOp=t.codeMaker; //next move should be a feedback from the codeMaker
    }

    /** Function invoked by the codeMaker of a turn in order to give to the codeBreaker the feedback regarding a guess
     * @param matchId id of the match
     * @param turnId id of the turn
     * @param corrPos number of correct positions, which means also correct code
     * @param wrongPosCorrCol number of wrong positions but right colors */
    function publishFeedback(uint matchId, uint turnId, uint corrPos, uint wrongPosCorrCol) onlyCodeMaker(matchId, turnId) public{
        Match storage m=activeMatches[matchId];
        if((m.turns.length)-1!=turnId)
            revert GameUtils.TurnEnded(turnId);
        if(corrPos>codeSize)
            revert GameUtils.InvalidParameter("correctPositions>codeSize");
        if(wrongPosCorrCol>codeSize)
            revert GameUtils.InvalidParameter("wrongPositionCorrectColors>codeSize");
        
        Turn storage t=m.turns[turnId];
        uint attemptNum=t.codeProposals.length;

        //The correct situation is when the codeProposals array has a length greater than the feedback ones of 1 unit
        if(t.codeProposals.length==0)
            revert GameUtils.UnauthorizedOperation("No guesses available");
        if((t.correctColorAndPosition.length!=attemptNum-1) || (t.correctColor.length!=attemptNum-1))
            revert GameUtils.DuplicateOperation("Feedback already provided");
        t.correctColorAndPosition.push(corrPos);
        t.correctColor.push(wrongPosCorrCol);

        //Third param: guess number
        emit GameUtils.feedbackProvided(matchId, turnId, uint(t.codeProposals.length-1), corrPos, wrongPosCorrCol);

        //Manages the situations which cause the ending of the turn
        if(corrPos==codeSize){ //CodeBreaker has won the turn because it has guessed the hidden code!
            t.codeGuessed=true;
            t.isSuspended=true;
            emit GameUtils.secretRequired(matchId, turnId, true,t.codeMaker);

            //AFK parameters management
            m.lastAFKreport=0; //reset the AFK timer if it was started by an AFK report
            m.whoHasToDoTheNextOp=t.codeMaker; //next move should be the secret publication from the codeMaker
            return;
        }
        if(t.codeProposals.length==numberGuesses){ //CodeMaker has won the turn because the codeBreaker has exhausted its attempts
            t.isSuspended=true;
            emit GameUtils.secretRequired(matchId, turnId,false, t.codeMaker);

            //AFK parameters management
            m.lastAFKreport=0; //reset the AFK timer if it was started by an AFK report
            m.whoHasToDoTheNextOp=t.codeMaker; //next move should be the secret publication from the codeMaker
            return;
        }

        //AFK parameters management
        m.lastAFKreport=0; //reset the AFK timer if it was started by an AFK report
        m.whoHasToDoTheNextOp=getCodeBreaker(matchId, turnId); //next move should be a guess from the codeBreaker
        return;
    }

    /** Function invoked by the codeMaker in order to prove that he has not changed the secret code during the
     * game. If the check passes then the function determines the points scored by the codeMaker of that turn.
     * If the codeMaker behaves unsportmanlike then it put into effect the punishment policy. 
     * @param matchId id of the match
     * @param turnId  id of the turn
     * @param secret code decided by the codeMaker at the beginning of the turn */
    function publishSecret(uint matchId, uint turnId, string memory secret) onlyCodeMaker(matchId, turnId) public{
        if(bytes(secret).length==0){
            revert GameUtils.InvalidParameter("Secret-Empty string");
        }
        if(!Utils.containsCharsOf(availableColors, secret))
            revert GameUtils.InvalidParameter("Invalid color in the secret");

        Match storage m=activeMatches[matchId];
        Turn storage t=m.turns[turnId];
        if(!t.isSuspended){
            revert GameUtils.TurnNotEnded(turnId);
        }
        
        string memory hashSecretProvided=string(abi.encodePacked(keccak256(bytes(secret))));
        if(!Utils.strcmp(hashSecretProvided, string(abi.encodePacked(t.codeHash)))){
            emit GameUtils.cheatingDetected(matchId, turnId, t.codeMaker);
            punish(matchId, msg.sender);
            return;
        }

        //We cannot start immediately another turn since we need to let disputes to be opened
        t.secret=secret;
        t.disputeWindowOpening=block.number;
        emit GameUtils.disputeWindowOpen(matchId, turnId, DISPUTEWINDOWLENGTH);

        //AFK parameters management
        m.lastAFKreport=0; //reset the AFK timer if it was started by an AFK report
        m.whoHasToDoTheNextOp=getCodeBreaker(matchId, turnId); 
        //next move should be the opening of a dispute or the end game (confirmation) of the codeBreaker
        return;
    }

    /** @notice Function invoked by one the codeBreaker of the turn to manage the ending of a turn, in the case in which
     * the codeMaker was not cheating during the turn. It assigns the earned points to the codeMaker of that turn 
     * and emit the event of turn completion. */
    function endTurn(uint matchId, uint turnId) onlyCodeBreaker(matchId, turnId) public{
        Match storage m=activeMatches[matchId];

        Turn storage t=m.turns[turnId];
        if((t.isSuspended==false) || bytes(t.secret).length==0) //Case match not suspended or secret not provided
            revert GameUtils.UnauthorizedOperation("Turn not terminable");

        if(turnId<m.turns.length-1)
            revert GameUtils.DuplicateOperation("Turn already ended");

        uint earned=uint(t.codeProposals.length);
        earned = !(t.codeGuessed) ? earned+extraReward : earned-1; 
        //the last code proposed is correct hence it's not a failure to consider as a point
        
        if(t.codeMaker==m.player1){
            m.score1+=earned;
        }else{
            m.score2+=earned;
        }

        emit GameUtils.turnCompleted(matchId, turnId, earned, t.codeMaker);

        if(m.turns.length<numberTurns){ //Turn bound not reached, start another game
            initializeTurn(matchId, turnId+1);
        }else{ //Turn bound reached, close the match
            endMatch(matchId, false);
        }

        /*Here the AFK parameters management it is not required since, if there will be another turn,
        initializeTurn function will manage it*/
    }
    
    /** @notice Private function invoked by the function "endTurn" or the function "punish" in order
     * to close the match and make the proper payments to the players.
     * @param matchId id of the match to close
     * @param fromPunishment boolean which indicates if the function call comes from "punish". In that 
     * case all the match stake should be send to only one player. */
    function endMatch(uint matchId, bool fromPunishment) internal {
        Match storage m=activeMatches[matchId];
        if(m.ended)
            revert GameUtils.UnauthorizedOperation("Match ended");

        if(!fromPunishment){
            m.ended=true;
            //Decide the winner of the match
            if(m.score1==m.score2){ //tie
                emit GameUtils.matchCompleted(matchId, address(0)); //In case of TIE the event will not specify a winning address

                //Each player will have the amount that it has deposited as stake at the beginning of the match
                payable(m.player1).transfer(m.stake);
                payable(m.player2).transfer(m.stake);
            }else{
                if(m.score1<m.score2){
                    emit GameUtils.matchCompleted(matchId, m.player2);
                    payable(m.player2).transfer(m.stake);
                }else{
                    emit GameUtils.matchCompleted(matchId, m.player1);
                    payable(m.player1).transfer(m.stake);
                }
            }
        }else{
            /*If the function is invoked from the punishment, here we notify only the deletion of the match
            because the payment has already been done in "punish".*/
            dropTheMatch(matchId);
            emit GameUtils.matchDeleted(matchId);
        }
    }

    /*
        ****************************************
        *            AFK & DISPUTES            *
        ****************************************
    */

    /** @notice Function invoked by the codeBreaker of the turn in order to report the fact that, in its opinion, the
     * codeMaker has provided a wrong feedback for one of its guesses. If the dispute will be accepted by the
     * contract the codeMaker will be punished accordingly to the policies implemented, otherwise the punishment
     * will be done on the issuer.
     * @param matchId id of the match reported
     * @param turnId id of the turn reported
     * @param feedbackNum number of the feedback reported (starting from 0) */
    function openDispute(uint matchId, uint turnId, uint feedbackNum) public onlyCodeBreaker(matchId, turnId){
        Turn storage t=activeMatches[matchId].turns[turnId];
        if(feedbackNum>=t.codeProposals.length)
            revert GameUtils.InvalidParameter("feedbackNum>#guesses emitted");
        if(!t.isSuspended)
            revert GameUtils.TurnNotEnded(turnId);
        if(bytes(t.secret).length==0)
            revert GameUtils.UnauthorizedOperation("Secret code not provided");
        if(block.number>t.disputeWindowOpening+DISPUTEWINDOWLENGTH)
            revert GameUtils.UnauthorizedOperation("Dispute window closed");

        //Checks if the codeMaker has behaved unsportmanlike
        if(t.correctColorAndPosition[feedbackNum]!=Utils.matchCount(t.codeProposals[feedbackNum], t.secret)){
            //Case of wrong CC provided
            emit GameUtils.cheatingDetected(matchId, turnId, t.codeMaker);
            punish(matchId, t.codeMaker);
            return;
        }
        if(t.correctColor[feedbackNum]!=Utils.semiMatchCount(t.codeProposals[feedbackNum], t.secret, availableColors)){
            //Case of wrong NC provided
            emit GameUtils.cheatingDetected(matchId, turnId, t.codeMaker);
            punish(matchId, t.codeMaker);
            return;
        }

        //The codeMaker has not performed any error so the issuer of the dispute will be punished
        emit GameUtils.cheatingDetected(matchId, turnId, msg.sender);
        //Invoke punishment for codeBreaker (which is msg.sender)
        punish(matchId, msg.sender);

        /*Here the AFK parameters management is not required because when a dispute is open the game will surely end */
    }

    /** @notice This function can be invoked by a participant of the match in order to notify the contract that
     * the opponent is AFK, hence the game is stucked due to his inactivity. An event is emitted
     * to trigger the opponent to perform the operation required. */
    function reportOpponentAFK(uint matchId) public onlyMatchParticipant(matchId){
        Match storage m=activeMatches[matchId];
        if(m.ended)
            revert GameUtils.UnauthorizedOperation("Match ended");
            
        if(m.whoReportedTheLastAFK==msg.sender)
            revert GameUtils.DuplicateOperation("AFK Already reported");

        if(m.whoHasToDoTheNextOp==msg.sender){
            //who has been reported to be AFK can only perform the action required
            revert GameUtils.UnauthorizedOperation("Please do the next operation of the turn");
        } 
        
        address afkplayer = (msg.sender==m.player1) ? m.player2 : m.player1;
        
        m.lastAFKreport=block.number; //set the blocknum of this report
        m.whoReportedTheLastAFK=msg.sender; 
        emit GameUtils.AFKreported(matchId, afkplayer);
    }

    /** @notice Function invoked in order to get all the match stake when one of the 2 players
     * is AFK for too much time. The action is possible only after have reported the AFK of that player and
     * have waited a move from the afk player for a period of time. */
    function requestRefundForAFK(uint matchId) public onlyMatchParticipant(matchId){
        Match storage m=activeMatches[matchId];
        if(m.whoReportedTheLastAFK!=msg.sender) 
            revert GameUtils.UnauthorizedOperation("You have not reported an AFK");

        if(m.lastAFKreport==0) //case of AFK report closed due to an opponent action
            revert GameUtils.UnauthorizedOperation("AFK window closed");
        
        if(block.number<m.lastAFKreport+AFKWINDOWLENGTH) //time left is not expired
            revert GameUtils.UnauthorizedOperation("AFK window still open");

        address afkplayer = (msg.sender==m.player1) ? m.player2 : m.player1;
        emit GameUtils.AFKconfirmed(matchId, afkplayer);
        punish(matchId, afkplayer); //this function does the punishment and closes the match
    }

    /** @notice Private function invoked by other functions in the contract when a cheating is detected.
     * The function sends the match stake to the honest player.
     * @param who cheater player */
    function punish(uint matchId, address who) internal{
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);

        Match storage m=activeMatches[matchId];
        uint stake=m.stake;
        address honestPlayer;
        if(m.player1==who){
            honestPlayer=m.player2;
        }else{
            honestPlayer=m.player1;
        }
        stake*=2; //double of the stake because the honest player will obtain also the stake of the cheater one

        endMatch(matchId, true); //cancel the match before paying for reentrancy security

        payable(honestPlayer).transfer(stake);
    }

    /*
        ****************************************
        *        UTILITIES & MODIFIERS         *
        ****************************************
    */

    /** @notice This function removes the element in position "target" from
     * the uint array. Since it's used to remove elements from uint arrays stored
     * in this contract (ex privateMatches), this function should be contained in this 
     * contract in order to manipulate these arrays.
     * @param array array from which we have to remove the element
     * @param target index of the element to remove
     */
    function popByIndex(uint[] storage array, uint target) internal {
        if(target>=array.length)
            revert GameUtils.InvalidParameter("target Out of bound");
        array[target]=array[array.length-1];
        array.pop();
    }

    /** @notice this modifier allows the operation at which it is attached only if
     * the caller is the player who has created that match. */
    modifier onlyMatchCreator(uint matchId) {
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].player1!=msg.sender)
            revert GameUtils.UnauthorizedAccess("You are not the creator of the match");
        _;
    }

    /** @notice this modifier allows the operation at which it is attached only if
     * the caller is one of the 2 players of that match. */
    modifier onlyMatchParticipant(uint matchId) {
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if((activeMatches[matchId].player1!=msg.sender)&&(activeMatches[matchId].player2!=msg.sender))
            revert GameUtils.UnauthorizedAccess("You are not a participant of the match");
        _;
    }

    /** @notice this modifier allows the operation at which it is attached only if
     * the caller is the codeBreaker of that turn of the match. */
    modifier onlyCodeMaker (uint matchId, uint turnId){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert GameUtils.MatchNotStarted(matchId);
        if(turnId>=activeMatches[matchId].turns.length)
            revert GameUtils.TurnNotFound(turnId);
        if((activeMatches[matchId].player1!=msg.sender)&&(activeMatches[matchId].player2!=msg.sender))
            revert GameUtils.UnauthorizedAccess("You are not a participant of the match");
        if(activeMatches[matchId].turns[turnId].codeMaker!=msg.sender)
            revert GameUtils.UnauthorizedOperation("You are not the codeMaker of this turn");
        _;
    }

    /** @notice this modifier allows the operation at which it is attached only if
     * the caller is the codeBreaker of that turn of the match. */
    modifier onlyCodeBreaker(uint matchId, uint turnId){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert GameUtils.MatchNotStarted(matchId);
        if(turnId>=activeMatches[matchId].turns.length)
            revert GameUtils.TurnNotFound(turnId);
        if((activeMatches[matchId].player1!=msg.sender)&&(activeMatches[matchId].player2!=msg.sender))
            revert GameUtils.UnauthorizedAccess("You are not a participant of the match");
        if(activeMatches[matchId].turns[turnId].codeMaker==msg.sender)
            revert GameUtils.UnauthorizedOperation("You are not the codeBreaker of this turn");
        _;
    }
    
    /** @notice this modifier allows the operation at which it is attached only if
     * the caller is the game manager. */
    modifier onlyGameOwner(){
        if(msg.sender!=gameManager)
            revert GameUtils.UnauthorizedOperation("You are not the game manager");
        _;
    }

    /** @notice Function that removes a match from the list of the active ones. */
    function dropTheMatch(uint matchId) internal{
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        activeMatchesNum--;
        delete activeMatches[matchId];
    }

    /*
        ****************************************
        *               GETTERS                *
        ****************************************
    */

   
    /* Function invoked to get the address of the codeMaker of a given turn of a given match.
     * The call fails if the turn/match is not found or because the match is not started. */
    function getCodeMaker(uint matchId, uint turnId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert GameUtils.MatchNotStarted(matchId);
        if(turnId>=activeMatches[matchId].turns.length)
            revert GameUtils.TurnNotFound(turnId);
        return activeMatches[matchId].turns[turnId].codeMaker;
    }

    /* Function invoked to get the address of the codeBreaker of a given turn of a given match.
     * The call fails if the turn/match is not found or because the match is not started. */
    function getCodeBreaker(uint matchId, uint turnId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert GameUtils.MatchNotStarted(matchId);
        if(turnId>=activeMatches[matchId].turns.length)
            revert GameUtils.TurnNotFound(turnId);
        if(activeMatches[matchId].player1==activeMatches[matchId].turns[turnId].codeMaker){
            return activeMatches[matchId].player2;
        }else{
            return activeMatches[matchId].player1;
        }
    }

    /* Function invoked to get the actual points of the 2 player of a match. The call
     * to that function fails if the match requested is not present in the list of the
     * matches currently active.*/
    function getActualPoints(uint matchId) public view returns (uint[] memory){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        uint[]memory scores=new uint[](2);
        scores[0]=activeMatches[matchId].score1;
        scores[1]=activeMatches[matchId].score2;
        return scores;
    }
    
    /* Function invoked to check if a given match is already ended.*/
    function isEnded(uint matchId) public view returns (bool){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        return activeMatches[matchId].ended;
    }
    
    /* Function return the address of the creator of the match whose id is "id". It fails if
     * the give id is not related to any active match.*/
    function getMatchCreator(uint matchId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        return activeMatches[matchId].player1;
    }

    /* Function returns the address of the second player of the match whose id is "id". It fails if
     * the given id is not related to any active match or if that match is still waiting for an opponent.
     * Notice that the match creator can have specified the address of the contender but he/she may have not
     * already join the match.*/
    function getSecondPlayer(uint matchId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].player2==address(0))
            revert GameUtils.Player2NotJoinedYet(matchId); 
        return activeMatches[matchId].player2;
    }

    function getGameParam()public view returns (uint _codeSize, uint _extraReward, uint _numberTurns, uint _numberGuesses){
        _codeSize=codeSize; //size of the code
        _extraReward=extraReward;  //extra reward for the code maker if the code breaker is not able to guess the code.
        _numberTurns=numberTurns;
        _numberGuesses=numberGuesses;
    }
    
    /* Function returns the Turn struct associated to the given matchId-turn couple*/
    function getTurn(uint matchId, uint turnId) public view returns (Turn memory){
        Turn memory i=activeMatches[matchId].turns[turnId];
        return i;
    }
}