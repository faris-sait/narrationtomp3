import { NextResponse } from "next/server";

export function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "x-request-id": crypto.randomUUID() } },
  );
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const MAX_LIST_LIMIT = 50;