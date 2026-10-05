import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logJobPallet } from "@/lib/queue/service";

function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

function isFormPost(contentType: string): boolean {
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

async function parsePalletInput(request: Request): Promise<{
  goodQuantity: number;
  defectQuantity: number;
  comment?: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      goodQuantity: Number(body.goodQuantity ?? body.quantity ?? 0),
      defectQuantity: Number(body.defectQuantity ?? 0),
      comment: body.comment ? String(body.comment) : undefined,
    };
  }

  const form = await request.formData();
  const legacyQuantity = form.get("quantity");
  const goodRaw = form.get("goodQuantity") ?? legacyQuantity ?? "0";
  return {
    goodQuantity: Number(goodRaw),
    defectQuantity: Number(form.get("defectQuantity") ?? "0"),
    comment: form.get("comment") ? String(form.get("comment")) : undefined,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(["admin", "cechas"]);
    const { id } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    const isForm = isFormPost(contentType);
    const input = await parsePalletInput(request);

    const job = await logJobPallet(id, user.userId, input);

    if (isForm) {
      return redirectToPath("/cechas?notice=pallet");
    }

    return jsonOk(job);
  } catch (error) {
    const contentType = request.headers.get("content-type") ?? "";
    const isForm = isFormPost(contentType);

    if (error instanceof Error) {
      if (error.message === "Darbas nerastas.") {
        if (isForm) return redirectToPath("/cechas?error=notfound");
        return jsonError(error.message, 404);
      }
      if (error.message === "COMMENT_REQUIRED") {
        if (isForm) return redirectToPath("/cechas?error=comment");
        return jsonError("Jei padaryta mažiau nei 90 % normos, komentaras privalomas.");
      }
      if (error.message === "QUANTITY_REQUIRED") {
        if (isForm) return redirectToPath("/cechas?error=quantity");
        return jsonError("Įveskite padarytą kiekį.");
      }
    }

    if (isForm) {
      return redirectToPath("/cechas?error=failed");
    }
    return handleApiError(error);
  }
}
