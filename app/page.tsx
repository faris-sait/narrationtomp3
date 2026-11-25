"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Voice {
  id: string;
  name: string;
  gender: "male" | "female";
  accent: string;
}

interface Narration {
  id: number;
  title: string;
  voiceId: string;
  voiceName: string;
  gender: string;
  createdAt: string;
}

export default function Home() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ id: number; title: string } | null>(
    null,
  );
  const [history, setHistory] = useState<Narration[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  function previewVoice() {
    if (!voiceId) return;
    if (!previewRef.current) {
      previewRef.current = new Audio();
      previewRef.current.addEventListener("ended", () => setPreviewing(null));
    }
    const player = previewRef.current;
    if (previewing === voiceId) {
      player.pause();
      setPreviewing(null);
      return;
    }
    player.src = `/api/voices/${encodeURIComponent(voiceId)}/preview`;
    setPreviewing(voiceId);
    player.play().catch(() => setPreviewing(null));
  }

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/narrations?limit=10");
    if (res.ok) {
      const data = await res.json();
      setHistory(data.items);
    }
  }, []);

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => {
        setVoices(d.voices);
        const firstMale = d.voices.find((v: Voice) => v.gender === "male");
        if (firstMale) setVoiceId(firstMale.id);
      });
    loadHistory();
  }, [loadHistory]);

  const visibleVoices = voices.filter((v) => v.gender === gender);

  async function generate() {
    setError(null);
    setLoading(true);
    setCurrent(null);
    try {
      const res = await fetch("/api/narrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, voiceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Generation failed");
        return;
      }
      setCurrent({ id: data.narration.id, title: data.narration.title });
      loadHistory();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: number) {
    await fetch(`/api/narrations/${id}`, { method: "DELETE" });
    if (current?.id === id) setCurrent(null);
    loadHistory();
  }

  function playHistory(n: Narration) {
    setCurrent({ id: n.id, title: n.title });
    setTimeout(() => audioRef.current?.play().catch(() => {}), 100);
  }

  const audioUrl = current ? `/api/narrations/${current.id}/audio` : null;

  return (
    <main>
      <h1>NarrateToMP3</h1>
      <p className="subtitle">
        Paste a narration script, pick a voice, get a free MP3.
      </p>

      <section className="card">
        <label htmlFor="script">Script</label>
        <textarea
          id="script"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Paste your narration script here…"
          rows={8}
          maxLength={100000}
        />
        <div className="meta-row">
          <span>{script.length.toLocaleString()} / 100,000 characters</span>
        </div>

        <fieldset>
          <legend>Voice</legend>
          <div className="gender-toggle" role="radiogroup" aria-label="Voice gender">
            {(["male", "female"] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={gender === g ? "active" : ""}
                onClick={() => {
                  setGender(g);
                  const first = voices.find((v) => v.gender === g);
                  if (first) setVoiceId(first.id);
                }}
              >
                {g === "male" ? "Male" : "Female"}
              </button>
            ))}
          </div>
          <div className="voice-row">
            <select
              aria-label="Voice"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
            >
              {visibleVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.accent}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="preview-btn"
              onClick={previewVoice}
              disabled={!voiceId || previewing === voiceId}
              aria-label={`Preview ${voiceId} voice`}
              title="Listen to a short sample of this voice"
            >
              {previewing === voiceId ? "…" : "▶"}
            </button>
          </div>
        </fieldset>

        <button
          className="generate"
          onClick={generate}
          disabled={loading || script.trim().length === 0 || !voiceId}
        >
          {loading ? "Generating…" : "Generate MP3"}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
            {error.includes("Rate limit") && (
              <>
                {" "}
                <button type="button" className="retry" onClick={generate}>
                  Retry
                </button>
              </>
            )}
          </p>
        )}
      </section>

      {current && audioUrl && (
        <section className="card result">
          <h2>{current.title || `Narration #${current.id}`}</h2>
          <audio ref={audioRef} controls src={audioUrl} />
          <div className="result-actions">
            <a
              className="download"
              href={`${audioUrl}?download=1`}
              download={`narration-${current.id}.mp3`}
            >
              Download MP3
            </a>
          </div>
        </section>
      )}

      <section className="card history">
        <h2>History</h2>
        {history.length === 0 ? (
          <p className="empty">No narrations yet.</p>
        ) : (
          <ul>
            {history.map((n) => (
              <li key={n.id} className={current?.id === n.id ? "current" : ""}>
                <div className="history-text">
                  <span className="history-title">{n.title}</span>
                  <span className="history-meta">
                    {n.voiceName} · {n.gender} ·{" "}
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="history-actions">
                  <button type="button" onClick={() => playHistory(n)}>
                    Play
                  </button>
                  <a href={`/api/narrations/${n.id}/audio?download=1`} download>
                    MP3
                  </a>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => remove(n.id)}
                    aria-label={`Delete narration ${n.id}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}