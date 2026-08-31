# Contract source

`customer.yaml` is an exact copy of `openapi/customer.yaml` from
`SkyPorch/daykeeper-openapi`, commit
`924dafc661952c2f97cb41e609e6b531c1f44a7b` (license metadata, PR #7).

- SHA-256: `5dcbefc60a33dc844cff452c0828abd4d462eac8685ca4e1192544bbeca97e4d`
- Source Git blob: `6de29c4e6a80c9297a36579ddf19234b47ded8c8`
- Tag status: unreleased commit snapshot; no new upstream tag is claimed.

The released baseline is tag `v1.0.0`, commit
`35f5bd45fe0c6a6901766543bff90dae6838b965`. Provider-neutral wording came from
PR #5, commit `fec6f9b88661fbfd04b7d7c66acce257f15ea6bd`.
This snapshot changes only `info.license` from that prior snapshot to match the
contract's Apache-2.0 license. Operations, schemas, scopes, and generated
TypeScript types are unchanged; PR #8 entitlement additions are not included.
The SDK's existing MIT license is unchanged.

Release provenance must record an immutable `daykeeper-openapi` tag and its
full commit SHA. Before release, update this snapshot record to that reviewed
tag and verify the contract checksum. CI regenerates TypeScript declarations
and fails when the committed output differs.
