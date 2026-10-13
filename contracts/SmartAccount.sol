// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IDcaSwapRouter {
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address to
    ) external returns (uint256 amountOut);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address tokenOut,
        address to
    ) external payable returns (uint256 amountOut);
}

/// @notice Non-custodial vault: owner configures rules; keepers run permissionless executors.
/// @dev Supports multiple concurrent DCA and recurring slots (one split config).
contract SmartAccount {
    struct RecurringRule {
        address token;
        address to;
        uint256 amount;
        uint256 interval;
        uint256 lastExecuted;
        bool enabled;
    }

    struct DcaRule {
        address tokenIn;
        address tokenOut;
        address router;
        uint256 amount;
        uint256 interval;
        uint256 lastExecuted;
        uint256 minOut;
        bool enabled;
    }

    address public owner;
    address public savings;
    address public splitToken; // e.g. Sepolia USDC
    uint16 public splitBps; // 2000 = 20.00%
    bool public splitEnabled;

    RecurringRule[] private _recurring;
    DcaRule[] private _dca;

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
    error DcaDisabled();
    error DcaNotDue();
    error InvalidRule();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SplitConfigured(address indexed token, address indexed savings, uint16 bps, bool enabled);
    event TokenSplit(address indexed token, uint256 incoming, uint256 sentToSavings, address indexed caller);
    event RecurringConfigured(
        uint256 indexed ruleId,
        address indexed token,
        address indexed to,
        uint256 amount,
        uint256 interval,
        bool enabled
    );
    event RecurringExecuted(
        uint256 indexed ruleId,
        address indexed token,
        address indexed to,
        uint256 amount,
        address caller
    );
    event DcaConfigured(
        uint256 indexed ruleId,
        address indexed tokenIn,
        address indexed tokenOut,
        address router,
        uint256 amount,
        uint256 interval,
        uint256 minOut,
        bool enabled
    );
    event DcaExecuted(
        uint256 indexed ruleId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address caller
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

    function recurringCount() external view returns (uint256) {
        return _recurring.length;
    }

    function recurringAt(uint256 ruleId)
        external
        view
        returns (
            address token,
            address to,
            uint256 amount,
            uint256 interval,
            uint256 lastExecuted,
            bool enabled
        )
    {
        if (ruleId >= _recurring.length) revert InvalidRule();
        RecurringRule storage r = _recurring[ruleId];
        return (r.token, r.to, r.amount, r.interval, r.lastExecuted, r.enabled);
    }

    /// @notice Add a recurring transfer slot. Returns the new rule id.
    function addRecurring(
        address token_,
        address to_,
        uint256 amount_,
        uint256 interval_
    ) external onlyOwner returns (uint256 ruleId) {
        return _addRecurring(token_, to_, amount_, interval_);
    }

    /// @notice Replace/update an existing recurring slot (or disable it).
    function setRecurringAt(
        uint256 ruleId,
        address token_,
        address to_,
        uint256 amount_,
        uint256 interval_,
        bool enabled_
    ) external onlyOwner {
        if (ruleId >= _recurring.length) revert InvalidRule();
        if (enabled_) {
            if (token_ == address(0) || to_ == address(0)) revert ZeroAddress();
            if (amount_ == 0) revert InvalidAmount();
            if (interval_ < 60) revert InvalidInterval();
        }
        RecurringRule storage r = _recurring[ruleId];
        r.token = token_;
        r.to = to_;
        r.amount = amount_;
        r.interval = interval_;
        r.enabled = enabled_;
        emit RecurringConfigured(ruleId, token_, to_, amount_, interval_, enabled_);
    }

    function setRecurringEnabled(uint256 ruleId, bool enabled_) external onlyOwner {
        if (ruleId >= _recurring.length) revert InvalidRule();
        RecurringRule storage r = _recurring[ruleId];
        r.enabled = enabled_;
        emit RecurringConfigured(ruleId, r.token, r.to, r.amount, r.interval, enabled_);
    }

    /// @notice Legacy single-slot helper: adds a new recurring rule when enabling.
    function setRecurring(
        address token_,
        address to_,
        uint256 amount_,
        uint256 interval_,
        bool enabled_
    ) external onlyOwner {
        if (!enabled_) {
            for (uint256 i = 0; i < _recurring.length; i++) {
                if (_recurring[i].enabled) {
                    _recurring[i].enabled = false;
                    emit RecurringConfigured(
                        i,
                        _recurring[i].token,
                        _recurring[i].to,
                        _recurring[i].amount,
                        _recurring[i].interval,
                        false
                    );
                }
            }
            return;
        }
        _addRecurring(token_, to_, amount_, interval_);
    }

    /// @notice Permissionless: execute a specific recurring slot when due.
    function executeRecurringAt(uint256 ruleId) external returns (uint256 sent) {
        return _executeRecurringAt(ruleId);
    }

    /// @notice Legacy: execute the first due enabled recurring rule.
    function executeRecurring() external returns (uint256 sent) {
        for (uint256 i = 0; i < _recurring.length; i++) {
            RecurringRule storage r = _recurring[i];
            if (!r.enabled || r.amount == 0) continue;
            if (r.lastExecuted != 0 && block.timestamp < r.lastExecuted + r.interval) continue;
            return _executeRecurringAt(i);
        }
        revert RecurringNotDue();
    }

    function dcaCount() external view returns (uint256) {
        return _dca.length;
    }

    function dcaAt(uint256 ruleId)
        external
        view
        returns (
            address tokenIn,
            address tokenOut,
            address router,
            uint256 amount,
            uint256 interval,
            uint256 lastExecuted,
            uint256 minOut,
            bool enabled
        )
    {
        if (ruleId >= _dca.length) revert InvalidRule();
        DcaRule storage r = _dca[ruleId];
        return (
            r.tokenIn,
            r.tokenOut,
            r.router,
            r.amount,
            r.interval,
            r.lastExecuted,
            r.minOut,
            r.enabled
        );
    }

    /// @notice Add a DCA slot. Returns the new rule id.
    function addDca(
        address tokenIn_,
        address tokenOut_,
        address router_,
        uint256 amount_,
        uint256 interval_,
        uint256 minOut_
    ) external onlyOwner returns (uint256 ruleId) {
        return _addDca(tokenIn_, tokenOut_, router_, amount_, interval_, minOut_);
    }

    function setDcaAt(
        uint256 ruleId,
        address tokenIn_,
        address tokenOut_,
        address router_,
        uint256 amount_,
        uint256 interval_,
        uint256 minOut_,
        bool enabled_
    ) external onlyOwner {
        if (ruleId >= _dca.length) revert InvalidRule();
        if (enabled_) {
            _validateDca(tokenIn_, tokenOut_, router_, amount_, interval_);
        }
        DcaRule storage r = _dca[ruleId];
        r.tokenIn = tokenIn_;
        r.tokenOut = tokenOut_;
        r.router = router_;
        r.amount = amount_;
        r.interval = interval_;
        r.minOut = minOut_;
        r.enabled = enabled_;
        emit DcaConfigured(ruleId, tokenIn_, tokenOut_, router_, amount_, interval_, minOut_, enabled_);
    }

    function setDcaEnabled(uint256 ruleId, bool enabled_) external onlyOwner {
        if (ruleId >= _dca.length) revert InvalidRule();
        DcaRule storage r = _dca[ruleId];
        r.enabled = enabled_;
        emit DcaConfigured(
            ruleId,
            r.tokenIn,
            r.tokenOut,
            r.router,
            r.amount,
            r.interval,
            r.minOut,
            enabled_
        );
    }

    /// @notice Legacy single-slot helper: adds a new DCA rule when enabling.
    function setDca(
        address tokenIn_,
        address tokenOut_,
        address router_,
        uint256 amount_,
        uint256 interval_,
        uint256 minOut_,
        bool enabled_
    ) external onlyOwner {
        if (!enabled_) {
            for (uint256 i = 0; i < _dca.length; i++) {
                if (_dca[i].enabled) {
                    _dca[i].enabled = false;
                    emit DcaConfigured(
                        i,
                        _dca[i].tokenIn,
                        _dca[i].tokenOut,
                        _dca[i].router,
                        _dca[i].amount,
                        _dca[i].interval,
                        _dca[i].minOut,
                        false
                    );
                }
            }
            return;
        }
        _addDca(tokenIn_, tokenOut_, router_, amount_, interval_, minOut_);
    }

    /// @notice Permissionless: execute a specific DCA slot when due.
    function executeDcaAt(uint256 ruleId) external returns (uint256 amountOut) {
        return _executeDcaAt(ruleId);
    }

    /// @notice Legacy: execute the first due enabled DCA rule.
    function executeDca() external returns (uint256 amountOut) {
        for (uint256 i = 0; i < _dca.length; i++) {
            DcaRule storage r = _dca[i];
            if (!r.enabled || r.amount == 0) continue;
            if (r.lastExecuted != 0 && block.timestamp < r.lastExecuted + r.interval) continue;
            return _executeDcaAt(i);
        }
        revert DcaNotDue();
    }

    // ---- Legacy view helpers (first enabled rule, else first slot) ----

    function recurringEnabled() external view returns (bool) {
        for (uint256 i = 0; i < _recurring.length; i++) {
            if (_recurring[i].enabled) return true;
        }
        return false;
    }

    function recurringToken() external view returns (address) {
        uint256 i = _firstRecurringIndex();
        return i == type(uint256).max ? address(0) : _recurring[i].token;
    }

    function recurringTo() external view returns (address) {
        uint256 i = _firstRecurringIndex();
        return i == type(uint256).max ? address(0) : _recurring[i].to;
    }

    function recurringAmount() external view returns (uint256) {
        uint256 i = _firstRecurringIndex();
        return i == type(uint256).max ? 0 : _recurring[i].amount;
    }

    function recurringInterval() external view returns (uint256) {
        uint256 i = _firstRecurringIndex();
        return i == type(uint256).max ? 0 : _recurring[i].interval;
    }

    function recurringLastExecuted() external view returns (uint256) {
        uint256 i = _firstRecurringIndex();
        return i == type(uint256).max ? 0 : _recurring[i].lastExecuted;
    }

    function dcaEnabled() external view returns (bool) {
        for (uint256 i = 0; i < _dca.length; i++) {
            if (_dca[i].enabled) return true;
        }
        return false;
    }

    function dcaToken() external view returns (address) {
        uint256 i = _firstDcaIndex();
        return i == type(uint256).max ? address(0) : _dca[i].tokenIn;
    }

    function dcaTokenOut() external view returns (address) {
        uint256 i = _firstDcaIndex();
        return i == type(uint256).max ? address(0) : _dca[i].tokenOut;
    }

    function dcaRouter() external view returns (address) {
        uint256 i = _firstDcaIndex();
        return i == type(uint256).max ? address(0) : _dca[i].router;
    }

    function dcaAmount() external view returns (uint256) {
        uint256 i = _firstDcaIndex();
        return i == type(uint256).max ? 0 : _dca[i].amount;
    }

    function dcaInterval() external view returns (uint256) {
        uint256 i = _firstDcaIndex();
        return i == type(uint256).max ? 0 : _dca[i].interval;
    }

    function dcaLastExecuted() external view returns (uint256) {
        uint256 i = _firstDcaIndex();
        return i == type(uint256).max ? 0 : _dca[i].lastExecuted;
    }

    function dcaMinOut() external view returns (uint256) {
        uint256 i = _firstDcaIndex();
        return i == type(uint256).max ? 0 : _dca[i].minOut;
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

    function _validateDca(
        address tokenIn_,
        address tokenOut_,
        address router_,
        uint256 amount_,
        uint256 interval_
    ) internal pure {
        if (router_ == address(0)) revert ZeroAddress();
        if (amount_ == 0) revert InvalidAmount();
        if (interval_ < 60) revert InvalidInterval();
        if (tokenOut_ == address(0)) {
            if (tokenIn_ == address(0)) revert ZeroAddress();
        } else {
            if (tokenIn_ != address(0)) revert InvalidAmount();
        }
    }

    function _addRecurring(
        address token_,
        address to_,
        uint256 amount_,
        uint256 interval_
    ) internal returns (uint256 ruleId) {
        if (token_ == address(0) || to_ == address(0)) revert ZeroAddress();
        if (amount_ == 0) revert InvalidAmount();
        if (interval_ < 60) revert InvalidInterval();

        ruleId = _recurring.length;
        _recurring.push(
            RecurringRule({
                token: token_,
                to: to_,
                amount: amount_,
                interval: interval_,
                lastExecuted: 0,
                enabled: true
            })
        );
        emit RecurringConfigured(ruleId, token_, to_, amount_, interval_, true);
    }

    function _executeRecurringAt(uint256 ruleId) internal returns (uint256 sent) {
        if (ruleId >= _recurring.length) revert InvalidRule();
        RecurringRule storage r = _recurring[ruleId];
        if (!r.enabled) revert RecurringDisabled();
        if (r.token == address(0) || r.to == address(0)) revert ZeroAddress();
        if (r.amount == 0) revert InvalidAmount();

        if (r.lastExecuted != 0 && block.timestamp < r.lastExecuted + r.interval) {
            revert RecurringNotDue();
        }

        uint256 bal = IERC20(r.token).balanceOf(address(this));
        if (bal < r.amount) revert InsufficientBalance();

        sent = r.amount;
        if (!IERC20(r.token).transfer(r.to, sent)) revert TransferFailed();

        r.lastExecuted = block.timestamp;
        accounted[r.token] = IERC20(r.token).balanceOf(address(this));
        emit RecurringExecuted(ruleId, r.token, r.to, sent, msg.sender);
    }

    function _addDca(
        address tokenIn_,
        address tokenOut_,
        address router_,
        uint256 amount_,
        uint256 interval_,
        uint256 minOut_
    ) internal returns (uint256 ruleId) {
        _validateDca(tokenIn_, tokenOut_, router_, amount_, interval_);
        ruleId = _dca.length;
        _dca.push(
            DcaRule({
                tokenIn: tokenIn_,
                tokenOut: tokenOut_,
                router: router_,
                amount: amount_,
                interval: interval_,
                lastExecuted: 0,
                minOut: minOut_,
                enabled: true
            })
        );
        emit DcaConfigured(ruleId, tokenIn_, tokenOut_, router_, amount_, interval_, minOut_, true);
    }

    function _executeDcaAt(uint256 ruleId) internal returns (uint256 amountOut) {
        if (ruleId >= _dca.length) revert InvalidRule();
        DcaRule storage r = _dca[ruleId];
        if (!r.enabled) revert DcaDisabled();
        if (r.router == address(0)) revert ZeroAddress();
        if (r.amount == 0) revert InvalidAmount();

        if (r.lastExecuted != 0 && block.timestamp < r.lastExecuted + r.interval) {
            revert DcaNotDue();
        }

        if (r.tokenOut == address(0)) {
            if (r.tokenIn == address(0)) revert ZeroAddress();
            uint256 bal = IERC20(r.tokenIn).balanceOf(address(this));
            if (bal < r.amount) revert InsufficientBalance();
            if (!IERC20(r.tokenIn).approve(r.router, r.amount)) revert TransferFailed();
            amountOut = IDcaSwapRouter(r.router).swapExactTokensForETH(
                r.amount,
                r.minOut,
                r.tokenIn,
                address(this)
            );
            accounted[r.tokenIn] = IERC20(r.tokenIn).balanceOf(address(this));
        } else {
            if (address(this).balance < r.amount) revert InsufficientBalance();
            amountOut = IDcaSwapRouter(r.router).swapExactETHForTokens{value: r.amount}(
                r.minOut,
                r.tokenOut,
                address(this)
            );
        }

        r.lastExecuted = block.timestamp;
        emit DcaExecuted(ruleId, r.tokenIn, r.tokenOut, r.amount, amountOut, msg.sender);
    }

    function _firstRecurringIndex() internal view returns (uint256) {
        for (uint256 i = 0; i < _recurring.length; i++) {
            if (_recurring[i].enabled) return i;
        }
        if (_recurring.length > 0) return 0;
        return type(uint256).max;
    }

    function _firstDcaIndex() internal view returns (uint256) {
        for (uint256 i = 0; i < _dca.length; i++) {
            if (_dca[i].enabled) return i;
        }
        if (_dca.length > 0) return 0;
        return type(uint256).max;
    }
}
