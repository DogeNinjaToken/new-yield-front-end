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
    amd: { address: '0x2222222222222222222222222222222222222222', symbol: 'AMD', name: 'AMD', assetType: 'stock', decimals: 18 }
  },
  farms: [
    { pid: 0, label: 'FORGE', token: 'forge', isTokenOnly: true, depositFeeBP: 100 },
    { pid: 16, label: 'AMD', token: 'amd', isTokenOnly: true, depositFeeBP: 250 }
  ],
  vaults: [],
  links: {}
};

async function render(pathname) {
  const app = { innerHTML: '', addEventListener() {} };
  const modal = { innerHTML: '', addEventListener() {} };
  const toast = { replaceChildren() {} };
  const nodes = { app, 'modal-root': modal, 'toast-root': toast };
  const document = { getElementById: id => nodes[id] || null, addEventListener() {}, hidden: false };
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
    vaults: [],
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
  const exposed = source.replace("  root.addEventListener('click', handleRootClick);", "  window.__metricsTest = { state: state, refreshUsdPrices: refreshUsdPrices, homeTvl: homeTvl, homeMarketCap: homeMarketCap, dailyStakerRewards: dailyStakerRewards };\n  root.addEventListener('click', handleRootClick);");
  const context = { window, document, console, BigInt, Set, Number, String, Array, Object, Math, Intl, Promise, URL };
  vm.createContext(context);
  vm.runInContext(exposed, context);
  await new Promise(resolve => setTimeout(resolve, 0));
  const state = window.__metricsTest.state;
  state.rpc = {};
  state.rpcReady = true;
  state.stats = { supply: 1000n * 10n ** 18n, cap: 200000n * 10n ** 18n, perSec: 1n * 10n ** 18n, totalAllocPoint: 400n, startTimestamp: 0n };
  state.data = {
    'farm:0': { totalStaked: 10n * 10n ** 18n, allocPoint: 100n, decimals: 18 },
    'farm:1': { totalStaked: 5n * 10n ** 18n, allocPoint: 200n, decimals: 18 },
    'farm:2': { totalStaked: 0n, allocPoint: 100n, decimals: 18 }
  };
  await window.__metricsTest.refreshUsdPrices();
  assert.equal(state.usdPrices.forge, 4);
  assert.equal(window.__metricsTest.homeTvl().value, '$50.00');
  assert.equal(window.__metricsTest.homeMarketCap().value, '$4,000.00');
  assert.equal(window.__metricsTest.dailyStakerRewards(), '64,800 FORGE / day');
  state.stats.cap = state.stats.supply + 1n * 10n ** 18n;
  assert.equal(window.__metricsTest.dailyStakerRewards(), '1 FORGE / day', 'daily rewards should respect remaining FORGE supply cap');
  console.log('PASS live home TVL, pair-based FORGE price, market cap and capped daily rewards');
}

(async () => {
  const routes = [
    ['/', 'Put your tokens', '/'],
    ['/pools/', 'Token staking', '/pools/'],
    ['/stocks/', 'Stock staking', '/stocks/'],
    ['/farms/', 'Stock staking', '/stocks/'],
    ['/staking/', 'Vaults', '/staking/']
  ];
  for (const [path, heading, activeHref] of routes) {
    const html = await render(path);
    assert(html.toLowerCase().includes(heading.toLowerCase()), `${path} heading mismatch`);
    assert(html.includes(`href="${activeHref}" aria-current="page"`), `${path} active navigation mismatch`);
    for (const target of ['/pools/', '/stocks/', '/staking/']) assert(html.includes(`href="${target}"`), `${path} missing ${target} navigation link`);
    console.log(`PASS ${path} renders ${heading}`);
  }
  const home = await render('/');
  const requestedStats = ['Total value staked (TVL)', 'FORGE market cap', 'Earn up to'];
  const statPositions = requestedStats.map(label => home.indexOf(`stat-label">${label}`));
  assert(statPositions.every(index => index >= 0) && statPositions[0] < statPositions[1] && statPositions[1] < statPositions[2], 'home page valuation and rewards cards should appear in the requested order');
  assert.match(home, /Test tokens have no monetary value/);
  console.log('PASS home page shows TVL, FORGE market cap and daily rewards in the requested order');
  const pools = await render('/pools/');
  assert.match(pools, /class="token-symbol">FORGE/);
  assert.doesNotMatch(pools, /class="token-symbol">AMD/);
  const tokenRateIndex = pools.indexOf('metric-label">Est. FORGE / token / yr');
  const tokenStakedIndex = pools.indexOf('metric-label">Total staked');
  assert(tokenRateIndex >= 0 && tokenRateIndex < tokenStakedIndex, 'token-pool rate should appear before total staked');
  const stocks = await render('/stocks/');
  assert.match(stocks, /class="token-symbol">AMD/);
  assert.doesNotMatch(stocks, /class="token-symbol">FORGE/);
  const stockRateIndex = stocks.indexOf('metric-label">Est. FORGE / token / yr');
  const stockStakedIndex = stocks.indexOf('metric-label">Total staked');
  assert(stockRateIndex >= 0 && stockRateIndex < stockStakedIndex, 'stock-pool rate should appear before total staked');
  console.log('PASS token and stock routes separate configured pool categories');
  await testLiveHomeMetrics();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
