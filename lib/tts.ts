import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export type Gender = "male" | "female";

export interface Voice {
  id: string;
  name: string;
  gender: Gender;
  accent: string;
}

export const VOICES: Voice[] = [
  { id: "en-US-GuyNeural", name: "Guy", gender: "male", accent: "American" },
  { id: "en-US-ChristopherNeural", name: "Christopher", gender: "male", accent: "American" },
  { id: "en-US-EricNeural", name: "Eric", gender: "male", accent: "American" },
  { id: "en-GB-RyanNeural", name: "Ryan", gender: "male", accent: "British" },
  { id: "en-IN-PrabhatNeural", name: "Prabhat", gender: "male", accent: "Indian" },
  { id: "en-AU-WayneNeural", name: "Wayne", gender: "male", accent: "Australian" },
  { id: "en-US-JennyNeural", name: "Jenny", gender: "female", accent: "American" },
  { id: "en-US-AriaNeural", name: "Aria", gender: "female", accent: "American" },
  { id: "en-US-MichelleNeural", name: "Michelle", gender: "female", accent: "American" },
  { id: "en-GB-SoniaNeural", name: "Sonia", gender: "female", accent: "British" },
  { id: "en-IN-NeerjaNeural", name: "Neerja", gender: "female", accent: "Indian" },
  { id: "en-AU-NatashaNeural", name: "Natasha", gender: "female", accent: "Australian" },
];

export function getVoice(id: string): Voice | undefined {
  return VOICES.find((v) => v.id === id);
}

export class TtsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Edge TTS accepts a few thousand characters per request; keep chunks small
// enough for sentences to stay natural across the boundary.
const MAX_CHUNK = 1800;

function splitScript(script: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const sentence of script.split(/(?<=[.!?;\n])\s+/)) {
    if (sentence.length > MAX_CHUNK) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += MAX_CHUNK) {
        chunks.push(sentence.slice(i, i + MAX_CHUNK));
      }
      continue;
    }
    if ((current + " " + sentence).trim().length > MAX_CHUNK) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export async function synthesizeChunk(
  voiceId: string,
  text: string,
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    voiceId,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
  );
  const { audioStream } = tts.toStream(text);
  const chunks: Buffer[] = [];
  for await (const c of audioStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function synthesizeMp3(
  script: string,
  voiceId: string,
): Promise<Buffer> {
  const parts = splitScript(script);
  const mp3s: Buffer[] = [];
  for (const part of parts) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        mp3s.push(await synthesizeChunk(voiceId, part));
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (lastErr) {
      throw new TtsError(
        "tts_failed",
        `Speech synthesis failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      );
    }
  }
  // MPEG frames concatenate safely.
  return Buffer.concat(mp3s);
}