// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
contract RebelDogePresale {
    IERC20 public token; // RebelDoge token (18 decimals)
    IERC20 public usdt; // USDT token (6 decimals)
    AggregatorV3Interface internal priceFeed; // Chainlink price feed for ETH/USD
    address public owner;

    uint256 public constant TOKEN_PRICE = 100; // 0.0001 USDT in 6 decimals (100 represents 0.0001 USDT)
    uint256 public constant TOTAL_TOKENS_FOR_SALE = 120_000_000 * 10 ** 18; // 120 million tokens with 18 decimals
    uint256 public constant BONUS_LIMIT = 60_000_000 * 10 ** 18; // First 60 million tokens get 50% bonus
    uint256 public constant WALLET_LIMIT = 20_000_000 * 10 ** 18; // 20 million tokens per wallet
    uint256 public constant VESTING_PERIOD = 1 minutes; // Monthly vesting period
    uint256 public constant VESTING_DURATION = 10; // 12 months

    mapping(address => uint256) public purchasedTokens;
    mapping(address => uint256) public claimedTokens;
    mapping(address => uint256) public lastClaimed;

    uint256 public totalTokensSold;
    bool public presaleStarted;
    bool public presaleEnded;

    event TokensPurchased(address indexed buyer, uint256 amount, bool bonus);
    event PresaleStarted();
    event PresaleEnded();

    constructor(IERC20 _token, IERC20 _usdt, address _priceFeed) {
        owner = msg.sender;
        token = _token;
        usdt = _usdt;
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the contract owner");
        _;
    }

    modifier presaleActive() {
        require(presaleStarted && !presaleEnded, "Presale is not active");
        _;
    }

    function startPresale() external onlyOwner {
        require(!presaleStarted, "Presale already started");
        presaleStarted = true;
        emit PresaleStarted();
    }

    function buyWithETH() external payable presaleActive {
        uint256 ethInUsd = getETHPriceInUSD(msg.value); // ETH value in USD with 18 decimals
        uint256 tokensToBuy = (ethInUsd * 10 ** 12) / (TOKEN_PRICE * 10 ** 6); // Scale to 18 decimals for RebelDoge
        _processPurchase(tokensToBuy, msg.sender);
    }

    function buyWithUSDT(uint256 usdtAmount) external presaleActive {
        require(usdtAmount > 0, "USDT amount must be greater than zero");
        usdt.transferFrom(msg.sender, address(this), usdtAmount);
        uint256 tokensToBuy = (usdtAmount * 10 ** 6 * 10 ** 18) /
            (TOKEN_PRICE * 10 ** 6); // Scale to 18 decimals for RebelDoge
        _processPurchase(tokensToBuy, msg.sender);
    }

    function getETHPriceInUSD(uint256 ethAmount) public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid ETH price");
        // price is in 8 decimals, so scale ethAmount correctly to 18 decimals
        uint256 ethPriceInUsd = (uint256(price) * ethAmount) / 10 ** 8;
        return ethPriceInUsd;
    }

    function getWRTeth(
        uint256 EthAmountInWEI
    ) external view presaleActive returns (uint256) {
        uint256 ethInUsd = getETHPriceInUSD(EthAmountInWEI); // ETH value in USD with 18 decimals
        uint256 tokensToBuy = (ethInUsd * 10 ** 12) / (TOKEN_PRICE * 10 ** 6); // Scale to 18 decimals for RebelDoge
        uint256 finalTokens = tokensToBuy;
        bool bonus = false;

        if (totalTokensSold < BONUS_LIMIT) {
            uint256 remainingBonusTokens = BONUS_LIMIT - totalTokensSold;
            uint256 bonusTokens = (tokensToBuy <= remainingBonusTokens)
                ? tokensToBuy / 2
                : remainingBonusTokens / 2;
            finalTokens += bonusTokens;
            bonus = true;
        }
        return finalTokens;
    }

    function getWRTUSD(
        uint256 usdtAmount
    ) external view presaleActive returns (uint256) {
        uint256 tokensToBuy = (usdtAmount * 10 ** 6 * 10 ** 18) /
            (TOKEN_PRICE * 10 ** 6); // Scale to 18 decimals for RebelDoge
        uint256 finalTokens = tokensToBuy;
        bool bonus = false;

        if (totalTokensSold < BONUS_LIMIT) {
            uint256 remainingBonusTokens = BONUS_LIMIT - totalTokensSold;
            uint256 bonusTokens = (tokensToBuy <= remainingBonusTokens)
                ? tokensToBuy / 2
                : remainingBonusTokens / 2;
            finalTokens += bonusTokens;
            bonus = true;
        }
        return finalTokens;
    }

    function _processPurchase(uint256 tokensToBuy, address buyer) internal {
        require(tokensToBuy > 0, "Amount must be greater than zero");
        require(
            purchasedTokens[buyer] + tokensToBuy <= WALLET_LIMIT,
            "Exceeds wallet limit"
        );
        require(
            totalTokensSold + tokensToBuy <= TOTAL_TOKENS_FOR_SALE,
            "Exceeds total tokens for sale"
        );

        uint256 finalTokens = tokensToBuy;
        bool bonus = false;

        if (totalTokensSold < BONUS_LIMIT) {
            uint256 remainingBonusTokens = BONUS_LIMIT - totalTokensSold;
            uint256 bonusTokens = (tokensToBuy <= remainingBonusTokens)
                ? tokensToBuy / 2
                : remainingBonusTokens / 2;
            finalTokens += bonusTokens;
            bonus = true;
        }

        purchasedTokens[buyer] += finalTokens;
        totalTokensSold += finalTokens;

        if (totalTokensSold >= TOTAL_TOKENS_FOR_SALE) {
            presaleEnded = true;
            presaleStarted = false;
            emit PresaleEnded();
        }

        emit TokensPurchased(buyer, finalTokens, bonus);
    }

    function claimTokens() external {
        require(presaleEnded, "Presale not ended");
        require(purchasedTokens[msg.sender] > 0, "No tokens purchased");

        uint256 claimable = _calculateClaimable(msg.sender);
        require(claimable > 0, "No tokens available for claim");

        uint256 timeElapsed = block.timestamp - lastClaimed[msg.sender];
        uint256 periodsElapsed = timeElapsed / VESTING_PERIOD;

        claimedTokens[msg.sender] += claimable;
        lastClaimed[msg.sender] =
        lastClaimed[msg.sender] +
        (periodsElapsed * VESTING_PERIOD); 
        IERC20(token).transferFrom(owner, msg.sender, claimable);
    }

    function _calculateClaimable(
        address buyer
    ) internal view returns (uint256) {
        uint256 purchased = purchasedTokens[buyer];
        uint256 claimed = claimedTokens[buyer];
        uint256 vestedAmount = purchased / 2; // 50% of total purchase is vested

        if (lastClaimed[buyer] == 0) {
            return vestedAmount; // The first 50% is released immediately at presale end
        }

        uint256 timeElapsed = block.timestamp - lastClaimed[buyer];
        uint256 periodsElapsed = timeElapsed / VESTING_PERIOD;

        uint256 monthlyRelease = vestedAmount / VESTING_DURATION; // Amount released each period
        uint256 totalClaimable = periodsElapsed * monthlyRelease;
        uint256 thistimeclaim = totalClaimable + claimed;

        if (
            thistimeclaim > vestedAmount &&
            token.balanceOf(msg.sender) < purchased
        ) {
            totalClaimable = thistimeclaim - claimed;
        }

        return totalClaimable;
    }

    function endPresale() external onlyOwner {
        require(presaleStarted, "Presale not started");
        presaleEnded = true;
        presaleStarted = false;
        emit PresaleEnded();
    }

    function withdrawFunds() external payable onlyOwner {
        payable(owner).transfer(address(this).balance);
        usdt.transfer(owner, usdt.balanceOf(address(this)));
    }
}
