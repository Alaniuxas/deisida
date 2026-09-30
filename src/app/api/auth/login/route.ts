import { NextResponse } from "next/server";
import { loginUser, type UserRole } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

function defaultPathForRole(role: UserRole): string {
  if (role === "cechas") return "/cechas";
  return "/pasiulymai";
}

/** 303 with a relative Location — safe behind Cloudflare (never 0.0.0.0:43127). */
function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

async function parseCredentials(request: Request): Promise<{
  email: string;
  password: string;
  next: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      email: String(body.email ?? "").trim(),
      password: String(body.password ?? ""),
      next: String(body.next ?? "").trim(),
    };
  }

  const form = await request.formData();
  return {
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
    next: String(form.get("next") ?? "").trim(),
  };
}

export async function POST(request: Request) {
  try {
    const { email, password, next } = await parseCredentials(request);
    const contentType = request.headers.get("content-type") ?? "";
    const isFormPost = contentType.includes("application/x-www-form-urlencoded")
      || contentType.includes("multipart/form-data");

    if (!email || !password) {
      if (isFormPost) {
        return redirectToPath("/prisijungti?error=empty");
      }
      return jsonError("Įveskite el. paštą ir slaptažodį.");
    }

    const user = await loginUser(email, password);
    if (!user) {
      if (isFormPost) {
        const query = new URLSearchParams({ error: "invalid", email });
        return redirectToPath(`/prisijungti?${query.toString()}`);
      }
      return jsonError("Neteisingi prisijungimo duomenys.", 401);
    }

    if (isFormPost) {
      const destination =
        next && next.startsWith("/") ? next : defaultPathForRole(user.role);
      return redirectToPath(destination);
    }

    return jsonOk({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
