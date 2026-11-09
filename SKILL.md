# Agentmarket CLI — skill

Operational guide for agents using `@agentmarket/cli` 0.1.0. The CLI serves gated
NFT collections and the Agentmarket venue on BSC. It is non-custodial and
preview-based: it builds calldata and asks Binance Agentic Wallet (`baw`) to
preview it. This CLI never signs, never holds a private key, and never sends a
transaction by itself.

## When to use this skill

Use it when the user wants to:

- inspect a collection, an NFT, a listing, or the deployment health;
- create a gated NFT collection and mint tokens as its creator;
- approve Agentmarket for a token or for all tokens of a collection;
- list, cancel, or buy an NFT on Agentmarket with BNB;
- execute or track a request that was already previewed.

Do not use it for unrelated protocol administration or asset-management tasks.
This package deliberately has no such commands.

## Preconditions

1. Node.js >= 22.12.0.
2. `baw` CLI >= 1.12.0 installed and on `PATH`.
3. Binance Agentic Wallet connected (`baw wallet status` reports `CONNECTED`).
4. A BSC address on the wallet (`binanceChainId` 56).
5. Developer Mode enabled in the Binance App (Agentic Wallet > Settings).
6. The address book contains non-null `nftRegistry`, `nftFactory`, and
   `agentmarket` addresses. The packaged `deployments/56.json` is the deployed
   BSC book; a custom book that omits these fails with `NFT_NOT_CONFIGURED`
   rather than using the zero address.
7. Agent ID eligibility. Under the default canonical policy, the wallet that
   receives an NFT and the buyer must have `eligibility.eligible == true` and
   the `agent id eligible` check must be `ok`. Creating a collection does not
   require an Agent ID. A custom collection policy may differ; read its
   `collection info` policy first. If the wallet is not eligible, claim an Agent
   ID or switch to an eligible wallet; see README "Before you start" and the
   [Binance Agentic Wallet skill](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/SKILL.md).

Run `agentmarket doctor --json` first. If `healthy` is false, read `checks`,
`warnings`, and `baw.error` before trying any write flow. `healthy: true` alone
does not prove Agent ID eligibility; check `eligibility.eligible`.

## Invocation

```bash
npx -y --package @agentmarket/cli@0.1.0 agentmarket doctor --json
# or, when installed globally:
agentmarket doctor --json
```

The same package provides the MCP server `agentmarket-mcp` over stdio.

## Command selection

```text
Read-only:
  doctor
  status
  collection info --collection <address>
  nft info --collection <address> --token-id <id>
  market status --collection <address> --token-id <id>
  tx status (--tx-hash <hash> | --order-id <id>)
  skill

Preview only:
  collection create --name --symbol --max-supply --metadata-uri
                    (--base-uri | --resolver) [--policy]
  collection mint --collection --to --count
  collection mint --collection --recipient <address>:<count> [--recipient ...]
  nft approve --collection --token-id [--spender] [--revoke]
  nft approve-all --collection [--operator] [--revoke]
  market list --collection --token-id --price <bnb> [--deadline <unix>]
  market cancel --collection --token-id
  market buy --collection --token-id

Execution:
  tx execute --request-id <id> --confirm
```

## Safety notes

- Writes are BSC mainnet 56 only. A non-56 address book is read-only;
  preview/execute fails with `UNSUPPORTED_CHAIN`.
- Transferring an NFT away or revoking approval does **not** cancel a listing.
  Only `market cancel` cancels. `approve-all` persists across transfers;
  single-token `approve` is cleared by a transfer.
- `market buy` reads the collection policy and checks
  `canTransfer(seller -> buyer)` before previewing. A denied transfer or a BAW
  simulation error stops the command.
- `collection mint` warns when a recipient is a facility that cannot hold NFTs;
  such a token would have no exit path.
- A preview is a quote, not an order lock. Settlement uses the on-chain listing
  and the exact price at execution.

Every command accepts `--json`. Use JSON mode in automation; parse exactly one
object from stdout.

## Standard write flow

1. Run the preview command.
2. Read `preview.requestId`, `preview.parsedTx`, `preview.simulationResult`,
   `preview.risks`, `preview.requireConfirmation`, and `preview.expiresAt`.
3. Show the user what will happen, including the target, function, value in wei,
   and any risks.
4. Only after explicit approval run:

   ```bash
   agentmarket tx execute --request-id <requestId> --confirm --json
   ```

5. If the result is `PENDING_CONFIRMATION`, ask the user to confirm in the
   Binance App. Obtain the txHash from the App record or BAW transaction
   history.
