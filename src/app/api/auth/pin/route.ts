import { loginByPin } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { redirectToPath } from "@/lib/request-url";

function isFormPost(contentType: string): boolean {
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

function loginErrorPath(next: string, error: string): string {
  const query = new URLSearchParams({ error });
  if (next) query.set("next", next);
  return `/prisijungti?${query.toString()}`;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const isForm = isFormPost(contentType);

    let pin = "";
    let next = "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      pin = String(body.pin ?? "").trim();
      next = String(body.next ?? "").trim();
    } else {
      const form = await request.formData();
      pin = String(form.get("pin") ?? "").trim();
      next = String(form.get("next") ?? "").trim();
    }

    if (!pin) {
      if (isForm) {
        return redirectToPath(loginErrorPath(next, "empty"));
      }
      return jsonError("Įveskite PIN kodą.");
    }

    const user = await loginByPin(pin);
    if (!user) {
      if (isForm) {
        return redirectToPath(loginErrorPath(next, "invalid"));
      }
      return jsonError("Neteisingas PIN kodas.", 401);
    }

    if (isForm) {
      const destination =
        next && next.startsWith("/") ? next : "/cechas";
      return redirectToPath(destination);
    }

    return jsonOk({ user });
  } catch (error) {
    const contentType = request.headers.get("content-type") ?? "";
    if (isFormPost(contentType)) {
      return redirectToPath("/prisijungti?error=failed");
    }
    return handleApiError(error);
  }
}
