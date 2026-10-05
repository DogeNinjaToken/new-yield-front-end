/* Updated by the testnet pool tool. No private keys. */
window.ROBINHOOD_FARM = {
  "enabled": true,
  "chainId": 46630,
  "chainName": "Robinhood Chain Testnet",
  "rpcUrl": "https://rpc.testnet.chain.robinhood.com",
  "explorerUrl": "https://explorer.testnet.chain.robinhood.com",
  "tokenAddress": "0x07b8c397aBDbbD5825285F247E86992Af7594B7f",
  "masterChefAddress": "0x03B3c29Dd4C3760aA3A51BEEb6b7346FCD82D916",
  "multicallAddress": "0x9D3cB516530DcB17F1DafBD92720b6b64eDf59a6",
  "tokenSymbol": "FORGE",
  "tokenName": "Forge",
  "tokens": {
    "forge": {
      "address": "0x07b8c397aBDbbD5825285F247E86992Af7594B7f",
      "symbol": "FORGE",
      "name": "Forge",
      "decimals": 18
    },
    "cbbtc": {
      "address": "0xb2d961650DD40B75B100b11b3f5D25F34718FBCD",
      "symbol": "cbBTC",
      "name": "Coinbase Wrapped BTC",
      "decimals": 8
    }
  },
  "pricePairs": [],
  "farms": [
    {
      "pid": 0,
      "label": "FORGE",
      "token": "forge",
      "quoteToken": "forge",
      "isTokenOnly": true,
      "stakeAddress": "",
      "depositFeeBP": 100,
      "allocPoint": 100
    },
    {
      "pid": 1,
      "label": "cbBTC",
      "token": "cbbtc",
      "quoteToken": "cbbtc",
      "isTokenOnly": true,
      "stakeAddress": "",
      "depositFeeBP": 250,
      "allocPoint": 100
    }
  ],
  "vaults": [],
  "links": {
    "swap": "",
    "liquidity": "",
    "chart": "",
    "docs": "",
    "telegram": "",
    "bridge": ""
  }
};
