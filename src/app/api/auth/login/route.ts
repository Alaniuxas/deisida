import { loginUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return jsonError("Įveskite el. paštą ir slaptažodį.");
    }

    const user = await loginUser(email, password);
    if (!user) {
      return jsonError("Neteisingi prisijungimo duomenys.", 401);
    }

    return jsonOk({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
