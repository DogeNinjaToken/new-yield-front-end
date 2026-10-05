const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(require('node:path').join(__dirname, '../static/js/app.js'), 'utf8');
const config = {
  enabled: false,
  chainId: 46630,
  chainName: 'Robinhood Chain Testnet',
  tokenSymbol: 'FORGE',
  tokens: {
    forge: { address: '0x1111111111111111111111111111111111111111', symbol: 'FORGE', name: 'Forge', decimals: 18 },
    amd: { address: '0x2222222222222222222222222222222222222222', symbol: 'AMD', name: 'AMD', assetType: 'stock', decimals: 18 },
    doge: { address: '0x3333333333333333333333333333333333333333', symbol: 'DOGE', name: 'Dogecoin', assetType: 'meme', decimals: 18 }
  },
  farms: [
    { pid: 0, label: 'FORGE', token: 'forge', isTokenOnly: true, depositFeeBP: 100 },
    { pid: 16, label: 'AMD', token: 'amd', isTokenOnly: true, depositFeeBP: 250 },
    { pid: 17, label: 'DOGE', token: 'doge', isTokenOnly: true, depositFeeBP: 250 }
  ],
  links: {}
};

async function render(pathname) {
  const app = { innerHTML: '', addEventListener() {} };
  const modal = { innerHTML: '', addEventListener() {} };
  const toast = { replaceChildren() {} };
  const nodes = { app, 'modal-root': modal, 'toast-root': toast };
  const document = { getElementById: id => nodes[id] || null, addEventListener() {}, hidden: false, createElement() { return { appendChild() {} }; } };
  const window = {
    ROBINHOOD_FARM: config,
    ethers: {},
    location: { pathname },
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 0; },
    addEventListener() {},
    dispatchEvent() {}
  };
  const context = { window, document, console, BigInt, Set, Number, String, Array, Object, Math, Intl, Promise, URL };
  vm.createContext(context);
  vm.runInContext(source, context);
  await new Promise(resolve => setTimeout(resolve, 0));
  return app.innerHTML;
}

