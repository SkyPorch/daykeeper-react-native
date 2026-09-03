# Releasing `@skyporch/daykeeper-react-native`

The package follows semantic versioning and records its exact customer OpenAPI
contract tag and commit.

Before the first release, choose and commit a license, scan the complete history
for secrets, make the repository public, confirm npm organization ownership and
2FA, and bootstrap the reviewed package interactively. npm cannot stage a
brand-new package.

Then configure npm trusted publishing for
`SkyPorch/daykeeper-react-native`, workflow `release.yml`, and environment
`daykeeper-npm-production`. Protect the environment with a non-author reviewer.
Matching GitHub releases stage packages through OIDC; a maintainer downloads
and reviews the staged tarball and approves it with npm 2FA. Stable releases use
`latest`, prereleases use `next`, and no long-lived npm token is stored in
GitHub.

Every release also requires a packed-package Metro smoke test on the supported
Expo/React Native version and iOS and Android runtime smoke evidence.

## The release sequence

Follow these steps in this order. Do not start a release out of order.

1. **Tag the contract first.** In `SkyPorch/daykeeper-openapi`, release the
   customer contract as an immutable tag `vMAJOR.MINOR.PATCH`. That repository's
   `VERSIONING.md` makes released tags immutable; a release cannot record a
   branch head.
2. **Point `openapi/SOURCE.md` at that tag.** Update the vendored snapshot
   record to the immutable tag *and* its full commit SHA, and re-verify the
   contract checksum with `pnpm check:generated`. Never record a branch head or
   an unmerged pull request head. `openapi/SOURCE.md` currently records an
   unreleased upstream commit, so it must be updated before any release.
3. **Finalize `CHANGELOG.md`.** The section for the version being released must
   carry no `(unreleased)` marker and must name every breaking change.
4. **One reviewed version-bump commit,** covering `package.json`,
   `CHANGELOG.md` and `COMPATIBILITY.md`, reviewed and merged to `main`.
5. **Create the GitHub release from a tag on `main`.** The release's target must
   be `main`, and the tag must be an ancestor of `main`; `release.yml` verifies
   both before it checks out or executes any repository code, and refuses
   otherwise.
6. **`release.yml` publishes with provenance.** The staging job holds the only
   `id-token: write` permission and stages with `--provenance` through OIDC
   trusted publishing. No long-lived npm token exists. A maintainer reviews the
   staged tarball and approves it with npm 2FA.
7. **Verify provenance after publish.** Check both:
   - `https://registry.npmjs.org/-/npm/v1/attestations/@skyporch/daykeeper-react-native@<version>`
   - `npm view @skyporch/daykeeper-react-native@<version> dist.attestations`

   A release with no attestation is not a completed release.

Before step 5, run `release.yml` from the Actions tab with `dry_run` left at
`true`. That path runs the full check chain and `npm publish --dry-run
--provenance`, and cannot publish or stage. The ancestor gate is skipped there
because a manual run has no release tag.

## Published 0.1.0 has no provenance

`@skyporch/daykeeper-react-native@0.1.0` was published by hand. It carries **no
provenance attestation**, even though `package.json` declares
`publishConfig.provenance: true`. That declaration only takes effect on a
publish that runs in a trusted-publishing CI context; a manual publish silently
produces an unattested tarball. No GitHub release exists for it and
`release.yml` has never run.

This cannot be fixed retroactively. Published versions are immutable, and an
attestation cannot be attached after the fact. The first release driven by
`release.yml` is what fixes this going forward; treat `0.1.0` as permanently
unattested and do not cite it as evidence of a provenance chain.
