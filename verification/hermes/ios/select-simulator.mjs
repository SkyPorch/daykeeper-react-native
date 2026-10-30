import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function selectSimulator(runtimes) {
  const candidates = runtimes
    .filter(
      (runtime) =>
        runtime.isAvailable &&
        runtime.platform === "iOS" &&
        Number(runtime.version.split(".")[0]) >= 18,
    )
    .sort((a, b) =>
      b.version.localeCompare(a.version, undefined, { numeric: true }),
    );
  for (const runtime of candidates) {
    const phones = (runtime.supportedDeviceTypes ?? []).filter(
      (device) => device.productFamily === "iPhone",
    );
    const deviceType =
      phones.find(
        (device) =>
          device.identifier ===
          "com.apple.CoreSimulator.SimDeviceType.iPhone-16",
      ) ?? phones[0];
    if (deviceType) return { runtime, deviceType };
  }
  throw new Error(
    "Install an iOS 18+ Simulator runtime with a supported iPhone device type",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { runtime, deviceType } = selectSimulator(
    JSON.parse(readFileSync(0, "utf8")).runtimes,
  );
  console.log(`${runtime.identifier}\t${deviceType.identifier}`);
}
