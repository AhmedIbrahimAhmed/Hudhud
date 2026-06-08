// Domain / link safety checker.
//
// Combines free signals, no API key required:
//  1. Local heuristics (phishing patterns, IP host, punycode, shorteners,
//     abused TLDs, missing HTTPS, lookalike keywords).
//  2. RDAP/WHOIS lookup (free, no key) for domain age + registrar + nameservers.
//  3. Optional Google Safe Browsing (only if GOOGLE_SAFE_BROWSING_API_KEY set).

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'cutt.ly', 'rebrand.ly', 'shorturl.at', 'rb.gy', 't.ly', 'lnkd.in',
]);
const ABUSED_TLDS = new Set([
  'zip', 'mov', 'xyz', 'top', 'tk', 'gq', 'ml', 'cf', 'ga', 'work', 'click',
  'country', 'kim', 'loan', 'men', 'review', 'stream', 'gdn', 'download', 'rest',
]);
const PHISH_WORDS = ['login', 'signin', 'verify', 'secure', 'account', 'update',
  'confirm', 'webscr', 'bank', 'paypal', 'wallet', 'unlock', 'support', 'recovery'];

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

function isIp(host) {
  return IP_RE.test(host) || host.includes(':'); // v4 or v6
}

// ---- RDAP (free WHOIS) -------------------------------------------------------
async function rdapLookup(domain) {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const reg = (data.events || []).find((e) => e.eventAction === 'registration');
    const exp = (data.events || []).find((e) => e.eventAction === 'expiration');
    const registrarEntity = (data.entities || []).find((e) => (e.roles || []).includes('registrar'));
    let registrar = '';
    const vcard = registrarEntity?.vcardArray?.[1];
    if (Array.isArray(vcard)) {
      const fn = vcard.find((v) => v[0] === 'fn');
      registrar = fn?.[3] || '';
    }
    const nameservers = (data.nameservers || []).map((n) => n.ldhName).filter(Boolean);
    const created = reg?.eventDate || null;
    let ageDays = null;
    if (created) ageDays = Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
    return {
      created,
      expires: exp?.eventDate || null,
      ageDays,
      registrar,
      nameservers,
      status: data.status || [],
    };
  } catch {
    return null;
  }
}

// ---- Optional Google Safe Browsing ------------------------------------------
async function safeBrowsing(url) {
  const key = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          client: { clientId: 'hudhud', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.matches) && data.matches.length
      ? data.matches.map((m) => m.threatType)
      : [];
  } catch {
    return null;
  }
}

// ---- Main check --------------------------------------------------------------
export async function checkUrl(rawUrl) {
  let input = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(input)) input = 'http://' + input; // assume http if scheme missing

  let url;
  try {
    url = new URL(input);
  } catch {
    return { url: rawUrl, level: 'invalid', score: 0, flags: ['رابط غير صالح'], domain: null };
  }

  const host = url.hostname.toLowerCase();
  const parts = host.split('.');
  const tld = parts[parts.length - 1];
  const base = parts.slice(-2).join('.');
  const flags = [];
  let score = 0;

  if (url.protocol !== 'https:') {
    flags.push('الرابط غير مشفّر (http بدل https)');
    score += 15;
  }
  if (isIp(host)) {
    flags.push('يستخدم عنوان IP بدل اسم نطاق');
    score += 30;
  }
  if (host.startsWith('xn--') || host.includes('.xn--')) {
    flags.push('يستخدم أحرفاً مموّهة (IDN/punycode) قد تنتحل نطاقاً معروفاً');
    score += 35;
  }
  if (input.includes('@')) {
    flags.push('يحتوي على «@» قد يخفي الوجهة الحقيقية');
    score += 30;
  }
  if (SHORTENERS.has(base)) {
    flags.push('رابط مختصر — الوجهة الحقيقية مخفية');
    score += 20;
  }
  if (ABUSED_TLDS.has(tld)) {
    flags.push(`امتداد نطاق (.${tld}) يُساء استخدامه كثيراً`);
    score += 20;
  }
  if (parts.length > 4) {
    flags.push('عدد كبير من النطاقات الفرعية');
    score += 15;
  }
  const phishHit = PHISH_WORDS.find((w) => host.includes(w));
  if (phishHit) {
    flags.push(`كلمة تُستخدم في التصيّد ضمن اسم النطاق («${phishHit}»)`);
    score += 20;
  }
  if (input.length > 100) {
    flags.push('رابط طويل بشكل غير معتاد');
    score += 5;
  }
  if (/[0-9]/.test(base.replace(/\d+$/, '')) && /[a-z]/.test(base)) {
    // digits mixed into the brand part (e.g. paypa1, g00gle)
    flags.push('أرقام مدمجة باسم النطاق قد تنتحل علامة معروفة');
    score += 10;
  }

  // External signals.
  const domain = isIp(host) ? null : await rdapLookup(base);
  if (domain?.ageDays != null) {
    if (domain.ageDays < 30) {
      flags.push(`النطاق حديث جداً (عُمره ${domain.ageDays} يوماً)`);
      score += 30;
    } else if (domain.ageDays < 180) {
      flags.push(`النطاق حديث نسبياً (عُمره ${domain.ageDays} يوماً)`);
      score += 12;
    }
  } else if (!isIp(host)) {
    flags.push('تعذّر التحقق من بيانات تسجيل النطاق');
    score += 5;
  }

  const sb = await safeBrowsing(url.href);
  if (sb && sb.length) {
    flags.push(`أدرجته خدمة Google Safe Browsing كتهديد: ${sb.join(', ')}`);
    score += 60;
  }

  score = Math.min(100, score);
  let level = 'safe';
  if (score >= 60) level = 'dangerous';
  else if (score >= 25) level = 'suspicious';

  return { url: url.href, host, tld, level, score, flags, domain, safeBrowsing: sb };
}

// Extract up to `max` URLs from arbitrary text.
export function extractUrls(text, max = 10) {
  const re = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;
  const seen = new Set();
  const out = [];
  for (const m of String(text || '').matchAll(re)) {
    const u = m[1];
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
    if (out.length >= max) break;
  }
  return out;
}