6. `executed: true` only means BAW accepted the request. `BROADCASTED` may not
   be mined. Poll `agentmarket tx status --tx-hash <txHash> --json` until
   `SUCCESS`, or check that the BscScan receipt status is `1`. Stop on `FAILED`
   or an unknown status; do not run the next command.
7. After success, check the business result before the next command:
   - create: `collection info` returns `isRegistered: true` and the expected
     creator;
   - mint: `nft info` owner is the recipient; `collection info` totalMinted
     increased;
   - approve: `nft info` shows the expected approval state;
   - list: `market status` shows `active: true`, seller, and price;
   - cancel: `market status` shows `active: false`;
   - buy: `nft info` owner is the buyer.

`--order-id` reads only the local journal. Without a txHash it does not discover
a new hash or become a live chain status; use `--tx-hash`.

Never invent or reuse a requestId. The local journal binds it to the chain,
wallet, target, calldata hash, and a single use. A requestId copied from another
machine or user is rejected by `PREVIEW_NOT_FOUND`, `PREVIEW_CHAIN_MISMATCH`, or
`PREVIEW_WALLET_MISMATCH`.

## Collection creation

```bash
agentmarket collection create \
  --name "Example Collection" \
  --symbol "EXAMPLE" \
  --max-supply 100 \
  --base-uri "ipfs://bafy.../" \
  --metadata-uri "ipfs://bafy.../collection.json" \
  --json
```

- `--max-supply` must be greater than zero.
- `--metadata-uri` is required: the URI of the collection-level metadata JSON.
  The chain stores the URI string, not the JSON.
- At least one of `--base-uri` or `--resolver` is required. A resolver must be a
  contract implementing `tokenURI(collection, tokenId)`; a resolver-only
  collection may omit `--base-uri`. If both are set, the resolver takes
  precedence.
- `--policy` is optional. Omitted means the factory resolves the policy
  registry's current policy (calldata contains address zero).

After success, read `CollectionCreated.nft` from the receipt. In BscScan, open
the transaction and expand the `CollectionCreated` log from the factory address;
copy the `nft` argument. If you process raw logs, filter by the factory address
and decode with the `AgenticNFTFactory` ABI; `nft` is the first indexed argument.
A decoded example:

```json
{
  "event": "CollectionCreated",
  "args": {
    "nft": "0x...",
    "creator": "0x...",
    "policy": "0x...",
    "maxSupply": "100",
    "metadataResolver": "0x..."
  }
}
```

Then run `collection info` with the emitted address and confirm
`isRegistered: true`, the expected creator, and the expected policy before
minting.

## Minting

```bash
agentmarket collection mint --collection <collection> --to <address> --count 2 --json
agentmarket collection mint --collection <collection> \
  --recipient <address>:2 --recipient <address>:1 --json
```

The CLI reads `creator()`, `maxSupply`, and `totalMinted` first. Only the
collection creator can mint. The whole request must fit the remaining supply.
One recipient uses `mint`; multiple recipients use `mintBatch`. Each
`--recipient` value is `<address>:<count>`.

## Approval for Agentmarket

Default spender/operator is the Agentmarket address from the address book.

```bash
agentmarket nft approve --collection <collection> --token-id 0 --json
agentmarket nft approve-all --collection <collection> --json
agentmarket nft approve --collection <collection> --token-id 0 --revoke --json
agentmarket nft approve-all --collection <collection> --revoke --json
```

`nft approve` requires the connected wallet to own the token. Prefer single-token
approval unless the user explicitly wants blanket approval.

## Listing

```bash
agentmarket market list --collection <collection> --token-id 0 --price 0.5 --json
agentmarket market list --collection <collection> --token-id 0 --price 0.5 \
  --deadline 1800000000 --json
```

`--price` is human BNB and is converted to wei by the CLI. `--deadline` is a Unix
timestamp in seconds; omit it for no expiry.

The CLI checks, in order:

1. the collection is registered in the NFT registry;
2. the connected wallet owns the token;
3. the price is positive;
4. the deadline is in the future (when supplied);
5. the market is approved for the token.

If approval is missing, the result is:

```json
{
  "status": "needsApproval",
  "needsApproval": [
    {
      "kind": "approve",
      "preview": { "requestId": "..." },
      "nextCommand": "agentmarket tx execute --request-id ... --confirm"
    }
  ],
  "approveAllCommand": "agentmarket nft approve-all --collection ..."
}
```

No listing preview exists in that result. Execute the approval, then re-run
`market list`. If approval exists, the result has `status: "preview"` and a
normal `Agentmarket.list` preview with value 0.

## Cancelling

