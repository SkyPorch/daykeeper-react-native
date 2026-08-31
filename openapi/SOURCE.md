# Contract source

`customer.yaml` is an exact copy of `openapi/customer.yaml` from
`SkyPorch/daykeeper-openapi`, commit
`6bcd7f2a299eb23093d0085890018a08090fc0e5` (customer usage errors, unreleased).

- SHA-256: `b62dd386a87380f3fe94f968ff8fedf703ca6079199ea74057d32e31f91e1fec`
- Source Git blob: `2f1b48fedaddfb7335389f75640e5e3b301575fb`
- Tag status: unreleased commit snapshot; no new upstream tag is claimed.

The released baseline is tag `v1.0.0`, commit
`35f5bd45fe0c6a6901766543bff90dae6838b965`. Provider-neutral wording came from
PR #5, commit `fec6f9b88661fbfd04b7d7c66acce257f15ea6bd`.
License metadata was aligned in commit
`924dafc661952c2f97cb41e609e6b531c1f44a7b`. This snapshot additionally adds optional
customer-error message, retryability and next-action fields. Operations and
scopes are unchanged; server-side entitlement/website schemas are not vendored.
Generated customer types include the optional fields. The SDK's existing MIT
license is unchanged.

Release provenance must record an immutable `daykeeper-openapi` tag and its
full commit SHA. Before release, update this snapshot record to that reviewed
tag and verify the contract checksum. CI regenerates TypeScript declarations
and fails when the committed output differs.
