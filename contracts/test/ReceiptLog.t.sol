// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";
import {IMandateRegistry} from "../src/interfaces/IMandateRegistry.sol";
import {IReceiptLog} from "../src/interfaces/IReceiptLog.sol";

contract ReceiptLogTest is Test {
    MandateRegistry registry;
    ReceiptLogContract rlog;

    address referee = makeAddr("referee");
    address user = makeAddr("user");
    address agentWallet = makeAddr("agentWallet");
    address perplKey = makeAddr("perplKey");
    address persona = makeAddr("persona");
    address stranger = makeAddr("stranger");

    bytes32 constant MON_PERP = keccak256("MON-PERP");

    event TradeReceipt(
        address indexed user,
        uint256 indexed agentId,
        uint64 indexed seq,
        IReceiptLog.Venue venue,
        bytes32 market,
        int8 side,
        uint128 sizeUsd6,
        uint256 price1e18,
        IReceiptLog.Status status,
        bool usedSlack,
        bytes32 reasonHash,
        bytes32 signalHash,
        bytes32 execTxHash
    );

    function setUp() public {
        registry = new MandateRegistry(referee);
        rlog = new ReceiptLogContract(registry);
        vm.warp(1_700_000_000);

        IMandateRegistry.Mandate memory m = IMandateRegistry.Mandate({
            policyHash: keccak256("policy"),
            maxNotionalUsd6: 100_000_000,
            maxLeverageX10: 50,
            maxWeeklyLossBps: 1000,
            agentId: 7,
            agentWallet: agentWallet,
            perplKey: perplKey,
            paused: false,
            updatedAt: 0
        });
        vm.prank(user);
        registry.setMandate(m);
    }

    function _receipt(IReceiptLog.Status status)
        internal
        view
        returns (IReceiptLog.ReceiptInput memory r)
    {
        r = IReceiptLog.ReceiptInput({
            user: user,
            venue: IReceiptLog.Venue.PERPL,
            market: MON_PERP,
            side: int8(1),
            sizeUsd6: 20_000_000,
            price1e18: 1e18,
            status: status,
            usedSlack: false,
            reasonHash: keccak256("reason"),
            signalHash: keccak256("signal"),
            execTxHash: bytes32(uint256(0xabc))
        });
    }

    function test_constructorStoresRegistry() public view {
        assertEq(address(rlog.registry()), address(registry));
    }

    function test_logReceipt_executed_byAgent() public {
        IReceiptLog.ReceiptInput memory r = _receipt(IReceiptLog.Status.EXECUTED);
        vm.expectEmit(true, true, true, true);
        emit TradeReceipt(
            user,
            7,
            1,
            r.venue,
            r.market,
            r.side,
            r.sizeUsd6,
            r.price1e18,
            r.status,
            r.usedSlack,
            r.reasonHash,
            r.signalHash,
            r.execTxHash
        );
        vm.prank(agentWallet);
        rlog.logReceipt(r);
        assertEq(rlog.seq(user), 1);
    }

    function test_logReceipt_fromNonAgentReverts() public {
        IReceiptLog.ReceiptInput memory r = _receipt(IReceiptLog.Status.EXECUTED);
        vm.prank(stranger);
        vm.expectRevert(ReceiptLogContract.NotAgentWallet.selector);
        rlog.logReceipt(r);
    }

    function test_logReceipt_shadowStatusReverts() public {
        IReceiptLog.ReceiptInput memory r = _receipt(IReceiptLog.Status.SHADOW);
        vm.prank(agentWallet);
        vm.expectRevert(ReceiptLogContract.ShadowNotAllowed.selector);
        rlog.logReceipt(r);
    }

    function test_logReceipt_executedWhilePausedReverts() public {
        vm.prank(user);
        registry.pause(user, "user");
        IReceiptLog.ReceiptInput memory r = _receipt(IReceiptLog.Status.EXECUTED);
        vm.prank(agentWallet);
        vm.expectRevert(ReceiptLogContract.MandateNotActive.selector);
        rlog.logReceipt(r);
    }

    function test_logReceipt_rejectedWhilePausedSucceeds() public {
        vm.prank(user);
        registry.pause(user, "user");
        IReceiptLog.ReceiptInput memory r = _receipt(IReceiptLog.Status.REJECTED);
        vm.prank(agentWallet);
        rlog.logReceipt(r); // REJECTED does not require isActive
        assertEq(rlog.seq(user), 1);
    }

    function test_logShadow_forcesUserAndStatus() public {
        // Build a receipt that lies about user and status; logShadow overrides both.
        IReceiptLog.ReceiptInput memory r = _receipt(IReceiptLog.Status.EXECUTED);
        r.user = user; // claim to be someone else's receipt

        vm.expectEmit(true, true, true, true);
        emit TradeReceipt(
            persona, // forced user = msg.sender
            99,
            1,
            r.venue,
            r.market,
            r.side,
            r.sizeUsd6,
            r.price1e18,
            IReceiptLog.Status.SHADOW, // forced status
            r.usedSlack,
            r.reasonHash,
            r.signalHash,
            r.execTxHash
        );
        vm.prank(persona);
        rlog.logShadow(99, r);
        assertEq(rlog.seq(persona), 1);
    }

    function test_seqIncrementsPerUser() public {
        IReceiptLog.ReceiptInput memory r = _receipt(IReceiptLog.Status.EXECUTED);
        vm.startPrank(agentWallet);
        rlog.logReceipt(r);
        rlog.logReceipt(r);
        rlog.logReceipt(r);
        vm.stopPrank();
        assertEq(rlog.seq(user), 3);

        // A different caller/user keeps its own counter.
        IReceiptLog.ReceiptInput memory sr = _receipt(IReceiptLog.Status.EXECUTED);
        vm.prank(persona);
        rlog.logShadow(1, sr);
        assertEq(rlog.seq(persona), 1);
        assertEq(rlog.seq(user), 3);
    }
}
