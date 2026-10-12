// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IReceiptLog} from "./interfaces/IReceiptLog.sol";
import {IMandateRegistry} from "./interfaces/IMandateRegistry.sol";

/// @title ReceiptLog
/// @notice Commit–reveal receipts for every trading decision. The agent logs a
///         receipt carrying hashes of its reasoning and the signals it saw;
///         the full JSON is served off-chain and the phone recomputes the hash
///         to prove the receipt matches. A sequence number per user makes the
///         feed tamper-evident.
/// @dev    No owner, no upgradeability. Authorisation for live receipts is read
///         straight from the MandateRegistry: only the user's registered
///         agentWallet can log on their behalf, and an EXECUTED receipt is only
///         accepted while the mandate is active.
contract ReceiptLog is IReceiptLog {
    IMandateRegistry public immutable registry;

    /// @notice Monotonic receipt counter per user.
    mapping(address => uint64) public seq;

    error NotAgentWallet();
    error ShadowNotAllowed();
    error MandateNotActive();

    constructor(IMandateRegistry registry_) {
        registry = registry_;
    }

    /// @inheritdoc IReceiptLog
    function logReceipt(ReceiptInput calldata r) external {
        IMandateRegistry.Mandate memory mandate = registry.getMandate(r.user);
        if (msg.sender != mandate.agentWallet) revert NotAgentWallet();
        if (r.status == Status.SHADOW) revert ShadowNotAllowed();
        if (r.status == Status.EXECUTED && !registry.isActive(r.user)) {
            revert MandateNotActive();
        }

        uint64 s = ++seq[r.user];
        _emit(mandate.agentId, s, r);
    }

    /// @inheritdoc IReceiptLog
    function logShadow(uint256 agentId, ReceiptInput calldata r) external {
        ReceiptInput memory shadow = r;
        shadow.user = msg.sender;
        shadow.status = Status.SHADOW;

        uint64 s = ++seq[msg.sender];
        _emit(agentId, s, shadow);
    }

    function _emit(uint256 agentId, uint64 s, ReceiptInput memory r) private {
        emit TradeReceipt(
            r.user,
            agentId,
            s,
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
    }
}
