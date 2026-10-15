// Resolves `react-native` to a stub so the native entry's lazy import can be
// exercised in Node. Registered only by the tests that need it.
export async function resolve(specifier, context, next) {
  if (specifier === "react-native")
    return {
      url: new URL("./react-native-stub.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  return next(specifier, context);
}
