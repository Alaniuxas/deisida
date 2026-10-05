import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runFridayQueuePlan } from "../src/lib/queue/plan";

const envLocal = resolve(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseAsOfArg(): Date {
  const flag = process.argv.find((arg) => arg.startsWith("--as-of="));
  if (!flag) {
    return new Date();
  }
  const value = flag.slice("--as-of=".length);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --as-of value: ${value}`);
  }
  return parsed;
}

const now = parseAsOfArg();

runFridayQueuePlan(now)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
