// Real-time speech-to-text over WebSocket.
//
// Browser mic audio → our WS (/api/transcribe/stream) → Deepgram live → back to
// the browser as interim/final transcripts. The Deepgram key never leaves the
// server; the client authenticates with its JWT as a query param.

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PATH = '/api/transcribe/stream';

export function setupTranscribeWS(server) {
  if (!process.env.DEEPGRAM_API_KEY) return; // feature off
  const wss = new WebSocketServer({ noServer: true });
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return;
    }
    if (url.pathname !== PATH) return; // not ours — ignore
    const token = url.searchParams.get('token');
    try {
      jwt.verify(token, SECRET);
    } catch {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const dg = deepgram.listen.live({
      model: process.env.DEEPGRAM_MODEL || 'nova-3',
      language: process.env.DEEPGRAM_LANGUAGE || 'ar',
      smart_format: true,
      interim_results: true,
    });

    let open = false;
    const queue = [];

    dg.on(LiveTranscriptionEvents.Open, () => {
      open = true;
      while (queue.length) dg.send(queue.shift());
    });
    dg.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data?.channel?.alternatives?.[0]?.transcript || '';
      if (transcript && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ transcript, is_final: !!data.is_final }));
      }
    });
    dg.on(LiveTranscriptionEvents.Error, (e) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ error: e?.message || 'خطأ في التفريغ' }));
    });
    dg.on(LiveTranscriptionEvents.Close, () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });

    // Audio chunks (binary) from the browser → Deepgram.
    ws.on('message', (msg) => {
      if (open) dg.send(msg);
      else queue.push(msg);
    });
    ws.on('close', () => {
      try {
        dg.finish();
      } catch {
        /* ignore */
      }
    });
  });
}
