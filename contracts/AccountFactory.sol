// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SmartAccount} from "./SmartAccount.sol";

/// @notice Deploys one user-owned SmartAccount per wallet (CREATE2).
contract AccountFactory {
    mapping(bytes32 => address) public accountOf;
    address[] public allAccounts;

    event AccountCreated(bytes32 indexed userId, address indexed account, address indexed owner);

    error AccountExists();
    error ZeroAddress();
    error NotOwnerCaller();

    function userIdOf(address owner) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner));
    }

    /// @notice Deploy a vault for msg.sender (non-custodial — caller becomes owner).
    function createAccount() external returns (address account) {
        return _create(msg.sender);
    }

    /// @notice Idempotent helper: returns existing vault or creates one.
    function getOrCreateAccount() external returns (address account) {
        bytes32 userId = userIdOf(msg.sender);
        account = accountOf[userId];
        if (account != address(0)) return account;
        return _create(msg.sender);
    }

    function _create(address owner) internal returns (address account) {
        if (owner == address(0)) revert ZeroAddress();
        bytes32 userId = userIdOf(owner);
        if (accountOf[userId] != address(0)) revert AccountExists();

        account = address(new SmartAccount{salt: userId}(owner));
        accountOf[userId] = account;
        allAccounts.push(account);
        emit AccountCreated(userId, account, owner);
    }

    function accountCount() external view returns (uint256) {
        return allAccounts.length;
    }
}
