import { logoutUser } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  await logoutUser();
  return NextResponse.redirect(new URL("/prisijungti", request.url));
}
