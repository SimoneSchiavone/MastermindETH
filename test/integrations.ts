import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {ethers} from "hardhat";


describe("Integration of UintNegotiation contract with MastermindGame contract", function(){
    const value=50;
    const codesize=5;
    const turns=4;
    const guesses=5;
    const reward=5;

    async function onlyDeployFixture() {        
        const Neg = await ethers.getContractFactory("UintNegotiation");
        const neg = await Neg.deploy();
        
        const Lib = await ethers.getContractFactory("Utils");
        const lib = await Lib.deploy();
        let add:string=await lib.getAddress();
        const MM = await ethers.getContractFactory("MastermindGame", {
            libraries: {
                Utils: add,
            },
        });

        const mm = await MM.deploy(codesize, reward, turns, guesses);
        return {neg, mm};
    }

    it("Set the reference to that contract", async () => {
        let {neg, mm}=await loadFixture(onlyDeployFixture);
        await expect(mm.setNegotiationContract(await ethers.getAddress(await neg.getAddress()))).not.to.be.reverted;
        expect(await mm.isThereANegotiationContract()).to.equal(await neg.getAddress());
    })

    it("Fails if not set by the game owner", async () => {
        let {neg, mm}=await loadFixture(onlyDeployFixture);
        let [u1, u2]=await ethers.getSigners();
        await expect(mm.connect(u2).setNegotiationContract(await ethers.getAddress(await neg.getAddress()))).to.be.revertedWithCustomError(mm, "UnauthorizedOperation").withArgs("You are not the game manager");
        expect(await mm.isThereANegotiationContract()).to.equal(ethers.ZeroAddress);
    })

    it("Should fail if an address of a contract not implementing the interface is passed", async () => {
        let {neg, mm}=await loadFixture(onlyDeployFixture);
        await expect(mm.setNegotiationContract(await ethers.getAddress(await mm.getAddress())));
        //expect(await mm.isThereANegotiationContract()).to.equal(await neg.getAddress());
    })
   
})