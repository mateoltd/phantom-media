import vm from "vm";

export default function evaluate(
  data: { output: string; exported: string[] },
  env: Record<string, string>
): Record<string, unknown> {
  const script = new vm.Script(`(function(){${data.output}})()`);

  const context = vm.createContext({
    ...env,
    globalThis: {},
    self: {},
    window: {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    URL,
    URLSearchParams,
    decodeURIComponent,
    encodeURIComponent,
  });

  return script.runInContext(context, { timeout: 10000 });
}
