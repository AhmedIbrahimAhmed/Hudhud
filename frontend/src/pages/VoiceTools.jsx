/* eslint-disable react-hooks/refs */
import { useEffect, useRef, useState } from "react";
import api from "../api/client.js";
import { useOnline } from "../hooks/useOnline.js";
import MicDictation from "../components/MicDictation.jsx";

export default function VoiceTools() {
  const online = useOnline();

  // ---------- Speech → Text (Deepgram: live mic + file upload) ----------
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const appendTranscript = (t) =>
    setTranscript((prev) => (prev.trim() ? `${prev.trimEnd()} ${t}` : t));

  async function uploadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("audio", file, file.name);
      const r = await api.post("/transcribe", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const text = (r.data?.transcript || "").trim();
      if (text) appendTranscript(text);
      else setError("لم يُلتقط أي كلام واضح في الملف.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  // ---------- Text → Speech (server: Edge neural Arabic voices) ----------
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState("");
  const [ttsText, setTtsText] = useState("");
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsError, setTtsError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [rate, setRate] = useState(1);
  const audioRef = useRef(null);

  useEffect(() => {
    api
      .get("/tts/voices")
      .then((r) => {
        const list = r.data?.voices || [];
        setVoices(list);
        setVoice((cur) => cur || list[0]?.id || "");
      })
      .catch(() => setVoices([]));
  }, []);

  // Revoke old object URLs to avoid leaks.
  useEffect(() => () => audioUrl && URL.revokeObjectURL(audioUrl), [audioUrl]);

  // Signature of what the current audio was generated from. If text/voice/rate
  // haven't changed, we reuse the already-generated audio instead of calling
  // the provider again.
  const genSigRef = useRef("");
  const sig = () => JSON.stringify({ t: ttsText, v: voice, r: rate });
  const audioUrlRef = useRef("");
  audioUrlRef.current = audioUrl;

  async function ensureAudio() {
    if (audioUrlRef.current && genSigRef.current === sig())
      return audioUrlRef.current;
    const r = await api.post(
      "/tts",
      { text: ttsText, voice, rate },
      { responseType: "arraybuffer" },
    );
    const blob = new Blob([r.data], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    audioUrlRef.current = url;
    genSigRef.current = sig();
    return url;
  }

  async function speak() {
    if (!ttsText.trim()) return;
    setTtsBusy(true);
    setTtsError("");
    try {
      await ensureAudio();
      setTimeout(() => audioRef.current?.play().catch(() => {}), 50);
    } catch (e) {
      setTtsError(e.message || "تعذّر توليد الصوت");
    } finally {
      setTtsBusy(false);
    }
  }

  // Extract a downloadable voice file — reuses the generated audio if unchanged.
  async function extract() {
    if (!ttsText.trim()) return;
    setTtsBusy(true);
    setTtsError("");
    try {
      const url = await ensureAudio();
      const a = document.createElement("a");
      a.href = url;
      a.download = "voice.mp3";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setTtsError(e.message || "تعذّر توليد الصوت");
    } finally {
      setTtsBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">الأدوات الصوتية</h2>

      {/* Speech → Text */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-brand">🎙️ تحويل الصوت إلى نص</h3>

        <div className="flex flex-wrap items-center gap-3">
          <MicDictation onTranscript={appendTranscript} online={online} />
          <span className="text-gray-300">أو</span>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy || !online}
            title={!online ? "غير متصل" : undefined}
            className="text-xs border border-gray-200 text-gray-600 rounded-xl px-3 py-2 hover:border-brand hover:text-brand disabled:opacity-40"
          >
            {busy ? "… يُفرّغ الملف" : "📁 رفع ملف صوتي"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={uploadFile}
            className="hidden"
          />
        </div>

        {error && <p className="text-xs text-flag-red">{error}</p>}

        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="سيظهر النص المُفرّغ هنا… يمكنك التعديل عليه."
          rows={6}
          className="w-full text-sm leading-8 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-gray-300"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setTranscript("")}
            className="text-xs bg-gray-100 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-200"
          >
            مسح
          </button>
          <button
            onClick={copyTranscript}
            disabled={!transcript}
            className="text-xs bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-40"
          >
            {copied ? "تم النسخ ✓" : "نسخ"}
          </button>
        </div>
      </section>

      {/* Text → Speech */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-brand">🔊 تحويل النص إلى صوت</h3>

        <textarea
          value={ttsText}
          onChange={(e) => setTtsText(e.target.value)}
          placeholder="اكتب أو الصق النص الذي تريد سماعه…"
          rows={5}
          className="w-full text-sm leading-8 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-gray-300"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-gray-500">الصوت:</label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 max-w-[240px] focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {voices.length === 0 && <option>جارٍ التحميل…</option>}
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>

          <label className="text-xs text-gray-500">السرعة:</label>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
          <span className="text-[11px] text-gray-400 w-8">
            {rate.toFixed(1)}×
          </span>

          <button
            onClick={speak}
            disabled={ttsBusy || !ttsText.trim() || !online}
            title={!online ? "غير متصل" : undefined}
            className="text-sm bg-brand text-white px-5 py-2 rounded-xl hover:bg-brand-dark disabled:opacity-40"
          >
            {ttsBusy ? "… يُولّد" : "▶ تشغيل"}
          </button>

          <button
            onClick={extract}
            disabled={ttsBusy || !ttsText.trim() || !online}
            title={!online ? "غير متصل" : undefined}
            className="text-sm border border-brand text-brand px-4 py-2 rounded-xl hover:bg-brand-light disabled:opacity-40"
          >
            ⬇ استخراج ملف صوتي
          </button>
        </div>

        {ttsError && <p className="text-xs text-flag-red">{ttsError}</p>}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            className="w-full mt-2"
          />
        )}
      </section>
    </div>
  );
}
