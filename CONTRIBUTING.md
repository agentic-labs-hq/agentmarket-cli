# Contributing

This is the public Agentmarket CLI/MCP package. Keep changes limited to the
end-user NFT collection, NFT approval, Agentmarket listing, and purchase surface.

## Before a pull request

```sh
npm ci
npm run typecheck
npm test
npm run check:package
```

- Do not add private keys, seed phrases, signer code, or local file
  dependencies.
- Do not add facility management, governance-parameter, NFT movement, or
  portfolio-browsing commands; those are outside this package's scope.
- Do not add private deployment material (keys, signer state, RPC credentials) or unreleased product files. The public address book in `deployments/56.json` is allowed.
- Keep the package contents limited to `dist`, `deployments`, `SKILL.md`,
  `README.md`, and `LICENSE`.
- A published version is immutable; fixes require a new version.

Security reports should follow [`SECURITY.md`](SECURITY.md), not a public issue.
