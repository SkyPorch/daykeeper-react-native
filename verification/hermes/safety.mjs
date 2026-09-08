export function validateHost(env, args) {
  if (args.length !== 2 || args[0] !== "--execute" || !args[1])
    throw new Error("explicit --execute PACK_JSON required");
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.RUNNER_OS !== "Linux" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted"
  )
    throw new Error("disposable GitHub-hosted Linux runner required");
  if (
    !/^emulator-\d+$/.test(env.ANDROID_SERIAL ?? "") ||
    env.ANDROID_SERIAL !== `emulator-${env.EMULATOR_PORT}`
  )
    throw new Error("explicit owned emulator serial required");
  return env.ANDROID_SERIAL;
}

export async function waitForMarker(
  read,
  marker,
  {
    now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    timeout = 90_000,
  } = {},
) {
  if (!/^DAYKEEPER_HERMES_SMOKE_OK_[a-f0-9-]+$/.test(marker))
    throw new Error("invalid marker");
  const deadline = now() + timeout;
  while (now() < deadline) {
    let xml = "";
    try {
      xml = await read();
    } catch {
      /* bounded device observation failure */
    }
    if (xml.includes(`text="${marker}"`)) return;
    if (xml.includes('text="FAILED"')) throw new Error("Hermes fixture failed");
    await sleep(2_000);
  }
  throw new Error("Hermes smoke marker was not observed before deadline");
}
