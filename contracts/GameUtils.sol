// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/**
 * @title Utils contract
 * @author Simone Schiavone <s.schiavone3@studenti.unipi.it>
 * @notice Library which contains event, errors used in the MastermindGame.sol contract
 */
import "hardhat/console.sol";

library GameUtils{

     //----------EVENTS----------
    event newMatchCreated(address creator, uint newMatchId); 
    //event emitted when a new match is created
    event secondPlayerJoined(address opponent, uint matchId); 
    //event emitted when an opponent joins a match that was waiting
    event matchStakeFixed(uint matchId, uint amount); 
    //notifies that an agreement between the 2 player has been reached and it shows the amount to pay
    event matchStakeDeposited(uint matchId, address who); 
    //notifies that both the player has deposited the stake for that match
    event matchDeleted(uint matchId); 
    //notifies the deletion of that match from the active ones
    event newTurnStarted(uint matchId, uint turnNum, address codeMaker); 
    //notifies that a new turn of a match ir ready to be played and it speficies the address of the codemaker;
    event codeHashPublished(uint matchId, uint turnNum, bytes32 digest); 
    //notifies that the codeMaker has published the digest of the code hence the opponent could start to emit guesses;
    event newGuess(uint matchId, uint turnNum, string guess); 
    //notifies that a the codeBreaker of a game has proposed a solution for the code
    event feedbackProvided(uint matchId, uint turnNum, uint attemptNum, uint corrPos, uint wrongPosCorrCol);
    //notifies that the codeMaker has provided its feedback regarding the guess number 'attemptnum' of that turn of the match;
    event secretRequired(uint matchId, uint turnId, bool codeGuesses, address codeMaker);
    //notifies the codemaker that the turn is going to end so he has to provide the original code
    event turnCompleted(uint matchId, uint turnNum, uint points, address who);
    //notifies that a turn of a match is completed with the assignment of those points to that player
    event matchCompleted(uint matchId, address winner);
    //notifies the completion of a match and indicates the winner of that match. Winner==address(0) represents the case of a tie.
    event cheatingDetected(uint matchId, uint turnId, address who);
    //notifies that a player had a dishonest behavior hence punishment is performed
    event disputeWindowOpen(uint matchId, uint turnId, uint length);
    //notifies the opening of the dispute window providing also its length in blocks
    event AFKreported(uint matchId, address afkplayer);
    //notifies the contract that probably that player is AFK
    event AFKconfirmed(uint matchId, address afkplayer);
    //The event notifies that the reported player did not take any action within the agreed time.

    //----------ERRORS----------
    error InvalidParameter(string reason);
    error MatchNotFound(uint matchId);
    error TurnNotFound(uint turnId);
    error DuplicateOperation(string reason);
    error UnauthorizedAccess(string conditionViolated);
    error UnauthorizedOperation(string conditionViolated);
    error MatchNotStarted(uint matchId);
    error TurnNotEnded(uint turnId);
    error TurnEnded(uint turnId);
    error Player2NotJoinedYet(uint matchId);
}
