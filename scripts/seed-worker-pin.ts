import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import { users } from "../src/lib/db/schema";

const DEFAULT_WORKER_PIN = process.env.WORKER_PIN ?? "1234";

/** Atskiri demo PIN — likusiems cechas lieka DEFAULT_WORKER_PIN. */
const NAMED_WORKER_PINS: Record<string, string> = {
  Aistė: "1111",
  Andrius: "2222",
};

function pinForWorker(name: string): string {
  return NAMED_WORKER_PINS[name] ?? DEFAULT_WORKER_PIN;
}

async function main(): Promise<void> {
  initializeDatabase();

  const cechasUsers = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.role, "cechas"));

  if (cechasUsers.length === 0) {
    console.log("Nėra cechas vartotojų — paleiskite db:import arba db:seed-rotation.");
    return;
  }

  const pinByHash = new Map<string, string>();
  for (const pin of new Set(Object.values(NAMED_WORKER_PINS).concat(DEFAULT_WORKER_PIN))) {
    pinByHash.set(pin, await bcrypt.hash(pin, 10));
  }

  const namedAssignments: Array<{ name: string; email: string; pin: string }> = [];

  for (const user of cechasUsers) {
    const pin = pinForWorker(user.name);
    const workerPinHash = pinByHash.get(pin);
    if (!workerPinHash) continue;

    await db.update(users).set({ workerPinHash }).where(eq(users.id, user.id));

    if (user.name in NAMED_WORKER_PINS) {
      namedAssignments.push({ name: user.name, email: user.email, pin });
    }
  }

  console.log(
    JSON.stringify(
      {
        defaultPin: DEFAULT_WORKER_PIN,
        namedPins: namedAssignments,
        updated: cechasUsers.length,
        login: "http://127.0.0.1:43127/prisijungti?next=/cechas",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
