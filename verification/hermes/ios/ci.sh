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
runtime=$(xcrun simctl list runtimes -j | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).runtimes.filter(x=>x.isAvailable&&x.identifier.startsWith("com.apple.CoreSimulator.SimRuntime.iOS-")); if(!r.length) process.exit(1); r.sort((a,b)=>a.version.localeCompare(b.version,undefined,{numeric:true})); process.stdout.write(r.at(-1).identifier)})')
device_type=$(xcrun simctl list devicetypes -j | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).devicetypes.find(x=>x.name==="iPhone 16")||JSON.parse(s).devicetypes.find(x=>x.name.startsWith("iPhone ")); if(!d) process.exit(1); process.stdout.write(d.identifier)})')
name="DaykeeperHermesSmoke-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
simulator=$(xcrun simctl create "$name" "$device_type" "$runtime")
xcrun simctl boot "$simulator"
xcrun simctl bootstatus "$simulator" -b
SIMULATOR_UDID="$simulator" SIMULATOR_NAME="$name" node verification/hermes/ios/run.mjs --execute "$RUNNER_TEMP/daykeeper-packed/pack.json"
