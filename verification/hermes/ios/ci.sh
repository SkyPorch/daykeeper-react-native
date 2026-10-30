#!/usr/bin/env bash
set -euo pipefail
simulator=''
cleanup() {
  if [[ -n "$simulator" ]]; then
    xcrun simctl shutdown "$simulator" || true
    xcrun simctl delete "$simulator" || true
  fi
  rm -rf "$TMPDIR"/daykeeper-hermes-ios-smoke-*
}
trap cleanup EXIT
rm -rf "$RUNNER_TEMP/daykeeper-packed" hermes-smoke-results
pnpm install --frozen-lockfile
pnpm test:hermes-harness
pnpm build
mkdir -p "$RUNNER_TEMP/daykeeper-packed"
npm pack --ignore-scripts --json --pack-destination "$RUNNER_TEMP/daykeeper-packed" > "$RUNNER_TEMP/daykeeper-packed/pack.json"
selection=$(xcrun simctl list runtimes -j | node verification/hermes/ios/select-simulator.mjs)
IFS=$'\t' read -r runtime device_type <<< "$selection"
name="DaykeeperHermesSmoke-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
simulator=$(xcrun simctl create "$name" "$device_type" "$runtime")
xcrun simctl boot "$simulator"
xcrun simctl bootstatus "$simulator" -b
SIMULATOR_UDID="$simulator" SIMULATOR_NAME="$name" node verification/hermes/ios/run.mjs --execute "$RUNNER_TEMP/daykeeper-packed/pack.json"
