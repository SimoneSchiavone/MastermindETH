// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/**
 * @title UintNegotiation contract
 * @author Simone Schiavone <s.schiavone3@studenti.unipi.it>
 * @notice Contract that allows to set up a negotiation process between two users
 * in order to determine an agreed uint value.
 */
import "hardhat/console.sol";

contract UintNegotiation{
    uint private nextNegotiationId=0;
    uint constant MAX_ITERATIONS=3; 
    //maximum number of iterations, where each iteration is composed by a proposal and then a counterproposal.

    struct Negotiation{
        address user1;
        address user2;

        uint[] proposals; //array of proposals done by user1
        uint[] c_proposals; //array of counter proposals done by user2

        uint agreedValue;
    }

    //Mapping which stores the active negotiations
    mapping (uint => Negotiation) activeNegotiations;

    //CUSTOM ERRORS
    error NegotiationNotFound(uint Id);
    error NegotiationNotCompleted(uint Id);
    error NotNegParticipant(uint Id);
    error NotNegCreator(uint Id);
    error NotUser2(uint Id);
    error InvalidParameter(string reason);
    error InvalidOperation(string reason);

    //EVENTS
    event negotiationStarted(uint Id, address user1, address user2);
    event newProposal(uint Id, uint amount);
    event newCounterProposal(uint Id, uint amount);
    event agreementReached(uint Id, uint amount);

    /**
     * @notice Function invoked in order to start a negotiation with a specified address. 
     * @param who address of the second user
     */
    function startNegotiationWith(address who) external returns (uint negotiationId){
        if(who==address(0)){
            revert InvalidParameter("User 2 address");
        }
        if(who==msg.sender){
            revert InvalidParameter("Cannot negotiate with yourself");
        }

        Negotiation storage newNegotiation=activeNegotiations[nextNegotiationId];
        newNegotiation.user1=msg.sender; //User 1 is the address of the creator of the Negotiation
        newNegotiation.user2=address(who);
        newNegotiation.agreedValue=0;
        
        activeNegotiations[nextNegotiationId]=newNegotiation;
        negotiationId=nextNegotiationId;
        nextNegotiationId++;
        emit negotiationStarted(negotiationId, msg.sender, who);
        return negotiationId;
    }

    /**
     * @notice Function invoked in order to get the value agreed if it is already been decided,
     * otherwise revert.
     * @param negotiationId id of the negotiation
     */
    function getValueAgreed(uint negotiationId) external view returns (uint){
        if(activeNegotiations[negotiationId].user1==address(0))
            revert NegotiationNotFound(negotiationId);
        if(activeNegotiations[negotiationId].agreedValue==0)
            revert NegotiationNotCompleted(negotiationId);
        return activeNegotiations[negotiationId].agreedValue;
    }

    /**
     * @notice Function invoked by the 'user1' of the negotiation in order to propose a value.
     * The value proposed has to be consistent with the other proposals/counterproposals.
     * @param negotiationId id of the negotition
     * @param amount amount proposed
     */
    function propose(uint negotiationId, uint amount) onlyNegCreator(negotiationId) external{
        if(amount==0)
            revert InvalidParameter("Amount==0");

        Negotiation storage n=activeNegotiations[negotiationId];

        if(n.agreedValue!=0)
            revert InvalidOperation("Agreement reached");

        if(n.proposals.length!=0){
            uint iteration=n.proposals.length;
            if(iteration==MAX_ITERATIONS)
                revert InvalidOperation("Accept or refuse the last counterproposal");
            
            if(n.proposals.length>n.c_proposals.length)
                revert InvalidOperation("Wait the counterproposal");    

            if(n.c_proposals[iteration-1]==amount)
                revert InvalidOperation("You should accept the counterproposal");

            uint previousCounterProp=n.c_proposals[iteration-1];
            uint previousProp=n.proposals[iteration-1];
            
            if(previousProp < previousCounterProp){ //upward counterproposal
                if(amount <= previousProp)
                    revert InvalidParameter("Should increase the amount of the proposal");
            }else{ //downward counterproposal
                if(amount >= previousProp)
                    revert InvalidParameter("Should decrease the amount of the proposal");
            }
        }
        
        n.proposals.push(amount);
        emit newProposal(negotiationId, amount);
    }

    /**
     * @notice Function invoked by the 'user2' of the negotiation in order to counterpropose a value.
     * The value counterproposed has to be consistent with the other proposals/counterproposals.
     * @param negotiationId id of the negotition
     * @param amount amount proposed
     */
    function counterpropose(uint negotiationId, uint amount) onlyUser2(negotiationId) external{
        if(amount==0)
            revert InvalidParameter("Amount==0");

        Negotiation storage n=activeNegotiations[negotiationId];

        if(n.agreedValue!=0)
            revert InvalidOperation("Agreement reached");

        if(n.proposals.length!=0){
            uint iteration=n.c_proposals.length;
    
            if(iteration==MAX_ITERATIONS)
                revert InvalidOperation("Wait the answer of the proposer");

            if(n.c_proposals.length>=n.proposals.length)
                revert InvalidOperation("Wait the proposal");

            if(n.proposals[iteration]==amount)
                revert InvalidOperation("You should accept the proposal");

            if(iteration>0){
                uint previousCounterProp=n.c_proposals[iteration-1];
                uint previousProp=n.proposals[iteration];
                    if(previousProp > previousCounterProp){ //upward counterproposal
                        if(amount <= previousCounterProp)
                            revert InvalidParameter("Should increase the amount of the proposal");
                    }else{ //downward counterproposal
                        if(amount >= previousCounterProp)
                            revert InvalidParameter("Should decrease the amount of the proposal");
                    }
            }
        }else
            revert InvalidOperation("Wait the proposal");

        n.c_proposals.push(amount);
        emit newCounterProposal(negotiationId, amount);
    }

    /**
     * @notice Function invoked by one of the user to accept the last proposal/counterproposal emitted
     * by the counterpart.
     * @param negotiationId id of the negotiation
     */
    function accept(uint negotiationId) onlyNegParticipant(negotiationId) external{
        Negotiation storage n=activeNegotiations[negotiationId];
        if(n.proposals.length==0)
            revert InvalidOperation("No proposals at the moment");
        
        if(n.agreedValue!=0)
            revert InvalidOperation("Agreement reached");

        //Check if it is called in the right moment of the negotiation:
        //Counterproposer when a proposal is active
        if(n.proposals.length>n.c_proposals.length){
            if(msg.sender==n.user1)
                revert InvalidOperation("Not your turn");
            n.agreedValue=n.proposals[n.proposals.length-1];
        }
            
        //Proposer when a counterproposal is active
        if(n.proposals.length==n.c_proposals.length){
            if(msg.sender==n.user2) 
                revert InvalidOperation("Not your turn");
            n.agreedValue=n.c_proposals[n.c_proposals.length-1];
        }
        emit agreementReached(negotiationId, n.agreedValue);
    }
    
    /**
     * @notice Function invoked by 'user1' in order to refuse the counterproposed value during
     * the last available iteration of the negotiation process.
     * @param negotiationId id of the negotiation
     */
    function refuse(uint negotiationId) onlyNegCreator(negotiationId) external{
        Negotiation storage n=activeNegotiations[negotiationId];
        if(n.c_proposals.length!=MAX_ITERATIONS)
            revert InvalidOperation("Continue the negotiation");
        uint lastProposal=n.proposals[n.proposals.length-1];
        uint lastCounterProposal=n.c_proposals[n.c_proposals.length-1];
        n.agreedValue=(lastProposal+lastCounterProposal)/2; 
        //AVG of the values emitted in the last iteration of the negotiation process
        emit agreementReached(negotiationId, n.agreedValue);
    }

    modifier onlyNegParticipant(uint negotiationId) {
        if(activeNegotiations[negotiationId].user1==address(0))
            revert NegotiationNotFound(negotiationId);
        if(activeNegotiations[negotiationId].user1!=msg.sender  &&
            activeNegotiations[negotiationId].user2!=msg.sender)
            revert NotNegParticipant(negotiationId);
        _;
    }

    modifier onlyUser2 (uint negotiationId){
        if(activeNegotiations[negotiationId].user1==address(0))
            revert NegotiationNotFound(negotiationId);
        if(activeNegotiations[negotiationId].user1!=msg.sender  &&
            activeNegotiations[negotiationId].user2!=msg.sender)
            revert NotNegParticipant(negotiationId);
        if(activeNegotiations[negotiationId].user2!=msg.sender)
            revert NotUser2(negotiationId);
        _;
    }

    modifier onlyNegCreator(uint negotiationId){
        if(activeNegotiations[negotiationId].user1==address(0))
            revert NegotiationNotFound(negotiationId);
        if(activeNegotiations[negotiationId].user1!=msg.sender  &&
            activeNegotiations[negotiationId].user2!=msg.sender)
            revert NotNegParticipant(negotiationId);
        if(activeNegotiations[negotiationId].user1!=msg.sender)
            revert NotNegCreator(negotiationId);
        _;
    }
}