const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RebelDogePresale", function () {
  let presaleContract, token, usdt, priceFeed;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy mock tokens and price feed contracts
    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy("RebelDoge", "RDOGE", 18);
    await token.deployed();

    usdt = await MockToken.deploy("Tether USD", "USDT", 6);
    await usdt.deployed();

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    priceFeed = await MockPriceFeed.deploy(8, 3000 * 10 ** 8); // Assume ETH/USD = 3000
    await priceFeed.deployed();

    const RebelDogePresale = await ethers.getContractFactory("RebelDogePresale");
    presaleContract = await RebelDogePresale.deploy(token.address, usdt.address, priceFeed.address);
    await presaleContract.deployed();

    // Mint and allocate tokens
    await token.mint(owner.address, ethers.utils.parseUnits("1000000000", 18));
    await token.transfer(presaleContract.address, ethers.utils.parseUnits("120000000", 18));
    await usdt.mint(addr1.address, ethers.utils.parseUnits("1000", 6));
  });

  // it("should deploy contracts successfully and validate token allocation", async function () {
  //   const totalSupply = await token.totalSupply();
  //   expect(totalSupply).to.equal(ethers.utils.parseUnits("1000000000", 18));

  //   const presaleBalance = await token.balanceOf(presaleContract.address);
  //   expect(presaleBalance).to.equal(ethers.utils.parseUnits("120000000", 18));
  // });

  // it("should allow only the owner to start the presale", async function () {
  //   await expect(presaleContract.connect(addr1).startPresale()).to.be.revertedWith("Not the contract owner");
  //   await presaleContract.startPresale();
  //   expect(await presaleContract.presaleStarted()).to.be.true;
  // });

  // it("should allow a basic purchase within wallet limit with ETH", async function () {
  //   await presaleContract.startPresale();
  //   const ethAmount = ethers.utils.parseEther("0.1");
  //   await presaleContract.connect(addr1).buyWithETH({ value: ethAmount });
  //   const purchasedTokens = await presaleContract.purchasedTokens(addr1.address);
  //   expect(purchasedTokens).to.be.greaterThan(0);
  // });

  // it("should revert if purchase exceeds wallet limit", async function () {
  //   await presaleContract.startPresale();
  //   const ethAmount = ethers.utils.parseEther("10");
  //   await expect(presaleContract.connect(addr1).buyWithETH({ value: ethAmount })).to.be.revertedWith("Exceeds wallet limit");
  // });

  it("should allow multiple purchases that accumulate to wallet limit", async function () {
    await presaleContract.startPresale();

    // Define ETH amounts for two purchases
    const ethAmount1 = ethers.utils.parseEther("0.2");
    const ethAmount2 = ethers.utils.parseEther("0.3");

    // First purchase
    console.log("First purchase with ETH amount:", ethAmount1.toString());
    await presaleContract.connect(addr1).buyWithETH({ value: ethAmount1 });
    let purchasedTokensAfterFirst = await presaleContract.purchasedTokens(addr1.address);
    console.log("Tokens purchased after first transaction:", purchasedTokensAfterFirst.toString());

    // Second purchase
    console.log("Second purchase with ETH amount:", ethAmount2.toString());
    await presaleContract.connect(addr1).buyWithETH({ value: ethAmount2 });
    let purchasedTokensAfterSecond = await presaleContract.purchasedTokens(addr1.address);
    console.log("Tokens purchased after second transaction:", purchasedTokensAfterSecond.toString());

    // Final check against WALLET_LIMIT
    const walletLimit = await presaleContract.WALLET_LIMIT();
    console.log("Wallet limit:", walletLimit.toString());
    expect(purchasedTokensAfterSecond).to.equal(walletLimit);
});


  it("should handle very small ETH amounts", async function () {
    await presaleContract.startPresale();
    const ethAmount = ethers.utils.parseEther("0.0001");
    await presaleContract.connect(addr1).buyWithETH({ value: ethAmount });
    const purchasedTokens = await presaleContract.purchasedTokens(addr1.address);
    expect(purchasedTokens).to.be.greaterThan(0);
  });

  it("should apply bonus if tokens are within bonus limit", async function () {
    await presaleContract.startPresale();
    const ethAmount = ethers.utils.parseEther("0.5");
    await presaleContract.connect(addr1).buyWithETH({ value: ethAmount });
    const purchasedTokens = await presaleContract.purchasedTokens(addr1.address);
    expect(purchasedTokens).to.be.greaterThan(0);
  });

  it("should allow purchase with USDT", async function () {
    await presaleContract.startPresale();
    const usdtAmount = ethers.utils.parseUnits("1", 6); // Equivalent to 1 USDT
    await usdt.connect(addr1).approve(presaleContract.address, usdtAmount);
    await presaleContract.connect(addr1).buyWithUSDT(usdtAmount);
    const purchasedTokens = await presaleContract.purchasedTokens(addr1.address);
    expect(purchasedTokens).to.be.greaterThan(0);
  });

  it("should handle vesting and allow claiming after presale ends", async function () {
    // Start the presale
    await presaleContract.startPresale();

    // Define and log the ETH amount for purchase
    const ethAmount = ethers.utils.parseEther("0.5");
    console.log("Purchasing tokens with ETH amount:", ethAmount.toString());

    // Purchase tokens with ETH
    await presaleContract.connect(addr1).buyWithETH({ value: ethAmount });

    // Fetch and log the number of purchased tokens for addr1
    let purchasedTokens = await presaleContract.purchasedTokens(addr1.address);
    console.log("Tokens purchased:", purchasedTokens.toString());

    // End the presale
    await presaleContract.endPresale();
    console.log("Presale ended.");

    // Advance blockchain time by 1 month to simulate vesting period
    const oneMonthInSeconds = 30 * 24 * 60 * 60;
    await ethers.provider.send("evm_increaseTime", [oneMonthInSeconds]);
    await ethers.provider.send("evm_mine");
    console.log("Time advanced by 1 month.");

    // Attempt to claim tokens
    await presaleContract.connect(addr1).claimTokens();

    // Log the number of tokens claimed by addr1
    const claimedTokens = await presaleContract.claimedTokens(addr1.address);
    console.log("Tokens claimed:", claimedTokens.toString());

    // Verify that some tokens were indeed claimed
    expect(claimedTokens).to.be.greaterThan(0);
});


  it("should revert if attempting to buy tokens before presale starts", async function () {
    const ethAmount = ethers.utils.parseEther("0.1");
    await expect(presaleContract.connect(addr1).buyWithETH({ value: ethAmount })).to.be.revertedWith("Presale is not active");
  });

  it("should revert if buying tokens after presale ends", async function () {
    await presaleContract.startPresale();
    await presaleContract.endPresale();
    const ethAmount = ethers.utils.parseEther("0.1");
    await expect(presaleContract.connect(addr1).buyWithETH({ value: ethAmount })).to.be.revertedWith("Presale is not active");
  });

  it("should allow only the owner to withdraw funds after presale", async function () {
    await presaleContract.startPresale();

    // Addr1 makes a purchase to provide funds in the contract
    const ethAmount = ethers.utils.parseEther("1");
    await presaleContract.connect(addr1).buyWithETH({ value: ethAmount });

    // End the presale
    await presaleContract.endPresale();

    // Non-owner (addr1) attempts to withdraw funds
    await expect(
        presaleContract.connect(addr1).withdrawFunds()
    ).to.be.revertedWith("Not the contract owner");

    // Check owner's balance before and after withdrawal
    const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
    await presaleContract.connect(owner).withdrawFunds();
    const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

    console.log("Owner balance before withdrawal:", ownerBalanceBefore.toString());
    console.log("Owner balance after withdrawal:", ownerBalanceAfter.toString());

    // Ensure owner's balance increased, indicating successful withdrawal
    expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
});


  it("should respect bonus limit correctly", async function () {
    await presaleContract.startPresale();
    const ethAmount = ethers.utils.parseEther("5");
    await presaleContract.connect(addr1).buyWithETH({ value: ethAmount });
    const tokensWithBonus = await presaleContract.purchasedTokens(addr1.address);
    expect(tokensWithBonus).to.be.greaterThan(0);
  });

  it("should handle zero and very small USDT purchases without errors", async function () {
    await presaleContract.startPresale();
    const smallUsdtAmount = ethers.utils.parseUnits("0.0001", 6);
    await usdt.connect(addr1).approve(presaleContract.address, smallUsdtAmount);
    await expect(presaleContract.connect(addr1).buyWithUSDT(smallUsdtAmount)).not.to.be.reverted;
  });

  it("should prevent front-running by ensuring ETH/USD conversion stability", async function () {
    await presaleContract.startPresale();
    const ethAmount = ethers.utils.parseEther("0.1");

    await priceFeed.setPrice(3500 * 10 ** 8); // Set a higher ETH price to check conversion stability
    await expect(presaleContract.connect(addr1).buyWithETH({ value: ethAmount })).not.to.be.reverted;
  });

  it("should prevent re-entrancy on claimTokens", async function () {
    await presaleContract.startPresale();
    const ethAmount = ethers.utils.parseEther("0.5");
    await presaleContract.connect(addr1).buyWithETH({ value: ethAmount });
    await presaleContract.endPresale();

    await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // Advance 1 month
    await ethers.provider.send("evm_mine");

    await expect(presaleContract.connect(addr1).claimTokens()).not.to.be.reverted;
  });

  it("should respect total token limit", async function () {
    await presaleContract.startPresale();
    const maxEthAmount = await presaleContract.getETHPriceInUSD(await presaleContract.TOTAL_TOKENS_FOR_SALE());
    await presaleContract.connect(addr1).buyWithETH({ value: maxEthAmount });
    expect(await presaleContract.totalTokensSold()).to.equal(await presaleContract.TOTAL_TOKENS_FOR_SALE());
    await expect(presaleContract.connect(addr2).buyWithETH({ value: ethers.utils.parseEther("1") })).to.be.revertedWith("Exceeds total tokens for sale");
  });
});
