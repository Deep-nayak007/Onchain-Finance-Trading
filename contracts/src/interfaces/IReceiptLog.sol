// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IReceiptLog
/// @notice Frozen interface — ARCHITECTURE.md §7.1. Every trading decision —
///         executed, rejected, failed or shadow — becomes an onchain receipt
///         carrying commit hashes of its reasoning (`reasonHash`) and the
///         signals it saw (`signalHash`). The phone recomputes the hashes and
///         shows a ✓ only on a match, so a decision cannot be edited after the
///         fact.
/// @dev    Do not change this interface without agreement in team chat and an
///         update to ARCHITECTURE.md.
interface IReceiptLog {
    enum Venue {
        PERPL,
        KURU
    }

    enum Status {
        EXECUTED,
        REJECTED,
        FAILED,
        SHADOW
    }

    struct ReceiptInput {
        address user;
        Venue venue;
        bytes32 market;
        int8 side;
        uint128 sizeUsd6;
        uint256 price1e18;
        Status status;
        bool usedSlack;
        bytes32 reasonHash;
        bytes32 signalHash;
        bytes32 execTxHash;
    }

    event TradeReceipt(
        address indexed user,
        uint256 indexed agentId,
        uint64 indexed seq,
        Venue venue,
        bytes32 market,
        int8 side,
        uint128 sizeUsd6,
        uint256 price1e18,
        Status status,
        bool usedSlack,
        bytes32 reasonHash,
        bytes32 signalHash,
        bytes32 execTxHash
    );

    /// @notice Log a live/decision receipt. Only the user's registered
    ///         agentWallet may call it. EXECUTED requires isActive(user).
    ///         SHADOW is not allowed here — use logShadow.
    function logReceipt(ReceiptInput calldata r) external;

    /// @notice Log a shadow (paper) decision. Anyone may call; forces
    ///         user = msg.sender and status = SHADOW. Envio counts it only when
    ///         msg.sender is a known persona wallet.
    function logShadow(uint256 agentId, ReceiptInput calldata r) external;
}