```bash
agentmarket market cancel --collection <collection> --token-id 0 --json
```

The CLI reads `listingOf` and requires `active == true` and
`seller == connected wallet`. Anything else is an error; nothing is previewed.

## Buying

```bash
agentmarket market buy --collection <collection> --token-id 0 --json
```

The CLI reads `listingOf` and `isExecutable` first. If the listing is inactive,
expired, no longer approved, or the seller no longer owns the token, the command
fails with `LISTING_NOT_EXECUTABLE` and details the reasons. Nothing is
previewed in that case.

For a valid listing the preview's call value equals the listing price in wei.
`market buy` reports `valueWei`, `priceBnb`, `feeBps`, and `marketplaceFeeWei`.
The seller cannot buy its own listing.

## Reading state

```bash
agentmarket collection info --collection <collection> --json
agentmarket nft info --collection <collection> --token-id 0 --json
agentmarket market status --collection <collection> --token-id 0 --json
```

`market status` returns the full listing, `executable`, `owner`, `registered`,
and the market approval view. It is read-only and does not require BAW (it still
needs RPC access).

## Environment

```text
AGENTMARKET_RPC_URL         BSC RPC endpoint; defaults to the address book rpcUrl.
AGENTMARKET_STATE_DIR       Journal directory; default ~/.agentmarket.
AGENTMARKET_DEPLOYMENT_FILE Address-book path; default packaged deployments/56.json.
```

Preview and execute processes must share `AGENTMARKET_STATE_DIR`. The journal is
local, mode 0600, and contains no credentials.

## JSON fields to rely on

- Success: `ok`, `command`, `chainId`, `network`, `warnings`.
- Preview: `preview.requestId`, `preview.nextCommand`, `preview.risks`,
  `preview.requireConfirmation`, `preview.expiresAt`, `call.to`,
  `call.functionName`, `call.valueWei`, `call.inputData`.
- Approval: `status: "needsApproval"`, `needsApproval[i].preview.requestId`,
  `needsApproval[i].nextCommand`.
- Execution: `executed`, `status`, `orderId`, `txHash`, `next`.
- Errors: `ok: false`, `error.code`, `error.message`, optional `error.details`.

Use `error.code`, not the message text, for branching. Common codes:
`USAGE`, `INVALID_ADDRESS`, `INVALID_AMOUNT`, `NFT_NOT_CONFIGURED`,
`DEPLOYMENT_INVALID`, `CHAIN_MISMATCH`, `UNSUPPORTED_CHAIN`,
`TRANSFER_NOT_ALLOWED`, `SIMULATION_FAILED`, `BAW_NOT_INSTALLED`,
`BAW_NOT_CONNECTED`, `DEVMODE_REQUIRED`, `NOT_TOKEN_OWNER`,
`COLLECTION_NOT_REGISTERED`, `LISTING_NOT_ACTIVE`, `LISTING_NOT_EXECUTABLE`,
`SELF_PURCHASE`, `NOT_COLLECTION_CREATOR`, `SUPPLY_EXCEEDED`,
`PREVIEW_NOT_FOUND`, `PREVIEW_ALREADY_USED`, `CONFIRM_REQUIRED`.

## MCP tools

Each CLI command has one MCP tool:

```text
agentmarket_doctor
agentmarket_status
agentmarket_skill
agentmarket_collection_info
agentmarket_collection_create
agentmarket_collection_mint
agentmarket_nft_info
agentmarket_nft_approve
agentmarket_nft_approve_all
agentmarket_market_status
agentmarket_market_list
agentmarket_market_cancel
agentmarket_market_buy
agentmarket_tx_execute
agentmarket_tx_status
```

MCP tool calls return `structuredContent` with the same fields as CLI `--json`
output. `agentmarket_tx_execute` requires `confirmed: true`. No private key
argument exists.

## Agent safety rules

1. Run `doctor` before a session and stop on configuration errors.
2. Never fabricate a collection, token id, price, deadline, address, or
   requestId.
3. Always show the preview's target, function, calldata, value, and risks to the
   user before execute.
4. Execute only a requestId from this session and this machine's journal.
5. Do not skip `--confirm`; it is a hard requirement.
6. Treat `isExecutable` as a preflight, not a settlement guarantee. State can
   change until the transaction confirms.
7. Do not retry execute after `PREVIEW_ALREADY_USED`; create a new preview.
8. If the result is `PENDING_CONFIRMATION`, wait for the user to confirm in the
   Binance App. Do not invent a replacement transaction.
9. The CLI has no NFT movement or browsing commands. Refer the user to a wallet
   or explorer for those actions.
