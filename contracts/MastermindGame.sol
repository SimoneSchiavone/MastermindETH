// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Uncomment this line to use console.log
import "hardhat/console.sol";
import "./Utils.sol";

/**
 * @title Mastermind Game Contract
 * @author Simone Schiavone <s.schiavone3@studenti.unipi.it>
 * @notice This smart conctract manages the matches between users
 *      for the code breaking game Mastermind.
 */
contract MastermindGame {
    address public gameManager;

    //---GAME PARAMETERS---
    //Typically in the real game are used 10 colors, here they are Amber, Black, Cyan, Green, Pink, Red, Turquoise, Violet, White, Yellow
    string public availableColors="ABCGPRTVWY"; //number of colors usable in the code
    uint8 public codeSize; //size of the code
    uint public extraReward;  //extra reward for the code maker if the code breaker is not able to guess the code.
    uint8 constant NUMBER_TURNS=4;
    uint8 constant NUMBER_GUESSES=5;

    //---DEADLINES---
    uint public constant STAKEPAYMENTDEADLINE = 300;
    

    //---MATCH MANAGEMENT---
    //Matches struct contains the addresses of the 2 players
    struct Match{
        address player1; //creator of the match
        address player2; //second player
        
        uint stake; //amount in wei to put in stake for this match
        uint timestampStakePaymentsOpening; //timestamp of when the stake amount is fixed by the creator
        bool deposit1; //indicates that player1 has payed the stake amount
        bool deposit2; //indicates that player2 has payed the stake amount

        uint score1;
        uint score2;
        Turn[] turns;
    }

    struct Turn{
        uint8 turnNo; //progressive number of this turn in the match
        bytes32 codeHash;
        address codeMaker; //store the index of the player who has the role of codemaker ex. 1 stands for player1

        string[] codeProposals; //code proposed by the code breaker at each attempt (max numberGuesses)
        uint[] correctColorAndPosition; //reply of the codeMaker regarding a full match which is a color&position match
        uint[] correctColor; //replay of the codeMaker regarding a partial match which means color ok but wrong position

        bool codeGuessed;
    }

    mapping(uint => Match) public activeMatches; //maps an active matchId to the players addresses
    uint[] publicMatchesWaitingForAnOpponent; 
    //array of the matchesIDs of matches without "player2" specified waiting for a player
    uint[] privateMatchesWaitingForAnOpponent; 
    //array of the matchesIDs of matches without "player2" specified waiting for a player

    uint activeMatchesNum=0; //counts active matches
    uint private nextMatchId=0; //matchId generation


    //---EVENTS---
    event newMatchCreated(address creator, uint newMatchId); 
    //event emitted when a new match is created
    event secondPlayerJoined(address opponent, uint matchId); 
    //event emitted when an opponent joins a match that was waiting
    event matchStakeFixed(uint matchId, uint amount); 
    //the event notifies that an agreement between the 2 player has been reached and it shows the amount to pay
    event matchStakeDeposited(uint matchId); 
    //the event notifies that both player have deposited the match stake for that match
    event matchDeleted(uint matchId); 
    //the event notifies the deletion of that match from the active ones
    event newTurnStarted(uint matchId, uint turnNum, address codeMaker); 
    //the event notifies that a new turn of a match ir ready to be played and it speficies the address of the codemaker;
    event codeHashPublished(uint matchId, uint turnNum, bytes32 digest); 
    //the event notifies that the codeMaker has published the digest of the code hence the opponent could start to emit guesses;
    event newGuess(uint matchId, uint turnNum, string guess); 
    //the event notifies that a the codeBreaker of a game has proposed a solution for the code
    event feedbackProvided(uint matchId, uint turnNum, uint attemptNum, uint corrPos, uint wrongPosCorrCol);
    //the event notifies that the codeMaker has provided its feedback regarding the guess number 'attemptnum' of that turn of the match;
    event turnCompleted(uint matchId, uint turnNum, address winner);
    //notifies that a turn of a match is completed with the victory of that player

    error InvalidParameter(string which, string reason);
    error MatchNotFound(uint matchId);
    error DuplicateOperation(string reason);
    error UnauthorizedAccess(string conditionViolated);
    error UnauthorizedOperation(string conditionViolated);
    error MatchNotStarted(uint matchId);
    /**
     * @notice Constructor function of the contract
     * @param _codeSize code size
     * @param _noGuessedReward extra reward for the code maker
     */
    constructor( uint8 _codeSize, uint _noGuessedReward){
        //require(_availableColors.length==10,"The number of available colors should be 10!");
        require(_codeSize!=0,"The code size should be greater than 1!");
        require(_noGuessedReward!=0,"The extra reward for the code maker has to be greater than 0!");
        /*
        if(_codeSize==0)
            revert InvalidParameter("codeSize","=0");
        if(extraReward==0)
            revert InvalidParameter("ExtraReward","=0");*/
        //availableColors=_availableColors;
        codeSize=_codeSize;
        extraReward=_noGuessedReward;
        gameManager=msg.sender;
    }

    //----------MATCHMAKING PHASE----------
    /**
     * @notice Function invoked in order to create a new game without setting
     * the address of the opponent.
     */ 
    function createMatch() public returns (uint matchId) {
        //Initialize a new match
        Match storage newMatch=activeMatches[nextMatchId];
        newMatch.player1=msg.sender;
        newMatch.player2=address(0);

        newMatch.stake=0;
        newMatch.deposit1=false;
        newMatch.deposit2=false;

        newMatch.score1=0;
        newMatch.score2=0;

        //activeMatches[nextMatchId]=newMatch;
        publicMatchesWaitingForAnOpponent.push(nextMatchId);

        emit newMatchCreated(newMatch.player1,(nextMatchId));
        
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
            revert InvalidParameter("opponent","=0");
 
        if(opponent==msg.sender)
            revert InvalidParameter("opponent","opponent==yourself");

        //Initialize a new match
        Match storage newMatch=activeMatches[nextMatchId];
        newMatch.player1=msg.sender;
        newMatch.player2=opponent;

        privateMatchesWaitingForAnOpponent.push(nextMatchId);

        emit newMatchCreated(newMatch.player1,(nextMatchId));
        
        nextMatchId++; //counter for the next new matchId
        activeMatchesNum++; //counter for the current active matches
        
        return (nextMatchId-1);
    }

    /**
     * @notice Function return the address of the creator of the match whose id is "id". It fails if
     * the give id is not related to any active match.
     * @param matchId id of the match whe are looking for
     */
    function getMatchCreator(uint matchId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        return activeMatches[matchId].player1;
    }

    /**
     * @notice Function return the address of the second player of the match whose id is "id". It fails if
     * the given id is not related to any active match or if that match is still waiting for an opponent.
     * Notice that the match creator can have specified the address of the contender but he/she may have not
     * already join the match.
     * @param matchId id of the match whe are looking for
     */
    function getSecondPlayer(uint matchId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        require(activeMatches[matchId].player2!=address(0),"This game is waiting for an opponent!"); 
        return activeMatches[matchId].player2;
    }

    /**
     * @notice Function that allow to join the match with id "id". In order to succeed in this operation we need that:
     * - the game has a slot available for any second player
     * OR
     * - the game has a slot reserved for me
     * @param matchId identifier of the game we would like to join
     */
    function joinMatchWithId(uint matchId) public{
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        if(activeMatches[matchId].player1==msg.sender)
            revert UnauthorizedAccess("You cannot join a match you have created");
        Match storage m=activeMatches[matchId];
        if(m.player2!=address(0)){ //second address not "null"
            if(Utils.uintArrayContains(privateMatchesWaitingForAnOpponent, matchId)){ //second address specified but user not arealdy joined
                //check that I'm the authorized opponent
                if(m.player2!=msg.sender)
                    revert UnauthorizedAccess("You cannot join this private match");

                m.player2=msg.sender; //add the second player

                uint idToDelete=Utils.uintArrayFind(privateMatchesWaitingForAnOpponent, matchId); //index in the array of the completed match
                popByIndex(privateMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status

                emit secondPlayerJoined(msg.sender, matchId);
            }else{ //second address is specified and that match is not in the list of the available ones
                revert UnauthorizedAccess("Full match");
            }
        }else{ //blank second address means that everyone can join this game
                m.player2=msg.sender; //add the second player

                uint idToDelete=Utils.uintArrayFind(publicMatchesWaitingForAnOpponent, matchId); //index in the array of the completed match
                popByIndex(publicMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status

                emit secondPlayerJoined(msg.sender, matchId);
        }
    }

    /**
     * @notice Function that allow to join one on the available matches that are still
     * waiting for a second player. It will fail if there is no match available.
     */
    function joinMatch() public{
        require(publicMatchesWaitingForAnOpponent.length>0,"Currently no matches are available, try to create a new one!");

        uint randIdx=Utils.randNo(publicMatchesWaitingForAnOpponent.length); //generate a number in [0, current number of available matches]
        uint id=publicMatchesWaitingForAnOpponent[randIdx]; //get the id of the waiting match associated to the idx generated above

        //the matches in publicMatchesWaitingForAnOpponent will have a blanbk field "player2" by construction!
        if(activeMatches[id].player1==msg.sender)
            revert UnauthorizedAccess("You cannot join a match you have created");
        //it may happen that player1 creates a public match, then he decides to join another game but the "random" procedure
        //provides the id of the same match he has created.
        
        activeMatches[id].player2=msg.sender; //add the second player
        uint idToDelete=Utils.uintArrayFind(publicMatchesWaitingForAnOpponent,id); //index in the array of the completed match
        popByIndex(publicMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status
    
        emit secondPlayerJoined(msg.sender, id);
    }

    //----------MATCH STAKE NEGOTIATION PHASE----------
    /*Here it's assumed that the value put in stake by both user for their match will be decided
    offchain and, whenever they have reached an agreement on that value, the match creator will set
    this parameter of the match. */

    /**
     * @notice Function callable once only by the creator of the match in order to fix the amount put in stake.
     * @param matchId id of the match for which we are setting this parameter
     * @param value amount to put in stake, >0.
     */
    function setStakeValue(uint matchId, uint value) onlyMatchCreator(matchId) public{
        if(value==0)
            revert InvalidParameter("stakeValue","=0");
        if(activeMatches[matchId].stake!=0)
            revert DuplicateOperation("Stake already fixed for that match");

        Match storage m=activeMatches[matchId];
        m.stake=value;
        m.timestampStakePaymentsOpening=block.timestamp;
        /*registers the timestamp when tha amount to pay is fixed because participant should send their funds
        within STAKEPAYMENTDEADLINE seconds, otherwise one of the parties can retire its funds and nullify the match */
    }

    /**
     * @notice Function callable by the participants of a match in order to deposit the amount to put in stake.
     * @param matchId id of the match for which we are paying
     */
    function depositStake(uint matchId) onlyMatchPartecipant(matchId) payable public{
        if(msg.value==0)
            revert InvalidParameter("WEI sent","=0");
        if(msg.value!=activeMatches[matchId].stake)
            revert InvalidParameter("WEI sent","!= agreed stake");
        Match storage m=activeMatches[matchId];
        if(msg.sender==m.player1){
            if(!m.deposit1){
                m.deposit1=true;
            }else{
                revert DuplicateOperation("WEI already sent");
            }
        }
        else{
            if(!m.deposit2){
                m.deposit2=true;
            }else{
                revert DuplicateOperation("WEI already sent");
            }
        }
        
        emit matchStakeDeposited(matchId);
        //If both players have put in stake the right amount of wei the match can start so emit an event
        if(m.deposit1&&m.deposit2)
            initializeTurn(matchId,0);
    }

    /**
     * @notice Function callable by the participants of a match in order to retire the amount of wei they have put in stake.
     * This works only if the phase of wei collection takes more than STAKEPAYMENTDEADLINE seconds. This action will
     * nullify the match.
     * @param matchId id of the match of which we would like to retire the funds
     */
    function requestRefundMatchStake(uint matchId) onlyMatchPartecipant(matchId) public {
        Match storage m=activeMatches[matchId];
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        require((!m.deposit1)||(!m.deposit2),"Both players have put their funds in stake!");

        //The caller has to have done the payment before, otherwise cannot request the refund
        if(msg.sender==m.player1){
            require(m.deposit1,"You have not put in stake the amount required!");
        }else{
            require(m.deposit2,"You have not put in stake the amount required!");
        }

        //Check if the deadline for the payments of the stake amount is already expired
        require(block.timestamp>=(m.timestampStakePaymentsOpening+STAKEPAYMENTDEADLINE),"You cannot request the refund until the deadline for the payments is expired!");

        (bool success,) = msg.sender.call{value: m.stake}("");
        require(success,"Refund payment failed!");

        dropTheMatch(matchId);
    }
    
    //----------TURN INITIALIZATION----------
    /**
     * @notice Match creation automatically invoked whenever the contract receives
     * the stake payment from both the game participant.
     * @param matchId id of the match to initialize
     */
    function initializeTurn(uint matchId, uint8 turnNo) private{
        require(turnNo<NUMBER_TURNS,"Number of turns bound exceeded!");
        //no further checks on matchId since this function is invoked from other "safe" functions
        Match storage m=activeMatches[matchId]; 
        
        address _codeMaker;
        //codeMaker selection
        if(turnNo==0){ //first turn
            if(uint8(Utils.randNo(2))==0){
                _codeMaker=m.player1;
            }else{
                _codeMaker=m.player2;
            }
        }else{
            //swap the roles
            if(m.turns[turnNo-1].codeMaker==m.player2){
                _codeMaker=m.player1;
            }else{
                _codeMaker=m.player2;
            }
        }
        
        //New turn creation and insertion in the associated match
        uint[] memory whatever; //empty array
        string[] memory _whatever;
        Turn memory t= Turn({turnNo: turnNo,codeMaker: _codeMaker, codeHash: 0,codeProposals: _whatever,correctColorAndPosition: whatever,correctColor: whatever, codeGuessed: false});
        m.turns.push(t);
        
        //Notifies the completion of this phase and request the codeMaker to start this turn
        emit newTurnStarted(matchId, turnNo, t.codeMaker);
    }

    //----------TURN ACTIONS----------
    /**
     * @notice Function invoked by the player who has the role of codeMaker of the turn
     * in order to load the digest of the secret. The hash is stored to guarantee that
     * he cannot change the code he has initially produce as a consequence of the guesses
     * of the codeBreaker.
     * @param matchId id of the match
     * @param turnId id of the current turn
     * @param codeDigest digest of the code produced by the codeMaker
     */
    function publishCodeHash(uint matchId, uint turnId, bytes32 codeDigest) onlyMatchPartecipant(matchId) onlyCodeMaker(matchId, turnId) public{ 
        //The checks regarding the match/turn ids are performed by the modifier
        //Check that this turn is not already finished.
        require((activeMatches[matchId].turns.length)-1==turnId,"This turn is already finished!");
        if(activeMatches[matchId].turns[turnId].codeHash!=0)
            revert DuplicateOperation("Secret code digest published");
        
        //PENSA SE FAR PARTIRE IL PUNISHMENT GIA' QUI
        activeMatches[matchId].turns[turnId].codeHash=codeDigest;
        emit codeHashPublished(matchId, turnId, codeDigest);
    }
    
    /**
     * @notice Function invoked by the player who has the role of codeBreaker of the turn in
     * order to send a candidateCode that the codeMaker will evaluate. Notice that this function
     * is callable only in the right moment of the turn, hence after the codeMaker has sent the feedback
     * regarding the last attempt of the codeBreaker.
     * @param matchId id of the match
     * @param turnId id of the turn of that march
     * @param codeProponed attempt of finding the code by the codeBreaker
     */
    function guessTheCode(uint matchId, uint turnId, string memory codeProponed) onlyMatchPartecipant(matchId) onlyCodeBreaker(matchId, turnId) public{ 
        //The checks regarding the match/turn ids are performed by the modifier
        //Check that this turn is not already finished.
        require((activeMatches[matchId].turns.length)-1==turnId,"This turn is already finished!");

        Turn storage t=activeMatches[matchId].turns[turnId]; //actual turn
        require(t.codeProposals.length<NUMBER_GUESSES,"Too many attempts for this turn!");
        require((t.codeProposals.length==t.correctColor.length)&&(t.codeProposals.length==t.correctColorAndPosition.length),"You need to wait the feedback from the codeMaker regarding the last code you have proposed!");

        //We assume that the string received by the contract is like "BCRTA", where each char represents one of the colors available in this game
        //Before pushing in the array of code proposed check its correctness
        if(!Utils.containsCharsOf(availableColors,codeProponed))
            revert InvalidParameter("codeProponed","Invalid color in the code");
     
        t.codeProposals.push(codeProponed);
        emit newGuess(matchId, turnId, codeProponed);
    }

    /**
     * Function invoked by the codeMaker of a turn in order to give the feedback reguarding a duess
     * to the codeBreaker.
     * @param matchId id of the match
     * @param turnId id of the turn
     * @param corrPos number of correct positions, which means also correct code
     * @param wrongPosCorrCol number of wrong positions but right colors
     */
    function provideFeedback(uint matchId, uint turnId, uint corrPos, uint wrongPosCorrCol) onlyMatchPartecipant(matchId) onlyCodeMaker(matchId, turnId) public{
        //The checks regarding the match/turn ids are performed by the modifier
        //Check that this turn is not already finished.
        require((activeMatches[matchId].turns.length)-1==turnId,"This turn is already finished!");
        if(corrPos>codeSize)
            revert InvalidParameter("correctPositions",">codeSize");
        if(wrongPosCorrCol>codeSize)
            revert InvalidParameter("wrongPositionCorrectColors",">codeSize");
        
        Turn storage t=activeMatches[matchId].turns[turnId]; //actual turn
        uint attemptNum=t.codeProposals.length;

        //The correct situation is when the codeProposals array has a length greater than the feedback ones of 1 unit
        require(t.codeProposals.length>0,"The codeBreakers has not yet provided a guess!");
        require((t.correctColorAndPosition.length==attemptNum-1) && (t.correctColor.length==attemptNum-1),"Feedback already provided for this attempt, wait for another guess of the codeBreaker!");
        t.correctColorAndPosition.push(corrPos);
        t.correctColor.push(wrongPosCorrCol);

        emit feedbackProvided(matchId, turnId, t.codeProposals.length-1, corrPos, wrongPosCorrCol);

        //Manages the situations which cause the ending of the turn
        if(corrPos==codeSize){ //CodeBreaker has won the turn because it has guessed the hidden code!
            t.codeGuessed=true;
            endTurn(matchId, turnId, getCodeBreaker(matchId, turnId));
        }
        if(t.codeProposals.length==NUMBER_GUESSES){ //CodeMaker has won the turn because the codeBreaker has exhausted its attempts
            endTurn(matchId, turnId, getCodeBreaker(matchId, turnId));
        }
    }

    function endTurn(uint matchId, uint turnId, address winner) private{
        console.log("TURNO FINITO CON VITTORIA DI %s",winner);
        //impostare il vincitore, assegnare il punteggio, avviare un nuovo turno
        //Turn storage t=activeMatches[matchId].turns[turnId]; //actual turn
    }
    //----------UTILITIES AND MODIFIERS----------
    /**
     * @notice This function removes the element in position "target" from
     * the uint array. Since it's used to remove elements from uint arrays stored
     * in this contract (ex privateMatches), this function should be contained in this 
     * contract in order to manipulate these arrays.
     * @param array array from which we have to remove the element
     * @param target index of the element to remove
     */
    function popByIndex(uint[] storage array, uint target) private {
        if(target>=array.length)
            revert InvalidParameter("target","Out of bound");
        array[target]=array[array.length-1];
        array.pop();
    }

    modifier onlyMatchCreator(uint matchId) {
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        require(activeMatches[matchId].player1==msg.sender,"Only the creator of that match can perform this operation!");
        _;
    }

    modifier onlyMatchPartecipant(uint matchId) {
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        if((activeMatches[matchId].player1!=msg.sender)&&(activeMatches[matchId].player2!=msg.sender))
            revert UnauthorizedAccess("You are not a participant of the match");
        require((activeMatches[matchId].player1==msg.sender)||(activeMatches[matchId].player2==msg.sender),"You are not participating to this match!");
        _;
    }

    /**
     * @notice this modifier allows the operation at which it is attached only if
     * the caller is the codeBreaker of that turn of the match.
     */
    modifier onlyCodeMaker (uint matchId, uint turnId){
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert MatchNotStarted(matchId);
        if(activeMatches[matchId].turns[turnId].codeMaker!=msg.sender)
            revert UnauthorizedOperation("You are not the codeMaker of this turn");
        _;
    }

    /**
     * @notice this modifier allows the operation at which it is attached only if
     * the caller is the codeBreaker of that turn of the match.
     */
    modifier onlyCodeBreaker(uint matchId, uint turnId){
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert MatchNotStarted(matchId);
        if(activeMatches[matchId].turns[turnId].codeMaker==msg.sender)
            revert UnauthorizedOperation("You are not the codeBreaker of this turn");
        _;
    }

    function dropTheMatch(uint matchId) private{
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        activeMatchesNum--;
        delete activeMatches[matchId];
        emit matchDeleted(matchId);
    }

    function getCodeMaker(uint matchId, uint turnId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert MatchNotStarted(matchId);

        return activeMatches[matchId].turns[turnId].codeMaker;
    }

    function getCodeBreaker(uint matchId, uint turnId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert MatchNotStarted(matchId);
        if(activeMatches[matchId].player1==activeMatches[matchId].turns[turnId].codeMaker){
            return activeMatches[matchId].player1;
        }else{
            return activeMatches[matchId].player2;
        }
    }
}
