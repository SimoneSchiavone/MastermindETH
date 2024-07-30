// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/**
 * @title Utils contract
 * @author Simone Schiavone <s.schiavone3@studenti.unipi.it>
 * @notice 
 */
contract Utils{
    /**
     * @notice The functions return a pseudo-random number lower than mod
     * @param mod int used in the % operation to get a number lower than mod
     */
    function randNo(uint mod) external view returns (uint){
        bytes32 bhash= blockhash(block.number-1);
        bytes memory bytesArray = new bytes(32);
        for(uint i; i<32; i++){
            bytesArray[i]=bhash[i];
        }
        bytes32 rand=keccak256(bytesArray);
        uint out=uint(rand)%mod;
        return out;
    }

    /**
     * @notice Pure function that finds a given uint in an array of uints. It returns the
     * index in the array of the occurrence if present, otherwise it revets the execution.
     * @param array base array on which we carry out the search.
     * @param target value to find.
     */
    function uintArrayFind(uint[] memory array, uint target) external pure returns (uint){
        for(uint i=0; i<array.length;i++){
            if(array[i]==target){
                return i;
            }
        }
        revert("Value not found in the array!");
    }

    /**
     * @notice Pure function that checks the presence of a given uint in an array of uints. It returns
     * true if there is an occurrence, false otherwise.
     * @param array base array on which we carry out the search.
     * @param target value to find.
     */
    function uintArrayContains(uint[] memory array, uint target) external pure returns (bool){
        for(uint i=0; i<array.length;i++){
            if(array[i]==target){
                return true;
            }
        }
        return false;
    }
}
