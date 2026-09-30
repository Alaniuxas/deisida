"use server";

import { redirect } from "next/navigation";
import { loginUser, type UserRole } from "@/lib/auth";

function defaultPathForRole(role: UserRole): string {
  if (role === "cechas") return "/cechas";
  return "/pasiulymai";
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim();

  if (!email || !password) {
    redirect("/prisijungti?error=empty");
  }

  const user = await loginUser(email, password);
  if (!user) {
    redirect(`/prisijungti?error=invalid&email=${encodeURIComponent(email)}`);
  }

  if (next && next.startsWith("/")) {
    redirect(next);
  }

  redirect(defaultPathForRole(user.role));
}
