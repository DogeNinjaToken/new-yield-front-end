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
  const pools = await render('/pools/');
  assert.match(pools, /class="token-symbol">FORGE/);
  assert.doesNotMatch(pools, /class="token-symbol">AMD/);
  const stocks = await render('/stocks/');
  assert.match(stocks, /class="token-symbol">AMD/);
  assert.doesNotMatch(stocks, /class="token-symbol">FORGE/);
  console.log('PASS token and stock routes separate configured pool categories');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
