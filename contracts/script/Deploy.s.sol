// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";

/// @notice Deploys MandateRegistry (with the Referee) and ReceiptLog (bound to
///         the registry). Run against testnet (10143) first, then mainnet
///         (143). Explicit gas is set via the broadcast tooling / foundry.toml.
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $MONAD_RPC --broadcast --slow -vvvv
///
/// Env:
///   DEPLOYER_PRIVATE_KEY  deployer key (keep a MON reserve buffer)
///   REFEREE_ADDRESS       Chainlink CRE referee (from Brain)
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address referee = vm.envAddress("REFEREE_ADDRESS");
        require(referee != address(0), "REFEREE_ADDRESS unset");

        vm.startBroadcast(pk);
        MandateRegistry registry = new MandateRegistry(referee);
        ReceiptLogContract receiptLog = new ReceiptLogContract(registry);
        vm.stopBroadcast();

        console2.log("MandateRegistry:", address(registry));
        console2.log("ReceiptLog:     ", address(receiptLog));
        console2.log("Referee:        ", referee);
        console2.log("Deploy block:   ", block.number);
    }
}
