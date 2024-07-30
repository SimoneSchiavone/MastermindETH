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
    Utils utils;

    //---GAME PARAMETERS---
    uint public availableColors; //number of colors usable in the code
    uint public codeSize; //size of the code
    uint public noGuessedReward;  //extra reward for the code maker if the code breaker is not able to guess the code.
    uint public numberTurns=4;
    uint public numberGuesses=3;

    //---MATCH MANAGEMENT---
    //Matches struct contains the addresses of the 2 players
    struct Match{
        address player1; //creator of the match
        address player2; //second player
        
        uint stake; //amount in wei to put in stake for this match
        uint timestampStakePaymentsOpening; //timestamp of when the stake amount is fixed by the creator
        bool deposit1; //indicates that player1 has payed the stake amount
        bool deposit2; //indicates that player2 has payed the stake amount
    }

    mapping(uint => Match) public activeMatches; //maps an active matchId to the players addresses
    uint[] publicMatchesWaitingForAnOpponent; 
    //array of the matchesIDs of matches without "player2" specified waiting for a player
    uint[] privateMatchesWaitingForAnOpponent; 
    //array of the matchesIDs of matches without "player2" specified waiting for a player

    uint activeMatchesNum=0; //counts active matches
    uint private nextMatchId=0; //matchId generation

    //---DEADLINES---
    uint public constant STAKEPAYMENTDEADLINE = 300;

    //---EVENTS---
    event newMatchCreated(address creator, uint newMatchId); //event emitted when a new match is created
    event secondPlayerJoined(address opponent, uint matchId); //event emitted when an opponent joins a match that was waiting
    event matchStakeFixed(uint matchId, uint amount); //the event notifies that an agreement between the 2 player has been reached and it shows the amount to pay
    event matchStakeDeposited(uint matchId); //the event notifies that both player have deposited the match stake for that match
    event matchDeleted(uint matchId); //the event notifies the deletion of that match from the active ones
    /**
     * @notice Constructor function of the contract
     * @param _availableColors number of colors usable in the code
     * @param _codeSize code size
     * @param _noGuessedReward extra reward for the code maker
     */
    constructor(uint _availableColors, uint _codeSize, uint _noGuessedReward){
        require(_availableColors>1,"The number of available colors should be greater than 1!");
        require(_codeSize>1,"The code size should be greater than 1!");
        require(_noGuessedReward>0, "The extra reward for the code maker has to be greater than 0!");
        availableColors=_availableColors;
        codeSize=_codeSize;
        noGuessedReward=_noGuessedReward;
        gameManager=msg.sender;

        utils=new Utils();
    }
    
    //---MATCHMAKING PHASE---
    /**
     * @notice Function invoked in order to create a new game without setting
     * the address of the opponent.
     */ 
    function createMatch() public returns (uint matchId) {
        //Initialize a new match
        Match memory newMatch;
        newMatch.player1=msg.sender;
        newMatch.player2=address(0);

        newMatch.stake=0;
        newMatch.deposit1=false;
        newMatch.deposit2=false;

        activeMatches[nextMatchId]=newMatch;
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
        require(opponent!=address(0),"Invalid address");
        require(opponent!=msg.sender,"You can't be both creator of the match and second player!");

        //Initialize a new match
        Match memory newMatch;
        newMatch.player1=msg.sender;
        newMatch.player2=opponent;
        
        activeMatches[nextMatchId]=newMatch;
        privateMatchesWaitingForAnOpponent.push(nextMatchId);

        emit newMatchCreated(newMatch.player1,(nextMatchId));
        
        nextMatchId++; //counter for the next new matchId
        activeMatchesNum++; //counter for the current active matches
        
        return (nextMatchId-1);
    }

    /**
     * @notice Function return the address of the creator of the match whose id is "id". It fails if
     * the give id is not related to any active match.
     * @param id id of the match whe are looking for
     */
    function getMatchCreator(uint id) public view returns (address){
        require(activeMatches[id].player1!=address(0),"No active games with that Id!");
        return activeMatches[id].player1;
    }

    /**
     * @notice Function return the address of the second player of the match whose id is "id". It fails if
     * the given id is not related to any active match or if that match is still waiting for an opponent.
     * Notice that the match creator can have specified the address of the contender but he/she may have not
     * already join the match.
     * @param id id of the match whe are looking for
     */
    function getSecondPlayer(uint id) public view returns (address){
        require(activeMatches[id].player1!=address(0),"No active games with that Id!");
        require(activeMatches[id].player2!=address(0),"This game is waiting for an opponent!"); 
        return activeMatches[id].player2;
    }

    /**
     * @notice Function that allow to join the match with id "id". In order to succeed in this operation we need that:
     * - the game has a slot available for any second player
     * OR
     * - the game has a slot reserved for me
     * @param id identifier of the game we would like to join
     */
    function joinMatchWithId(uint id) public{
        require(activeMatches[id].player1!=address(0),"There is no match with that id");
        require(activeMatches[id].player1!=msg.sender,"You cannot join a match created by yourself!");
        Match storage m=activeMatches[id];
        if(m.player2!=address(0)){ //second address not "null"
            if(utils.uintArrayContains(privateMatchesWaitingForAnOpponent,id)){ //second address specified but user not arealdy joined
                //check that I'm the authorized opponent
                require(m.player2==msg.sender,"You are not authorized to join this match!");

                m.player2=msg.sender; //add the second player

                uint idToDelete=utils.uintArrayFind(privateMatchesWaitingForAnOpponent,id); //index in the array of the completed match
                popByIndex(privateMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status

                emit secondPlayerJoined(msg.sender, id);
            }else{ //second address is specified and that match is not in the list of the available ones
                revert("This match is already full!");
            }
        }else{ //blank second address means that everyone can join this game
                m.player2=msg.sender; //add the second player

                uint idToDelete=utils.uintArrayFind(publicMatchesWaitingForAnOpponent,id); //index in the array of the completed match
                popByIndex(publicMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status

                emit secondPlayerJoined(msg.sender, id);
        }
    }

    /**
     * @notice Function that allow to join one on the available matches that are still
     * waiting for a second player. It will fail if there is no match available.
     */
    function joinMatch() public{
        require(publicMatchesWaitingForAnOpponent.length>0,"Currently no matches are available, try to create a new one!");

        uint randIdx=utils.randNo(publicMatchesWaitingForAnOpponent.length); //generate a number in [0, current number of available matches]
        uint id=publicMatchesWaitingForAnOpponent[randIdx]; //get the id of the waiting match associated to the idx generated above

        //the matches in publicMatchesWaitingForAnOpponent will have a blanbk field "player2" by construction!
        require(activeMatches[id].player1!=msg.sender,"You cannot join a match created by yourself, try again!");
        //it may happen that player1 creates a public match, then he decides to join another game but the "random" procedure
        //provides the id of the same match he has created.
        
        activeMatches[id].player2=msg.sender; //add the second player
        uint idToDelete=utils.uintArrayFind(publicMatchesWaitingForAnOpponent,id); //index in the array of the completed match
        popByIndex(publicMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status
    
        emit secondPlayerJoined(msg.sender, id);
    }

    //---GAME STAKE NEGOTIATION PHASE---
    /*Here it's assumed that the value put in stake by both user for their match will be decided
    offchain and, whenever they have reached an agreement on that value, the match creator will set
    this parameter of the match. */

    /**
     * @notice Function callable once only by the creator of the match in order to fix the amount put in stake.
     * @param matchId id of the match for which we are setting this parameter
     * @param value amount to put in stake, >0.
     */
    function setStakeValue(uint matchId, uint value) onlyMatchCreator(matchId) public{
        require(value>0,"The match stake has to be greater than zero!");
        require(activeMatches[matchId].stake==0,"The amount to put in stake has already been fixed by the match creator!");
        Match storage m=activeMatches[matchId];
        m.stake=value;
        m.timestampStakePaymentsOpening=block.timestamp;
        /*registers the timestamp when tha amount to pay is fixed because participant should send their funds
        within STAKEPAYMENTDEADLINE seconds, otherwise one of the parties can retire its funds and nullify the match */
    }

    /**
     * @notice Function callable by the partecipants of a match in order to deposit the amount to put in stake.
     * @param matchId id of the match for which we are paying
     */
    function depositStake(uint matchId) onlyMatchPartecipant(matchId) payable public{
        require(msg.value>0,"The match stake has to be greater than zero!");
        require(msg.value==activeMatches[matchId].stake,"You have sent an incorrect amout of WEI for this game");
        Match storage m=activeMatches[matchId];
        if(msg.sender==m.player1){
            if(!m.deposit1){
                m.deposit1=true;
            }else{
                revert("You have already sent the wei in stake for this match!");
            }
        }
        else{
            if(!m.deposit2){
                m.deposit2=true;
            }else{
                revert("You have already sent the wei in stake for this match!");
            }
        }
        
        
        //If both players have put in stake the right amount of wei the match can start so emit an event
        emit matchStakeDeposited(matchId);
    }

    /**
     * @notice Function callable by the partecipants of a match in order to retire the amount of wei they have put in stake.
     * This works only if the phase of wei collection takes more than STAKEPAYMENTDEADLINE seconds. This action will
     * nullify the match.
     * @param matchId id of the match of which we would like to retire the funds
     */
    function requestRefundMatchStake(uint matchId) onlyMatchPartecipant(matchId) public {
        Match storage m=activeMatches[matchId];
        require(m.player1!=address(0),"There is no match with that id");
        require((!m.deposit1)||(!m.deposit2),"Both players have put their funds in stake!");

        //The caller has to have done the payment before, otherwise cannot request the refund
        if(msg.sender==m.player1){
            require(m.deposit1,"You have not put in stake the amount required!");
        }else{
            require(m.deposit2,"You have not put in stake the amount required!");
        }

        //Check if the deadline for the payments of the stake amount is already expired
        require((m.timestampStakePaymentsOpening+STAKEPAYMENTDEADLINE)>block.timestamp,"You cannot request the refund until the deadline for the payments is expired!");

        (bool success,) = msg.sender.call{value: m.stake}("");
        require(success,"Refund payment failed!");

        dropTheMatch(matchId);
    }

    /**
     * @notice This function removes the element in position "target" from
     * the uint array. Since it's used to remove elements from uint arrays stored
     * in this contract (ex privateMatches), this function should be contained in this 
     * contract in order to manipulate these arrays.
     * @param array array from which we have to remove the element
     * @param target index of the element to remove
     */
    function popByIndex(uint[] storage array, uint target) private {
     require(target<array.length,"Array index out of bound!");
     array[target]=array[array.length-1];
     array.pop();
    }

    modifier onlyMatchCreator(uint matchId) {
        require(activeMatches[matchId].player1==msg.sender,"Only the creator of that match can perform this operation!");
        _;
    }

    modifier onlyMatchPartecipant(uint matchId) {
        require((activeMatches[matchId].player1==msg.sender)||(activeMatches[matchId].player2==msg.sender),"You are not participating to this match!");
        _;
    }

    function dropTheMatch(uint matchId) private{
        require(activeMatches[matchId].player1!=address(0),"There is no match with that id");
        activeMatchesNum--;
        delete activeMatches[matchId];
        //This function can be called when the players have not put their fund in stake within the time agreed.
        emit matchDeleted(matchId);
    }
}
