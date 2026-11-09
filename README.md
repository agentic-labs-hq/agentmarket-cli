# Agentmarket CLI

`@agentmarket/cli` is the end-user and agent command-line interface for gated NFT
collections and the Agentmarket venue on BNB Smart Chain (BSC). It also ships an
MCP server (`agentmarket-mcp`) with one tool per command.

The CLI is non-custodial. Every write command builds calldata and asks the
[Binance Agentic Wallet](https://www.binance.com/en/web3-wallet) (`baw`) to
preview it. The CLI never holds a private key, never signs locally, and never
broadcasts a raw transaction. Execution is a separate, explicit step:
`agentmarket tx execute --request-id <id> --confirm`.

## What it can do

| Area | Commands |
| --- | --- |
| Health and status | `doctor`, `status`, `skill` |
| Collections | `collection create`, `collection info`, `collection mint` |
| NFTs | `nft info`, `nft approve`, `nft approve-all` |
| Agentmarket | `market status`, `market list`, `market cancel`, `market buy` |
| Execution | `tx execute`, `tx status` |

All commands support `--json` and print exactly one JSON object. On-chain reads
use a public BSC RPC through `viem`. Wallet status and transaction history use
BAW.

## Install

Requirements:

- Node.js >= 22.12.0

The Binance Agentic Wallet, wallet connection, Developer Mode and Agent ID are
covered in [Before you start](#before-you-start).

```bash
npm install --global @agentmarket/cli
agentmarket --version
agentmarket doctor --json
```

Or run without a global install:

```bash
npx -y --package @agentmarket/cli@0.1.0 agentmarket doctor --json
```

Or run from a source checkout:

```bash
npm ci
npm run build
node dist/cli.js doctor --json
```

If you use the source path, replace `agentmarket` with `node dist/cli.js` in the
examples below. `preview.nextCommand` also contains `agentmarket`; replace it the
same way, and run the command from the repository root.

## Before you start

1. Install the Binance Agentic Wallet CLI:

   ```sh
   npm install -g @binance/agentic-wallet@1.12.0
   ```

   See the [Binance Agentic Wallet skill](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/SKILL.md)
   for the full command surface.

2. Sign in and connect the wallet:

   ```sh
   baw auth signin --json
   # Open urlForWeb, then:
   baw auth verify --qrCodeId <qrCodeId> --json
   baw wallet status --json
   ```

   `baw wallet status` must report `CONNECTED`.

3. Enable Developer Mode in the Binance App: Agentic Wallet > Settings >
   Developer Mode.

4. Check the Agent ID:

   ```sh
   baw wallet agent-id --json
   agentmarket doctor --json
   ```

   Under the default canonical policy, an eligible Agent ID is required to
   receive a gated NFT and to buy one. Creating a collection does not require an
   Agent ID. A collection created with a custom policy follows that policy; read
   `collection info` before assuming eligibility.

   Check the result, not only `healthy`:

   - `doctor.eligibility.eligible` must be `true`;
   - the `agent id eligible` check must be `ok`.

   `healthy: true` alone does not prove Agent ID eligibility. If
   `baw wallet agent-id --json` shows no active ID, follow the claim flow in the
   [Binance Agentic Wallet skill](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/SKILL.md).
   See
   [Background](https://github.com/agentic-labs-hq/agentic-protocol/blob/main/docs/BACKGROUND.md).

5. Keep BNB in the wallet for gas and for the listing price.

## Quick start

Each write command has two steps: preview, then execute the returned
`preview.requestId`. Do not run the next command until the previous execution
succeeds. A preview is a quote, not a transaction.

### What "success" means

`tx execute` returns `executed: true` when BAW accepts the request. This is not
an on-chain receipt.

- `PENDING_CONFIRMATION`: confirm or reject in the Binance App. A txHash may not
  be available yet.
- `BROADCASTED`: the transaction was submitted, but it may not be mined.
- `SUCCESS`: the transaction is mined successfully. Check with
  `agentmarket tx status --tx-hash <txHash> --json`.
- `FAILED`: the transaction reverted. Stop; do not run the next step.

If BAW does not return a final status, open the txHash in BscScan and check the
receipt status is `1`. Do not treat `ok: true` or `executed: true` alone as
on-chain success.

The example uses two wallets:

- **Wallet A**: collection creator and seller. It must be able to receive a
  gated NFT.
- **Wallet B**: buyer. It must be a different wallet with an eligible Agent ID
  and BNB for gas and the price.

### Seller flow (wallet A)

```bash
# 1. Check deployment, RPC, wallet and identity.
agentmarket doctor --json
agentmarket status --json

# 2. Preview collection creation.
# --base-uri and --metadata-uri are placeholders; see the command reference.
agentmarket collection create \
  --name "Example Collection" \
  --symbol "EXAMPLE" \
  --max-supply 100 \
  --base-uri "ipfs://bafy.../" \
  --metadata-uri "ipfs://bafy.../collection.json" \
  --json
# Copy preview.requestId from the result, then:
agentmarket tx execute --request-id <createRequestId> --confirm --json

# 3. Read the collection address.
# The execution result has txHash when broadcast. If status is
# PENDING_CONFIRMATION, confirm in the Binance App and obtain the txHash.
# Open the transaction in BscScan and read CollectionCreated.nft.
# The event fields are nft (indexed), creator, policy, maxSupply and
# metadataResolver. Use nft as <collection>.
# Example: txHash 0x<64 hex>; CollectionCreated.nft 0x<40 hex>.
# Do not use the factory address or the transaction hash as the collection.
agentmarket collection info --collection <collection> --json

# 4. Preview minting two tokens to wallet A.
agentmarket collection mint --collection <collection> --to <walletA> --count 2 --json
agentmarket tx execute --request-id <mintRequestId> --confirm --json

# 5. Preview approval of token 0.
agentmarket nft approve --collection <collection> --token-id 0 --json
agentmarket tx execute --request-id <approveRequestId> --confirm --json

# 6. Preview a 0.5 BNB listing.
agentmarket market list --collection <collection> --token-id 0 --price 0.5 --json
agentmarket tx execute --request-id <listRequestId> --confirm --json

# 7. Confirm the listing is active.
agentmarket market status --collection <collection> --token-id 0 --json
```

Use `agentmarket tx status --tx-hash <txHash> --json` if you need to confirm the
broadcast.

Batch mint is a separate form. Use the single-recipient form above or this one,
not both for the same tokens:

```bash
agentmarket collection mint --collection <collection> \
  --recipient <walletA>:2 --recipient <walletA>:1 --json
agentmarket tx execute --request-id <batchMintRequestId> --confirm --json
```

### Buyer flow (wallet B)

Switch BAW to wallet B, then:

```bash
agentmarket doctor --json
agentmarket status --json
agentmarket market status --collection <collection> --token-id 0 --json
agentmarket market buy --collection <collection> --token-id 0 --json
agentmarket tx execute --request-id <buyRequestId> --confirm --json
agentmarket nft info --collection <collection> --token-id 0 --json
```

`nft info` must report wallet B as the owner. Wallet B pays exactly 0.5 BNB plus
gas. The seller cannot buy the same listing.

## Command reference

### `doctor`

Read-only health check:

- BSC chain 56 and RPC availability;
- code at the NFT registry, NFT factory, and Agentmarket addresses;
- Agentmarket `feeBps`, `maxFeeBps`, and `treasury`;
- policy registry, identity adapter, and Agent ID eligibility;
- BAW version, `CONNECTED`, BSC address, Developer Mode, tx-lock, and BNB balance.

If BAW is unavailable, the result is still structured and reports
`"healthy": false`. The command does not crash on a missing or disconnected
wallet.

Common doctor results:

| Check | Fix |
| --- | --- |
| `baw available` fails | Install `@binance/agentic-wallet@1.12.0` and put `baw` on `PATH`. |
| `baw wallet connected` fails | Run `baw auth signin --json`, open `urlForWeb`, complete `baw auth verify`, then re-run `doctor`. |
| `baw developer mode` fails | Enable Developer Mode in the Binance App: Agentic Wallet > Settings > Developer Mode. |
| `agent id eligible` fails or warns | Check `baw wallet agent-id --json`; claim an Agent ID or use an eligible wallet. See the protocol Background link above. |
| `BSC mainnet (56)` fails | Use a BSC 56 RPC and the packaged `deployments/56.json`. |
| `nftRegistry code`, `nftFactory code`, or `agentmarket code` fails | The address book is missing deployed addresses. Use the packaged BSC book, or set a complete `AGENTMARKET_DEPLOYMENT_FILE`. |

### `status`

Read-only snapshot: chain head, gas price, the address book, Agentmarket
configuration, policy state, and the wallet. `nftConfigured` reports whether the
NFT addresses are present in the address book.

### `collection info --collection <address>`

Reads name, symbol, creator, policy, maxSupply, totalMinted, baseURI,
metadataURI, metadataResolver, factory, and the `INFTRegistry` record
(`isRegistered`, `policyOf`, `creatorOf`).

### `collection create`

```text
collection create --name <name> --symbol <symbol> --max-supply <n>
  --metadata-uri <uri> (--base-uri <uri> | --resolver <address>) [--policy <address>]
```

Builds `AgenticNFTFactory.createCollection` and previews it. `maxSupply` must be
greater than zero. `--metadata-uri` is the collection-level metadata JSON stored
on-chain; it is not the per-token metadata. The `ipfs://bafy.../` values in the
example are placeholders. At least one of `--base-uri` or `--resolver` is
required; a resolver-only collection may omit `--base-uri`. If both are set, the
resolver takes precedence. `--policy` is optional; omitting it encodes the zero
address, which the factory resolves to the policy registry's current policy.

With `--base-uri`, token 0 resolves to `baseURI + "0"`. Prepare the
collection-level JSON and one metadata file per token if you use this mode.

The transaction does not return the new collection address. Read it from the
`CollectionCreated` event in the receipt. A static call can compute the predicted
address, but it does not persist the collection.

### `collection mint`

```text
collection mint --collection <address> --to <address> --count <n>
collection mint --collection <address> --recipient <address>:<count> [--recipient ...]
```

Reads `creator()`, `maxSupply`, and `totalMinted` first. Only the immutable
creator can mint, and the total request must fit the remaining supply. A single
recipient uses `mint(to, count)`; multiple recipients use
`mintBatch(recipients, counts)`.

If a recipient is a facility whose type is not one of the five NFT facility
types, the result warns: that facility has no ERC-721 exit path, so the token
would be stranded. Use an agent or an NFT facility.

### `nft info --collection <address> --token-id <id>`

Reads `ownerOf`, `tokenURI`, and collection basics.

### `nft approve` / `nft approve-all`

```text
nft approve --collection <address> --token-id <id> [--spender <address>] [--revoke]
nft approve-all --collection <address> [--operator <address>] [--revoke]
```

`spender`/`operator` default to the Agentmarket address. `--revoke` encodes
`approve(0)` or `setApprovalForAll(false)`. Single-token approval requires the
connected wallet to own the token.

`approve-all` persists across NFT transfers. Moving the token away or revoking
approval does not cancel an existing listing; only `market cancel` does. The
command warns about this.

### `market status --collection <address> --token-id <id>`

Reads the full listing (seller, price, payment asset, deadline, nonce, fee
snapshot, active), `isExecutable`, `ownerOf`, `getApproved`, and
`isApprovedForAll` for Agentmarket.

### `market list`

```text
market list --collection <address> --token-id <id> --price <bnb> [--deadline <unix>]
```

Preflight, in order:

1. the collection is registered in the NFT registry;
2. the connected wallet owns the token;
3. `--price` is positive BNB and is converted to wei;
4. `--deadline` (when supplied) is a valid future Unix timestamp; omit it for no
   expiry;
5. the market is approved for the token.

If approval is missing, the command returns `status: "needsApproval"` with an
approve preview and the `approve-all` alternative command. If approval exists,
it previews `Agentmarket.list` with value 0. When approval is via `approve-all`,
the result warns that transferring the token away or revoking approval does not
cancel the listing.

### `market cancel --collection <address> --token-id <id>`

Requires an active listing whose seller is the connected wallet, then previews
`Agentmarket.cancel`.

### `market buy --collection <address> --token-id <id>`

Reads the listing and `isExecutable`. An inactive, expired, unapproved, or
otherwise invalid listing is an error; nothing is previewed. Before previewing,
the CLI also reads the collection policy and runs
`canTransfer(seller -> buyer, operator = Agentmarket)`; a denied transfer stops
the command, and a BAW simulation error stops the preview. A valid listing
previews `Agentmarket.buy` with the BAW payload value equal to the listing price
in wei. The seller cannot buy its own listing.

### `tx execute --request-id <id> --confirm`

Executes exactly one requestId returned by a previous preview. The requestId is
bound to the chain and wallet in the local journal, can be consumed once, and is
sent to `baw contract-call execute`. `--confirm` is mandatory.

### `tx status`

```text
tx status --tx-hash <hash>
tx status --order-id <id>
```

`--tx-hash` queries BAW's transaction history. `--order-id` reads the local
journal written by `tx execute`. The BAW contract-call flow has no order lookup,
so the journal is what makes order tracking possible.

### `skill`

Prints the packaged `SKILL.md` guide for agents.

## BAW execution model

```text
read state (RPC) -> build one calldata -> baw contract-call preview
  -> requestId / parsedTx / simulationResult / risks / requireConfirmation / expiresAt
  -> user reviews
  -> agentmarket tx execute --request-id <id> --confirm
  -> baw contract-call execute --requestId <id>
```

Rules enforced by the CLI:

- one calldata per preview; no batching and no atomic multi-call;
- The previewed call value is always in wei; `market buy` uses the exact listing
  price;
- no gas price or gas limit flags are sent; BAW estimates;
- Developer Mode is checked before every preview and before execute;
- on-chain reads use viem; wallet status and tx history use BAW;
- no private key, signer, or raw transaction path exists in this package.

If a preview expires, re-run the command. If execute returns
`PENDING_CONFIRMATION`, confirm in the Binance App and then query by tx hash.

## Environment

| Variable | Purpose |
| --- | --- |
| `AGENTMARKET_RPC_URL` | Overrides the address book RPC URL. Must be http(s). |
| `AGENTMARKET_STATE_DIR` | Local journal directory (default `~/.agentmarket`). Preview and execute must share it. |
| `AGENTMARKET_DEPLOYMENT_FILE` | Overrides the address-book path (default packaged `deployments/56.json`). |

The state directory contains `tx-journal.json` with preview bindings and
execution records. It is written with mode 0600 and contains no credentials.

## Address book and deployment status

The address book keys are:

```text
chainId, network, rpcUrl, startBlock, governance,
nftRegistry, nftFactory, agentmarket, treasury,
policy, identityAdapter, agentIdRegistry, policyRegistry, venueRegistry
```

The packaged `deployments/56.json` contains the known Agentic Protocol mainnet
addresses, including the deployed NFT registry, NFT factory, and Agentmarket.
The CLI never substitutes the zero address: a custom address book that omits one
of these fails with `NFT_NOT_CONFIGURED` and a message that names the missing
key.

To use another complete deployment, set `AGENTMARKET_DEPLOYMENT_FILE` to a JSON
file with the same schema and non-null NFT/market addresses.

Write commands are **BSC mainnet 56 only**. A non-56 address book is read-only:
`doctor`, `status`, and info commands work, but any preview or execute fails with
`UNSUPPORTED_CHAIN` because BAW always targets BSC 56.

## JSON output

Every command supports `--json` and prints one object. Successful results have
`"ok": true` and `"command"`. Failures have `"ok": false` and an error code:

```json
{
  "ok": false,
  "command": "market list",
  "error": {
    "code": "NOT_TOKEN_OWNER",
    "message": "Only the token owner can list it. ..."
  }
}
```

Preview results contain `preview.requestId`, `preview.parsedTx`,
`preview.simulationResult`, `preview.risks`, `preview.requireConfirmation`,
`preview.expiresAt`, and `preview.nextCommand`. `needsApproval` results contain
an approval preview in `needsApproval[0].preview`.

## MCP server

`agentmarket-mcp` speaks MCP over stdio and exposes one tool per command. From a
source checkout, run `node dist/mcp.js`.

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

Example client configuration:

```json
{
  "mcpServers": {
    "agentmarket": {
      "command": "npx",
      "args": ["-y", "--package", "@agentmarket/cli@0.1.0", "agentmarket-mcp"]
    }
  }
}
```

The MCP schemas are complete zod schemas. `agentmarket_tx_execute` requires
`confirmed: true`; no key material is accepted.

## Safety notes

- Read every preview before executing. `parsedTx`, `simulationResult`, and
  `risks` come from BAW.
- `market list` and `market buy` are preflighted, but the chain remains the final
  authority: ownership, approval, price, and deadlines can change between
  preview and execution.
- The Agentmarket fee is snapshotted when `list` executes; settlement pays the
  treasury current at `buy` time.
- Never pass a requestId from another machine or user: the local journal binding
  is part of the security model.
- The CLI has no command to move NFTs or browse collections; use a wallet or an
  explorer for those actions.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run check:package
```

Tests are offline: BAW and the RPC client are injected fakes. The package is
TypeScript ESM and targets Node.js >= 22.12.0.

## License

MIT
