// API tests against a real database and the live TTS provider.
// Run with the app serving on $BASE_URL (default http://127.0.0.1:3000):
//   node --test tests/api.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

async function json(path, init = {}, ip) {
  // A fresh source IP per call keeps tests outside each other''s rate-limit
  // window; on Vercel the platform sets x-forwarded-for itself, so this only
  // affects local/dev behaviour. Pass `ip` to share a bucket (rate-limit test).
  const headers = { "Content-Type": "application/json", ...(init.headers ?? {}) };
  if (!headers["x-forwarded-for"]) {
    headers["x-forwarded-for"] = ip ?? `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  }
  const res = await fetch(BASE + path, { ...init, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body, res };
}

test("GET /api/voices lists male and female voices", async () => {
  const { status, body } = await json("/api/voices");
  assert.equal(status, 200);
  const genders = new Set(body.voices.map((v) => v.gender));
  assert.ok(genders.has("male") && genders.has("female"));
  assert.ok(body.voices.length >= 10);
});

test("GET /api/healthz reports database up", async () => {
  const { status, body } = await json("/api/healthz");
  assert.equal(status, 200);
  assert.equal(body.database, "up");
});

test("POST /api/narrations generates and persists a real MP3 (female)", async () => {
  const { status, body } = await json("/api/narrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: "Automated test one. The female voice speaks.",
      voiceId: "en-US-JennyNeural",
    }),
  });
  assert.equal(status, 201);
  const id = body.narration.id;

  const audio = await fetch(`${BASE}/api/narrations/${id}/audio`);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");
  const buf = Buffer.from(await audio.arrayBuffer());
  assert.ok(buf.length > 1000);
  // MPEG frame sync (0xFF Ex/Fx) proves it is real MP3, not an error page
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1] & 0xe0, 0xe0);
});

test("POST /api/narrations generates a real MP3 (male)", async () => {
  const { status, body } = await json("/api/narrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: "Automated test two. The male voice speaks.",
      voiceId: "en-US-GuyNeural",
    }),
  });
  assert.equal(status, 201);
  const id = body.narration.id;
  const audio = await fetch(`${BASE}/api/narrations/${id}/audio?download=1`);
  assert.equal(audio.status, 200);
  assert.match(audio.headers.get("content-disposition"), /attachment/);
  const buf = Buffer.from(await audio.arrayBuffer());
  assert.equal(buf[0], 0xff);

  const del = await json(`/api/narrations/${id}`, { method: "DELETE" });
  assert.equal(del.status, 200);
});

test("POST /api/narrations rejects empty script and unknown voice", async () => {
  const empty = await json("/api/narrations", {
    method: "POST",
    body: JSON.stringify({ script: " ", voiceId: "en-US-GuyNeural" }),
  });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, "validation_error");

  const badVoice = await json("/api/narrations", {
    method: "POST",
    body: JSON.stringify({ script: "hi", voiceId: "not-a-voice" }),
  });
  assert.equal(badVoice.status, 400);
});

test("POST /api/narrations rate-limits after the per-minute budget", async () => {
  const ip = "10.9.9.9";
  const post = () =>
    json(
      "/api/narrations",
      {
        method: "POST",
        body: JSON.stringify({ script: "nope ", voiceId: "en-US-GuyNeural" }),
      },
      ip,
    );
  // Validation rejects (400) still count against the budget; one of the
  // later calls must come back 429 rate_limited.
  const statuses = [];
  for (let i = 0; i < 8; i++) {
    const r = await post();
    statuses.push(r.status);
  }
  assert.ok(statuses.includes(429), `expected a 429 among ${statuses.join(",")}`);
});

test("GET /api/narrations paginates with cursor", async () => {
  const first = await json("/api/narrations?limit=1");
  assert.equal(first.status, 200);
  assert.ok(first.body.items.length <= 1);
  if (first.body.nextCursor) {
    const second = await json(`/api/narrations?limit=1&before=${first.body.nextCursor}`);
    assert.equal(second.status, 200);
  }
});

test("GET /api/narrations/[id]/audio returns 404 for missing id", async () => {
  const { status, body } = await json("/api/narrations/99999999/audio");
  assert.equal(status, 404);
  assert.equal(body.error.code, "not_found");
});

test("GET /api/voices/[id]/preview returns a cached MP3 sample", async () => {
  const first = await fetch(`${BASE}/api/voices/en-US-JennyNeural/preview`);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "audio/mpeg");
  const buf = Buffer.from(await first.arrayBuffer());
  assert.ok(buf.length > 1000);
  assert.equal(buf[0], 0xff);

  const second = await fetch(`${BASE}/api/voices/en-US-JennyNeural/preview`);
  assert.equal(second.status, 200);
  assert.match(second.headers.get("cache-control"), /immutable/);

  const missing = await json("/api/voices/not-a-voice/preview");
  assert.equal(missing.status, 400);
});