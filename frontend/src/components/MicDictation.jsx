import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';

// Real-time mic dictation: streams audio over a WebSocket to the backend
// (which relays to Deepgram live) and appends recognized Arabic text as you
// speak. Only shown when the backend has transcription enabled and the browser
// supports MediaRecorder.
export default function MicDictation({ onTranscript, onError, online = true, compact = false }) {
  const [enabled, setEnabled] = useState(false);
  const [recording, setRecording] = useState(false);
  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);

  // Surface errors to the parent (rendered in a banner above the input) when an
  // onError callback is provided; otherwise fall back to local inline state.
  const [localError, setLocalError] = useState('');
  const reportError = (msg) => (onError ? onError(msg) : setLocalError(msg));
  const clearError = () => (onError ? onError('') : setLocalError(''));

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'MediaRecorder' in window;
    if (!supported) return;
    api
      .get('/health')
      .then((r) => setEnabled(!!r.data?.features?.transcribe))
      .catch(() => setEnabled(false));
  }, []);

  // Clean up on unmount.
  useEffect(() => () => cleanup(), []);

  function cleanup() {
    try {
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    } catch {
      /* ignore */
    }
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function pickMime() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
  }

  async function start() {
    clearError();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const token = localStorage.getItem('token');
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/api/transcribe/stream?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        const mimeType = pickMime();
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorderRef.current = mr;
        mr.ondataavailable = (e) => {
          if (e.data.size && ws.readyState === WebSocket.OPEN) {
            e.data.arrayBuffer().then((buf) => ws.send(buf));
          }
        };
        mr.start(250); // send a chunk every 250ms
        setRecording(true);
      };
      ws.onmessage = (ev) => {
        let data;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data.error) {
          reportError(data.error);
          return;
        }
        // Append only final segments to avoid flickering/duplicates.
        if (data.is_final && data.transcript) onTranscript(data.transcript);
      };
      ws.onerror = () => reportError('تعذّر الاتصال بخدمة التفريغ');
      ws.onclose = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
    } catch {
      reportError('تعذّر الوصول إلى الميكروفون — تحقّق من إذن المتصفح.');
    }
  }

  function stop() {
    try {
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    } catch {
      /* ignore */
    }
    wsRef.current?.close();
    setRecording(false);
  }

  const label = recording ? (compact ? '⏹' : '⏹ إيقاف') : compact ? '🎙️' : '🎙️ إملاء';

  const isDisabled = !online || !enabled;
  const tooltipText = !online 
    ? 'غير متصل' 
    : !enabled 
      ? 'خدمة التفريغ غير مفعّلة في الخادم' 
      : recording 
        ? 'إيقاف التسجيل' 
        : 'إملاء صوتي مباشر';

  return (
    <div className="flex items-center gap-2">
      {/* When a parent handles errors (onError), they render in the banner above
          the input; otherwise fall back to a small inline note here. */}
      {!onError && localError && (
        <span className="text-[10px] text-flag-red max-w-[160px]">{localError}</span>
      )}
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={isDisabled}
        title={tooltipText}
        className={`flex items-center gap-1.5 transition disabled:opacity-40 ${
          compact ? 'text-sm rounded-md px-1.5 py-1' : 'text-xs rounded-xl px-3 py-2 border'
        } ${
          recording
            ? 'bg-red-50 text-flag-red animate-pulse ' + (compact ? '' : 'border-red-200')
            : compact
              ? 'text-gray-400 hover:text-brand'
              : 'bg-white border-gray-200 text-gray-600 hover:border-brand hover:text-brand'
        }`}
      >
        {label}
      </button>
    </div>
  );
}
