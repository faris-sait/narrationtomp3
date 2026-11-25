import { synthesizeMp3 } from "./tts";

// Small in-process concurrency queue so many simultaneous or very long
// scripts cannot fan out into dozens of concurrent TTS sessions.
// Single-instance only; on multi-instance deployments the limit applies per
// instance, which is acceptable for this free-tier scale.

const MAX_CONCURRENT = Number(process.env.TTS_MAX_CONCURRENT ?? 2);
const MAX_WAITING = Number(process.env.TTS_MAX_QUEUE ?? 20);

export class QueueBusyError extends Error {
  constructor() {
    super("TTS queue is full");
    this.name = "QueueBusyError";
  }
}

let active = 0;
const waiters: Array<() => void> = [];

export function queueDepth(): number {
  return waiters.length;
}

export async function synthesizeQueued(
  script: string,
  voiceId: string,
): Promise<Buffer> {
  if (waiters.length >= MAX_WAITING) throw new QueueBusyError();
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active++;
  try {
    return await synthesizeMp3(script, voiceId);
  } finally {
    active--;
    const next = waiters.shift();
    if (next) next();
  }
}