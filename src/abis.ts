import { parseAbi } from "viem";

/**
 * Minimal, source-accurate ABI fragments for the NFT protocol and Agentmarket.
 * They mirror contracts/interfaces/{INFTRegistry,IAgentNFT,IAgentNFTFactory,
 * IAgentmarket,ITransferPolicy,IPolicyRegistry,IIdentityAdapter} and the
 * Agent ID registry adapter interface. No SDK is vendored.
 */
export const nftRegistryAbi = parseAbi([
  "function policyRegistry() view returns (address)",
  "function isRegistered(address nft) view returns (bool)",
  "function policyOf(address nft) view returns (address)",
  "function creatorOf(address nft) view returns (address)",
  "function isRegistrar(address account) view returns (bool)",
]);

export const nftFactoryAbi = parseAbi([
  "function policyRegistry() view returns (address)",
  "function assetRegistry() view returns (address)",
  "function createCollection(string name, string symbol, address policy, uint256 maxSupply, string baseURI, string metadataURI, address metadataResolver) returns (address nft)",
]);

export const nftAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function creator() view returns (address)",
  "function policy() view returns (address)",
  "function factory() view returns (address)",
  "function maxSupply() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function baseURI() view returns (string)",
  "function metadataURI() view returns (string)",
  "function metadataResolver() view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function mint(address to, uint256 count)",
  "function mintBatch(address[] recipients, uint256[] counts)",
  "function approve(address to, uint256 tokenId)",
  "function setApprovalForAll(address operator, bool approved)",
]);

export const agentmarketAbi = parseAbi([
  "function nftRegistry() view returns (address)",
  "function venueRegistry() view returns (address)",
  "function treasury() view returns (address)",
  "function feeBps() view returns (uint16)",
  "function maxFeeBps() view returns (uint16)",
  "function governance() view returns (address)",
  "function pendingGovernance() view returns (address)",
  "function nonceOf(address seller) view returns (uint64)",
  "function listingOf(address collection, uint256 tokenId) view returns ((address seller, address collection, uint256 tokenId, uint256 price, address paymentAsset, uint64 deadline, uint64 nonce) order, uint16 feeBps, bool active)",
  "function isExecutable(address collection, uint256 tokenId) view returns (bool)",
  "function list(address collection, uint256 tokenId, uint256 price, uint64 deadline)",
  "function cancel(address collection, uint256 tokenId)",
  "function buy(address collection, uint256 tokenId) payable",
]);

export const policyRegistryAbi = parseAbi([
  "function currentPolicy() view returns (address)",
  "function isPolicyAllowed(address policy) view returns (bool)",
  "function policyVersion(address policy) view returns (uint256)",
]);

export const transferPolicyAbi = parseAbi([
  "function canTransfer(address asset, address from, address to, address operator, bytes context) view returns (bool allowed, bytes32 reason)",
  "function isMember(address wallet) view returns (bool)",
  "function isFacility(address account) view returns (bool)",
  "function isEligible(address account) view returns (bool)",
  "function categoryOf(address account) view returns (uint8)",
  "function isRevokedFacility(address account) view returns (bool)",
  "function identityRegistry() view returns (address)",
  "function facilityRegistry() view returns (address)",
]);

export const venueRegistryAbi = parseAbi([
  "function isFacility(address account) view returns (bool)",
  "function facilityType(address account) view returns (bytes32)",
]);

export const identityAdapterAbi = parseAbi([
  "function hasIdentity(address wallet) view returns (bool)",
  "function identityOf(address wallet) view returns (uint256 tokenId, bytes32 handleHash)",
  "function kind() view returns (bytes32)",
  "function version() view returns (uint256)",
  "function chainId() view returns (uint256)",
]);

export const agentIdRegistryAbi = parseAbi([
  "function balanceOf(address wallet) view returns (uint256)",
  "function handleOf(address wallet) view returns (string)",
]);

/** AssetType enum value for NFTs (`enum AssetType { FT, NFT }`). */
export const ASSET_TYPE_NFT = 1;
