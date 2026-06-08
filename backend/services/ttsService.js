// Text-to-speech via Microsoft Edge's free online neural voices (no API key).
// Returns high-quality Arabic audio regardless of OS-installed voices.

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Curated Arabic neural voices (label shown in the UI dropdown).
const ARABIC_VOICES = [
  { id: 'ar-EG-SalmaNeural', label: 'سلمى — مصر (أنثى)' },
  { id: 'ar-EG-ShakirNeural', label: 'شاكر — مصر (ذكر)' },
  { id: 'ar-SA-ZariyahNeural', label: 'زارية — السعودية (أنثى)' },
  { id: 'ar-SA-HamedNeural', label: 'حامد — السعودية (ذكر)' },
  { id: 'ar-JO-SanaNeural', label: 'سناء — الأردن (أنثى)' },
  { id: 'ar-JO-TaimNeural', label: 'تيم — الأردن (ذكر)' },
  { id: 'ar-LB-LaylaNeural', label: 'ليلى — لبنان (أنثى)' },
  { id: 'ar-LB-RamiNeural', label: 'رامي — لبنان (ذكر)' },
  { id: 'ar-SY-AmanyNeural', label: 'أماني — سوريا (أنثى)' },
  { id: 'ar-SY-LaithNeural', label: 'ليث — سوريا (ذكر)' },
  { id: 'ar-AE-FatimaNeural', label: 'فاطمة — الإمارات (أنثى)' },
];
const VALID = new Set(ARABIC_VOICES.map((v) => v.id));
const DEFAULT_VOICE = 'ar-JO-SanaNeural'; // Levantine — closest to Palestinian

export function listArabicVoices() {
  return ARABIC_VOICES;
}

/**
 * @param {string} text
 * @param {string} voice  one of the curated voice ids
 * @param {number} rate   speech rate multiplier (0.5–1.5, default 1)
 * @returns {Promise<Buffer>} mp3 audio
 */
export async function synthesize(text, voice, rate) {
  const chosen = VALID.has(voice) ? voice : DEFAULT_VOICE;
  const r = Number(rate);
  const safeRate = Number.isFinite(r) ? Math.max(0.5, Math.min(1.5, r)) : 1;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(chosen, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const res = tts.toStream(text, { rate: safeRate });
  const stream = res.audioStream || res;
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
