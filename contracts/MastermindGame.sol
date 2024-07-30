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
    }

    mapping(uint => Match) public activeMatches; //maps an active matchId to the players addresses
    uint[] publicMatchesWaitingForAnOpponent; 
    //array of the matchesIDs of matches without "player2" specified waiting for a player
    uint[] privateMatchesWaitingForAnOpponent; 
    //array of the matchesIDs of matches without "player2" specified waiting for a player

    uint activeMatchesNum=0; //counts active matches
    uint private nextMatchId=0; //matchId generation

    event newMatchCreated(address creator, uint newMatchId); //event emitted when a new match is created
    event secondPlayerJoined(address opponent, uint matchId); //event emitted when an opponent joins a match that was waiting

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

        if(activeMatches[id].player2!=address(0)){ //second address not "null"
            if(utils.uintArrayContains(privateMatchesWaitingForAnOpponent,id)){ //second address specified but user not arealdy joined
                //check that I'm the authorized opponent
                require(activeMatches[id].player2==msg.sender,"You are not authorized to join this match!");

                activeMatches[id].player2=msg.sender; //add the second player

                uint idToDelete=utils.uintArrayFind(privateMatchesWaitingForAnOpponent,id); //index in the array of the completed match
                popByIndex(privateMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status

                emit secondPlayerJoined(msg.sender, id);
            }else{ //second address is specified and that match is not in the list of the available ones
                revert("This match is already full!");
            }
        }else{ //blank second address means that everyone can join this game
                activeMatches[id].player2=msg.sender; //add the second player

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
}
