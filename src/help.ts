import { COMMANDS } from "./args.js";
import { PROGRAM } from "./version.js";

const GLOBAL_OPTIONS = `Global options:
  --json                 Print exactly one JSON object to stdout.
  -h, --help             Show help.
  --version              Show the package version.`;

const ENVIRONMENT = `Environment:
  AGENTMARKET_RPC_URL         BSC RPC endpoint. Defaults to the address book's rpcUrl.
  AGENTMARKET_STATE_DIR       State directory (default ~/.agentmarket). tx-journal.json
                              stores preview bindings and execution records; preview and
                              execute must share it.
  AGENTMARKET_DEPLOYMENT_FILE Address-book path. Defaults to the packaged deployments/56.json.`;

const WALLET = `Binance Agentic Wallet (non-custodial):
  - Requires the official \`baw\` CLI 1.12.0+ and a connected Agentic Wallet.
  - The BSC address comes from \`baw wallet address --json\` (binanceChainId 56).
  - Developer Mode must be enabled in the Binance App for contract-call preview/execute.
  - Every write command builds calldata and previews through
    \`baw contract-call preview\`; it never signs, never handles key material, and
    never sends a transaction.
  - Execute separately with "agentmarket tx execute --request-id <id> --confirm".
    Binance may require confirmation in the Binance App.`;

const SAFETY = `Safety:
  - All commands except "tx execute" are read-only or preview-only.
  - market list checks the NFT approval first and returns status=needsApproval with an
    approve preview instead of previewing a listing that would revert.
  - market buy reads the listing and isExecutable; an invalid listing is an error, and
    the BAW value is exactly the listing price in wei.
  - tx execute refuses without --confirm and only runs a locally previewed requestId.`;

export const MAIN_HELP = `Agentmarket CLI — gated NFT collections and the Agentmarket venue on BSC

Usage:
  ${PROGRAM} <command> [options]

Read-only:
  doctor [--json]                                   NFT deployment + BAW health.
  status [--json]                                   Chain/address-book/market/wallet snapshot.
  skill [--json]                                    Print the packaged SKILL.md guide.
  collection info --collection <address>            Collection metadata + registry record.
  nft info --collection --token-id <id>             Owner, token URI, collection basics.
  market status --collection --token-id <id>        Listing, isExecutable, owner, approval.

Preview only (returns requestId; sends nothing):
  collection create --name --symbol --max-supply    Preview AgenticNFTFactory.createCollection.
                    --metadata-uri [--base-uri]
                    [--resolver] [--policy]
  collection mint --collection --to --count         Preview mint.
                  --collection --recipient <addr>:<n> [--recipient ...]  Preview mintBatch.
  nft approve --collection --token-id               Preview approve; spender defaults to
              [--spender] [--revoke]                Agentmarket. --revoke clears approval.
  nft approve-all --collection [--operator]         Preview setApprovalForAll; operator
                  [--revoke]                        defaults to Agentmarket.
  market list --collection --token-id --price <bnb> Check owner/registry/price/deadline and
              [--deadline <unix>]                   approval; preview list only when approved.
  market cancel --collection --token-id             Preview cancel (seller only).
  market buy --collection --token-id                Preview buy; payment = listing price.

Execution (separate and explicit):
  tx execute --request-id <id> --confirm [--json]   Execute one previewed request.
  tx status (--order-id <id> | --tx-hash <hash>)    Query status. --order-id uses the local
           [--json]                                  journal; --tx-hash uses BAW.

${GLOBAL_OPTIONS}

${ENVIRONMENT}

${WALLET}

${SAFETY}

Run "${PROGRAM} <command> --help" for command-specific help.`;

const doctorHelp = `Usage: ${PROGRAM} doctor [--json]

Read-only checks: BSC chain 56, NFT registry/factory/Agentmarket contract code,
market feeBps/maxFeeBps/treasury, policy registry and identity adapter,
Agent ID eligibility, plus the Binance Agentic Wallet version, CONNECTED
status, BSC address, Developer Mode, tx-lock, and BNB balance.

If BAW is unavailable the result is still structured and reports healthy=false;
it does not crash the RPC checks.`;

const statusHelp = `Usage: ${PROGRAM} status [--json]

Read-only snapshot: chain head, gas price, address book, Agentmarket
configuration, policy state, and the Binance Agentic Wallet. Missing NFT
addresses are reported (nftConfigured=false) instead of being replaced with the
zero address.`;

const skillHelp = `Usage: ${PROGRAM} skill [--json]

Prints the packaged SKILL.md operational guide for agents. With --json, returns
one object containing the guide text.`;

const collectionInfoHelp = `Usage: ${PROGRAM} collection info --collection <address> [--json]

Reads name, symbol, creator, policy, maxSupply, totalMinted, baseURI,
metadataURI, metadataResolver, the collection factory, and INFTRegistry
isRegistered/policyOf/creatorOf. Read-only.`;

