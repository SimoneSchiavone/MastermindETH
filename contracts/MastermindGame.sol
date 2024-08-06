// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Uncomment this line to use console.log
import "hardhat/console.sol";
import "./Utils.sol";
import "./GameUtils.sol";

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
    uint8 public extraReward;  //extra reward for the code maker if the code breaker is not able to guess the code.
    uint8 constant NUMBER_TURNS=4;
    uint8 constant NUMBER_GUESSES=5;

    //---DEADLINES---
    uint8 public constant STAKEPAYMENTDEADLINE = 25; //25 blocks, about 5 minutes
    uint8 public constant DISPUTEWINDOWLENGHT= 10; //10 blocks, about 2 minutes

    

    //---MATCH MANAGEMENT---
    //Matches struct contains the addresses of the 2 players
    struct Match{
        address player1; //creator of the match
        address player2; //second player
        
        uint stake; //amount in wei to put in stake for this match
        uint timestampStakePaymentsOpening; //blocknum of the block in which the stake is fixed
        bool deposit1; //indicates that player1 has payed the stake amount
        bool deposit2; //indicates that player2 has payed the stake amount

        uint score1;
        uint score2;
        Turn[] turns;
    }

    struct Turn{
        uint8 turnNo; //progressive number of this turn in the match
        bytes32 codeHash;
        string secret; //code generated by the CodeMaker, initially empty then filled at the end of the turn
        address codeMaker; //store the index of the player who has the role of codemaker ex. 1 stands for player1

        string[] codeProposals; //code proposed by the code breaker at each attempt (max numberGuesses)
        uint[] correctColorAndPosition; //reply of the codeMaker regarding a full match which is a color&position match
        uint[] correctColor; //replay of the codeMaker regarding a partial match which means color ok but wrong position

        bool codeGuessed; //indicates that the code has been guessed by the codeBreaker
        bool isSuspended; //indicates wether the turn is sospended due to the attempt bound or by the guessing of the secret
        uint disputeWindowOpening; //blocktime of the block in which the dispute window is opened.
    }

    mapping(uint => Match) public activeMatches; //maps an active matchId to the players addresses
    uint[] publicMatchesWaitingForAnOpponent; 
    //array of the matchesIDs of matches without "player2" specified waiting for a player
    uint[] privateMatchesWaitingForAnOpponent; 
    //array of the matchesIDs of matches without "player2" specified waiting for a player

    uint activeMatchesNum=0; //counts active matches
    uint private nextMatchId=0; //matchId generation

    /**
     * @notice Constructor function of the contract
     * @param _codeSize code size
     * @param _noGuessedReward extra reward for the code maker
     */
    constructor( uint8 _codeSize, uint8 _noGuessedReward){
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
            revert GameUtils.InvalidParameter("opponent","=0");
 
        if(opponent==msg.sender)
            revert GameUtils.InvalidParameter("opponent","opponent==yourself");

        //Initialize a new match
        Match storage newMatch=activeMatches[nextMatchId];
        newMatch.player1=msg.sender;
        newMatch.player2=opponent;

        privateMatchesWaitingForAnOpponent.push(nextMatchId);

        emit GameUtils.newMatchCreated(newMatch.player1,(nextMatchId));
        
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
            revert GameUtils.MatchNotFound(matchId);
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
            revert GameUtils.MatchNotFound(matchId);
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
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].player1==msg.sender)
            revert GameUtils.UnauthorizedAccess("You cannot join a match you have created");
        Match storage m=activeMatches[matchId];
        if(m.player2!=address(0)){ //second address not "null"
            if(Utils.uintArrayContains(privateMatchesWaitingForAnOpponent, matchId)){ //second address specified but user not arealdy joined
                //check that I'm the authorized opponent
                if(m.player2!=msg.sender)
                    revert GameUtils.UnauthorizedAccess("You cannot join this private match");

                m.player2=msg.sender; //add the second player

                uint idToDelete=Utils.uintArrayFind(privateMatchesWaitingForAnOpponent, matchId); //index in the array of the completed match
                popByIndex(privateMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status

                emit GameUtils.secondPlayerJoined(msg.sender, matchId);
            }else{ //second address is specified and that match is not in the list of the available ones
                revert GameUtils.UnauthorizedAccess("Full match");
            }
        }else{ //blank second address means that everyone can join this game
                m.player2=msg.sender; //add the second player

                uint idToDelete=Utils.uintArrayFind(publicMatchesWaitingForAnOpponent, matchId); //index in the array of the completed match
                popByIndex(publicMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status

                emit GameUtils.secondPlayerJoined(msg.sender, matchId);
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
            revert GameUtils.UnauthorizedAccess("You cannot join a match you have created");
        //it may happen that player1 creates a public match, then he decides to join another game but the "random" procedure
        //provides the id of the same match he has created.
        
        activeMatches[id].player2=msg.sender; //add the second player
        uint idToDelete=Utils.uintArrayFind(publicMatchesWaitingForAnOpponent,id); //index in the array of the completed match
        popByIndex(publicMatchesWaitingForAnOpponent,idToDelete); //this match is no more in waiting status
    
        emit GameUtils.secondPlayerJoined(msg.sender, id);
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
            revert GameUtils.InvalidParameter("stakeValue","=0");
        if(activeMatches[matchId].stake!=0)
            revert GameUtils.DuplicateOperation("Stake already fixed for that match");

        Match storage m=activeMatches[matchId];
        m.stake=value;
        m.timestampStakePaymentsOpening=block.number;
        /*registers the timestamp when tha amount to pay is fixed because participant should send their funds
        within STAKEPAYMENTDEADLINE seconds, otherwise one of the parties can retire its funds and nullify the match */
    }

    /**
     * @notice Function callable by the participants of a match in order to deposit the amount to put in stake.
     * @param matchId id of the match for which we are paying
     */
    function depositStake(uint matchId) onlyMatchParticipant(matchId) payable public{
        if(msg.value==0)
            revert GameUtils.InvalidParameter("WEI sent","=0");
        if(msg.value!=activeMatches[matchId].stake)
            revert GameUtils.InvalidParameter("WEI sent","!= agreed stake");
        Match storage m=activeMatches[matchId];
        if(msg.sender==m.player1){
            if(!m.deposit1){
                m.deposit1=true;
            }else{
                revert GameUtils.DuplicateOperation("WEI already sent");
            }
        }
        else{
            if(!m.deposit2){
                m.deposit2=true;
            }else{
                revert GameUtils.DuplicateOperation("WEI already sent");
            }
        }
        
        emit GameUtils.matchStakeDeposited(matchId);
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
    function requestRefundMatchStake(uint matchId) onlyMatchParticipant(matchId) public {
        Match storage m=activeMatches[matchId];
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        require((!m.deposit1)||(!m.deposit2),"Both players have put their funds in stake!");

        //The caller has to have done the payment before, otherwise cannot request the refund
        if(msg.sender==m.player1){
            require(m.deposit1,"You have not put in stake the amount required!");
        }else{
            require(m.deposit2,"You have not put in stake the amount required!");
        }

        //Check if the deadline for the payments of the stake amount is already expired
        require(block.number>=(m.timestampStakePaymentsOpening+STAKEPAYMENTDEADLINE),"You cannot request the refund until the deadline for the payments is expired!");

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
    function initializeTurn(uint matchId, uint8 turnId) private{
        require(turnId<NUMBER_TURNS,"Number of turns bound exceeded!");
        //no further checks on matchId since this function is invoked from other "safe" functions
        Match storage m=activeMatches[matchId]; 
        
        address _codeMaker;
        //codeMaker selection
        if(turnId==0){ //first turn
            _codeMaker= (uint8(Utils.randNo(2))==0) ? m.player1 : m.player2;
        }else{
            //swap the roles
            _codeMaker= (m.turns[turnId-1].codeMaker==m.player2)? m.player1 : m.player2;
        }
        
        //New turn creation and insertion in the associated match
        uint[] memory whatever; //empty array
        string[] memory _whatever;
        string memory __whatever;
        Turn memory t= Turn({turnNo: turnId,codeMaker: _codeMaker, codeHash: 0,codeProposals: _whatever,correctColorAndPosition: whatever,
            correctColor: whatever, codeGuessed: false, isSuspended: false, disputeWindowOpening: 0, secret: __whatever});
        m.turns.push(t);
        
        //Notifies the completion of this phase and request the codeMaker to start this turn
        emit GameUtils.newTurnStarted(matchId, turnId, t.codeMaker);
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
    function publishCodeHash(uint matchId, uint8 turnId, bytes32 codeDigest) onlyMatchParticipant(matchId) onlyCodeMaker(matchId, turnId) public{ 
        //The checks regarding the match/turn ids are performed by the modifier
        //Check that this turn is not already finished.
        require((activeMatches[matchId].turns.length)-1==turnId,"This turn is already finished!");
        if(activeMatches[matchId].turns[turnId].codeHash!=0)
            revert GameUtils.DuplicateOperation("Secret code digest published");
        
        //PENSA SE FAR PARTIRE IL PUNISHMENT GIA' QUI
        activeMatches[matchId].turns[turnId].codeHash=codeDigest;
        emit GameUtils.codeHashPublished(matchId, turnId, codeDigest);
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
    function guessTheCode(uint matchId, uint8 turnId, string memory codeProponed) onlyMatchParticipant(matchId) onlyCodeBreaker(matchId, turnId) public{ 
        //The checks regarding the match/turn ids are performed by the modifier
        //Check that this turn is not already finished.
        require((activeMatches[matchId].turns.length)-1==turnId,"This turn is already finished!");

        Turn storage t=activeMatches[matchId].turns[turnId]; //actual turn
        //CONTROLLO NON NECESSARIO PERCHè' ALL'ULTIMO TENTATIVO IL TURNO TERMINA
        require(t.codeProposals.length<NUMBER_GUESSES,"Too many attempts for this turn!");
        if(t.isSuspended){
            revert GameUtils.UnauthorizedOperation("Turn suspended, no more guesses admitted");
        }
        require((t.codeProposals.length==t.correctColor.length)&&(t.codeProposals.length==t.correctColorAndPosition.length),"You need to wait the feedback from the codeMaker regarding the last code you have proposed!");

        //We assume that the string received by the contract is like "BCRTA", where each char represents one of the colors available in this game
        //Before pushing in the array of code proposed check its correctness
        if(!Utils.containsCharsOf(availableColors,codeProponed))
            revert GameUtils.InvalidParameter("codeProponed","Invalid color in the code");
     
        t.codeProposals.push(codeProponed);
        emit GameUtils.newGuess(matchId, turnId, codeProponed);
    }

    /**
     * Function invoked by the codeMaker of a turn in order to give the feedback reguarding a duess
     * to the codeBreaker.
     * @param matchId id of the match
     * @param turnId id of the turn
     * @param corrPos number of correct positions, which means also correct code
     * @param wrongPosCorrCol number of wrong positions but right colors
     */
    function provideFeedback(uint matchId, uint8 turnId, uint8 corrPos, uint8 wrongPosCorrCol) onlyMatchParticipant(matchId) onlyCodeMaker(matchId, turnId) public{
        //The checks regarding the match/turn ids are performed by the modifier
        //Check that this turn is not already finished.
        require((activeMatches[matchId].turns.length)-1==turnId,"This turn is already finished!");
        if(corrPos>codeSize)
            revert GameUtils.InvalidParameter("correctPositions",">codeSize");
        if(wrongPosCorrCol>codeSize)
            revert GameUtils.InvalidParameter("wrongPositionCorrectColors",">codeSize");
        
        Turn storage t=activeMatches[matchId].turns[turnId]; //actual turn
        uint attemptNum=t.codeProposals.length;

        //The correct situation is when the codeProposals array has a length greater than the feedback ones of 1 unit
        require(t.codeProposals.length>0,"The codeBreakers has not yet provided a guess!");
        require((t.correctColorAndPosition.length==attemptNum-1) && (t.correctColor.length==attemptNum-1),"Feedback already provided for this attempt, wait for another guess of the codeBreaker!");
        t.correctColorAndPosition.push(corrPos);
        t.correctColor.push(wrongPosCorrCol);

        emit GameUtils.feedbackProvided(matchId, turnId, uint8(t.codeProposals.length-1), corrPos, wrongPosCorrCol);

        //Manages the situations which cause the ending of the turn
        if(corrPos==codeSize){ //CodeBreaker has won the turn because it has guessed the hidden code!
            t.codeGuessed=true;
            t.isSuspended=true;
            emit GameUtils.secretRequired(matchId, turnId, true,t.codeMaker);
        }
        if(t.codeProposals.length==NUMBER_GUESSES){ //CodeMaker has won the turn because the codeBreaker has exhausted its attempts
            t.isSuspended=true;
            emit GameUtils.secretRequired(matchId, turnId,false, t.codeMaker);
        }
    }

    /**
     * Function invoked by the codeBreaker of the turn in order to report the fact that, in its opinion, the
     * codeMaker has provided a wrong feedback for one of its guesses. If the dispute will be accepted by the
     * contract the codeMaker will be punished accordingly to the policies implemented, otherwise the punishment
     * will be done on the issuer.
     * @param matchId id of the match reported
     * @param turnId id of the turn reported
     * @param feedbackNum number of the feedback reported (starting from 0)
     */
    function openDispute(uint matchId, uint8 turnId, uint8 feedbackNum) public onlyMatchParticipant(matchId) onlyCodeBreaker(matchId, turnId){
        Turn storage t=activeMatches[matchId].turns[turnId];
        if(feedbackNum>=t.codeProposals.length)
            revert GameUtils.InvalidParameter("feedbackNum",">#guesses emitted");
        if(!t.isSuspended)
            revert GameUtils.TurnNotEnded(turnId);
        if(bytes(t.secret).length==0)
            revert GameUtils.UnauthorizedOperation("Secret code not provided");
        if(block.number>t.disputeWindowOpening+DISPUTEWINDOWLENGHT)
            revert GameUtils.UnauthorizedOperation("Dispute window closed");

        //FIXME: C'è un array out of bound qui, controllare
        
        //Checks if the codeMaker has behaved unsportmanlike
        if(t.correctColorAndPosition[feedbackNum]!=Utils.matchCount(t.codeProposals[feedbackNum], t.secret)){
            //Case of wrong CC provided
            emit GameUtils.cheatingDetected(matchId, turnId, t.codeMaker);
            //TODO: Invoke punishment for codeMaker
            return;
        }
        if(t.correctColorAndPosition[feedbackNum]!=Utils.semiMatchCount(t.codeProposals[feedbackNum], t.secret, availableColors)){
            //Case of wrong NC provided
            emit GameUtils.cheatingDetected(matchId, turnId, t.codeMaker);
            //TODO: Invoke punishment for codeMaker
            return;
        }

        //The codeMaker has not performed any error so the issuer of the dispute will be punished
        //TODO: Invoke punishment for codeBreaker (msg.sender, tanto è già controllato)

    }
    //----------TURN CONCLUSION----------
    /**
     * Function invoked by the codeMaker in order to prove that he has not changed the secret code during the
     * game. If the check passes then the function determines the points scored by the codeMaker of that turn.
     * If the codeMaker behaves unsportmanlike then it put into effect the punishment policy. 
     * @param matchId id of the match
     * @param turnId  id of the turn
     * @param secret code decided by the codeMaker at the beginning of the turn
     */
    function provideSecret(uint matchId, uint8 turnId, string memory secret) onlyMatchParticipant(matchId) onlyCodeMaker(matchId, turnId) public{
        if(bytes(secret).length==0){
            revert GameUtils.InvalidParameter("secret","Empty string");
        }

        if(!Utils.containsCharsOf(availableColors, secret))
            revert GameUtils.InvalidParameter("secret","Invalid color in the code");

        Turn storage t=activeMatches[matchId].turns[turnId];
        if(!t.isSuspended){
            revert GameUtils.TurnNotEnded(turnId);
        }
        
        string memory hashSecretProvided=string(abi.encodePacked(keccak256(bytes(secret))));
        if(!Utils.strcmp(hashSecretProvided, string(abi.encodePacked(t.codeHash)))){
            //TODO: IMPLEMENT THE PUNISHMENT POLICY  
            emit GameUtils.cheatingDetected(matchId, turnId, t.codeMaker);
            return;
        }

        //FIXME: We cannot start immediately another match since we need to let disputes to be opened
        t.secret=secret;
        emit GameUtils.disputeWindowOpen(matchId, turnId, DISPUTEWINDOWLENGHT);
        /*
        //Manages the situations which cause the ending of the turn
        if(t.correctColorAndPosition[(t.codeProposals.length)-1]==codeSize){ //Turn suspended because the codeBraker has guessed the hidden code!
            t.codeGuessed=true;
            //The points earned are the number of failed attempts hence subtract1
            endTurn(matchId, turnId, uint8(t.codeProposals.length-1));
        }
        if(t.codeProposals.length==NUMBER_GUESSES){ //Turn suspended because the bounds on the attempts has been reached!
            endTurn(matchId, turnId, uint8(t.codeProposals.length));
        }*/
    }

    /**
     * Function invoked by one of the participant after the closing of the dispute window in order to
     * manage the ending of a turn, hence assigning the earned points to the codeMaker of that turn 
     * and emit the event of turn completion. 
     * @param matchId id of the match
     * @param turnId  id of the turn
     */
    function endTurn(uint matchId, uint8 turnId) onlyMatchParticipant(matchId) public{
        Match storage m=activeMatches[matchId];
        Turn storage t=m.turns[turnId];
        if(block.number<t.disputeWindowOpening+DISPUTEWINDOWLENGHT)
            revert GameUtils.UnauthorizedOperation("Dispute window is still open");

        uint8 earned=uint8(t.codeProposals.length);
        earned = !(t.codeGuessed) ? earned+extraReward : earned-1; //the last code proposed is correct hence it's not a failure to consider
        
        if(t.codeMaker==m.player1){
            m.score1+=earned;
        }else{
            m.score2+=earned;
        }

        emit GameUtils.turnCompleted(matchId, turnId, earned, t.codeMaker);

        if(m.turns.length<NUMBER_TURNS){ //Turn bound not reached, start another game
            initializeTurn(matchId, turnId+1);
        }else{ //Turn bound reached, close the match
            endMatch(matchId);
        }
    }

    function endMatch(uint matchId) private {
        Match storage m=activeMatches[matchId];
        //Decide the winner of the match
        if(m.score1==m.score2){ //tie
            emit GameUtils.matchCompleted(matchId, address(0));
        }else{
            if(m.score1<m.score2){
                emit GameUtils.matchCompleted(matchId, m.player1);
            }else{
                emit GameUtils.matchCompleted(matchId, m.player2);
            }
        }

        //C'è già Drop The Match per chiudere tutto
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
            revert GameUtils.InvalidParameter("target","Out of bound");
        array[target]=array[array.length-1];
        array.pop();
    }

    modifier onlyMatchCreator(uint matchId) {
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].player1!=msg.sender)
            revert GameUtils.UnauthorizedAccess("You are not the creator of the match");
        _;
    }

    modifier onlyMatchParticipant(uint matchId) {
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if((activeMatches[matchId].player1!=msg.sender)&&(activeMatches[matchId].player2!=msg.sender))
            revert GameUtils.UnauthorizedAccess("You are not a participant of the match");
        _;
    }

    /**
     * @notice this modifier allows the operation at which it is attached only if
     * the caller is the codeBreaker of that turn of the match.
     */
    modifier onlyCodeMaker (uint matchId, uint turnId){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert GameUtils.MatchNotStarted(matchId);
        if(turnId>=activeMatches[matchId].turns.length)
            revert GameUtils.TurnNotStarted(turnId);
        if(activeMatches[matchId].turns[turnId].codeMaker!=msg.sender)
            revert GameUtils.UnauthorizedOperation("You are not the codeMaker of this turn");
        _;
    }

    /**
     * @notice this modifier allows the operation at which it is attached only if
     * the caller is the codeBreaker of that turn of the match.
     */
    modifier onlyCodeBreaker(uint matchId, uint turnId){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert GameUtils.MatchNotStarted(matchId);
        if(turnId>=activeMatches[matchId].turns.length)
            revert GameUtils.TurnNotStarted(turnId);
        if(activeMatches[matchId].turns[turnId].codeMaker==msg.sender)
            revert GameUtils.UnauthorizedOperation("You are not the codeBreaker of this turn");
        _;
    }

    function dropTheMatch(uint matchId) private{
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        activeMatchesNum--;
        delete activeMatches[matchId];
        emit GameUtils.matchDeleted(matchId);
    }

    function getCodeMaker(uint matchId, uint turnId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert GameUtils.MatchNotStarted(matchId);
        if(turnId>=activeMatches[matchId].turns.length)
            revert GameUtils.TurnNotStarted(turnId);

        return activeMatches[matchId].turns[turnId].codeMaker;
    }

    function getCodeBreaker(uint matchId, uint turnId) public view returns (address){
        if(activeMatches[matchId].player1==address(0))
            revert GameUtils.MatchNotFound(matchId);
        if(activeMatches[matchId].turns.length==0)
            revert GameUtils.MatchNotStarted(matchId);
        if(turnId>=activeMatches[matchId].turns.length)
            revert GameUtils.TurnNotStarted(turnId);
        if(activeMatches[matchId].player1==activeMatches[matchId].turns[turnId].codeMaker){
            return activeMatches[matchId].player2;
        }else{
            return activeMatches[matchId].player1;
        }
    }
}
