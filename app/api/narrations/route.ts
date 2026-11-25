import { db } from "@/db";
import { narrations } from "@/db/schema";
import { getVoice, synthesizeMp3, TtsError } from "@/lib/tts";
import {
  createNarrationSchema,
  errorBody,
  validationError,
} from "@/lib/validation";
import { desc, gt, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readJson, MAX_LIST_LIMIT } from "@/lib/api";
import { saveAudioMp3 } from "@/lib/storage";
import { QueueBusyError, synthesizeQueued } from "@/lib/queue";
import { checkRateLimit, clientKey } from "@/lib/ratelimit";

export const maxDuration = 60;


const LIMIT_DEFAULT = 10;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIST_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || LIMIT_DEFAULT),
  );
  const beforeParam = url.searchParams.get("before");
  const before = beforeParam ? Number(beforeParam) : null;

  if (beforeParam !== null && (before === null || !Number.isInteger(before))) {
    return NextResponse.json(errorBody("validation_error", "before must be an integer id"), {
      status: 400,
    });
  }

  const rows = await db
    .select({
      id: narrations.id,
      title: narrations.title,
      voiceId: narrations.voiceId,
      voiceName: narrations.voiceName,
      gender: narrations.gender,
      createdAt: narrations.createdAt,
    })
    .from(narrations)
    .where(before ? lt(narrations.id, before) : sql`true`)
    .orderBy(desc(narrations.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json(
    { items, nextCursor: hasMore ? items[items.length - 1].id : null },
    { headers: { "x-request-id": crypto.randomUUID() } },
  );
}

export async function POST(req: Request) {
  const rate = checkRateLimit(clientKey(req));
  if (!rate.allowed) {
    return NextResponse.json(
      errorBody("rate_limited", `Rate limit reached. Try again in ${rate.retryAfterSeconds}s.`),
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const body = await readJson<unknown>(req);
  if (body === null) {
    return NextResponse.json(errorBody("invalid_json", "Request body must be JSON"), {
      status: 400,
    });
  }

  const parsed = createNarrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }

  const voice = getVoice(parsed.data.voiceId)!;
  const { script } = parsed.data;

  let mp3: Buffer;
  try {
    mp3 = await synthesizeQueued(script, voice.id);
  } catch (err) {
    if (err instanceof TtsError) {
      return NextResponse.json(errorBody(err.code, err.message), { status: 502 });
    }
    if (err instanceof QueueBusyError) {
      return NextResponse.json(
        errorBody("queue_busy", "Too many narrations in progress. Please try again shortly."),
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    throw err;
  }

  const title =
    script.replace(/\s+/g, " ").trim().slice(0, 80) +
    (script.length > 80 ? "…" : "");

  let audioUrl: string | null = null;
  try {
    audioUrl = await saveAudioMp3(mp3);
  } catch (err) {
    console.error("blob_upload_failed", { message: (err as Error).message });
  }

  const [row] = await db
    .insert(narrations)
    .values({
      title,
      script,
      voiceId: voice.id,
      voiceName: voice.name,
      gender: voice.gender,
      audio: audioUrl ? null : mp3,
      audioUrl,
    })
    .returning({
      id: narrations.id,
      title: narrations.title,
      voiceId: narrations.voiceId,
      voiceName: narrations.voiceName,
      gender: narrations.gender,
      createdAt: narrations.createdAt,
    });

  return NextResponse.json(
    { narration: row },
    { status: 201, headers: { "x-request-id": crypto.randomUUID() } },
  );
}