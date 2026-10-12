// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";
import {IMandateRegistry} from "../src/interfaces/IMandateRegistry.sol";
import {IReceiptLog} from "../src/interfaces/IReceiptLog.sol";

/// @notice Post-deploy smoke test: sets a mandate, logs one EXECUTED receipt,
///         pauses, and asserts the state transitions. Run against testnet only.
///
/// Env: DEPLOYER_PRIVATE_KEY, MANDATE_REGISTRY_ADDRESS, RECEIPT_LOG_ADDRESS
contract Smoke is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        MandateRegistry registry = MandateRegistry(vm.envAddress("MANDATE_REGISTRY_ADDRESS"));
        ReceiptLogContract receiptLog = ReceiptLogContract(vm.envAddress("RECEIPT_LOG_ADDRESS"));

        vm.startBroadcast(pk);
        // The deployer plays the user and the agent wallet for the smoke test.
        registry.setMandate(
            IMandateRegistry.Mandate({
                policyHash: keccak256("smoke-policy"),
                maxNotionalUsd6: 25_000_000,
                maxLeverageX10: 30,
                maxWeeklyLossBps: 500,
                agentId: 0,
                agentWallet: deployer,
                perplKey: deployer,
                paused: false,
                updatedAt: 0
            })
        );
        require(registry.isActive(deployer), "not active after setMandate");

        receiptLog.logReceipt(
            IReceiptLog.ReceiptInput({
                user: deployer,
                venue: IReceiptLog.Venue.PERPL,
                market: keccak256("MON-PERP"),
                side: int8(1),
                sizeUsd6: 10_000_000,
                price1e18: 1e18,
                status: IReceiptLog.Status.EXECUTED,
                usedSlack: false,
                reasonHash: keccak256("reason"),
                signalHash: keccak256("signal"),
                execTxHash: bytes32(0)
            })
        );
        require(receiptLog.seq(deployer) == 1, "seq not incremented");

        registry.pause(deployer, "smoke");
        require(!registry.isActive(deployer), "still active after pause");
        registry.resume();
        require(registry.isActive(deployer), "not active after resume");
        vm.stopBroadcast();

        console2.log("Smoke OK. seq =", receiptLog.seq(deployer));
    }
}
