import { VOICES } from "@/lib/tts";
import { NextResponse } from "next/server";


export async function GET() {
  return NextResponse.json({ voices: VOICES });
}