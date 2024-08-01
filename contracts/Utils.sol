// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/**
 * @title Utils contract
 * @author Simone Schiavone <s.schiavone3@studenti.unipi.it>
 * @notice 
 */
import "hardhat/console.sol";

library Utils{
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

    function strcmp(string memory origin, string memory toCheck) external pure returns(bool){
        return (keccak256(abi.encodePacked((origin))) == keccak256(abi.encodePacked((toCheck))));
    }
    function contains (string memory what, string memory where) external pure{
        /*console.log("Comparo\n");
          console.log("%s",where);
          console.log("con");
          console.log("%s",what);*/
        bytes memory whatBytes = bytes (what); //what to search
        bytes memory whereBytes = bytes (where); //where to search
        /*console.log("Comparo");
        console.logBytes(whereBytes);
        console.log("con");
        console.logBytes(whatBytes);*/
        bool ok_char=false;
        for (uint i = 0; i < whereBytes.length; i++) {
            //console.log("Carattere numero %d di %s",i,where);
            for (uint j = 0; j < whatBytes.length; j++){
                if (whereBytes [i] == whatBytes [j]) {
                    //console.log("CARATTERE TROVATO!");
                    ok_char = true;
                    break;
                }
            }
            if(ok_char==true){ //move to the next char in 'where'
                //console.log("RAMO OK");
                ok_char=false;
            }else{
                revert("The guess contains an invalid color!");
            }
        }
    }
}
