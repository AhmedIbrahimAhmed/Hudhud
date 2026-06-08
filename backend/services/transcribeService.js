// Speech-to-text via Deepgram (Nova-3, Arabic / Palestinian dialect).
// Kept behind a single function so the provider can be swapped later (e.g.
// Google Chirp_3) by changing only this file + .env.

import { createClient } from '@deepgram/sdk';

export function transcribeEnabled() {
  return !!process.env.DEEPGRAM_API_KEY;
}

/**
 * @param {Buffer} audioBuffer  raw audio bytes (webm/ogg/wav…)
 * @param {string} mimetype     the audio mime type
 * @returns {Promise<string>}   the transcript text
 */
export async function transcribe(audioBuffer, mimetype) {
  if (!transcribeEnabled()) throw new Error('ميزة التفريغ الصوتي معطّلة (DEEPGRAM_API_KEY غير مُعد)');

  const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
    model: process.env.DEEPGRAM_MODEL || 'nova-3',
    language: process.env.DEEPGRAM_LANGUAGE || 'ar',
    smart_format: true, // punctuation + formatting
    mimetype,
  });

  if (error) throw new Error(`تعذّر التفريغ الصوتي: ${error.message || error}`);
  return result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
}
