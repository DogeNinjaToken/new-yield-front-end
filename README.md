# YieldForge front end

This is a self-contained static front end. There is no build step and no wallet secret belongs in this repository.

## Deploy to a separate Vercel project

1. Extract the contents of this ZIP directly into the root of a new GitHub repository. `index.html`, `vercel.json`, `images/` and `static/` should be visible at the repository root.
2. Import that repository into a new Vercel project.
3. Set Framework Preset to **Other** and Root Directory to `.`. Leave the build command empty. Deploy the static files from the repository root.
4. Open `/`, `/pools/`, `/stocks/` and `/staking/` to check the pages.

The Vercel project is separate from the current site. This package does not deploy or change any contracts.

## Current public configuration

`static/js/robinhood-config.js` is copied from the supplied project. It currently targets Robinhood Chain Testnet (chain ID `46630`) and contains one configured FORGE pool. The stock, token and vault pages only show pools that are configured for this chain; empty states are expected for categories with no configured pools.

Edit that file only when the contract addresses, chain ID, pool IDs, token addresses and deposit fees have been verified to match the same deployment. Do not use Robinhood mainnet token addresses with the testnet MasterChef. `enabled` must stay false until the full deployment checks pass.

The app checks the RPC chain, contract code, FORGE ownership, MasterChef reward token, configured pool token addresses and configured deposit fees before enabling transactions. If a check fails or the RPC is unreachable, transaction buttons remain paused and the pages show an inline status message.

## Wallet and staking behaviour

- Connects through EIP-1193 and EIP-6963 browser wallets; it does not ask for or store private keys.
- Requests the configured chain in the wallet and offers to add it if the wallet does not know it.
- Requires token approval before staking, estimates deposit fees and credited token units, then sends the configured MasterChef deposit.
- Claims MasterChef rewards through `deposit(pid, 0)` and withdraws through `withdraw(pid, amount)`.
- Reads balances and pending rewards from the configured contracts. It does not invent a price, TVL or APR when a price source is absent.
- Supports optional pre-funded vault entries using the supplied TestVault interface when the public config contains them.

`static/js/ethers.umd.min.js` is ethers.js 6.16.0. Its licence is included as `ETHERS-LICENSE.md`.

## Test scope

Run `node tests/render-smoke.cjs` to check the route labels, navigation targets, stock/token separation and the legacy `/farms/` alias without any installed packages.

The attached source package has local Ganache/Chromium tests for the original compiled app. Those tests use a simulated wallet and mock token contracts; they are not a test against Robinhood's live RPC or actual production token contracts. Verify the connected wallet, token approval, a small stake, claim and withdrawal on the intended deployment before inviting users.