const collectionCreateHelp = `Usage: ${PROGRAM} collection create --name <name> --symbol <symbol>
                              --max-supply <n> --metadata-uri <uri>
                              [--base-uri <uri>] [--resolver <address>]
                              [--policy <address>] [--json]

Builds AgenticNFTFactory.createCollection calldata and previews it through BAW.
maxSupply must be greater than zero. Pass --base-uri for baseURI metadata, or
--resolver for resolver metadata; when --resolver is set, --base-uri may be
omitted. resolver must be a contract. policy is optional; 0 means the policy
registry's current policy.

The new collection address is emitted by the CollectionCreated event after
execution; it is not available in the preview. Preview only; execute with
"agentmarket tx execute --request-id <id> --confirm".`;

const collectionMintHelp = `Usage: ${PROGRAM} collection mint --collection <address> --to <address> --count <n>
       ${PROGRAM} collection mint --collection <address> --recipient <address>:<count>
                                  [--recipient <address>:<count> ...]
       [--json]

Reads creator(), maxSupply, and totalMinted first. Only the immutable creator
can mint, and the total request must fit the remaining supply. A single
recipient uses mint(to, count); more than one uses mintBatch(recipients, counts).
Preview only.`;

const nftInfoHelp = `Usage: ${PROGRAM} nft info --collection <address> --token-id <id> [--json]

Reads ownerOf, tokenURI, and collection basics. Read-only.`;

const nftApproveHelp = `Usage: ${PROGRAM} nft approve --collection <address> --token-id <id>
                           [--spender <address>] [--revoke] [--json]

Builds ERC-721 approve(spender, tokenId) and previews it. spender defaults to
the Agentmarket address. --revoke encodes approve(0). The connected wallet must
own the token. Preview only.`;

const nftApproveAllHelp = `Usage: ${PROGRAM} nft approve-all --collection <address>
                               [--operator <address>] [--revoke] [--json]

Builds ERC-721 setApprovalForAll(operator, !revoke) and previews it. operator
defaults to the Agentmarket address. Preview only.`;

const marketStatusHelp = `Usage: ${PROGRAM} market status --collection <address> --token-id <id> [--json]

Reads the full listing (seller, price, payment asset, deadline, nonce, fee
snapshot, active), isExecutable, ownerOf, getApproved, and isApprovedForAll for
the market. Read-only.`;

const marketListHelp = `Usage: ${PROGRAM} market list --collection <address> --token-id <id>
                            --price <bnb> [--deadline <unix>] [--json]

Checks that the collection is registered, the wallet owns the token, price is
positive, and the deadline (when supplied) is in the future. Then checks the
market approval:

  - not approved -> status=needsApproval with an approve preview (and the
    approve-all alternative); the list is NOT previewed;
  - approved -> previews Agentmarket.list and returns requestId.

--price is human BNB and is converted to wei. --deadline is a Unix timestamp;
omit it for no expiry. Preview only.`;

const marketCancelHelp = `Usage: ${PROGRAM} market cancel --collection <address> --token-id <id> [--json]

Reads listingOf and requires an active listing whose seller is the connected
wallet. Builds and previews Agentmarket.cancel. Preview only.`;

const marketBuyHelp = `Usage: ${PROGRAM} market buy --collection <address> --token-id <id> [--json]

Reads listingOf and isExecutable. An inactive, expired, unapproved, or
otherwise invalid listing is an error and nothing is previewed. A valid listing
previews Agentmarket.buy with the payment amount set to the listing price in
wei; no amount flag is needed. The seller cannot buy its own listing. Preview
only.`;

const txExecuteHelp = `Usage: ${PROGRAM} tx execute --request-id <id> --confirm [--json]

Executes exactly one requestId returned by a previous preview through
\`baw contract-call execute --requestId <id> --json\`. Requires --confirm;
refuses without it. The requestId is bound to this chain and wallet in the
local journal and can be consumed only once.

No key material is handled here — signing and any Binance App confirmation
happen in the Binance Agentic Wallet. If BAW returns PENDING_CONFIRMATION,
confirm in the Binance App, then query by txHash.`;

const txStatusHelp = `Usage: ${PROGRAM} tx status --tx-hash <hash> [--json]
       ${PROGRAM} tx status --order-id <id> [--json]

--tx-hash queries BAW's transaction history by hash.
--order-id reads the local journal written by tx execute. The BAW contract-call
flow has no orderId status endpoint; if a txHash was recorded it is refreshed
through BAW, otherwise the last known local status is shown with an explicit
freshness marker.`;

const COMMAND_HELP: Record<string, string> = {
  doctor: doctorHelp,
  status: statusHelp,
  skill: skillHelp,
  "collection info": collectionInfoHelp,
  "collection create": collectionCreateHelp,
  "collection mint": collectionMintHelp,
  "nft info": nftInfoHelp,
  "nft approve": nftApproveHelp,
  "nft approve-all": nftApproveAllHelp,
  "market status": marketStatusHelp,
  "market list": marketListHelp,
  "market cancel": marketCancelHelp,
  "market buy": marketBuyHelp,
  "tx execute": txExecuteHelp,
  "tx status": txStatusHelp,
};

export function helpFor(command: string): string {
  return COMMAND_HELP[command] ?? MAIN_HELP;
}

export function commandList(): string[] {
  return Object.keys(COMMANDS);
}
