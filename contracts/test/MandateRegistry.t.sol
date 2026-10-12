// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {IMandateRegistry} from "../src/interfaces/IMandateRegistry.sol";

contract MandateRegistryTest is Test {
    MandateRegistry registry;

    address referee = makeAddr("referee");
    address user = makeAddr("user");
    address stranger = makeAddr("stranger");
    address agentWallet = makeAddr("agentWallet");
    address perplKey = makeAddr("perplKey");

    event MandateSet(
        address indexed user,
        uint256 indexed agentId,
        bytes32 policyHash,
        uint64 maxNotionalUsd6,
        uint16 maxLeverageX10,
        uint16 maxWeeklyLossBps,
        address agentWallet,
        address perplKey
    );
    event SlackGranted(
        address indexed user,
        uint16 maxLeverageX10,
        uint64 maxNotionalUsd6,
        uint64 extraRiskUsd6,
        uint64 expiresAt
    );
    event SlackRevoked(address indexed user);
    event Paused(address indexed user, address indexed by, string reason);
    event Resumed(address indexed user);

    function setUp() public {
        registry = new MandateRegistry(referee);
        vm.warp(1_700_000_000);
    }

    function _mandate() internal view returns (IMandateRegistry.Mandate memory m) {
        m = IMandateRegistry.Mandate({
            policyHash: keccak256("policy"),
            maxNotionalUsd6: 100_000_000, // $100
            maxLeverageX10: 50, // 5.0x
            maxWeeklyLossBps: 1000,
            agentId: 1,
            agentWallet: agentWallet,
            perplKey: perplKey,
            paused: false,
            updatedAt: 0
        });
    }

    function _setMandate(address who) internal {
        vm.prank(who);
        registry.setMandate(_mandate());
    }

    function _slack(uint64 ttl) internal view returns (IMandateRegistry.Slack memory s) {
        s = IMandateRegistry.Slack({
            maxLeverageX10: 50,
            maxNotionalUsd6: 150_000_000,
            extraRiskUsd6: 8_000_000,
            expiresAt: uint64(block.timestamp) + ttl
        });
    }

    // ---- Construction ----

    function test_refereeImmutable() public view {
        assertEq(registry.referee(), referee);
    }

    // ---- setMandate ----

    function test_setMandate_byUser_emitsAndStores() public {
        vm.expectEmit(true, true, true, true);
        emit MandateSet(user, 1, keccak256("policy"), 100_000_000, 50, 1000, agentWallet, perplKey);
        _setMandate(user);

        IMandateRegistry.Mandate memory m = registry.getMandate(user);
        assertEq(m.agentWallet, agentWallet);
        assertEq(m.perplKey, perplKey);
        assertEq(m.maxLeverageX10, 50);
        assertFalse(m.paused);
        assertEq(m.updatedAt, uint64(block.timestamp));
        assertTrue(registry.isActive(user));
    }

    function test_setMandate_revertsZeroAgentWallet() public {
        IMandateRegistry.Mandate memory m = _mandate();
        m.agentWallet = address(0);
        vm.prank(user);
        vm.expectRevert(MandateRegistry.ZeroAgentWallet.selector);
        registry.setMandate(m);
    }

    function test_setMandate_revertsZeroPerplKey() public {
        IMandateRegistry.Mandate memory m = _mandate();
        m.perplKey = address(0);
        vm.prank(user);
        vm.expectRevert(MandateRegistry.ZeroPerplKey.selector);
        registry.setMandate(m);
    }

    function test_setMandate_revertsZeroLeverage() public {
        IMandateRegistry.Mandate memory m = _mandate();
        m.maxLeverageX10 = 0;
        vm.prank(user);
        vm.expectRevert(MandateRegistry.ZeroLeverage.selector);
        registry.setMandate(m);
    }

    function test_setMandate_unpausesAndClearsSlack() public {
        _setMandate(user);
        vm.prank(user);
        registry.grantSlack(_slack(1 hours));
        vm.prank(referee);
        registry.pause(user, "test");

        // Re-setting the mandate unpauses and clears slack.
        _setMandate(user);
        assertTrue(registry.isActive(user));
        (, bool active) = registry.activeSlack(user);
        assertFalse(active);
    }

    // "setMandate is msg.sender = user": a user can only ever set their own
    // mandate. There is no admin path, so a stranger setting one just creates
    // their own — never the victim's.
    function test_setMandate_onlyAffectsCaller() public {
        _setMandate(stranger);
        assertFalse(registry.isActive(user));
        assertTrue(registry.isActive(stranger));
    }

    // ---- grantSlack ----

    function test_grantSlack_byUser() public {
        _setMandate(user);
        uint64 exp = uint64(block.timestamp) + 1 hours;
        vm.expectEmit(true, false, false, true);
        emit SlackGranted(user, 50, 150_000_000, 8_000_000, exp);
        vm.prank(user);
        registry.grantSlack(_slack(1 hours));

        (IMandateRegistry.Slack memory s, bool active) = registry.activeSlack(user);
        assertTrue(active);
        assertEq(s.expiresAt, exp);
    }

    function test_grantSlack_revertsWithoutMandate() public {
        vm.prank(user);
        vm.expectRevert(MandateRegistry.NoMandate.selector);
        registry.grantSlack(_slack(1 hours));
    }

    function test_grantSlack_revertsWhenPaused() public {
        _setMandate(user);
        vm.prank(user);
        registry.pause(user, "u");
        vm.prank(user);
        vm.expectRevert(MandateRegistry.IsPaused.selector);
        registry.grantSlack(_slack(1 hours));
    }

    function test_grantSlack_revertsExpiryInPast() public {
        _setMandate(user);
        IMandateRegistry.Slack memory s = _slack(1 hours);
        s.expiresAt = uint64(block.timestamp); // not strictly in the future
        vm.prank(user);
        vm.expectRevert(MandateRegistry.SlackExpiryInPast.selector);
        registry.grantSlack(s);
    }

    function test_grantSlack_revertsExpiryTooFar() public {
        _setMandate(user);
        IMandateRegistry.Slack memory s = _slack(24 hours + 1);
        vm.prank(user);
        vm.expectRevert(MandateRegistry.SlackExpiryTooFar.selector);
        registry.grantSlack(s);
    }

    function test_grantSlack_exactly24hAllowed() public {
        _setMandate(user);
        IMandateRegistry.Slack memory s = _slack(24 hours);
        vm.prank(user);
        registry.grantSlack(s); // boundary: <= now + 24h is fine
        (, bool active) = registry.activeSlack(user);
        assertTrue(active);
    }

    function test_slackExpires() public {
        _setMandate(user);
        vm.prank(user);
        registry.grantSlack(_slack(1 hours));
        vm.warp(block.timestamp + 1 hours + 1);
        (, bool active) = registry.activeSlack(user);
        assertFalse(active);
    }

    function test_grantSlack_onlyUser() public {
        _setMandate(user);
        // Stranger with no mandate cannot grant slack for themselves either.
        vm.prank(stranger);
        vm.expectRevert(MandateRegistry.NoMandate.selector);
        registry.grantSlack(_slack(1 hours));
    }

    // ---- revokeSlack ----

    function test_revokeSlack_emitsAndClears() public {
        _setMandate(user);
        vm.prank(user);
        registry.grantSlack(_slack(1 hours));
        vm.expectEmit(true, false, false, false);
        emit SlackRevoked(user);
        vm.prank(user);
        registry.revokeSlack();
        (, bool active) = registry.activeSlack(user);
        assertFalse(active);
    }

    // ---- pause ----

    function test_pause_byUser() public {
        _setMandate(user);
        vm.expectEmit(true, true, false, true);
        emit Paused(user, user, "user");
        vm.prank(user);
        registry.pause(user, "user");
        assertFalse(registry.isActive(user));
    }

    function test_pause_byReferee() public {
        _setMandate(user);
        vm.expectEmit(true, true, false, true);
        emit Paused(user, referee, "referee:weekly_loss");
        vm.prank(referee);
        registry.pause(user, "referee:weekly_loss");
        assertFalse(registry.isActive(user));
    }

    function test_pause_byStrangerReverts() public {
        _setMandate(user);
        vm.prank(stranger);
        vm.expectRevert(MandateRegistry.NotUserOrReferee.selector);
        registry.pause(user, "nope");
    }

    function test_pause_clearsSlack() public {
        _setMandate(user);
        vm.prank(user);
        registry.grantSlack(_slack(1 hours));
        vm.prank(referee);
        registry.pause(user, "referee:test");
        (, bool active) = registry.activeSlack(user);
        assertFalse(active);
    }

    function test_pause_revertsWithoutMandate() public {
        vm.prank(user);
        vm.expectRevert(MandateRegistry.NoMandate.selector);
        registry.pause(user, "x");
    }

    // ---- resume ----

    function test_resume_onlyUser() public {
        _setMandate(user);
        vm.prank(referee);
        registry.pause(user, "referee:test");

        // Referee cannot resume.
        vm.prank(referee);
        vm.expectRevert(MandateRegistry.NoMandate.selector);
        registry.resume();

        // Stranger cannot resume the user.
        vm.prank(stranger);
        vm.expectRevert(MandateRegistry.NoMandate.selector);
        registry.resume();

        // The user can.
        vm.expectEmit(true, false, false, false);
        emit Resumed(user);
        vm.prank(user);
        registry.resume();
        assertTrue(registry.isActive(user));
    }

    // ---- isActive ----

    function test_isActive_falseWithoutMandate() public view {
        assertFalse(registry.isActive(user));
    }
}
