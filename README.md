# YieldForge front end

This is a self-contained static front end. There is no build step and no wallet secret belongs in this repository.

## Deploy to a separate Vercel project

1. Extract the contents of this ZIP directly into the root of a new GitHub repository. `index.html`, `vercel.json`, `images/` and `static/` should be visible at the repository root.
2. Import that repository into a new Vercel project.
3. Set Framework Preset to **Other** and Root Directory to `.`. Leave the build command empty. Deploy the static files from the repository root.
4. Open `/`, `/pools/`, `/stocks/` and `/memes/` to check the pages.

The Vercel project is separate from the current site. This package does not deploy or change any contracts.

## Current public configuration

`static/js/robinhood-config.js` is copied from the supplied project. It currently targets Robinhood Chain Testnet (chain ID `46630`). The token, stock and meme pages only show single-token MasterChef pools configured for this chain; empty states are expected for categories with no configured pools. Tag meme-token metadata with `assetType: "meme"` and stock-token metadata with `assetType: "stock"`. Untagged tokens appear under Token Staking.

Edit that file only when the contract addresses, chain ID, pool IDs, token addresses and deposit fees have been verified to match the same deployment. Do not use Robinhood mainnet token addresses with the testnet MasterChef. `enabled` must stay false until the full deployment checks pass.

The app checks the RPC chain, contract code, FORGE ownership, MasterChef reward token, configured pool token addresses and configured deposit fees before enabling transactions. If a check fails or the RPC is unreachable, transaction buttons remain paused and the pages show an inline status message.

## Wallet and staking behaviour

- Connects through EIP-1193 and EIP-6963 browser wallets; it does not ask for or store private keys.
- Requests the configured chain in the wallet and offers to add it if the wallet does not know it.
- Requires token approval before staking, estimates deposit fees and credited token units, then sends the configured MasterChef deposit.
- Claims MasterChef rewards through `deposit(pid, 0)` and withdraws through `withdraw(pid, amount)`.
- Reads balances and pending rewards from the configured contracts. It does not invent a price, TVL or APR when a price source is absent.
- Meme tokens use the same ERC-20 approval, MasterChef stake, claim and withdrawal flow as other single-token pools. No separate vault contract is needed.

`static/js/ethers.umd.min.js` is ethers.js 6.16.0. Its licence is included as `ETHERS-LICENSE.md`.

## Test scope

Run `node tests/render-smoke.cjs` to check route labels, navigation targets, category separation, the meme-pool request email and the legacy `/farms/` stock alias without installed packages.

The attached source package has local Ganache/Chromium tests for the original compiled app. Those tests use a simulated wallet and mock token contracts; they are not a test against Robinhood's live RPC or actual production token contracts. Verify the connected wallet, token approval, a small stake, claim and withdrawal on the intended deployment before inviting users.
