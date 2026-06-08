// Image forensics for source verification:
//   1) Reverse image search (Serper.dev "lens") — where the image appeared online.
//   2) AI-generated / deepfake detection (ScamAI).
//
// Both providers need a PUBLIC image URL. For uploaded files we first push the
// image to a free anonymous host (catbox.moe, no key) to obtain a URL, then run
// both checks on it. A user-supplied URL is used directly.

export function reverseEnabled() {
  return !!process.env.SERPAPI_API_KEY || !!process.env.SERPER_API_KEY;
}
export function aiDetectEnabled() {
  return (
    (!!process.env.SIGHTENGINE_API_USER && !!process.env.SIGHTENGINE_API_SECRET) ||
    !!process.env.SCAMAI_API_KEY
  );
}

// ---- Free anonymous image host (no key) -------------------------------------
export async function uploadToHost(buffer, filename = 'image.jpg', mimetype = 'image/jpeg') {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([buffer], { type: mimetype }), filename);
  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const text = (await res.text()).trim();
  if (!res.ok || !/^https?:\/\//.test(text)) {
    console.error('Upload to host failed:', res.status, text);
    throw new Error('تعذّر رفع الصورة إلى المضيف المؤقت');
  }
  return text;
}

// ---- Reverse image search ---------------------------------------------------
// Prefer SerpApi (Google Lens "Exact matches" — true provenance: pages where the
// SAME image appears). Fall back to Serper (visual/similar matches only).
export async function reverseSearch(imageUrl) {
  if (process.env.SERPAPI_API_KEY) return serpApiExactMatches(imageUrl);
  if (process.env.SERPER_API_KEY) return serperLens(imageUrl);
  throw new Error('البحث العكسي معطّل');
}

function host(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function serpApiExactMatches(imageUrl) {
  const params = new URLSearchParams({
    engine: 'google_lens',
    type: 'exact_matches',
    url: imageUrl,
    api_key: process.env.SERPAPI_API_KEY,
  });
  const res = await fetch(`https://serpapi.com/search?${params}`, {
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (data.error) {
    // SerpApi returns "hasn't returned any results" as an error — that's just
    // an empty result, not a failure.
    if (/hasn'?t returned any results|no results/i.test(data.error)) {
      return { count: 0, matches: [], mode: 'exact' };
    }
    throw new Error(`خطأ في البحث العكسي: ${data.error}`);
  }
  const list = data.exact_matches || data.image_results || data.visual_matches || [];
  const matches = list.map((o) => ({
    title: o.title || '',
    link: o.link || '',
    source: o.source || host(o.link),
    date: o.date || '',
    thumbnail: o.thumbnail || o.thumbnail_url || '',
  }));
  return { count: matches.length, matches, mode: 'exact' };
}

async function serperLens(imageUrl) {
  const res = await fetch('https://google.serper.dev/lens', {
    method: 'POST',
    headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`خطأ في البحث العكسي (${res.status}): ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  const organic = Array.isArray(data.organic) ? data.organic : [];
  const matches = organic.map((o) => ({
    title: o.title || '',
    link: o.link || '',
    source: o.source || host(o.link),
    date: o.date || '',
    thumbnail: o.thumbnailUrl || o.imageUrl || '',
  }));
  return { count: matches.length, matches, mode: 'visual' };
}

// ---- AI-generated image detection -------------------------------------------
// Sightengine = general AI-generated detection (uses a URL).
// ScamAI = face-swap / deepfake detection (needs a face; multipart file upload).
export async function aiDetect({ url, buffer, filename, mimetype }) {
  if (process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET) {
    return sightengineDetect(url);
  }
  if (process.env.SCAMAI_API_KEY) {
    return scamaiDetect({ buffer, filename, mimetype, url });
  }
  throw new Error('كشف الذكاء الاصطناعي معطّل');
}

async function sightengineDetect(imageUrl) {
  const params = new URLSearchParams({
    url: imageUrl,
    models: 'genai',
    api_user: process.env.SIGHTENGINE_API_USER,
    api_secret: process.env.SIGHTENGINE_API_SECRET,
  });
  const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`, {
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  if (data.status !== 'success') {
    throw new Error(`خطأ في كشف الذكاء الاصطناعي: ${data.error?.message || res.status}`);
  }
  const score = data.type?.ai_generated ?? null; // 0..1
  return {
    label: score != null && score >= 0.5 ? 'AI' : 'Real',
    isAi: score != null && score >= 0.5,
    confidence: score,
    type: 'genai',
    model: 'sightengine',
  };
}

// ScamAI face-swap deepfake detection (multipart image upload).
async function scamaiDetect({ buffer, filename, mimetype, url }) {
  console.log('ScamAI detect called, buffer:', !!buffer, 'url:', url);
  // If we have a buffer, use it directly (don't go through URL)
  if (!buffer && url) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      buffer = Buffer.from(await resp.arrayBuffer());
      mimetype = mimetype || resp.headers.get('content-type') || 'image/jpeg';
    } catch (e) {
      console.error('Failed to fetch image from URL:', e);
      throw new Error('تعذّر تحميل الصورة من الرابط المقدم');
    }
  }
  if (!buffer) throw new Error('لا توجد صورة للتحليل');

  const endpoint = process.env.SCAMAI_API_URL || 'https://api.scam.ai/api/defence/faceswap/predict';
  console.log('ScamAI endpoint:', endpoint);
  console.log('ScamAI API key exists:', !!process.env.SCAMAI_API_KEY);
  const form = new FormData();
  form.append('files', new Blob([buffer], { type: mimetype || 'image/jpeg' }), filename || 'image.jpg');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-api-key': process.env.SCAMAI_API_KEY },
    body: form,
    signal: AbortSignal.timeout(60000), // Increased timeout to 60 seconds
  });
  const data = await res.json().catch(() => ({}));
  console.log('ScamAI response status:', res.status, 'data:', data);

  // No face → can't run face-swap detection on this image.
  if (data.detail) {
    return { label: null, isAi: false, confidence: null, model: 'scamai', note: data.detail };
  }
  if (!res.ok || data.success === false) {
    console.error('ScamAI error:', res.status, data);
    throw new Error(`خطأ في كشف الذكاء الاصطناعي (${res.status})`);
  }

  const isAi = data.verdict === 'fake';
  return {
    label: isAi ? 'AI' : 'Real',
    isAi,
    confidence: typeof data.confidence === 'number' ? data.confidence : null,
    type: 'تبديل الوجه / تزييف عميق',
    model: 'scamai',
    faces: data.num_faces ?? null,
  };
}
