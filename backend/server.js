import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupTranscribeWS } from './wsTranscribe.js';
import { init as initDb } from './db/index.js';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import articleRoutes from './routes/articles.js';
import chatRoutes from './routes/chat.js';
import transcribeRoutes from './routes/transcribe.js';
import ttsRoutes from './routes/tts.js';
import domainRoutes from './routes/domain.js';
import taskRoutes from './routes/tasks.js';
import imageRoutes from './routes/image.js';
import teamRoutes from './routes/teams.js';
import notificationRoutes from './routes/notifications.js';
import teamTaskRoutes from './routes/teamTasks.js';
import teamMessageRoutes from './routes/teamMessages.js';
import videoDetectionRoutes from './routes/videoDetection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve uploaded avatars.
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Health + feature-flag check (used by the frontend to show notices).
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    features: {
      correction: !!process.env.GEMINI_API_KEY,
      chat: !!process.env.OPENROUTER_API_KEY,
      moderation: !!process.env.OPENAI_API_KEY,
      transcribe: !!process.env.DEEPGRAM_API_KEY,
      imageReverse: !!process.env.SERPAPI_API_KEY || !!process.env.SERPER_API_KEY,
      imageAi:
        (!!process.env.SIGHTENGINE_API_USER && !!process.env.SIGHTENGINE_API_SECRET) ||
        !!process.env.SCAMAI_API_KEY,
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/transcribe', transcribeRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/domain', domainRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/team-tasks', teamTaskRoutes);
app.use('/api/team-messages', teamMessageRoutes);
app.use('/api/defence', videoDetectionRoutes);

// Multer / generic error handler (returns Arabic message).
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'خطأ في الخادم' });
});

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);
setupTranscribeWS(server); // real-time transcription WebSocket

// First non-internal IPv4 address, so the server can be reached over the LAN.
function lanAddress() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

// Wait for the database (and apply the schema) before accepting requests, then
// bind to 0.0.0.0 so the API is reachable from other devices on the network.
initDb()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      const lan = lanAddress();
      console.log(`✅ Hudhud backend running on:`);
      console.log(`   • Local:   http://localhost:${PORT}`);
      if (lan) console.log(`   • Network: http://${lan}:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('❌ Failed to initialize database:', e);
    process.exit(1);
  });
