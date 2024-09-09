import { expect, should } from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {ethers} from "hardhat";

describe("StakeNegotiation Contract", function(){
    const value=50;

    async function onlyDeployFixture() {        
        const Neg = await ethers.getContractFactory("UintNegotiation");
        const neg = await Neg.deploy();
        return neg;
    }

    async function neg0Created() {        
        const neg = await loadFixture(onlyDeployFixture);
        let [user1, user2]=await ethers.getSigners();
        await expect(neg.startNegotiationWith(user2.address)).to.emit(neg, "negotiationStarted").withArgs(0, user1.address, user2.address);
        return {neg, user1, user2};
    }

    async function firstProposalEmitted() {        
        const {neg, user1, user2} = await loadFixture(neg0Created);
        // Iteration 0: 50 ---> ?
        await expect(neg.propose(0 , value)).to.emit(neg, "newProposal").withArgs(0, value);
        return {neg, user1, user2};
    }

    async function agreementAlmostReached(){
        const {neg, user1, user2} = await loadFixture(firstProposalEmitted);
        // Iteration 0: 50 <--- 51
        await expect(neg.connect(user2).counterpropose(0, value+1)).not.to.be.reverted;
        // Iteration 1: 52 ---> 52
        await expect(neg.connect(user1).propose(0, value+2)).not.to.be.reverted;
        // Iteration 1: 52 <--- 53
        await expect(neg.connect(user2).counterpropose(0, value+3)).not.to.be.reverted;
        // Iteration 2: 54 ---> ?
        await expect(neg.connect(user1).propose(0, value+4)).not.to.be.reverted;
        // Iteration 2: 54 <--- 56
        await expect(neg.connect(user2).counterpropose(0, value+6)).not.to.be.reverted;
        //The negot. creator now can only accept or reject the proposal '56'
        return {neg, user1, user2};
    }

    async function agreementReached(){
        const {neg, user1, user2} = await loadFixture(agreementAlmostReached);
        await expect(neg.connect(user1).accept(0)).to.emit(neg, "agreementReached").withArgs(0, value+6);
        return {neg, user1, user2};
    }

    describe("Negotiation creation", function(){
        it("Should fail with address 0 as parameter", async () => {
            let neg=await loadFixture(onlyDeployFixture);
            await expect(neg.startNegotiationWith(ethers.ZeroAddress)).to.be.revertedWithCustomError(neg, "InvalidParameter").withArgs("User 2 address");
        })

        it("Should fail if negotiating with itself", async () => {
            let neg=await loadFixture(onlyDeployFixture);
            let [user1]=await ethers.getSigners();
            await expect(neg.startNegotiationWith(user1.address)).to.be.revertedWithCustomError(neg, "InvalidParameter").withArgs("Cannot negotiate with yourself");
        })

        it("Should correctly emit the event and return the id", async () => {
            let neg=await loadFixture(onlyDeployFixture);
            let [user1, user2]=await ethers.getSigners();
            let tx=await neg.startNegotiationWith(user2.address);
            await expect(tx).to.emit(neg, "negotiationStarted").withArgs(0, user1.address, user2.address);
        })

        it("Should correctly increase the Id for each new negotiation", async () => {
            let neg=await loadFixture(onlyDeployFixture);
            let [user1, user2]=await ethers.getSigners();
            await expect(neg.startNegotiationWith(user2.address)).to.emit(neg, "negotiationStarted").withArgs(0, user1.address, user2.address);
            await expect(neg.startNegotiationWith(user2.address)).to.emit(neg, "negotiationStarted").withArgs(1, user1.address, user2.address);
        })
    })

    describe("Get stake agreed", function(){
        it("Should fail with id not found", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            await expect(neg.getValueAgreed(1)).to.be.revertedWithCustomError(neg, "NegotiationNotFound").withArgs(1);
        })

        it("Should fail is the negotiation process is not completed", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            await expect(neg.getValueAgreed(0)).to.be.revertedWithCustomError(neg, "NegotiationNotCompleted").withArgs(0);
        })

        it("Should correctly provide the stake agreed", async () => {
            let {neg, user1, user2}=await loadFixture(agreementReached);
            expect(await neg.getValueAgreed(0)).to.be.equal(value+6);
        })
    })

    describe("Propose", function(){
        it("Should fail with id not found", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            await expect(neg.propose(1, value)).to.be.revertedWithCustomError(neg, "NegotiationNotFound").withArgs(1);
        })

        it("Should fail if called by someone not involved in the neg. process", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            let [u1, u2, u3]=await ethers.getSigners();
            await expect(neg.connect(u3).propose(0, value)).to.be.revertedWithCustomError(neg, "NotNegParticipant").withArgs(0);
        })

        it("Should fail if called by someone not the neg. creator", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            await expect(neg.connect(user2).propose(0, value)).to.be.revertedWithCustomError(neg, "NotNegCreator").withArgs(0);
        })

        it("Should fail if the amount proposed is 0", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            await expect(neg.connect(user1).propose(0, 0)).to.be.revertedWithCustomError(neg, "InvalidParameter").withArgs("Amount==0");
        })

        it("Should fail if the the agreement is already reached", async () => {
            let {neg, user1, user2}=await loadFixture(agreementReached);
            await expect(neg.connect(user1).propose(0, value)).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("Agreement reached");
        })

        it("Should correctly do the proposal and emit the event", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            let tx=neg.connect(user1).propose(0, value);
            await expect(tx).not.to.be.reverted;
            await expect(tx).to.emit(neg, "newProposal").withArgs(0, value);
        })

        it("Should fail if he does not wait the counterproposal", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            let tx=neg.connect(user1).propose(0, value);
            await expect(tx).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("Wait the counterproposal");
        })

        it("Should fail if the proposed value is equal to the one in the counterproposal", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            expect(await neg.connect(user2).counterpropose(0, value+1)).to.emit(neg, "newCounterProposal").withArgs(0, value+2);
            let tx=neg.connect(user1).propose(0, value+1);
            await expect(tx).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("You should accept the counterproposal");
        })

        it("Should fail if is called when the max number of iterations has been already performed", async () => {
            let {neg, user1, user2}=await loadFixture(agreementAlmostReached);
            let tx=neg.connect(user1).propose(0, value+1);
            await expect(tx).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("Accept or refuse the last counterproposal");
        })

        describe("Should fail if the proposed does not follow the trend established by the negotiation", async () => {
            it("Case of a proposal higher than the previous in case of a upward trend", async () => {
                let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
                expect(await neg.connect(user2).counterpropose(0, value+1)).not.to.be.reverted;
                let tx=neg.connect(user1).propose(0, value);
                await expect(tx).to.be.revertedWithCustomError(neg, "InvalidParameter").withArgs("Should increase the amount of the proposal");
            })
            
            it("Case of a proposal higher than the previous in case of a downward trend", async () => {
                let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
                expect(await neg.connect(user2).counterpropose(0, value/2)).not.to.be.reverted;
                let tx=neg.connect(user1).propose(0, value);
                await expect(tx).to.be.revertedWithCustomError(neg, "InvalidParameter").withArgs("Should decrease the amount of the proposal");
            })
        })
    })

    describe("Counterpropose", function(){
        it("Should fail with id not found", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            await expect(neg.connect(user2).counterpropose(1, value)).to.be.revertedWithCustomError(neg, "NegotiationNotFound").withArgs(1);
        })

        it("Should fail if called by someone not involved in the neg. process", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            let [u1, u2, u3]=await ethers.getSigners();
            await expect(neg.connect(u3).counterpropose(0, value)).to.be.revertedWithCustomError(neg, "NotNegParticipant").withArgs(0);
        })

        it("Should fail if called by the neg. creator", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            await expect(neg.connect(user1).counterpropose(0, value)).to.be.revertedWithCustomError(neg, "NotUser2").withArgs(0);
        })

        it("Should fail if the amount proposed is 0", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            await expect(neg.connect(user2).counterpropose(0, 0)).to.be.revertedWithCustomError(neg, "InvalidParameter").withArgs("Amount==0");
        })

        it("Should fail if the the agreement is already reached", async () => {
            let {neg, user1, user2}=await loadFixture(agreementReached);
            await expect(neg.connect(user2).counterpropose(0, value)).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("Agreement reached");
        })

        it("Should correctly do the proposal and emit the event", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            let tx=neg.connect(user2).counterpropose(0, value+1);
            await expect(tx).to.emit(neg, "newCounterProposal").withArgs(0, value+1);
        })

        it("Should fail if he does not wait the proposal", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            let tx=neg.connect(user2).counterpropose(0, value);
            await expect(tx).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("Wait the proposal");

            await expect(neg.propose(0, value)).not.to.be.reverted;
            await expect(neg.connect(user2).counterpropose(0, value+1)).not.to.be.reverted;
            await expect(neg.connect(user2).counterpropose(0, value+3)).to.be.revertedWithCustomError(neg,"InvalidOperation").withArgs("Wait the proposal");
        })

        it("Should fail when the maximum number of iteration is reached", async () => {
            let {neg, user1, user2}=await loadFixture(agreementAlmostReached);
            await expect(neg.connect(user2).counterpropose(0, value+100)).to.be.revertedWithCustomError(neg,"InvalidOperation").withArgs("Wait the answer of the proposer");
        })

        it("Should fail if the counterproposed value is equal to the one in the proposal", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            let tx=neg.connect(user2).counterpropose(0, value);
            await expect(tx).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("You should accept the proposal");
        })

        describe("Should fail if the proposed does not follow the trend established by the negotiation", async () => {
            it("Case of a proposal higher than the previous in case of a upward trend", async () => {
                let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
                expect(await neg.connect(user2).counterpropose(0, value+1)).not.to.be.reverted;
                expect(await neg.connect(user1).propose(0, value+2)).not.to.be.reverted;
                let tx=neg.connect(user2).counterpropose(0, value);
                await expect(tx).to.be.revertedWithCustomError(neg, "InvalidParameter").withArgs("Should increase the amount of the proposal");
            })
            
            it("Case of a proposal higher than the previous in case of a downward trend", async () => {
                let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
                expect(await neg.connect(user2).counterpropose(0, value-1)).not.to.be.reverted;
                expect(await neg.connect(user1).propose(0, value-2)).not.to.be.reverted;
                let tx=neg.connect(user2).counterpropose(0, value-1);
                await expect(tx).to.be.revertedWithCustomError(neg, "InvalidParameter").withArgs("Should decrease the amount of the proposal");
            })
        })
    })

    describe("Accept", function(){
        it("Should fail with id not found", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            await expect(neg.connect(user2).accept(1)).to.be.revertedWithCustomError(neg, "NegotiationNotFound").withArgs(1);
        })

        it("Should fail if called by someone not involved in the neg. process", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            let [u1, u2, u3]=await ethers.getSigners();
            await expect(neg.connect(u3).accept(0)).to.be.revertedWithCustomError(neg, "NotNegParticipant").withArgs(0);
        })

        it("Should fail if there are no proposals yet", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            await expect(neg.connect(user2).accept(0)).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("No proposals at the moment");
        })

        it("Should fail if called in the wrong moment by user1", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            await expect(neg.connect(user1).accept(0)).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("Not your turn");
        })

        it("Should fail if called in the wrong moment by user2", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            await expect(neg.connect(user2).counterpropose(0, value+1)).not.to.be.reverted;
            await expect(neg.connect(user2).accept(0)).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("Not your turn");
        })

        it("Should fail if the the agreement is already reached", async () => {
            let {neg, user1, user2}=await loadFixture(agreementReached);
            await expect(neg.connect(user2).accept(0)).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("Agreement reached");
            
        })

        it("Should correctly accept the proposal/counterproposal and emit the event", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            let tx=neg.connect(user2).accept(0);
            await expect(tx).to.emit(neg, "agreementReached").withArgs(0, value);
        })
       
    })

    describe("Refuse", function(){
        it("Should fail with id not found", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            await expect(neg.connect(user2).refuse(1)).to.be.revertedWithCustomError(neg, "NegotiationNotFound").withArgs(1);
        })

        it("Should fail if called by someone not the neg. creator", async () => {
            let {neg, user1, user2}=await loadFixture(firstProposalEmitted);
            let [u1, u2, u3]=await ethers.getSigners();
            await expect(neg.connect(u3).refuse(0)).to.be.revertedWithCustomError(neg, "NotNegParticipant").withArgs(0);
        })

        it("Should fail if there are no proposals yet", async () => {
            let {neg, user1, user2}=await loadFixture(neg0Created);
            await expect(neg.connect(user1).refuse(0)).to.be.revertedWithCustomError(neg, "InvalidOperation").withArgs("Continue the negotiation");
        })

        it("Should properly determine the final agreement ", async () => {
            let {neg, user1, user2}=await loadFixture(agreementAlmostReached);
            await expect(neg.connect(user1).refuse(0)).to.emit(neg, "agreementReached").withArgs(0, value+5);
        })
    })
})