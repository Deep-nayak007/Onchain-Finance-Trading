// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IMandateRegistry
/// @notice Frozen interface — ARCHITECTURE.md §7.1. The Rules knot of LEASH:
///         the onchain record of what a user has authorised their AI trader to
///         do, plus narrow, expiring "slack" exceptions and a pause switch the
///         user or the Referee can throw.
/// @dev    Do not change this interface without agreement in team chat and an
///         update to ARCHITECTURE.md. Consumers (Brain, Face, Envio) build
///         against it.
interface IMandateRegistry {
    struct Mandate {
        bytes32 policyHash;
        uint64 maxNotionalUsd6;
        uint16 maxLeverageX10;
        uint16 maxWeeklyLossBps;
        uint256 agentId;
        address agentWallet;
        address perplKey;
        bool paused;
        uint64 updatedAt;
    }

    struct Slack {
        uint16 maxLeverageX10;
        uint64 maxNotionalUsd6;
        uint64 extraRiskUsd6;
        uint64 expiresAt;
    }

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

    /// @notice Set/replace the caller's mandate. msg.sender = user. Unpauses and clears slack.
    function setMandate(Mandate calldata m) external;

    /// @notice Grant a narrow, expiring exception. User only; expiresAt <= now + 24h.
    function grantSlack(Slack calldata s) external;

    /// @notice Revoke any active slack. User only.
    function revokeSlack() external;

    /// @notice Pause a user's trader. Callable by the user or the Referee. Clears slack.
    function pause(address user, string calldata reason) external;

    /// @notice Resume after a pause. User only.
    function resume() external;

    function getMandate(address user) external view returns (Mandate memory);

    /// @notice Returns the slack and whether it is currently active (unexpired).
    function activeSlack(address user) external view returns (Slack memory s, bool active);

    /// @notice A mandate exists and is not paused.
    function isActive(address user) external view returns (bool);

    /// @notice The immutable Referee address allowed to pause.
    function referee() external view returns (address);
}
