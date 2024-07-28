// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Uncomment this line to use console.log
import "hardhat/console.sol";

/**
 * @title Mastermind Game Contract
 * @author Simone Schiavone <s.schiavone3@studenti.unipi.it>
 * @notice This smart conctract manages the matches between users
 *      for the code breaking game Mastermind.
 */
contract MastermindGame {
    address public gameManager;

    //---GAME PARAMETERS---
    uint public availableColors; 
    //number of colors usable in the code
    uint public codeSize; 
    //size of the code
    uint public noGuessedReward; 
    //extra reward for the code maker if the code breaker was not able to guess the code.

    //---MATCH MANAGEMENT---
    //Matches struct contains the addresses of the 2 players
    struct Match{
        address player1;
        address player2;
    }
    mapping(uint => Match) public activeMatches; //maps an active matchId to the players addresses
    uint activeMatchesNum=0; //counts active matches
    uint private nextMatchId=0; //matchId generation

    event newGameCreated(address creator, uint newGameId); //event emitted when a new game is created

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
    }
    
    /**
     * @notice Function invoked in order to create a new game (the unique actual participant 
     * is the creator of the game)
     */ 
    function createGame() public returns (uint matchId) {
        //Initialize a new match
        Match memory newGame;
        newGame.player1=msg.sender;
        newGame.player2=address(0);
        
        activeMatches[nextMatchId]=newGame; //vedere come si aggiunge al mapping
        nextMatchId++; //counter for the next new matchId
        activeMatchesNum++; //counter for the current active matches

        emit newGameCreated(newGame.player1,(nextMatchId-1));
        console.log("MSG SENDER %s\n",msg.sender);
        console.log("Inserted new game: with id %s and value %s and %s",nextMatchId-1, activeMatches[nextMatchId-1].player1, activeMatches[nextMatchId-1].player2);
        return (nextMatchId-1);
    }

    function getActiveMatches() public view{
        console.log("ACTIVE GAMES\n");
        for(uint i=0; i<nextMatchId; i++){
            console.log("GameId %d: %s VS %s\n", i, activeMatches[i].player1, activeMatches[i].player2);
        }
    }

    function getMatchCreator(uint gameId) public returns (address){
        require(activeMatches[gameId].player1!=address(0),"No active games with that Id!");
        return activeMatches[gameId].player1;
    }

    function getMatchJoiner(uint gameId) public returns (address){
        require(activeMatches[gameId].player1!=address(0),"No active games with that Id!");
        require(activeMatches[gameId].player2!=address(0),"This game is waiting for an opponent!");
        return activeMatches[gameId].player2;
    }
}
