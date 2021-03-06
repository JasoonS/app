const {
  BN,
  expectRevert,
  ether,
  expectEvent,
  balance,
  time,
} = require('@openzeppelin/test-helpers');

const NoLossDao = artifacts.require('NoLossDao');
const AaveLendingPool = artifacts.require('AaveLendingPool');
const ERC20token = artifacts.require('MockERC20');
const ADai = artifacts.require('ADai');

contract('NoLossDao', accounts => {
  let aaveLendingPool;
  let noLossDao;
  let dai;
  let aDai;

  const applicationAmount = '5000000';

  beforeEach(async () => {
    dai = await ERC20token.new('AveTest', 'AT', 18, accounts[0], {
      from: accounts[0],
    });
    aDai = await ADai.new(dai.address, {
      from: accounts[0],
    });
    aaveLendingPool = await AaveLendingPool.new(aDai.address, {
      from: accounts[0],
    });
    noLossDao = await NoLossDao.new({ from: accounts[0] });
    await dai.addMinter(aDai.address, { from: accounts[0] });
    await noLossDao.initialize(
      dai.address,
      aDai.address,
      aaveLendingPool.address,
      aaveLendingPool.address,
      applicationAmount,
      '1800',
      {
        from: accounts[0],
      }
    );
  });

  it('NoLossDao:userJoin. User can join', async () => {
    let mintAmount = '60000000000';
    // deposit
    await dai.mint(accounts[1], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[1],
    });
    let allowance = await dai.allowance.call(accounts[1], noLossDao.address);

    await noLossDao.deposit(mintAmount, { from: accounts[1] });
    let deposit = await noLossDao.depositedDai.call(accounts[1]);

    // User has joined the pool
    assert.equal(mintAmount, allowance.toString());
    assert.equal(mintAmount, deposit.toString());
  });

  it('NoLossDao:userJoin. User cannot join once already in', async () => {
    let mintAmount = '60000000000';
    await dai.mint(accounts[1], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[1],
    });

    await noLossDao.deposit('30000000000', { from: accounts[1] });
    await expectRevert(
      noLossDao.deposit('30000000000', { from: accounts[1] }),
      'Person is already a user'
    ); // double deposit not allowed
  });

  it('NoLossDao:userJoin. Deposit - should revert if no deposit approved', async () => {
    let mintAmount = '60000000000';
    await dai.mint(accounts[1], mintAmount);

    await expectRevert(
      noLossDao.deposit(mintAmount, { from: accounts[1] }),
      'amount not available'
    );
  });

  it('NoLossDao:userJoin. Deposit - should revert if user does not have enough DAi', async () => {
    let mintAmount = '60000000000';
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[1],
    });

    await expectRevert(
      noLossDao.deposit(mintAmount, { from: accounts[1] }),
      'User does not have enough DAI'
    );
  });

  it('NoLossDao:userJoin. User join iteration correctly displayed', async () => {
    let mintAmount = '60000000000';
    // Join in iteration 1
    await dai.mint(accounts[1], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[1],
    });
    await noLossDao.deposit(mintAmount, { from: accounts[1] });
    await time.increase(time.duration.seconds(1801));

    await noLossDao.distributeFunds();

    // Iteration 2 will only be recorded when payout function is called.
    // Join in iteration 2
    await dai.mint(accounts[2], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[2],
    });
    await noLossDao.deposit(mintAmount, { from: accounts[2] });

    let account1join = await noLossDao.iterationJoined.call(accounts[1]);
    let account2join = await noLossDao.iterationJoined.call(accounts[2]);

    // User has joined the pool
    assert.equal(account1join.toString(), '0');
    assert.equal(account2join.toString(), '1');
  });

  it('NoLossDao:userJoin. Correctly display total DAi deposited after multiple people join', async () => {
    let mintAmount = '60000000000';
    // first person
    await dai.mint(accounts[1], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[1],
    });
    await noLossDao.deposit(mintAmount, { from: accounts[1] });
    // second person
    await dai.mint(accounts[2], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[2],
    });
    await noLossDao.deposit(mintAmount, { from: accounts[2] });
    // third person
    await dai.mint(accounts[3], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[3],
    });
    await noLossDao.deposit(mintAmount, { from: accounts[3] });
    // proposal joined too
    await dai.mint(accounts[4], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[4],
    });
    await noLossDao.createProposal('Some IPFS hash string', {
      from: accounts[4],
    });

    let totalExpected = parseInt(mintAmount) * 3 + parseInt(applicationAmount);
    let daiDeposited = await noLossDao.totalDepositedDai.call();
    assert.equal(daiDeposited.toString(), totalExpected.toString());
  });

  it('NoLossDao:userJoin. If no vote in iteration application does not break', async () => {
    let mintAmount = '60000000000';
    // Join in iteration 0
    await dai.mint(accounts[1], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[1],
    });
    await noLossDao.deposit(mintAmount, { from: accounts[1] });

    // change iteration 0 ->1
    await time.increase(time.duration.seconds(1801));
    await noLossDao.distributeFunds();

    // Iteration 2 will only be recorded when payout function is called.
    // Join in iteration 2
    await dai.mint(accounts[2], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[2],
    });
    await noLossDao.deposit(mintAmount, { from: accounts[2] });

    // change iteration 1 ->2
    await time.increase(time.duration.seconds(1801));
    await noLossDao.distributeFunds(); // This should fail if no project voted for?
    // Join iteration 3
    await dai.mint(accounts[3], mintAmount);
    await dai.approve(noLossDao.address, mintAmount, {
      from: accounts[3],
    });
    await noLossDao.deposit(mintAmount, { from: accounts[3] });

    let account1join = await noLossDao.iterationJoined.call(accounts[1]);
    let account2join = await noLossDao.iterationJoined.call(accounts[2]);
    let account3join = await noLossDao.iterationJoined.call(accounts[3]);
    // User has joined the pool

    assert.equal(account1join.toString(), '0');
    assert.equal(account2join.toString(), '1');
    assert.equal(account3join.toString(), '2');
  });

  // Add tests to check if users can leave and that they get correct amount....
  // TODO: figure if we deduct gas fees off them for their proxyTwitter votes
});
