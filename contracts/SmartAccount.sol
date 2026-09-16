// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Non-custodial vault: owner configures rules; keepers run permissionless executors.
contract SmartAccount {
    address public owner;
    address public savings;
    address public splitToken; // e.g. Sepolia USDC
    uint16 public splitBps; // 2000 = 20.00%
    bool public splitEnabled;

    /// @dev Recurring fixed-amount transfer (permissionless executeRecurring when due).
    address public recurringToken;
    address public recurringTo;
    uint256 public recurringAmount;
    uint256 public recurringInterval; // seconds
    uint256 public recurringLastExecuted;
    bool public recurringEnabled;

    /// @dev Tracked balance so repeated processToken calls only split newly received tokens.
    mapping(address => uint256) public accounted;

    error NotOwner();
    error InvalidBps();
    error TransferFailed();
    error ZeroAddress();
    error SplitDisabled();
    error WrongToken();
    error RecurringDisabled();
    error RecurringNotDue();
    error InsufficientBalance();
    error InvalidInterval();
    error InvalidAmount();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SplitConfigured(address indexed token, address indexed savings, uint16 bps, bool enabled);
    event TokenSplit(address indexed token, uint256 incoming, uint256 sentToSavings, address indexed caller);
    event RecurringConfigured(
        address indexed token,
        address indexed to,
        uint256 amount,
        uint256 interval,
        bool enabled
    );
    event RecurringExecuted(
        address indexed token,
        address indexed to,
        uint256 amount,
        address indexed caller
    );
    event Executed(address indexed to, uint256 value, bytes data);
    event EthReceived(address indexed from, uint256 amount, uint256 sentToSavings);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    /// @notice Native ETH still auto-splits on receive when enabled (no token configured needed).
    receive() external payable {
        uint256 forwarded;
        if (splitEnabled && savings != address(0) && splitBps > 0 && splitToken == address(0) && msg.value > 0) {
            forwarded = (msg.value * uint256(splitBps)) / 10_000;
            if (forwarded > 0) {
                (bool ok, ) = savings.call{value: forwarded}("");
                if (!ok) revert TransferFailed();
            }
        }
        emit EthReceived(msg.sender, msg.value, forwarded);
    }

    function setSplit(address token_, address savings_, uint16 bps_, bool enabled_) external onlyOwner {
        if (bps_ > 10_000) revert InvalidBps();
        if (enabled_ && savings_ == address(0)) revert ZeroAddress();
        splitToken = token_;
        savings = savings_;
        splitBps = bps_;
        splitEnabled = enabled_;
        if (token_ != address(0)) {
            accounted[token_] = IERC20(token_).balanceOf(address(this));
        }
        emit SplitConfigured(token_, savings_, bps_, enabled_);
    }

    /// @notice Permissionless: anyone (keeper) can call after USDC is sent to this vault.
    function processToken(address token_) external returns (uint256 sentToSavings) {
        if (!splitEnabled) revert SplitDisabled();
        if (splitToken == address(0) || token_ != splitToken) revert WrongToken();
        if (savings == address(0)) revert ZeroAddress();

        uint256 bal = IERC20(token_).balanceOf(address(this));
        uint256 incoming = bal - accounted[token_];
        if (incoming == 0) {
            return 0;
        }

        sentToSavings = (incoming * uint256(splitBps)) / 10_000;
        if (sentToSavings > 0) {
            if (!IERC20(token_).transfer(savings, sentToSavings)) revert TransferFailed();
        }

        accounted[token_] = IERC20(token_).balanceOf(address(this));
        emit TokenSplit(token_, incoming, sentToSavings, msg.sender);
    }

    /// @notice Configure fixed USDC (or token) payout every `interval_` seconds.
    function setRecurring(
        address token_,
        address to_,
        uint256 amount_,
        uint256 interval_,
        bool enabled_
    ) external onlyOwner {
        if (enabled_) {
            if (token_ == address(0) || to_ == address(0)) revert ZeroAddress();
            if (amount_ == 0) revert InvalidAmount();
            if (interval_ < 60) revert InvalidInterval(); // min 1 minute
        }
        recurringToken = token_;
        recurringTo = to_;
        recurringAmount = amount_;
        recurringInterval = interval_;
        recurringEnabled = enabled_;
        emit RecurringConfigured(token_, to_, amount_, interval_, enabled_);
    }

    /// @notice Permissionless: keeper sends `recurringAmount` when the interval has elapsed.
    function executeRecurring() external returns (uint256 sent) {
        if (!recurringEnabled) revert RecurringDisabled();
        if (recurringToken == address(0) || recurringTo == address(0)) revert ZeroAddress();
        if (recurringAmount == 0) revert InvalidAmount();

        if (
            recurringLastExecuted != 0 &&
            block.timestamp < recurringLastExecuted + recurringInterval
        ) {
            revert RecurringNotDue();
        }

        uint256 bal = IERC20(recurringToken).balanceOf(address(this));
        if (bal < recurringAmount) revert InsufficientBalance();

        sent = recurringAmount;
        if (!IERC20(recurringToken).transfer(recurringTo, sent)) revert TransferFailed();

        recurringLastExecuted = block.timestamp;
        accounted[recurringToken] = IERC20(recurringToken).balanceOf(address(this));
        emit RecurringExecuted(recurringToken, recurringTo, sent, msg.sender);
    }

    function execute(address to, uint256 value, bytes calldata data)
        external
        onlyOwner
        returns (bytes memory)
    {
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) revert TransferFailed();
        emit Executed(to, value, data);
        return ret;
    }

    function approveToken(address token, address spender, uint256 amount) external onlyOwner {
        if (token == address(0) || spender == address(0)) revert ZeroAddress();
        if (!IERC20(token).approve(spender, amount)) revert TransferFailed();
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
        accounted[token] = IERC20(token).balanceOf(address(this));
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
