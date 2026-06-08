# 🔑 API Keys You Need (all free)

The app needs **3 free API keys**. None of them require a paid plan for this project.
Create each account, copy the key, and paste it into `backend/.env` (copy `backend/.env.example` → `backend/.env` first).

| Key | What it's for | Cost | Required? |
|-----|---------------|------|-----------|
| `GEMINI_API_KEY` | Arabic grammar/spelling + terminology correction of articles | Free | ✅ Yes (core feature) |
| `OPENROUTER_API_KEY` | Multi-model chat box (switch between ~25 free LLMs) | Free | ✅ Yes (chat feature) |
| `OPENAI_API_KEY` | Content moderation (shocking / inappropriate scoring) | Free* | ⬜ Optional (skipped if missing) |

\* OpenAI's **moderation endpoint is free** (not billed), but creating the account may ask for a phone number.

> If a key is missing, the app still runs — that one feature is skipped with a clear notice. So you can start with just `GEMINI_API_KEY`.

---

## 1️⃣ GEMINI_API_KEY — Google AI Studio (required)

Used for: correcting Arabic grammar/spelling and explaining each change.

**Steps:**
1. Go to **https://aistudio.google.com/apikey**
2. Sign in with a Google account.
3. Click **"Create API key"** (or "Get API key").
4. Copy the key (looks like `AIza...`).
5. Paste it into `backend/.env`:
   ```
   GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX
   ```

**Free limits:** ~15 requests/min, ~1,500 requests/day, 1M-token context.
**Privacy note:** On the free tier, Google may use your text to improve its products (human review possible). Don't paste secret/private info. The free tier is **not available to users in the EEA / UK / Switzerland** — those need the paid tier.

---

## 2️⃣ OPENROUTER_API_KEY — OpenRouter (required for chat)

Used for: the chat box, where you switch between many free models (DeepSeek, Qwen3, Llama, etc.) from one key.

**Steps:**
1. Go to **https://openrouter.ai/** and sign up (Google/GitHub login works).
2. Open **https://openrouter.ai/keys**
3. Click **"Create Key"**, give it a name, and copy it (looks like `sk-or-v1-...`).
4. Paste it into `backend/.env`:
   ```
   OPENROUTER_API_KEY=sk-or-v1-XXXXXXXXXXXXXXXXXXXXXXXX
   ```

**Free limits:** 20 requests/min and **50 requests/day** on free models.
👉 Tip: a **one-time $10 credit** purchase raises this to **1,000 requests/day** (you don't have to spend it — just having bought credits unlocks the higher cap). Not required to start.
**Browse free models:** https://openrouter.ai/models?max_price=0

---

## 4️⃣ DEEPGRAM_API_KEY — Deepgram (optional, voice dictation)

Used for: the **🎙️ microphone** in the article editor — speak in Palestinian Arabic and it transcribes into the text area.

**Steps:**
1. Go to **https://console.deepgram.com** and sign up (no credit card).
2. You get **$200 free credit** (≈ 400+ hours of audio).
3. Create an API key and copy it.
4. Paste it into `backend/.env`:
   ```
   DEEPGRAM_API_KEY=...
   DEEPGRAM_MODEL=nova-3
   DEEPGRAM_LANGUAGE=ar
   ```

**Notes:** dialect transcription still has ~20% word-error-rate on real Palestinian speech — **always review** the transcript. If the key is missing, the mic button just won't appear.

---

## 3️⃣ OPENAI_API_KEY — OpenAI (optional, free moderation)

Used for: scoring how shocking / inappropriate an article is. If you skip it, the app just won't show those percentages.

**Steps:**
1. Go to **https://platform.openai.com/** and sign up / log in.
2. Open **https://platform.openai.com/api-keys**
3. Click **"Create new secret key"**, copy it (looks like `sk-...`). You only see it once.
4. Paste it into `backend/.env`:
   ```
   OPENAI_API_KEY=sk-XXXXXXXXXXXXXXXXXXXXXXXX
   ```

**Cost:** The **moderation** model (`omni-moderation-latest`) is **free** and does not count against billing. (Other OpenAI models cost money — we only use moderation.)

---

## 5️⃣ SERPER_API_KEY — Serper.dev (optional, reverse image search)

Used for: the **🖼️ التحقق من الصور** page — finds where an image appeared online.

1. Sign up at **https://serper.dev** (Google login, no card).
2. Free tier: **2,500 searches/month**.
3. Copy your key from the dashboard → `backend/.env`:
   ```
   SERPER_API_KEY=...
   ```

## 6️⃣ SCAMAI_API_KEY — ScamAI (optional, AI-image detection)

Used for: the **🖼️ التحقق من الصور** page — detects AI-generated / deepfake images.

1. Sign up at **https://app.scam.ai**.
2. Free tier: **~200 detections/month**.
3. Copy your key → `backend/.env`:
   ```
   SCAMAI_API_KEY=...
   SCAMAI_MODEL=eva-v1-fast
   ```

> **Privacy note:** the image-verification tools upload your image to external services (a temporary host + Google + ScamAI) to run the checks. This applies to sensitive images too — only use it when that's acceptable.

---

## ✅ Final `backend/.env` should look like this

```env
PORT=4000
JWT_SECRET=any-long-random-text-you-make-up

GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-3-flash-lite

OPENROUTER_API_KEY=sk-or-v1-...

OPENAI_API_KEY=sk-...
```

After saving the file, start the backend and you're ready. 🎉