async function testWalletPersistsAcrossNavigation() {
  const app = { innerHTML: '', addEventListener() {} };
  const modal = { innerHTML: '', addEventListener() {} };
  const nodes = { app, 'modal-root': modal, 'toast-root': { replaceChildren() {} } };
  const document = { getElementById: id => nodes[id] || null, addEventListener() {}, hidden: false, createElement() { return { appendChild() {} }; } };
  const location = { pathname: '/' };
  const listeners = {};
  const window = {
    ROBINHOOD_FARM: config,
    ethers: {},
    location,
    history: { pushState(_state, _title, path) { location.pathname = path; } },
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 0; },
    scrollTo() {}, addEventListener(name, listener) { listeners[name] = listener; }, dispatchEvent() {}
  };
  const exposedSource = source.replace(
    "  root.addEventListener('click', handleRootClick);",
    "  window.__navigationTest = { state: state, handleRootClick: handleRootClick, render: render };\n  root.addEventListener('click', handleRootClick);"
  );
  assert.notEqual(exposedSource, source, 'navigation test hook should be installed');
  const context = { window, document, console, BigInt, Set, Number, String, Array, Object, Math, Intl, Promise, URL };
  vm.createContext(context);
  vm.runInContext(exposedSource, context);
  await new Promise(resolve => setTimeout(resolve, 0));

  const state = window.__navigationTest.state;
  const provider = { connected: true };
  const signer = { connected: true };
  state.account = '0x1234567890abcdef1234567890abcdef12345678';
  state.injected = provider;
  state.signer = signer;

  function clickInternalLink(path) {
    let prevented = false;
    const link = { getAttribute(name) { return name === 'href' ? path : null; } };
    window.__navigationTest.handleRootClick({
      target: { closest(selector) { return selector === 'a[href]' ? link : null; } },
      button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
      preventDefault() { prevented = true; }
    });
    assert.equal(prevented, true, `internal navigation to ${path} should avoid a document reload`);
  }

  clickInternalLink('/memes/');
  assert.equal(location.pathname, '/memes/');
  assert.equal(state.route, 'memes');
  assert.equal(state.account, '0x1234567890abcdef1234567890abcdef12345678');
  assert.equal(state.injected, provider);
  assert.equal(state.signer, signer);
  function clickAction(action) {
    const button = { getAttribute(name) { return name === 'data-action' ? action : null; } };
    const walletControl = {};
    window.__navigationTest.handleRootClick({
      target: { closest(selector) { return selector === '[data-action]' ? button : (selector === '.wallet-control' ? walletControl : null); } },
      button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
      preventDefault() {}
    });
  }
  assert.match(app.innerHTML, /wallet-button connected/);
  assert.match(app.innerHTML, /href="\/memes\/" aria-current="page"/);

  location.pathname = '/pools/';
  listeners.popstate();
  assert.equal(state.route, 'pools', 'browser back/forward should update the rendered route');
  assert.equal(state.account, '0x1234567890abcdef1234567890abcdef12345678', 'history navigation should preserve the connected wallet');
  assert.equal(state.injected, provider);
  assert.equal(state.signer, signer);

  state.route = 'home';
  state.data = {
    'farm:17': {
      kind: 'farm', id: '17', token: { symbol: 'DOGE', name: 'Dogecoin' },
      userAmount: 5n * 10n ** 18n, pending: 2n * 10n ** 18n, decimals: 18
    }
  };
  window.__navigationTest.render();
  let positionActions = app.innerHTML.slice(app.innerHTML.indexOf('class="position-actions"'));
  const claimIndex = positionActions.indexOf('data-action="harvest"');
  const withdrawIndex = positionActions.indexOf('data-mode="withdraw"');
  assert(claimIndex >= 0 && claimIndex < withdrawIndex, 'home position should show Claim to the left of Withdraw');
  assert.match(positionActions, /data-action="harvest" data-key="17">Claim<\/button>/, 'claim should target the position pool');
  assert.match(positionActions, /data-mode="withdraw">Withdraw<\/button>/);

  state.data['farm:17'].pending = 0n;
  window.__navigationTest.render();
  positionActions = app.innerHTML.slice(app.innerHTML.indexOf('class="position-actions"'));
  assert.match(positionActions, /data-action="harvest" data-key="17" disabled title="No rewards available to claim">Claim<\/button>/, 'claim should be disabled when the position has no pending rewards');
  console.log('PASS home positions provide a claim-only action before withdrawal');
  console.log('PASS client-side navigation and browser history preserve the connected wallet');
  clickAction('wallet-menu');
  assert.match(app.innerHTML, /class="wallet-menu"/);
  assert.match(app.innerHTML, /Disconnect wallet/);
  assert.match(app.innerHTML, /aria-expanded="true"/);
  clickAction('disconnect');
  assert.equal(state.account, '', 'disconnect should clear the connected account from the app');
  assert.equal(state.injected, null, 'disconnect should clear the injected provider from the app');
  assert.equal(state.signer, null, 'disconnect should clear the signer from the app');
  assert.match(app.innerHTML, /data-action="connect">Connect wallet/);
  console.log('PASS wallet menu offers a working in-app disconnect action');
}

