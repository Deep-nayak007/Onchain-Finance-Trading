// Verbatim fragment of Perpl's Exchange ABI (read-only views Brain uses for live market signals).
// Source: https://github.com/PerplFoundation/dex-sdk/blob/78ce8a06e39e/crates/sdk/abi/dex/Exchange.json
// TODO(Rails): export the full Exchange ABI from packages/shared/abis and switch this import to it.
export const perplExchangeViewsAbi = [
  {
    "type": "function",
    "name": "getExchangeInfo",
    "inputs": [],
    "outputs": [
      {
        "name": "balanceCNS",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "protocolBalanceCNS",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "recycleBalanceCNS",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "collateralDecimals",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "collateralToken",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "verifierProxy",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPerpetualInfoV2",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "perpetualInfo",
        "type": "tuple",
        "internalType": "struct PerpetualInfoV2",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "priceDecimals",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lotDecimals",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "linkFeedId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "priceTolPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "marginTol",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "marginTolDecimals",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "refPriceMaxAgeSec",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "positionBalanceCNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "insuranceBalanceCNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "markPNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "markTimestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lastPNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lastTimestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "oraclePNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "oracleTimestampSec",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "longOpenInterestLNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "shortOpenInterestLNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fundingStartBlock",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fundingRatePct100k",
            "type": "int16",
            "internalType": "int16"
          },
          {
            "name": "absFundingClampPctPer100K",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum PerpStatusEnum"
          },
          {
            "name": "basePricePNS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxBidPriceONS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minBidPriceONS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxAskPriceONS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minAskPriceONS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "numOrders",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "ignOracle",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "fundingSumScalingExp",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  }
] as const;
