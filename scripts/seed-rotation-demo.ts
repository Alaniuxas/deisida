import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import { machines, users } from "../src/lib/db/schema";
import {
  createRotationPeriod,
  defaultPeriodEnd,
} from "../src/lib/queue/rotations";
import { formatDateIso, todayIso } from "../src/lib/queue/rotation-dates";
import { importWorkNorms } from "../src/lib/queue/work-norms";

const STARTER_PASSWORD = "deisida";

const DEMO_USERS = [
  { id: "admin-danas", email: "danas@deisida.lt", name: "Danas", role: "admin" as const },
  { id: "cechas-kristina", email: "kristina@deisida.lt", name: "Kristina", role: "cechas" as const },
  { id: "cechas-daiva", email: "daiva@deisida.lt", name: "Daiva", role: "cechas" as const },
  { id: "cechas-jonas", email: "jonas@deisida.lt", name: "Jonas", role: "cechas" as const },
  { id: "cechas-rasa", email: "rasa@deisida.lt", name: "Rasa", role: "cechas" as const },
];

async function seedUsers(passwordHash: string): Promise<void> {
  for (const person of DEMO_USERS) {
    await db
      .insert(users)
      .values({ ...person, passwordHash })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: person.name, role: person.role, passwordHash },
      });
  }
}

async function seedMachines(): Promise<void> {
  const rows = [
    { id: "KONV", code: "KONV", title: "Senas konvejeris", dailyRate: 240 },
    { id: "KNEW", code: "KNEW", title: "Naujas konvejeris", dailyRate: 720 },
  ] as const;

  for (const machine of rows) {
    await db
      .insert(machines)
      .values({
        id: machine.id,
        code: machine.code,
        title: machine.title,
        dailyRate: machine.dailyRate,
        rotationHours: 4,
        currentWidthMm: 0,
      })
      .onConflictDoUpdate({
        target: machines.id,
        set: {
          title: machine.title,
          dailyRate: machine.dailyRate,
          rotationHours: 4,
        },
      });
  }
}

async function resolveUserId(email: string): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!row) {
    throw new Error(`Demo user not found after seed: ${email}`);
  }

  return row.id;
}

async function seedDemoRotation(adminId: string): Promise<void> {
  const { rotationAssignments, rotationHistory, rotationPeriods } = await import(
    "../src/lib/db/schema"
  );
  await db.delete(rotationHistory);
  await db.delete(rotationAssignments);
  await db.delete(rotationPeriods);

  const startDate = todayIso();
  const endDate = defaultPeriodEnd(startDate);

  const [kristinaId, daivaId, jonasId, rasaId] = await Promise.all([
    resolveUserId("kristina@deisida.lt"),
    resolveUserId("daiva@deisida.lt"),
    resolveUserId("jonas@deisida.lt"),
    resolveUserId("rasa@deisida.lt"),
  ]);

  await createRotationPeriod({
    startDate,
    endDate,
    note: "Demo rotacijos periodas (penktadienio planas)",
    createdById: adminId,
    assignments: [
      { personId: kristinaId, machineId: "KONV" },
      { personId: daivaId, machineId: "KONV" },
      { personId: jonasId, machineId: "KNEW" },
      { personId: rasaId, machineId: "KNEW" },
    ],
  });
}

async function main(): Promise<void> {
  initializeDatabase();
  const passwordHash = await bcrypt.hash(STARTER_PASSWORD, 10);

  await seedUsers(passwordHash);
  await seedMachines();
  await importWorkNorms();

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, "danas@deisida.lt"))
    .limit(1);

  if (admin) {
    await seedDemoRotation(admin.id);
  }

  console.log(
    JSON.stringify(
      {
        password: STARTER_PASSWORD,
        admin: "danas@deisida.lt",
        periodStart: todayIso(),
        periodEnd: defaultPeriodEnd(formatDateIso(new Date())),
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
