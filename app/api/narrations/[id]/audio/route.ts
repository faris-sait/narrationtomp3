import { db } from "@/db";
import { narrations } from "@/db/schema";
import { errorBody } from "@/lib/validation";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(errorBody("validation_error", "Invalid id"), {
      status: 400,
    });
  }

  const [row] = await db
    .select({ audio: narrations.audio, audioUrl: narrations.audioUrl })
    .from(narrations)
    .where(eq(narrations.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json(errorBody("not_found", "Narration not found"), {
      status: 404,
    });
  }

  const download = new URL(req.url).searchParams.get("download");
  const filename = `narration-${id}.mp3`;

  if (row.audioUrl) {
    // Audio is stored in Vercel Blob; the blob URL is public and CDN-cached.
    return NextResponse.redirect(row.audioUrl, {
      status: 307,
      headers: download
        ? { "Content-Disposition": `attachment; filename="${filename}"` }
        : undefined,
    });
  }

  if (!row.audio) {
    return NextResponse.json(errorBody("not_found", "Audio not available"), {
      status: 404,
    });
  }

  return new NextResponse(new Uint8Array(row.audio), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(row.audio.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": download
        ? `attachment; filename="${filename}"`
        : `inline; filename="${filename}"`,
    },
  });
}