(function () {
  'use strict';

  var C = window.ROBINHOOD_FARM || {};
  var E = window.ethers;
  var ZERO = '0x0000000000000000000000000000000000000000';
  var ERC20_ABI = [
    'function allowance(address owner,address spender) view returns (uint256)',
    'function approve(address spender,uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function owner() view returns (address)'
  ];
  var CHEF_ABI = [
    'function forge() view returns (address)',
    'function forgePerSec() view returns (uint256)',
    'function maxSupply() view returns (uint256)',
    'function owner() view returns (address)',
    'function pendingForge(uint256 pid,address user) view returns (uint256)',
    'function poolInfo(uint256 pid) view returns (address stakeToken,uint256 allocPoint,uint256 lastRewardTimestamp,uint256 accForgePerShare,uint16 depositFeeBP,uint256 totalStaked)',
    'function poolLength() view returns (uint256)',
    'function startTimestamp() view returns (uint256)',
    'function totalAllocPoint() view returns (uint256)',
    'function userInfo(uint256 pid,address user) view returns (uint256 amount,uint256 rewardDebt)',
    'function deposit(uint256 pid,uint256 amount)',
    'function withdraw(uint256 pid,uint256 amount)'
  ];
  var VAULT_ABI = [
    'function bonusEndTimestamp() view returns (uint256)',
    'function deposit(uint256 amount)',
    'function pendingReward(address user) view returns (uint256)',
    'function rewardPerSec() view returns (uint256)',
    'function totalStaked() view returns (uint256)',
    'function userInfo(address user) view returns (uint256 amount,uint256 rewardDebt)',
    'function withdraw(uint256 amount)'
  ];
  var PRICE_PAIR_ABI = [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)'
  ];

  var root = document.getElementById('app');
  var modalRoot = document.getElementById('modal-root');
  var toastRoot = document.getElementById('toast-root');
  var state = {
    route: routeFromPath(), rpc: null, chef: null, forge: null,
    rpcReady: false, rpcError: '', stats: null, usdPrices: {}, account: '',
    injected: null, signer: null, data: {}, loading: false,
    query: '', modal: null, startupWarning: '', refreshTimer: null
  };

  function routeFromPath() {
    var p = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    if (p === '/stocks' || p === '/farms') return 'stocks';
    if (p === '/pools') return 'pools';
    if (p === '/staking' || p === '/vaults') return 'vaults';
    return 'home';
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function address(value) {
    if (typeof value !== 'string') return '';
    var match = value.match(/^0x[a-fA-F0-9]{40}$/);
    return match ? value : '';
  }

  function configuredAddress(value) {
    if (typeof value === 'string') return address(value);
    if (value && typeof value === 'object') {
      return address(value[String(C.chainId)] || value[C.chainId] || value.default || '');
    }
    return '';
  }

  function tokenFor(farm) {
    if (!farm || typeof farm.token !== 'string') return null;
    return (C.tokens || {})[farm.token] || null;
  }

  function tokenKey(farm) {
    return farm && typeof farm.token === 'string' ? farm.token : '';
  }

  function isStock(token) {
    return !!token && String(token.assetType || token.type || '').toLowerCase() === 'stock';
  }

  function validFarm(farm) {
    return !!farm && farm.isTokenOnly === true && farm.pid != null && Number.isInteger(Number(farm.pid)) && !!tokenFor(farm);
  }

  function allFarms() {
    return Array.isArray(C.farms) ? C.farms.filter(validFarm) : [];
  }

  function configuredVaults() {
    return Array.isArray(C.vaults) ? C.vaults.filter(function (v) {
      return address(configuredAddress(v.address)) && (C.tokens || {})[v.stakingToken] && (C.tokens || {})[v.earningToken];
    }) : [];
  }

  function visibleFarms() {
    return allFarms().filter(function (farm) {
      return state.route === 'stocks' ? isStock(tokenFor(farm)) : !isStock(tokenFor(farm));
    });
  }

  function explorerAddress(value) {
    var base = String(C.explorerUrl || '').replace(/\/+$/, '');
    return base && address(value) ? base + '/address/' + value : '';
  }

  function explorerTx(value) {
    var base = String(C.explorerUrl || '').replace(/\/+$/, '');
    return base && /^0x[a-fA-F0-9]{64}$/.test(value || '') ? base + '/tx/' + value : '';
  }

  function shortAddress(value) {
    return value ? value.slice(0, 6) + '…' + value.slice(-4) : '';
  }

  function comma(value, fraction) {
    if (value == null || !E) return '—';
    var number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('en-GB', { maximumFractionDigits: fraction == null ? 4 : fraction }).format(number);
  }

  function units(value, decimals, fraction) {
    if (value == null || !E) return '—';
    try {
      var n = Number(E.formatUnits(value, decimals == null ? 18 : decimals));
      if (!Number.isFinite(n)) return '—';
      if (n !== 0 && Math.abs(n) < 0.0001) return '<0.0001';
      return comma(n, fraction == null ? 4 : fraction);
    } catch (_) { return '—'; }
  }

  function metaToken(token, key) {
    token = token || {};
    var symbol = token.symbol || String(key || 'TOKEN').toUpperCase();
    return {
      key: key || '', symbol: String(symbol), name: String(token.name || symbol),
      address: configuredAddress(token.address), decimals: token.decimals !== null && token.decimals !== undefined && token.decimals !== '' && Number.isInteger(Number(token.decimals)) ? Number(token.decimals) : null,
      assetType: String(token.assetType || token.type || '').toLowerCase(), priceUsd: token.priceUsd
    };
  }

  function icon(key) {
    var safe = String(key || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    var src = '/images/tokens/' + safe + '.png';
    return '<img class="token-icon" src="' + esc(src) + '" alt="" onerror="this.onerror=null;this.src=\'/images/tokens/forge.png\'">';
  }

  function chainLabel() {
    var name = String(C.chainName || 'Robinhood Chain');
    return name.replace('Robinhood Chain ', 'Robinhood ').replace('Robinhood Chain', 'Robinhood');
  }

  function header() {
    var nav = [
      ['home', '/', 'Overview'],
      ['pools', '/pools/', 'Token staking'],
      ['stocks', '/stocks/', 'Stock staking'],
      ['vaults', '/staking/', 'Vaults']
    ];
    var navHtml = nav.map(function (n) {
      return '<a class="' + (state.route === n[0] ? 'active' : '') + '" href="' + n[1] + '"' + (state.route === n[0] ? ' aria-current="page"' : '') + '>' + n[2] + '</a>';
    }).join('');
    var walletLabel = state.account ? shortAddress(state.account) : 'Connect wallet';
    return '<header class="topbar"><div class="topbar-inner">' +
      '<a class="brand" href="/" aria-label="YieldForge overview"><img src="/images/LogoTextNewDark.png" alt="YieldForge"></a>' +
      '<nav class="nav" aria-label="Main navigation">' + navHtml + '</nav>' +
      '<div class="top-actions"><div class="network-chip ' + (state.rpcReady ? '' : 'offline') + '"><i class="network-dot"></i><span>' + esc(chainLabel()) + '</span></div>' +
      '<button class="wallet-button ' + (state.account ? 'connected' : '') + '" data-action="connect">' + esc(walletLabel) + '</button></div>' +
      '</div></header>';
  }

  function footer() {
    var explorer = String(C.explorerUrl || '').trim();
    return '<footer class="footer"><span>YieldForge protocol · ' + esc(chainLabel()) + '</span><span>Token balances are ERC-20 units. Rewards vary with pool activity.</span>' +
      (explorer ? '<a href="' + esc(explorer) + '" target="_blank" rel="noopener">Block explorer ↗</a>' : '') + '</footer>';
  }

  function stateNotice() {
    if (C.enabled !== true) return '<div class="notice-card">The public configuration is disabled. Connect the verified deployment details in <code>static/js/robinhood-config.js</code> to open staking.</div>';
    if (state.rpcError) return '<div class="notice-card error">' + esc(state.rpcError) + '</div>';
    if (state.startupWarning) return '<div class="notice-card">' + esc(state.startupWarning) + '</div>';
    return '';
  }

  function testnetStrip() {
    return Number(C.chainId) === 46630 ? '<div class="info-strip"><span class="info-icon">i</span><span><strong>Testnet is active.</strong> FORGE and other test tokens on this network have no monetary value. Check your wallet network before approving a transaction.</span></div>' : '';
  }

  function statCard(label, value, foot) {
    return '<div class="stat-card"><div class="stat-label">' + esc(label) + '</div><div class="stat-value">' + esc(value) + '</div><div class="stat-foot">' + esc(foot || '') + '</div></div>';
  }

  function positivePrice(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function formatUsd(value) {
    if (!Number.isFinite(value) || value < 0) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }

  function tokenKeyForAddress(value) {
    var target = address(value);
    if (!target) return '';
    var tokens = C.tokens || {};
    var keys = Object.keys(tokens);
    for (var i = 0; i < keys.length; i++) {
      var tokenAddress = configuredAddress(tokens[keys[i]].address);
      if (tokenAddress && tokenAddress.toLowerCase() === target.toLowerCase()) return keys[i];
    }
    return configuredAddress(C.tokenAddress) && configuredAddress(C.tokenAddress).toLowerCase() === target.toLowerCase() ? 'forge' : '';
  }

  function tokenDecimals(key, tokenAddress) {
    var meta = metaToken((C.tokens || {})[key], key);
    if (meta.decimals != null) return Promise.resolve(meta.decimals);
    var farms = allFarms();
    for (var i = 0; i < farms.length; i++) {
      if (tokenKey(farms[i]) === key) {
        var farmData = state.data['farm:' + Number(farms[i].pid)];
        if (farmData && Number.isInteger(farmData.decimals)) return Promise.resolve(farmData.decimals);
      }
    }
    var vaults = configuredVaults();
    for (var j = 0; j < vaults.length; j++) {
      if (vaults[j].stakingToken === key) {
        var vaultData = state.data['vault:' + String(vaults[j].sousId || vaults[j].address || '')];
        if (vaultData && Number.isInteger(vaultData.decimals)) return Promise.resolve(vaultData.decimals);
      }
    }
    if (!address(tokenAddress)) return Promise.resolve(null);
    return new E.Contract(tokenAddress, ERC20_ABI, state.rpc).decimals().then(function (value) {
      var decimals = Number(value);
      return Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : null;
    }).catch(function () { return null; });
  }

  async function readPricePair(pairConfig) {
    var pairAddress = typeof pairConfig === 'string' ? address(pairConfig) : configuredAddress(pairConfig && (pairConfig.address || pairConfig.pairAddress || pairConfig.pair));
    if (!pairAddress) return null;
    try {
      var pair = new E.Contract(pairAddress, PRICE_PAIR_ABI, state.rpc);
      var values = await Promise.all([pair.token0(), pair.token1(), pair.getReserves()]);
      var key0 = tokenKeyForAddress(values[0]);
      var key1 = tokenKeyForAddress(values[1]);
      if (!key0 || !key1 || key0 === key1) return null;
      var decimals = await Promise.all([tokenDecimals(key0, values[0]), tokenDecimals(key1, values[1])]);
      if (decimals[0] == null || decimals[1] == null) return null;
      return { key0: key0, key1: key1, decimals0: decimals[0], decimals1: decimals[1], reserve0: values[2][0], reserve1: values[2][1] };
    } catch (_) { return null; }
  }

  async function refreshUsdPrices() {
    var prices = {};
    var tokens = C.tokens || {};
    Object.keys(tokens).forEach(function (key) {
      var price = positivePrice(tokens[key] && tokens[key].priceUsd);
      if (price != null) prices[key] = price;
    });
    var pairConfigs = Array.isArray(C.pricePairs) ? C.pricePairs : [];
    var pairs = await Promise.all(pairConfigs.map(readPricePair));
    pairs = pairs.filter(Boolean);
    for (var pass = 0; pass < pairs.length; pass++) {
      var changed = false;
      pairs.forEach(function (pair) {
        var price0 = positivePrice(prices[pair.key0]);
        var price1 = positivePrice(prices[pair.key1]);
        var reserve0 = Number(E.formatUnits(pair.reserve0, pair.decimals0));
        var reserve1 = Number(E.formatUnits(pair.reserve1, pair.decimals1));
        if (!(reserve0 > 0) || !(reserve1 > 0) || !Number.isFinite(reserve0) || !Number.isFinite(reserve1)) return;
        if (price0 != null && price1 == null) {
          var derived1 = price0 * reserve0 / reserve1;
          if (Number.isFinite(derived1) && derived1 > 0) { prices[pair.key1] = derived1; changed = true; }
        } else if (price1 != null && price0 == null) {
          var derived0 = price1 * reserve1 / reserve0;
          if (Number.isFinite(derived0) && derived0 > 0) { prices[pair.key0] = derived0; changed = true; }
        }
      });
      if (!changed) break;
    }
    state.usdPrices = prices;
  }

  function homeTvl() {
    if (Number(C.chainId) === 46630) return { value: 'Testnet', foot: 'Test tokens have no monetary value' };
    if (!state.rpcReady) return { value: '—', foot: 'Waiting for live pool data' };
    var models = allFarms().map(poolModel).concat(configuredVaults().map(vaultModel));
    var totalUsd = 0;
    for (var i = 0; i < models.length; i++) {
      var model = models[i];
      if (model.error) return { value: '—', foot: 'Could not read every configured staking balance' };
      if (model.totalStaked == null) return { value: 'Loading…', foot: 'Reading live pool balances' };
      var amount = Number(E.formatUnits(model.totalStaked, model.decimals));
      if (!Number.isFinite(amount)) return { value: '—', foot: 'A pool balance could not be valued' };
      if (amount === 0) continue;
      var price = positivePrice(state.usdPrices[model.key]);
      if (price == null) return { value: 'Needs prices', foot: 'Configure USD prices for all staked assets' };
      totalUsd += amount * price;
      if (!Number.isFinite(totalUsd)) return { value: '—', foot: 'Estimated value is outside the display range' };
    }
    return { value: formatUsd(totalUsd), foot: 'Across configured pools and vaults · estimated USD value' };
  }

  function homeMarketCap() {
    if (Number(C.chainId) === 46630) return { value: 'Testnet', foot: 'Test tokens have no monetary value' };
    if (!state.stats || state.stats.supply == null) return { value: '—', foot: 'Waiting for FORGE supply data' };
    var forgeKey = tokenKeyForAddress(C.tokenAddress) || 'forge';
    var price = positivePrice(state.usdPrices[forgeKey]);
    if (price == null) return { value: 'Needs price', foot: 'Configure a FORGE USD price or price pair' };
    var supply = Number(E.formatUnits(state.stats.supply, 18));
    return { value: formatUsd(supply * price), foot: 'Total FORGE supply × estimated spot price' };
  }

  function activeRewardPools() {
    if (!state.rpcReady || !state.stats || state.stats.totalAllocPoint == null) {
      return { value: '—', foot: 'Waiting for live pool data' };
    }
    var farms = allFarms();
    if (!farms.length) return { value: '0 / 0', foot: 'No configured token or stock pools' };
    var totalAlloc = BigInt(state.stats.totalAllocPoint);
    var activeAlloc = 0n;
    var activeCount = 0;
    for (var i = 0; i < farms.length; i++) {
      var model = poolModel(farms[i]);
      if (model.error) return { value: '—', foot: 'Could not read every configured pool' };
      if (model.totalStaked == null || model.allocPoint == null) {
        return { value: 'Loading…', foot: 'Reading live pool balances' };
      }
      var allocPoint = BigInt(model.allocPoint);
      if (BigInt(model.totalStaked) > 0n && allocPoint > 0n) {
        activeCount++;
        activeAlloc += allocPoint;
      }
    }
    if (activeAlloc > totalAlloc) return { value: '—', foot: 'Live pool allocation data is inconsistent' };
    var percentage = totalAlloc === 0n ? 0 : Number(activeAlloc * 10000n / totalAlloc) / 100;
    return {
      value: activeCount + ' / ' + farms.length,
      foot: comma(percentage, 2) + '% of total FORGE allocation is in pools with stakers'
    };
  }

  function renderHome() {
    var stats = state.stats || {};
    var supplyValue = stats.supply == null ? '—' : units(stats.supply, 18, 2);
    var capValue = stats.cap == null ? '—' : units(stats.cap, 18, 0);
    var capFoot = stats.supply == null || stats.cap == null ? 'Live supply and cap' : comma(Number(E.formatUnits(stats.supply, 18)) / Math.max(Number(E.formatUnits(stats.cap, 18)), 1) * 100, 1) + '% of current cap';
    var emission = stats.perDay == null ? '—' : units(stats.perDay, 18, 2) + ' FORGE';
    var count = allFarms().length;
    var tvl = homeTvl();
    var marketCap = homeMarketCap();
    var activePools = activeRewardPools();
    var positions = Object.keys(state.data).map(function (key) { return state.data[key]; }).filter(function (m) { return m && m.kind === 'farm' && m.userAmount > 0n; }).slice(0, 4);
    var positionHtml = '';
    if (state.account) {
      if (positions.length) {
        positionHtml = '<section class="panel position-panel"><div class="position-head"><h2>Your positions</h2><span>Across configured pools</span></div>' + positions.map(function (m) {
          return '<div class="position-row"><div><strong>' + esc(m.token.symbol) + '</strong><div class="label">' + esc(m.token.name) + '</div></div><div><span class="label">Staked</span><br><strong>' + units(m.userAmount, m.decimals) + ' ' + esc(m.token.symbol) + '</strong></div><div><span class="label">Pending rewards</span><br><strong>' + units(m.pending, 18) + ' FORGE</strong></div><div class="position-actions"><button class="button compact ghost" data-action="open-modal" data-kind="farm" data-key="' + esc(m.id) + '" data-mode="withdraw">Withdraw</button></div></div>';
        }).join('') + '</section>';
      } else {
        positionHtml = '<section class="panel position-panel"><div class="position-head"><h2>Your positions</h2><span>Wallet connected</span></div><p class="stat-foot">No active positions found in the configured pools.</p></section>';
      }
    }
    return '<main class="page">' + testnetStrip() + stateNotice() +
      '<section class="hero"><div class="hero-inner"><div><div class="eyebrow">Robinhood Chain · YieldForge</div><h1>Put your tokens<br><span>to work.</span></h1><p class="hero-copy">A focused staking experience for the YieldForge protocol. Stake supported tokens, track your position and claim FORGE rewards from one place.</p><div class="hero-actions"><a class="button" href="/pools/">Explore token pools <span aria-hidden="true">↗</span></a><a class="button secondary" href="/stocks/">View stock pools</a></div></div><img class="hero-emblem" src="/images/tokens/forge.png" alt="YieldForge forge emblem"></div></section>' +
      '<section class="stat-grid" aria-label="Protocol statistics">' +
      statCard('Total value staked (TVL)', tvl.value, tvl.foot) +
      statCard('FORGE market cap', marketCap.value, marketCap.foot) +
      statCard('Active reward pools', activePools.value, activePools.foot) +
      statCard('FORGE supply', supplyValue + (stats.supply != null ? ' / ' + capValue : ''), capFoot) +
      statCard('Configured pools', String(count), state.rpcReady ? 'Verified against the current deployment' : 'Pool list from public configuration') +
      statCard('Emission pace', emission, 'Protocol rate · distributed by pool weight') +
      '</section>' +
      '<div class="section-heading"><div><h2>Choose your staking route</h2><p>Every pool uses a single supported token.</p></div></div>' +
      '<section class="feature-grid">' +
      '<a class="panel feature-card" href="/pools/"><span class="feature-icon">◈</span><span class="arrow">↗</span><h3>Token staking</h3><p>Browse configured crypto-token pools and manage deposits, withdrawals and FORGE rewards.</p></a>' +
      '<a class="panel feature-card" href="/stocks/"><span class="feature-icon">▥</span><span class="arrow">↗</span><h3>Stock staking</h3><p>Stake supported Robinhood stock tokens. Deposits are accounted for in ERC-20 token units.</p></a>' +
      '<a class="panel feature-card" href="/staking/"><span class="feature-icon">⌁</span><span class="arrow">↗</span><h3>Vaults</h3><p>See separately configured reward vaults and the assets each one accepts.</p></a>' +
      '</section>' + positionHtml + footer() + '</main>';
  }

  function poolModel(farm) {
    var key = tokenKey(farm);
    var token = metaToken(tokenFor(farm), key);
    var id = String(Number(farm.pid));
    var live = state.data['farm:' + id] || {};
    return {
      kind: 'farm', id: id, key: key, farm: farm, token: token,
      decimals: live.decimals != null ? live.decimals : (token.decimals == null ? 18 : token.decimals),
      totalStaked: live.totalStaked, allocPoint: live.allocPoint,
      forgePerSec: live.forgePerSec, totalAllocPoint: live.totalAllocPoint,
      userAmount: live.userAmount, pending: live.pending,
      balance: live.balance, allowance: live.allowance, fee: live.fee != null ? live.fee : Number(farm.depositFeeBP || 0),
      error: live.error || ''
    };
  }

  function vaultModel(vault) {
    var key = String(vault.sousId || vault.address || '');
    var tokenKeyName = String(vault.stakingToken || '');
    var rewardKey = String(vault.earningToken || 'forge');
    var stakeToken = metaToken((C.tokens || {})[tokenKeyName], tokenKeyName);
    var rewardToken = metaToken((C.tokens || {})[rewardKey], rewardKey);
    var live = state.data['vault:' + key] || {};
    return { kind: 'vault', id: key, key: tokenKeyName, vault: vault, token: stakeToken, rewardToken: rewardToken,
      decimals: live.decimals != null ? live.decimals : (stakeToken.decimals == null ? 18 : stakeToken.decimals),
      totalStaked: live.totalStaked, userAmount: live.userAmount, pending: live.pending,
      balance: live.balance, allowance: live.allowance, fee: 0, error: live.error || '' };
  }

  function annualRewardRate(model) {
    if (model.kind !== 'farm' || model.totalStaked == null || model.allocPoint == null ||
        model.forgePerSec == null || model.totalAllocPoint == null) return '—';
    try {
      var totalStaked = BigInt(model.totalStaked);
      var allocPoint = BigInt(model.allocPoint);
      var totalAllocPoint = BigInt(model.totalAllocPoint);
      var forgePerSec = BigInt(model.forgePerSec);
      if (totalStaked === 0n) return 'Awaiting stake';
      if (allocPoint === 0n || totalAllocPoint === 0n || forgePerSec === 0n) return '0';
      var tokenScale = 10n ** BigInt(model.decimals);
      var rate = (forgePerSec * allocPoint * 31536000n * tokenScale) / (totalAllocPoint * totalStaked);
      return units(rate, 18, 4);
    } catch (_) { return '—'; }
  }

  function card(model) {
    var isVault = model.kind === 'vault';
    var rewardSymbol = isVault ? model.rewardToken.symbol : (C.tokenSymbol || 'FORGE');
    var staked = model.totalStaked == null ? '—' : units(model.totalStaked, model.decimals) + ' ' + model.token.symbol;
    var user = state.account ? (model.userAmount == null ? '—' : units(model.userAmount, model.decimals) + ' ' + model.token.symbol) : 'Connect wallet';
    var pending = state.account ? (model.pending == null ? '—' : units(model.pending, isVault ? (model.rewardToken.decimals || 18) : 18) + ' ' + rewardSymbol) : 'Connect wallet';
    var badgeClass = isStock(model.token) ? 'tag stock-chip' : 'fee-chip';
    var badge = isVault ? 'Vault' : (Number(model.fee) ? (Number(model.fee) / 100) + '% deposit fee' : 'No deposit fee');
    var mode = state.account && model.userAmount > 0n ? 'withdraw' : 'stake';
    var idAttr = ' data-kind="' + esc(model.kind) + '" data-key="' + esc(model.id) + '"';
    var rate = annualRewardRate(model);
    var rateTitle = 'Estimated annual FORGE rewards per one staked token, using current on-chain emissions, pool allocation and total stake. Assumes these values continue; this is not a USD APR.';
    return '<article class="pool-card' + (isVault ? '' : ' has-rate') + '">' +
      '<div class="asset-cell">' + icon(model.key) + '<div class="token-copy"><div class="token-symbol">' + esc(model.token.symbol) + ' <span class="' + badgeClass + '">' + esc(badge) + '</span></div><div class="token-name">' + esc(model.token.name) + (isVault ? ' · earns ' + esc(rewardSymbol) : '') + '</div></div></div>' +
      (isVault ? '' : '<div class="metric-col reward-rate-col" title="' + esc(rateTitle) + '"><div class="metric-label">Est. FORGE / token / yr</div><div class="metric-value">' + esc(rate) + '</div></div>') +
      '<div class="metric-col"><div class="metric-label">Total staked</div><div class="metric-value">' + esc(staked) + '</div></div>' +
      '<div class="metric-col stake-position-col"><div class="metric-label">Your stake</div><div class="metric-value dim">' + esc(user) + '</div></div>' +
      '<div class="metric-col pending-col"><div class="metric-label">' + (isVault ? 'Pending reward' : 'Pending FORGE') + '</div><div class="metric-value">' + esc(pending) + '</div></div>' +
      '<div class="card-actions">' +
      (state.account && model.pending > 0n ? '<button class="button compact ghost" data-action="harvest"' + idAttr + '>Claim</button>' : '') +
      (state.account && model.userAmount > 0n ? '<button class="button compact ghost" data-action="open-modal"' + idAttr + ' data-mode="withdraw">Withdraw</button>' : '') +
      '<button class="button compact" data-action="open-modal"' + idAttr + ' data-mode="' + (mode === 'withdraw' ? 'stake' : 'stake') + '">Stake</button>' +
      '</div>' + (model.error ? '<div class="metric-col" style="grid-column:1/-1;color:#ff9292">' + esc(model.error) + '</div>' : '') +
      '</article>';
  }

  function poolPage() {
    var stock = state.route === 'stocks';
    var list = visibleFarms().map(poolModel);
    var hasPools = list.length > 0;
    var searchText = state.query.toLowerCase().trim();
    if (searchText) list = list.filter(function (m) { return (m.token.symbol + ' ' + m.token.name).toLowerCase().indexOf(searchText) >= 0; });
    var cards = list.map(card).join('');
    var empty = !list.length ? '<div class="empty-state"><div class="empty-mark">' + (stock ? '▥' : '◈') + '</div><h2>' + (searchText ? 'No matching pools' : (stock ? 'No stock pools configured' : 'No token pools configured')) + '</h2><p>' + (searchText ? 'Try another token symbol or name.' : (stock ? 'This deployment has no stock-token pools configured. Once a pool is added to the public configuration and deployed on this chain, it will appear here.' : 'This deployment has no crypto-token pools configured beyond any pools shown in the current network configuration.')) + '</p>' + (stock ? '<a class="button compact ghost" href="/pools/">Browse token staking</a>' : '') + '</div>' : cards;
    var headers = stock ? 'Stake supported Robinhood stock tokens. Amounts are ERC-20 token units; stock multipliers do not change your deposited principal.' : 'Deposit a supported token to earn FORGE. Pool and fee details are checked against the configured contract.';
    var warning = stock ? 'Stock tokens use ERC-20 token units. This interface never converts your deposit to underlying share quantities.' : 'Deposit fees are shown before approval. Withdrawals do not incur a deposit fee.';
    var rateNote = 'Estimated annual rates use current on-chain FORGE emissions, pool allocation and total stake. They assume these values continue, are denominated in FORGE per staked token, and are not USD APRs.';
    return '<main class="page">' + testnetStrip() + stateNotice() +
      '<div class="page-title-row"><div><div class="eyebrow">YieldForge · Robinhood Chain</div><h1>' + (stock ? 'Stock staking' : 'Token staking') + '</h1><p>' + headers + '</p></div><div class="page-title-actions">' +
      (hasPools ? '<input class="search" id="pool-search" type="search" value="' + esc(state.query) + '" placeholder="Search tokens" aria-label="Search tokens">' : '') + '</div></div>' +
      '<div class="info-strip"><span class="info-icon">i</span><span>' + esc(warning + ' ' + rateNote) + '</span></div>' +
      '<section class="pool-list" aria-label="' + (stock ? 'Stock staking pools' : 'Token staking pools') + '">' + (state.loading && !list.length ? '<div class="status-panel"><p>Reading configured pools from Robinhood Chain…</p></div>' : empty) + '</section>' + footer() + '</main>';
  }

  function vaultPage() {
    var vaults = configuredVaults();
    var hasVaults = vaults.length > 0;
    var list = vaults.map(vaultModel).filter(function (m) {
      if (!state.query) return true;
      return (m.token.symbol + ' ' + m.token.name + ' ' + m.rewardToken.symbol).toLowerCase().indexOf(state.query.toLowerCase()) >= 0;
    });
    return '<main class="page">' + testnetStrip() + stateNotice() +
      '<div class="page-title-row"><div><div class="eyebrow">YieldForge · Separate reward contracts</div><h1>Vaults</h1><p>Standalone pre-funded vaults with their own staking and reward contracts.</p></div>' +
      (hasVaults ? '<div class="page-title-actions"><input class="search" id="pool-search" type="search" value="' + esc(state.query) + '" placeholder="Search vaults" aria-label="Search vaults"></div>' : '') + '</div>' +
      '<div class="info-strip"><span class="info-icon">i</span><span>Vault rewards come from each vault contract and are separate from MasterChef pool emissions.</span></div>' +
      '<section class="pool-list" aria-label="Configured vaults">' + (list.length ? list.map(card).join('') : '<div class="empty-state"><div class="empty-mark">⌁</div><h2>No vaults configured</h2><p>This deployment currently has no separate reward vaults. When a verified vault is added to the public configuration, it will appear here with its own stake, withdraw and claim controls.</p></div>') + '</section>' + footer() + '</main>';
  }

  function render() {
    if (!root) return;
    var page = state.route === 'home' ? renderHome() : (state.route === 'vaults' ? vaultPage() : poolPage());
    root.innerHTML = header() + page;
  }

  function messageForError(error) {
    var msg = String(error && (error.shortMessage || error.reason || error.message) || error || 'Unknown error');
    if (/user rejected|user denied|rejected the request/i.test(msg)) return 'Request cancelled in wallet.';
    if (/insufficient funds/i.test(msg)) return 'This wallet does not have enough ETH for network gas.';
    if (/network changed|chain changed/i.test(msg)) return 'The wallet network changed. Reconnect and try again.';
    return msg.split('\n')[0].slice(0, 220);
  }

  function toast(text, hash) {
    if (!toastRoot) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text + ' ';
    var url = explorerTx(hash);
    if (url) {
      var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'View transaction ↗';
      el.appendChild(a);
    }
    toastRoot.replaceChildren(el);
    window.setTimeout(function () { if (el.parentNode) el.remove(); }, 6500);
  }

  function discoverProvider() {
    if (state.injected) return Promise.resolve(state.injected);
    return new Promise(function (resolve) {
      var found = [];
      function onAnnounce(event) {
        if (event.detail && event.detail.provider && typeof event.detail.provider.request === 'function') found.push(event.detail);
      }
      window.addEventListener('eip6963:announceProvider', onAnnounce);
      window.dispatchEvent(new Event('eip6963:requestProvider'));
      window.setTimeout(function () {
        window.removeEventListener('eip6963:announceProvider', onAnnounce);
        var meta = found.find(function (x) { return x.info && x.info.rdns === 'io.metamask'; });
        state.injected = (meta && meta.provider) || (found[0] && found[0].provider) || window.ethereum || null;
        resolve(state.injected);
      }, 250);
    });
  }

  async function switchWalletNetwork(provider) {
    var wanted = Number(C.chainId);
    if (!wanted) throw new Error('The configured chain ID is missing.');
    var actual = Number(BigInt(await provider.request({ method: 'eth_chainId' })));
    if (actual === wanted) return;
    var hex = '0x' + BigInt(wanted).toString(16);
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    } catch (error) {
      var code = error && (error.code || (error.data && error.data.originalError && error.data.originalError.code));
      if (Number(code) !== 4902) throw error;
      var network = { chainId: hex, chainName: C.chainName || 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [C.rpcUrl] };
      if (C.explorerUrl) network.blockExplorerUrls = [C.explorerUrl];
      await provider.request({ method: 'wallet_addEthereumChain', params: [network] });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    }
    actual = Number(BigInt(await provider.request({ method: 'eth_chainId' })));
    if (actual !== wanted) throw new Error('Select ' + (C.chainName || 'the configured Robinhood network') + ' in your wallet.');
  }

  async function connectWallet() {
    if (!C.enabled) throw new Error('The current public configuration is disabled.');
    var provider = await discoverProvider();
    if (!provider) throw new Error('No browser wallet found. Open this site in a browser with an EIP-1193 wallet installed.');
    var accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts.length) throw new Error('The wallet did not return an account.');
    await switchWalletNetwork(provider);
    state.injected = provider;
    state.account = accounts[0];
    var browserProvider = new E.BrowserProvider(provider, 'any');
    state.signer = await browserProvider.getSigner(state.account);
    if (typeof provider.on === 'function') {
      provider.on('accountsChanged', function (next) {
        state.account = next && next[0] ? next[0] : '';
        state.signer = null;
        state.data = {};
        render();
        refreshVisibleData();
      });
      provider.on('chainChanged', function () { window.location.reload(); });
    }
    render();
    await refreshVisibleData();
    toast('Wallet connected.');
  }

  async function requireSigner() {
    if (!state.account || !state.injected) await connectWallet();
    await switchWalletNetwork(state.injected);
    var p = new E.BrowserProvider(state.injected, 'any');
    state.signer = await p.getSigner(state.account);
    return state.signer;
  }

  function farmConfigsForCurrentView() {
    if (state.route === 'home') return allFarms();
    if (state.route === 'stocks' || state.route === 'pools') return visibleFarms();
    return [];
  }

  function mapLimit(list, limit, task) {
    var index = 0;
    var workers = Array.from({ length: Math.min(limit, list.length) }, async function () {
      while (index < list.length) {
        var current = index++;
        await task(list[current]);
      }
    });
    return Promise.all(workers);
  }

  async function loadFarm(farm) {
    var id = String(Number(farm.pid));
    var key = tokenKey(farm);
    var meta = metaToken(tokenFor(farm), key);
    try {
      var stakeAddress = meta.address;
      if (!stakeAddress) throw new Error('Token contract address is missing.');
      var contract = new E.Contract(stakeAddress, ERC20_ABI, state.rpc);
      var info = await state.chef.poolInfo(Number(farm.pid));
      if (String(info[0]).toLowerCase() !== stakeAddress.toLowerCase()) throw new Error('Stake-token address differs from the deployed pool.');
      var fee = Number(info[4]);
      if (farm.depositFeeBP != null && fee !== Number(farm.depositFeeBP)) throw new Error('Deposit fee differs from the public configuration.');
      var decimals = meta.decimals;
      if (decimals == null || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) decimals = Number(await contract.decimals());
      var model = { kind: 'farm', id: id, key: key, farm: farm, token: meta, decimals: decimals,
        totalStaked: info[5], allocPoint: info[1], forgePerSec: state.stats && state.stats.perSec,
        totalAllocPoint: state.stats && state.stats.totalAllocPoint,
        fee: fee, userAmount: 0n, pending: 0n, balance: 0n, allowance: 0n };
      if (state.account) {
        var results = await Promise.all([
          state.chef.userInfo(Number(farm.pid), state.account),
          state.chef.pendingForge(Number(farm.pid), state.account),
          contract.balanceOf(state.account),
          contract.allowance(state.account, C.masterChefAddress)
        ]);
        model.userAmount = results[0][0]; model.pending = results[1]; model.balance = results[2]; model.allowance = results[3];
      }
      state.data['farm:' + id] = model;
    } catch (error) {
      state.data['farm:' + id] = { kind: 'farm', id: id, key: key, farm: farm, token: meta, decimals: meta.decimals || 18, error: messageForError(error), userAmount: 0n, pending: 0n, fee: Number(farm.depositFeeBP || 0) };
    }
  }

  async function loadVault(vault) {
    var id = String(vault.sousId || vault.address || '');
    var key = String(vault.stakingToken || '');
    var rewardKey = String(vault.earningToken || 'forge');
    var stakeToken = metaToken((C.tokens || {})[key], key);
    var rewardToken = metaToken((C.tokens || {})[rewardKey], rewardKey);
    try {
      var vaultAddress = configuredAddress(vault.address);
      var tokenContract = new E.Contract(stakeToken.address, ERC20_ABI, state.rpc);
      var contract = new E.Contract(vaultAddress, VAULT_ABI, state.rpc);
      var pair = await Promise.all([contract.totalStaked(), contract.rewardPerSec()]);
      var decimals = stakeToken.decimals;
      if (decimals == null) decimals = Number(await tokenContract.decimals());
      var model = { kind: 'vault', id: id, key: key, vault: vault, token: stakeToken, rewardToken: rewardToken, decimals: decimals, totalStaked: pair[0], rewardPerSec: pair[1], userAmount: 0n, pending: 0n, balance: 0n, allowance: 0n, fee: 0 };
      if (state.account) {
        var results = await Promise.all([contract.userInfo(state.account), contract.pendingReward(state.account), tokenContract.balanceOf(state.account), tokenContract.allowance(state.account, vaultAddress)]);
        model.userAmount = results[0][0]; model.pending = results[1]; model.balance = results[2]; model.allowance = results[3];
      }
      state.data['vault:' + id] = model;
    } catch (error) {
      state.data['vault:' + id] = { kind: 'vault', id: id, key: key, vault: vault, token: stakeToken, rewardToken: rewardToken, decimals: stakeToken.decimals || 18, error: messageForError(error), userAmount: 0n, pending: 0n, fee: 0 };
    }
  }

  async function refreshVisibleData() {
    if (!state.rpcReady || !C.enabled) return;
    var farms = farmConfigsForCurrentView();
    var vaults = (state.route === 'vaults' || state.route === 'home') ? configuredVaults() : [];
    if (!farms.length && !vaults.length && state.route !== 'home') { render(); return; }
    state.loading = true; render();
    await mapLimit(farms, 4, loadFarm);
    await mapLimit(vaults, 3, loadVault);
    if (state.route === 'home') await refreshUsdPrices();
    state.loading = false; render();
    if (state.modal) drawModal();
  }

  async function validateDeployment() {
    if (C.enabled !== true) { state.rpcError = ''; state.startupWarning = 'Launch configuration is disabled.'; render(); return; }
    if (!E) throw new Error('Wallet library failed to load. Refresh the page.');
    if (!Number(C.chainId) || !C.rpcUrl) throw new Error('The public configuration is missing a chain ID or RPC URL.');
    var tokenAddress = configuredAddress(C.tokenAddress);
    var chefAddress = configuredAddress(C.masterChefAddress);
    if (!tokenAddress || !chefAddress) throw new Error('The public configuration is missing contract addresses.');
    state.rpc = new E.JsonRpcProvider(C.rpcUrl, { chainId: Number(C.chainId), name: C.chainName || 'robinhood' });
    state.chef = new E.Contract(chefAddress, CHEF_ABI, state.rpc);
    state.forge = new E.Contract(tokenAddress, ERC20_ABI, state.rpc);
    var network = await state.rpc.getNetwork();
    if (Number(network.chainId) !== Number(C.chainId)) throw new Error('The configured RPC returned a different chain ID.');
    var code = await Promise.all([state.rpc.getCode(tokenAddress), state.rpc.getCode(chefAddress)]);
    if (code[0] === '0x' || code[1] === '0x') throw new Error('No Forge or MasterChef contract was found at the configured address.');
    var checks = await Promise.all([state.forge.owner(), state.chef.forge(), state.chef.poolLength(), state.chef.maxSupply(), state.chef.forgePerSec(), state.forge.totalSupply(), state.chef.totalAllocPoint(), state.chef.startTimestamp()]);
    if (String(checks[0]).toLowerCase() !== chefAddress.toLowerCase()) throw new Error('FORGE ownership has not been transferred to the configured MasterChef contract.');
    if (String(checks[1]).toLowerCase() !== tokenAddress.toLowerCase()) throw new Error('MasterChef is configured with a different FORGE token.');
    var farms = allFarms();
    if (Array.isArray(C.farms) && C.farms.length !== farms.length) throw new Error('The public configuration includes an unsupported or invalid pool. Only single-token pools are supported.');
    var length = Number(checks[2]);
    var pidSet = new Set();
    for (var i = 0; i < farms.length; i++) {
      var f = farms[i];
      if (pidSet.has(Number(f.pid)) || Number(f.pid) >= length) throw new Error('Configured pool IDs do not match the deployed MasterChef pool count.');
      pidSet.add(Number(f.pid));
    }
    state.stats = { supply: checks[5], cap: checks[3], perSec: checks[4], perDay: checks[4] * 86400n, totalAllocPoint: checks[6], startTimestamp: checks[7] };
    state.rpcReady = true;
    state.rpcError = '';
    state.startupWarning = '';
    await mapLimit(farms, 4, async function (farm) {
      var info = await state.chef.poolInfo(Number(farm.pid));
      var token = metaToken(tokenFor(farm), tokenKey(farm));
      if (!token.address || String(info[0]).toLowerCase() !== token.address.toLowerCase()) throw new Error('Configured token does not match deployed pool ' + farm.pid + '.');
      if (farm.depositFeeBP != null && Number(info[4]) !== Number(farm.depositFeeBP)) throw new Error('Configured fee does not match deployed pool ' + farm.pid + '.');
    });
  }

  function modalItem() {
    if (!state.modal) return null;
    var m = state.modal;
    if (m.kind === 'farm') return poolModel((C.farms || []).find(function (f) { return String(Number(f.pid)) === String(m.id); }));
    var v = (C.vaults || []).find(function (x) { return String(x.sousId || x.address) === String(m.id); });
    return v ? vaultModel(v) : null;
  }

  function parseModalAmount(item) {
    var input = document.getElementById('modal-amount');
    if (!input || !input.value.trim()) return null;
    try { return E.parseUnits(input.value.trim(), item.decimals); } catch (_) { return null; }
  }

  function modalDescription(m, item) {
    var isWithdraw = m.mode === 'withdraw';
    if (isWithdraw) return 'Withdraw the selected amount from your position. Withdrawals do not have a deposit fee.';
    if (item.kind === 'vault') return 'Deposit ' + item.token.symbol + ' into this vault. Rewards are paid by the separate vault contract.';
    return 'Deposit ' + item.token.symbol + ' into the configured MasterChef pool and earn FORGE rewards.';
  }

  function updateModalSummary() {
    if (!state.modal) return;
    var item = modalItem();
    if (!item) return;
    var amount = parseModalAmount(item);
    var isWithdraw = state.modal.mode === 'withdraw';
    var feeBps = isWithdraw ? 0 : Number(item.fee || 0);
    var fee = amount == null ? null : amount * BigInt(feeBps) / 10000n;
    var received = amount == null ? null : amount - fee;
    var balance = isWithdraw ? item.userAmount : item.balance;
    var exceeds = amount != null && balance != null && amount > balance;
    var allowance = item.allowance || 0n;
    var needsApproval = !isWithdraw && amount != null && allowance < amount;
    var button = document.getElementById('modal-primary');
    var sub = document.getElementById('modal-summary');
    var note = document.getElementById('modal-note');
    if (sub) {
      if (isWithdraw) sub.innerHTML = '<div class="detail-row"><span>Available to withdraw</span><strong>' + esc(units(item.userAmount, item.decimals) + ' ' + item.token.symbol) + '</strong></div><div class="detail-row"><span>Estimated fee</span><strong>None</strong></div>';
      else sub.innerHTML = '<div class="detail-row"><span>Deposit fee</span><strong>' + esc(feeBps ? (feeBps / 100) + '%' : 'None') + '</strong></div><div class="detail-row"><span>Estimated fee amount</span><strong>' + esc(fee == null ? '—' : units(fee, item.decimals) + ' ' + item.token.symbol) + '</strong></div><div class="detail-row"><span>Estimated credited amount</span><strong>' + esc(received == null ? '—' : units(received, item.decimals) + ' ' + item.token.symbol) + '</strong></div>';
    }
    if (button) {
      button.textContent = !state.account ? 'Connect wallet' : (exceeds ? 'Amount exceeds balance' : (needsApproval ? 'Approve ' + item.token.symbol : (isWithdraw ? 'Confirm withdrawal' : 'Confirm stake')));
      button.disabled = !state.account ? !!state.modal.busy : (amount == null || amount <= 0n || exceeds || !!item.error || !state.rpcReady || state.modal.busy);
    }
    if (note && !state.modal.busy && !state.modal.status) note.textContent = item.error || (!state.rpcReady ? 'The configured chain is not ready. Transactions are paused.' : (state.account ? '' : 'Connect your wallet to continue.'));
  }

  function drawModal() {
    if (!state.modal) { modalRoot.innerHTML = ''; return; }
    var item = modalItem();
    if (!item) { modalRoot.innerHTML = ''; state.modal = null; return; }
    var isWithdraw = state.modal.mode === 'withdraw';
    var balance = isWithdraw ? item.userAmount : item.balance;
    var balanceLabel = isWithdraw ? 'Available' : 'Wallet balance';
    var rewardSymbol = item.kind === 'vault' ? item.rewardToken.symbol : (C.tokenSymbol || 'FORGE');
    modalRoot.innerHTML = '<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><div class="modal-kicker">' + (isWithdraw ? 'Position management' : 'YieldForge staking') + '</div><h2 id="modal-title">' + (isWithdraw ? 'Withdraw ' : 'Stake ') + esc(item.token.symbol) + '</h2></div><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div><div class="modal-body"><p class="hero-copy" style="font-size:12px;margin:0 0 18px">' + esc(modalDescription(state.modal, item)) + '</p><div class="balance-line"><span>' + balanceLabel + ': ' + esc(balance == null ? '—' : units(balance, item.decimals) + ' ' + item.token.symbol) + '</span><button type="button" data-action="max-amount">MAX</button></div><div class="amount-wrap"><input id="modal-amount" class="amount-input" inputmode="decimal" autocomplete="off" type="text" placeholder="0.00"><span class="amount-token">' + esc(item.token.symbol) + '</span></div><div class="amount-details" id="modal-summary"></div><div class="modal-actions"><button id="modal-primary" class="button" data-action="modal-primary">Connect wallet</button></div><p id="modal-note" class="tx-note" role="status">' + esc(state.modal.status || '') + '</p><div class="detail-row" style="margin-top:5px"><span>Reward asset</span><strong>' + esc(rewardSymbol) + '</strong></div></div></section></div>';
    updateModalSummary();
  }

  function setModalStatus(text, type) {
    if (!state.modal) return;
    state.modal.status = text;
    state.modal.busy = type === 'busy';
    var note = document.getElementById('modal-note');
    if (note) { note.textContent = text; note.className = 'tx-note' + (type === 'error' ? ' error' : (type === 'success' ? ' success' : '')); }
    updateModalSummary();
  }

  function currentInputValue() {
    var input = document.getElementById('modal-amount');
    return input ? input.value : '';
  }

  async function sendWithMargin(contract, method, args) {
    var fn = contract[method];
    var estimate = await fn.estimateGas(...args);
    var gasLimit = estimate * 125n / 100n + 50000n;
    return fn(...args, { gasLimit: gasLimit });
  }

  async function runModalPrimary() {
    if (!state.modal) return;
    if (!state.account) { try { await connectWallet(); } catch (e) { setModalStatus(messageForError(e), 'error'); } return; }
    var item = modalItem();
    var amount = parseModalAmount(item);
    if (!amount || amount <= 0n) { setModalStatus('Enter an amount greater than zero.', 'error'); return; }
    var isWithdraw = state.modal.mode === 'withdraw';
    var inputText = currentInputValue().trim();
    var spender = item.kind === 'vault' ? configuredAddress(item.vault.address) : C.masterChefAddress;
    var tokenContract = new E.Contract(item.token.address, ERC20_ABI, await requireSigner());
    if (!isWithdraw && (item.allowance || 0n) < amount) {
      state.modal.busy = true; setModalStatus('Waiting for wallet approval…', 'busy');
      try {
        var approveTx = await sendWithMargin(tokenContract, 'approve', [spender, amount]);
        setModalStatus('Approval sent. Waiting for confirmation…', 'busy');
        await approveTx.wait();
        setModalStatus('Approval confirmed. You can now stake.', 'success');
        await refreshVisibleData();
        state.modal.status = 'Approval confirmed. You can now stake.'; state.modal.busy = false;
        drawModal();
        var input = document.getElementById('modal-amount'); if (input) input.value = inputText;
        updateModalSummary();
      } catch (error) { setModalStatus(messageForError(error), 'error'); }
      return;
    }
    state.modal.busy = true; setModalStatus(isWithdraw ? 'Waiting for wallet confirmation…' : 'Waiting for wallet confirmation…', 'busy');
    try {
      var tx;
      if (item.kind === 'vault') {
        var vaultContract = new E.Contract(configuredAddress(item.vault.address), VAULT_ABI, await requireSigner());
        tx = await sendWithMargin(vaultContract, isWithdraw ? 'withdraw' : 'deposit', [amount]);
      } else {
        var chef = new E.Contract(C.masterChefAddress, CHEF_ABI, await requireSigner());
        tx = await sendWithMargin(chef, isWithdraw ? 'withdraw' : 'deposit', [Number(item.id), amount]);
      }
      setModalStatus('Transaction sent. Waiting for confirmation…', 'busy');
      await tx.wait();
      state.modal = null; drawModal();
      await refreshVisibleData();
      toast(isWithdraw ? 'Withdrawal confirmed.' : 'Stake confirmed.', tx.hash);
    } catch (error) { setModalStatus(messageForError(error), 'error'); }
  }

  async function harvest(kind, id) {
    try {
      var signer = await requireSigner();
      var tx;
      if (kind === 'vault') {
        var vault = (C.vaults || []).find(function (v) { return String(v.sousId || v.address) === String(id); });
        if (!vault) throw new Error('Vault is no longer in the public configuration.');
        tx = await sendWithMargin(new E.Contract(configuredAddress(vault.address), VAULT_ABI, signer), 'deposit', [0n]);
      } else {
        tx = await sendWithMargin(new E.Contract(C.masterChefAddress, CHEF_ABI, signer), 'deposit', [Number(id), 0n]);
      }
      toast('Claim transaction sent.');
      await tx.wait();
      await refreshVisibleData();
      toast('Rewards claimed.', tx.hash);
    } catch (error) { toast(messageForError(error)); }
  }

  function openModal(kind, id, mode) {
    if (!state.rpcReady) { toast(state.rpcError || 'The configured Robinhood deployment is not ready yet.'); return; }
    state.modal = { kind: kind, id: String(id), mode: mode === 'withdraw' ? 'withdraw' : 'stake', status: '', busy: false };
    drawModal();
    window.setTimeout(function () { var input = document.getElementById('modal-amount'); if (input) input.focus(); }, 40);
  }

  function handleRootClick(event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');
    if (action === 'connect') {
      connectWallet().catch(function (error) { toast(messageForError(error)); });
    } else if (action === 'open-modal') {
      openModal(button.getAttribute('data-kind'), button.getAttribute('data-key'), button.getAttribute('data-mode'));
    } else if (action === 'harvest') {
      harvest(button.getAttribute('data-kind'), button.getAttribute('data-key'));
    }
  }

  function handleModalClick(event) {
    var el = event.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'close-modal' && (el === event.target || el.classList.contains('close-button'))) { state.modal = null; drawModal(); }
    if (action === 'max-amount') {
      var item = modalItem(); var input = document.getElementById('modal-amount');
      var amount = state.modal.mode === 'withdraw' ? item.userAmount : item.balance;
      if (input && amount != null) { input.value = E.formatUnits(amount, item.decimals); updateModalSummary(); }
    }
    if (action === 'modal-primary') runModalPrimary().catch(function (error) { setModalStatus(messageForError(error), 'error'); });
  }

  function handleInput(event) {
    if (event.target && event.target.id === 'pool-search') {
      state.query = event.target.value || '';
      var value = event.target.value;
      var start = event.target.selectionStart;
      render();
      var replacement = document.getElementById('pool-search');
      if (replacement) { replacement.focus(); replacement.value = value; try { replacement.setSelectionRange(start, start); } catch (_) {} }
    } else if (event.target && event.target.id === 'modal-amount') {
      updateModalSummary();
    }
  }

  async function start() {
    if (!E) { state.rpcError = 'The wallet library failed to load. Refresh the page and check the deployed static files.'; render(); return; }
    render();
    try {
      await validateDeployment();
      render();
      await refreshVisibleData();
      if (state.refreshTimer) window.clearInterval(state.refreshTimer);
      state.refreshTimer = window.setInterval(function () {
        if (!document.hidden && state.rpcReady) {
          Promise.all([state.forge.totalSupply(), state.chef.maxSupply(), state.chef.forgePerSec(), state.chef.totalAllocPoint(), state.chef.startTimestamp()]).then(function (values) {
            state.stats = { supply: values[0], cap: values[1], perSec: values[2], perDay: values[2] * 86400n, totalAllocPoint: values[3], startTimestamp: values[4] }; render();
          }).catch(function () {});
          refreshVisibleData();
        }
      }, 30000);
    } catch (error) {
      console.error('YieldForge deployment validation:', error);
      state.rpcReady = false;
      state.rpcError = 'The configured Robinhood RPC or contract checks failed. Pool transactions are paused until the network and deployment configuration are reachable.';
      render();
    }
  }

  root.addEventListener('click', handleRootClick);
  root.addEventListener('input', handleInput);
  modalRoot.addEventListener('click', handleModalClick);
  modalRoot.addEventListener('input', handleInput);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && state.modal) { state.modal = null; drawModal(); } });
  start();
})();
