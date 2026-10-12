// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IMandateRegistry} from "./interfaces/IMandateRegistry.sol";

/// @title MandateRegistry
/// @notice The Rules knot of LEASH. A user records what their AI trader may do
///         (markets, leverage, size, weekly loss), grants narrow expiring
///         "slack" exceptions, and can pause at any time. The Referee may also
///         pause, and nobody else can.
/// @dev    No owner, no upgradeability, no backdoor. The only privileged party
///         is the immutable `referee`, and it can only *pause* — it can never
///         resume, set a mandate, or grant slack. Judges will read this.
contract MandateRegistry is IMandateRegistry {
    /// @notice Maximum lifetime of a slack grant.
    uint64 public constant MAX_SLACK_DURATION = 24 hours;

    /// @inheritdoc IMandateRegistry
    address public immutable referee;

    mapping(address => Mandate) private _mandates;
    mapping(address => Slack) private _slack;

    error ZeroAgentWallet();
    error ZeroPerplKey();
    error ZeroLeverage();
    error NoMandate();
    error IsPaused();
    error SlackExpiryInPast();
    error SlackExpiryTooFar();
    error NotUserOrReferee();
    error NotUser();

    /// @param referee_ The address allowed to pause users (Chainlink CRE key).
    constructor(address referee_) {
        referee = referee_;
    }

    /// @inheritdoc IMandateRegistry
    function setMandate(Mandate calldata m) external {
        if (m.agentWallet == address(0)) revert ZeroAgentWallet();
        if (m.perplKey == address(0)) revert ZeroPerplKey();
        if (m.maxLeverageX10 == 0) revert ZeroLeverage();

        Mandate storage stored = _mandates[msg.sender];
        stored.policyHash = m.policyHash;
        stored.maxNotionalUsd6 = m.maxNotionalUsd6;
        stored.maxLeverageX10 = m.maxLeverageX10;
        stored.maxWeeklyLossBps = m.maxWeeklyLossBps;
        stored.agentId = m.agentId;
        stored.agentWallet = m.agentWallet;
        stored.perplKey = m.perplKey;
        stored.paused = false;
        stored.updatedAt = uint64(block.timestamp);

        // A new mandate wipes any outstanding exception.
        _clearSlack(msg.sender);

        emit MandateSet(
            msg.sender,
            m.agentId,
            m.policyHash,
            m.maxNotionalUsd6,
            m.maxLeverageX10,
            m.maxWeeklyLossBps,
            m.agentWallet,
            m.perplKey
        );
    }

    /// @inheritdoc IMandateRegistry
    function grantSlack(Slack calldata s) external {
        Mandate storage mandate = _mandates[msg.sender];
        if (mandate.agentWallet == address(0)) revert NoMandate();
        if (mandate.paused) revert IsPaused();
        if (s.expiresAt <= block.timestamp) revert SlackExpiryInPast();
        if (s.expiresAt > block.timestamp + MAX_SLACK_DURATION) revert SlackExpiryTooFar();

        _slack[msg.sender] = s;

        emit SlackGranted(
            msg.sender, s.maxLeverageX10, s.maxNotionalUsd6, s.extraRiskUsd6, s.expiresAt
        );
    }

    /// @inheritdoc IMandateRegistry
    function revokeSlack() external {
        if (_mandates[msg.sender].agentWallet == address(0)) revert NoMandate();
        _clearSlack(msg.sender);
    }

    /// @inheritdoc IMandateRegistry
    function pause(address user, string calldata reason) external {
        if (msg.sender != user && msg.sender != referee) revert NotUserOrReferee();
        if (_mandates[user].agentWallet == address(0)) revert NoMandate();

        _mandates[user].paused = true;
        _clearSlack(user);

        emit Paused(user, msg.sender, reason);
    }

    /// @inheritdoc IMandateRegistry
    function resume() external {
        Mandate storage mandate = _mandates[msg.sender];
        if (mandate.agentWallet == address(0)) revert NoMandate();
        mandate.paused = false;
        emit Resumed(msg.sender);
    }

    /// @inheritdoc IMandateRegistry
    function getMandate(address user) external view returns (Mandate memory) {
        return _mandates[user];
    }

    /// @inheritdoc IMandateRegistry
    function activeSlack(address user) external view returns (Slack memory s, bool active) {
        s = _slack[user];
        active = s.expiresAt > block.timestamp;
    }

    /// @inheritdoc IMandateRegistry
    function isActive(address user) external view returns (bool) {
        Mandate storage mandate = _mandates[user];
        return mandate.agentWallet != address(0) && !mandate.paused;
    }

    function _clearSlack(address user) private {
        if (_slack[user].expiresAt != 0 || _slack[user].maxLeverageX10 != 0) {
            delete _slack[user];
            emit SlackRevoked(user);
        }
    }
}