async function testLiveHomeMetrics() {
  const forgeAddress = '0x3333333333333333333333333333333333333333';
  const assetAddress = '0x4444444444444444444444444444444444444444';
  const pairAddress = '0x5555555555555555555555555555555555555555';
  const metricConfig = {
    enabled: false,
    chainId: 4663,
    tokenAddress: forgeAddress,
    tokens: {
      forge: { address: forgeAddress, symbol: 'FORGE', name: 'Forge', decimals: 18 },
      asset: { address: assetAddress, symbol: 'ASSET', name: 'Test Asset', decimals: 18, priceUsd: 2 }
    },
    pricePairs: [{ address: pairAddress }],
    farms: [
      { pid: 0, token: 'forge', isTokenOnly: true },
      { pid: 1, token: 'asset', isTokenOnly: true },
      { pid: 2, token: 'forge', isTokenOnly: true }
    ],
    links: {}
  };
  const app = { innerHTML: '', addEventListener() {} };
  const nodes = { app, 'modal-root': { innerHTML: '', addEventListener() {} }, 'toast-root': { replaceChildren() {} } };
  const document = { getElementById: id => nodes[id] || null, addEventListener() {}, hidden: false };
  function formatUnits(value, decimals = 18) {
    const raw = BigInt(value);
    const scale = 10n ** BigInt(decimals);
    const whole = raw / scale;
    const fraction = (raw % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : String(whole);
  }
  const ethers = {
    formatUnits,
    Contract: function (address) {
      assert.equal(address, pairAddress);
      return {
        token0: async () => forgeAddress,
        token1: async () => assetAddress,
        getReserves: async () => [500n * 10n ** 18n, 1000n * 10n ** 18n, 0]
      };
    }
  };
  const window = {
    ROBINHOOD_FARM: metricConfig,
    ethers,
    location: { pathname: '/' },
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 0; }, addEventListener() {}, dispatchEvent() {}
  };
  const exposed = source.replace("  root.addEventListener('click', handleRootClick);", "  window.__metricsTest = { state: state, refreshUsdPrices: refreshUsdPrices, homeTvl: homeTvl, homeMarketCap: homeMarketCap, activeRewardPools: activeRewardPools, dailyRewardRate: dailyRewardRate };\n  root.addEventListener('click', handleRootClick);");
  const context = { window, document, console, BigInt, Set, Number, String, Array, Object, Math, Intl, Promise, URL };
  vm.createContext(context);
  vm.runInContext(exposed, context);
  await new Promise(resolve => setTimeout(resolve, 0));
  const state = window.__metricsTest.state;
  state.rpc = {};
  state.rpcReady = true;
  state.stats = { supply: 1000n * 10n ** 18n, cap: 200000n * 10n ** 18n, perSec: 1n * 10n ** 18n, totalAllocPoint: 400n, startTimestamp: 0n, poolLength: 3n };
  state.data = {
    'farm:0': { totalStaked: 10n * 10n ** 18n, allocPoint: 100n, decimals: 18 },
    'farm:1': { totalStaked: 5n * 10n ** 18n, allocPoint: 200n, decimals: 18 },
    'farm:2': { totalStaked: 0n, allocPoint: 100n, decimals: 18 }
  };
  state.ratePools = {
    '0': { totalStaked: 10n * 10n ** 18n, allocPoint: 100n },
    '1': { totalStaked: 5n * 10n ** 18n, allocPoint: 200n },
    '2': { totalStaked: 0n, allocPoint: 100n }
  };
  const rewardRate = window.__metricsTest.dailyRewardRate({
    kind: 'farm', totalStaked: 5n * 10n ** 18n, allocPoint: 200n,
    forgePerSec: 1n * 10n ** 18n, totalAllocPoint: 400n, decimals: 18
  });
  assert.equal(rewardRate, '8,640', 'daily reward rate should account for pool allocation and full-token stake units');
  assert.equal(window.__metricsTest.dailyRewardRate({
    kind: 'farm', totalStaked: 5n * 10n ** 6n, allocPoint: 200n,
    forgePerSec: 1n * 10n ** 18n, totalAllocPoint: 400n, decimals: 6
  }), rewardRate, 'daily rate should be normalized for tokens with different decimals');
  state.stats.supply = 199999n * 10n ** 18n;
  assert.equal(window.__metricsTest.dailyRewardRate({
    kind: 'farm', totalStaked: 5n * 10n ** 18n, allocPoint: 200n,
    forgePerSec: 1n * 10n ** 18n, totalAllocPoint: 400n, decimals: 18
  }), '0.1333', 'daily estimate should scale across active pool weights when remaining supply cannot cover one day');
  state.stats.supply = 1000n * 10n ** 18n;
  console.log('PASS daily per-token reward math, token decimals and remaining supply cap adjustment');
  await window.__metricsTest.refreshUsdPrices();
  assert.equal(state.usdPrices.forge, 4);
  assert.equal(window.__metricsTest.homeTvl().value, '$50.00');
  assert.equal(window.__metricsTest.homeMarketCap().value, '$4,000.00');
  assert.deepEqual(
    JSON.parse(JSON.stringify(window.__metricsTest.activeRewardPools())),
    { value: '2 / 3', foot: '75% of total FORGE allocation is in pools with stakers' }
  );
  console.log('PASS live home TVL, pair-based FORGE price, market cap and active reward-pool allocation');
}

