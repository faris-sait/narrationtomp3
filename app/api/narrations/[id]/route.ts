import { db } from "@/db";
import { narrations } from "@/db/schema";
import { errorBody } from "@/lib/validation";
import { deleteAudio } from "@/lib/storage";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(errorBody("validation_error", "Invalid id"), {
      status: 400,
    });
  }

  const deleted = await db
    .delete(narrations)
    .where(eq(narrations.id, id))
    .returning({ id: narrations.id, audioUrl: narrations.audioUrl });

  if (deleted.length === 0) {
    return NextResponse.json(errorBody("not_found", "Narration not found"), {
      status: 404,
    });
  }

  try {
    await deleteAudio(deleted[0].audioUrl);
  } catch (err) {
    console.error("blob_delete_failed", { message: (err as Error).message });
  }

  return NextResponse.json({ deletedId: deleted[0].id });
}