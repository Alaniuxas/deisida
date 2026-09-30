import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

export type UserRole = "admin" | "pardavimai" | "cechas";

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ??
    "deisida-dev-session-secret-change-in-production-32chars",
  cookieName: "deisida_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function getCurrentUser(): Promise<SessionData | null> {
  const session = await getSession();
  if (!session.userId || !session.email || !session.name || !session.role) {
    return null;
  }
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
  };
}

export async function requireUser(roles?: UserRole[]): Promise<SessionData> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  if (roles && !roles.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function loginUser(
  email: string,
  password: string,
): Promise<SessionData | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role as UserRole;
  await session.save();

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
  };
}

export async function logoutUser(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function userToSession(user: User): SessionData {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
  };
}
