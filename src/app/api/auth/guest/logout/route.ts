import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export async function POST(req: Request) {
  await destroySession("guest");
  return NextResponse.redirect(new URL("/my", req.url));
}
