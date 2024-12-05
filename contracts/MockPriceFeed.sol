// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";


contract MockPriceFeed is AggregatorV3Interface {
    int256 public price;
    uint8 public override decimals;

    constructor(uint8 _decimals, int256 _price) {
        decimals = _decimals;
        price = _price;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, price, block.timestamp, block.timestamp, 0);
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function description() external pure override returns (string memory) {
        return "Mock Price Feed";
    }

    function getRoundData(uint80 /* _roundId */)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, price, block.timestamp, block.timestamp, 0);
    }
}

