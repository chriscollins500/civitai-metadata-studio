// Synthetic JSON-RPC fixture. Parsed messages are data, never executable code.
import { createInterface } from "node:readline";
import { setImmediate as nextTurn } from "node:timers/promises";
console.error("fixture stderr ready");
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let chain = Promise.resolve();
lines.on("line", line => {
  chain = chain.then(async () => {
    const request = JSON.parse(line);
    if (request.method === "fixture/die") process.exit(17);
    if (request.method === "fixture/malformed") process.stdout.write("not-json\n");
    const result = { value: request.params?.value, cwd: process.cwd(), argv: process.argv.slice(2), fixtureEnv: process.env.STUDIO_FIXTURE_ENV };
    const packet = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
    if (request.method === "fixture/fragment") {
      for (let offset = 0; offset < packet.length; offset += 13) {
        if (!process.stdout.write(packet.subarray(offset, offset + 13))) await new Promise(resolve => process.stdout.once("drain", resolve));
        await nextTurn();
      }
    } else if (!process.stdout.write(packet)) await new Promise(resolve => process.stdout.once("drain", resolve));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
});
lines.on("close", () => { if (process.argv.includes("--linger-after-eof")) setInterval(() => {}, 1000); });
