# Contract source

`customer.yaml` is an exact copy of `openapi/customer.yaml` from
`SkyPorch/daykeeper-openapi`, commit
`4a2b82c9b23503073dc26fdeb5163e8869d007b8` (agent credentials, unreleased),
the head of upstream PR #13 (`codex/daykeeper-agent-credentials`). It
supersedes the earlier snapshot at commit
`6bcd7f2a299eb23093d0085890018a08090fc0e5`.

- SHA-256: `ae75711072950c786d69401301292659ece7f37461cf0621ae4f8a58836b82bd`
- Source Git blob: `9cdf5423e73ad8008fc62adeb8c66e3c018c357d`
- Tag status: unreleased commit snapshot; no new upstream tag is claimed.

The released baseline is tag `v1.0.0`, commit
`35f5bd45fe0c6a6901766543bff90dae6838b965`. Provider-neutral wording came from
PR #5, commit `fec6f9b88661fbfd04b7d7c66acce257f15ea6bd`.
License metadata was aligned in commit
`924dafc661952c2f97cb41e609e6b531c1f44a7b`. This snapshot opens the `CustomerError` envelope:
`additionalProperties: true`, with the optional `message`, `retryable` and
`nextAction` fields, and an `error` code documented as extensible so that
unknown values must be handled safely rather than rejected. The SDK matches
that by validating the shape of a code instead of an allowlist. Operations and
scopes are unchanged; server-side entitlement/website schemas are not vendored.
Generated customer types include the optional fields. The SDK's existing MIT
license is unchanged.

Release provenance must record an immutable `daykeeper-openapi` tag and its
full commit SHA. Before release, update this snapshot record to that reviewed
tag and verify the contract checksum. CI regenerates TypeScript declarations
and fails when the committed output differs.
