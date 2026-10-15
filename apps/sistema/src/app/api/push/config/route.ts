import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET(): NextResponse {
  const key = process.env.PUSH_VAPID_PUBLIC_KEY ?? "";
  return NextResponse.json({ enabled: Boolean(key), publicKey: key }, {
    headers: { "Cache-Control": "no-store" },
  });
}