(async () => {
  const routes = [
    ['/', 'Put your tokens', '/'],
    ['/pools/', 'Token staking', '/pools/'],
    ['/stocks/', 'Stock staking', '/stocks/'],
    ['/farms/', 'Stock staking', '/stocks/'],
    ['/memes/', 'Meme staking', '/memes/'],
    ['/staking/', 'Meme staking', '/memes/'],
    ['/vaults/', 'Meme staking', '/memes/']
  ];
  for (const [path, heading, activeHref] of routes) {
    const html = await render(path);
    assert(html.toLowerCase().includes(heading.toLowerCase()), `${path} heading mismatch`);
    assert(html.includes(`href="${activeHref}" aria-current="page"`), `${path} active navigation mismatch`);
    for (const target of ['/pools/', '/stocks/', '/memes/']) assert(html.includes(`href="${target}"`), `${path} missing ${target} navigation link`);
    console.log(`PASS ${path} renders ${heading}`);
  }
  const home = await render('/');
  const requestedStats = ['Total value staked (TVL)', 'FORGE market cap', 'Active reward pools'];
  const statPositions = requestedStats.map(label => home.indexOf(`stat-label">${label}`));
  assert(statPositions.every(index => index >= 0) && statPositions[0] < statPositions[1] && statPositions[1] < statPositions[2], 'home page valuation and rewards cards should appear in the requested order');
  assert.match(home, /Test tokens have no monetary value/);
  console.log('PASS home page shows TVL, FORGE market cap and active reward pools in the requested order');
  const pools = await render('/pools/');
  assert.match(pools, /class="token-symbol">FORGE/);
  assert.doesNotMatch(pools, /class="token-symbol">AMD/);
  const tokenRateIndex = pools.indexOf('metric-label"><span>Est. Daily FORGE rewards</span><span>for every FORGE staked</span>');
  const tokenStakedIndex = pools.indexOf('metric-label">Total staked');
  assert(tokenRateIndex >= 0 && tokenRateIndex < tokenStakedIndex, 'token-pool daily per-token rate should appear before total staked');
  assert.match(pools, /Estimated FORGE earned over 24 hours for 1 whole FORGE token staked/);
  const stocks = await render('/stocks/');
  assert.match(stocks, /class="token-symbol">AMD/);
  assert.doesNotMatch(stocks, /class="token-symbol">FORGE/);
  const stockRateIndex = stocks.indexOf('metric-label"><span>Est. Daily FORGE rewards</span><span>for every AMD staked</span>');
  const stockStakedIndex = stocks.indexOf('metric-label">Total staked');
  assert(stockRateIndex >= 0 && stockRateIndex < stockStakedIndex, 'stock-pool daily per-token rate should appear before total staked');
  assert.match(stocks, /Estimated FORGE earned over 24 hours for 1 whole AMD token staked/);
  const memes = await render('/memes/');
  assert.match(memes, /class="token-symbol">DOGE/);
  assert.doesNotMatch(memes, /class="token-symbol">FORGE|class="token-symbol">AMD/);
  assert.match(memes, /<span>Est\. Daily FORGE rewards<\/span><span>for every DOGE staked<\/span>/);
  assert.match(memes, /Estimated FORGE earned over 24 hours for 1 whole DOGE token staked/);
  assert.match(memes, /href="https:\/\/forms\.gle\/dTXMaBD8fVZmhuFAA" target="_blank" rel="noopener noreferrer">Add your meme token here/);
  assert.doesNotMatch(memes, /href="mailto:/);
  assert.doesNotMatch(home, /href="\/staking\/"|>Vaults</);
  console.log('PASS token, stock and meme routes separate pool categories and the meme request opens its Google Form in a new tab');
  await testWalletPersistsAcrossNavigation();
  await testLiveHomeMetrics();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
