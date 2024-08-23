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

    /**
     * @notice Pure function that counts the number of char matches between the two strings.
     * It assumes thah the first string is the shortest between the two, in case the lenght
     * is different
     */
    function matchCount (string memory s1, string memory s2) external pure returns(uint){
        bytes memory s1_ = bytes (s1);
        bytes memory s2_ = bytes (s2);
        uint counter=0;
        for (uint i = 0; i < s1_.length; i++) {
            if (s1_[i] == s2_[i]) {
                    counter++;
            }
        }
        return counter;
    }
    
    /**
     * @notice Pure function that count the semi-matches between the 2 strings. A semi-match is
     * a position i such that s1[i]!=s2[i] but s1[i] appears in s2 in a different position.
     * @param alphabet set of distinct chars that appear in s1, s2
     */
    function semiMatchCount (string memory s1, string memory s2, string memory alphabet) external pure returns(uint){
        //In MastermindGame.sol s1 is the guess of the user, s2 is the secret, alphabet is the set of available colors
        bytes memory s1_ = bytes (s1);
        bytes memory s2_ = bytes (s2);
        bytes memory alphabet_ = bytes (alphabet);

        uint[256] memory charOccurrencesS1;
        uint[256] memory charOccurrencesS2;        

        //Parallel scan of s1 and s2
        for (uint i=0; i<s1_.length; i++) {
            if (s1_[i] != s2_[i]) { //if it's a "full" match do not take into consideration
                charOccurrencesS1[uint8(s1_[i])]++;
                charOccurrencesS2[uint8(s2_[i])]++;
            }
        }

        uint semiMatches=0;
        //Scan of the alphabet to compute the number of "semi-matches" (wrong position)
        for (uint i=0; i<alphabet_.length; i++) {
            //console.log("Scansiono %d al tentativo %d", uint8(alphabet_[i]))
            if (charOccurrencesS1[uint8(alphabet_[i])] <= charOccurrencesS2[uint8(alphabet_[i])] ) { //take the min
                semiMatches+=charOccurrencesS1[uint8(alphabet_[i])];
            }else{
                semiMatches+=charOccurrencesS2[uint8(alphabet_[i])];
            }
        }  
        return semiMatches;
    }

    /**
     * @notice The function checks that the string 'where' contains only characters
     * present in the string 'what'
     * @param what base string
     * @param where string to check
     */
    function containsCharsOf (string memory what, string memory where) external pure returns(bool){
        bytes memory whatBytes = bytes (what); //what to search
        bytes memory whereBytes = bytes (where); //where to search
        bool ok_char=false;
        for (uint i = 0; i < whereBytes.length; i++) {
            //console.log("Carattere numero %d di %s",i,where);
            for (uint j = 0; j < whatBytes.length; j++){
                if (whereBytes [i] == whatBytes [j]) {
                    ok_char = true;
                    break;
                }
            }
            if(ok_char==true){ //move to the next char in 'where'
                ok_char=false;
            }else{
                return false;
            }
        }
        return true;
    }
}
