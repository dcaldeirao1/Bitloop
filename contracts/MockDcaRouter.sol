// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IMintable {
    function mint(address to, uint256 amount) external;
}

interface IUniswapV2Router02 {
    function WETH() external view returns (address);
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}

/// @notice DCA router used by SmartAccount vaults.
/// - USDC → ETH: pays ETH from router inventory at a fixed rate
/// - ETH → ERC-20: buys on Uniswap V2 with msg.value (WETH → token)
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

contract MockDcaRouter is IDcaSwapRouter {
    address public owner;
    /// @dev tokenIn units per 1 ETH (1e18 wei)
    uint256 public rate;
    address public uniswapRouter;
    address public weth;

    error NotOwner();
    error ZeroAddress();
    error InvalidRate();
    error TransferFailed();
    error InsufficientLiquidity();
    error Slippage();
    error NoTokenMarket();
    error InvalidEthValue();

    event RateUpdated(uint256 rate);
    event UniswapUpdated(address router, address weth);
    event SwappedEth(address indexed tokenIn, address indexed to, uint256 amountIn, uint256 ethOut);
    event SwappedToken(
        address indexed tokenOut,
        address indexed to,
        uint256 ethIn,
        uint256 amountOut
    );
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 rate_, address uniswapRouter_) {
        owner = msg.sender;
        if (rate_ == 0) revert InvalidRate();
        rate = rate_;
        if (uniswapRouter_ != address(0)) {
            uniswapRouter = uniswapRouter_;
            weth = IUniswapV2Router02(uniswapRouter_).WETH();
        }
    }

    receive() external payable {}

    function setRate(uint256 rate_) external onlyOwner {
        if (rate_ == 0) revert InvalidRate();
        rate = rate_;
        emit RateUpdated(rate_);
    }

    function setUniswapRouter(address uniswapRouter_) external onlyOwner {
        uniswapRouter = uniswapRouter_;
        weth = uniswapRouter_ == address(0)
            ? address(0)
            : IUniswapV2Router02(uniswapRouter_).WETH();
        emit UniswapUpdated(uniswapRouter_, weth);
    }

    function withdrawEth(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount);
    }

    function quoteEth(uint256 amountIn) public view returns (uint256) {
        return (amountIn * 1e18) / rate;
    }

    /// @notice USDC (or any ERC-20) → native ETH from router inventory.
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address to
    ) external returns (uint256 amountOut) {
        if (tokenIn == address(0) || to == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert InvalidRate();

        if (!IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn)) {
            revert TransferFailed();
        }

        amountOut = quoteEth(amountIn);
        if (amountOut < amountOutMin) revert Slippage();
        if (address(this).balance < amountOut) revert InsufficientLiquidity();

        (bool ok, ) = to.call{value: amountOut}("");
        if (!ok) revert TransferFailed();

        emit SwappedEth(tokenIn, to, amountIn, amountOut);
    }

    /// @notice Native ETH → ERC-20 via Uniswap V2 (WETH → tokenOut).
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address tokenOut,
        address to
    ) external payable returns (uint256 amountOut) {
        if (tokenOut == address(0) || to == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert InvalidEthValue();

        // Local/test fallback: mintable mocks without Uniswap
        if (uniswapRouter == address(0) || weth == address(0)) {
            amountOut = msg.value;
            if (amountOut < amountOutMin) revert Slippage();
            try IMintable(tokenOut).mint(to, amountOut) {
                emit SwappedToken(tokenOut, to, msg.value, amountOut);
                return amountOut;
            } catch {
                revert NoTokenMarket();
            }
        }

        if (tokenOut == weth) revert NoTokenMarket();

        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = tokenOut;

        uint256[] memory quoted;
        try IUniswapV2Router02(uniswapRouter).getAmountsOut(msg.value, path) returns (
            uint256[] memory q
        ) {
            quoted = q;
        } catch {
            revert NoTokenMarket();
        }
        if (quoted.length != 2 || quoted[1] == 0) revert NoTokenMarket();

        uint256 balBefore = IERC20(tokenOut).balanceOf(to);
        IUniswapV2Router02(uniswapRouter).swapExactETHForTokens{value: msg.value}(
            amountOutMin,
            path,
            to,
            block.timestamp + 300
        );
        amountOut = IERC20(tokenOut).balanceOf(to) - balBefore;
        if (amountOut < amountOutMin) revert Slippage();

        emit SwappedToken(tokenOut, to, msg.value, amountOut);
    }
}
