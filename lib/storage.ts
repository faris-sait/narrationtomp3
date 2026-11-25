import { del, put } from "@vercel/blob";

// Audio lives in Vercel Blob when BLOB_READ_WRITE_TOKEN is set (free tier).
// Without a token — local development — the MP3 bytes fall back to the
// `narrations.audio` bytea column so the app works end to end offline.
export const blobEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function saveAudioMp3(buffer: Buffer): Promise<string | null> {
  if (!blobEnabled) return null;
  const { url } = await put(`narrations/${crypto.randomUUID()}.mp3`, buffer, {
    access: "public",
    contentType: "audio/mpeg",
    cacheControlMaxAge: 31_536_000,
  });
  return url;
}

export async function deleteAudio(url: string | null): Promise<void> {
  if (url) await del(url);
}