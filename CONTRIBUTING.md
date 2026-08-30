# Contributing

Customer API changes start in `SkyPorch/daykeeper-openapi`. Update the vendored
tagged contract and regenerate with `pnpm generate`.

Run `pnpm check` before review. React Native behavior must keep administrative
credentials out of the bundle, fetch a fresh end-user token per request, support
both streaming and buffered Fetch responses, enforce bounded responses, and
avoid logging tokens or conversation contents.

Changes to runtime assumptions or package exports require Metro smoke tests on
the supported Expo/React Native matrix. Native features additionally require
iOS and Android example-app verification.
