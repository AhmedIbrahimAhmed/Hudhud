import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { useChat } from '../chat/ChatContext.jsx';
import { useOnline } from '../hooks/useOnline.js';
import MicDictation from './MicDictation.jsx';

// Friendly short label for an OpenRouter model id like
// "meta-llama/llama-3.3-70b-instruct:free".
function shortName(id) {
  return id.replace(':free', '').split('/').pop();
}

export default function ChatAssistant() {
  // Conversation + selected model live in shared context (saved with the
  // session and restored when a session is opened).
  const { messages, setMessages, model, setModel } = useChat();
  const online = useOnline();
  const [models, setModels] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(''); // shown in a banner directly above the input
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api
      .get('/chat/models')
      .then((r) => {
        const list = r.data.models || [];
        setModels(list);
        if (r.data.notice) setNotice(r.data.notice);
        // Keep the saved model if it's still available; otherwise pick the first.
        setModel((cur) => (list.some((m) => m.id === cur) ? cur : list[0]?.id || ''));
      })
      .catch((e) => setNotice(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for "ask the assistant about this selected text" from the result.
  useEffect(() => {
    function onAsk(e) {
      const text = (e.detail || '').trim();
      if (!text) return;
      setInput((prev) => `${prev ? prev + '\n' : ''}بخصوص هذا المقطع: «${text}»\n`);
      inputRef.current?.focus();
    }
    window.addEventListener('ask-assistant', onAsk);
    return () => window.removeEventListener('ask-assistant', onAsk);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, sending]);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !model || sending || !online) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    if (inputRef.current) inputRef.current.style.height = 'auto'; // reset size
    setInput('');
    setSending(true);
    try {
      // Only send real conversation turns upstream — drop any local "error"
      // bubbles, which OpenRouter rejects as an unknown role.
      const history = next
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));
      const r = await api.post('/chat', { model, messages: history });
      setMessages([...next, { role: 'assistant', content: r.data.reply }]);
    } catch (err) {
      setMessages([...next, { role: 'error', content: err.message }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative flex flex-col h-full min-h-0">
      {/* Faint chat watermark behind the conversation */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-28 h-28 text-brand opacity-[0.05]"
          aria-hidden="true"
        >
          <path d="M12 3C6.477 3 2 6.79 2 11.5c0 2.21.99 4.21 2.6 5.72-.13 1.27-.6 2.6-1.32 3.62a.5.5 0 0 0 .54.77c1.83-.36 3.3-1.02 4.3-1.6 1.18.38 2.48.49 3.88.49 5.523 0 10-3.79 10-8.5S17.523 3 12 3Z" />
        </svg>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-6">
            اسأل المساعد أي شيء — اختر النموذج من شريط الأدوات بالأسفل.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-xs rounded-xl px-3 py-2 max-w-[90%] whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-brand text-white mr-auto'
                : m.role === 'error'
                ? 'bg-red-50 text-flag-red ml-auto'
                : 'bg-gray-100 text-gray-800 ml-auto'
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && <div className="text-xs text-gray-400 ml-auto">يكتب…</div>}
      </div>

      {notice && <p className="px-3 text-[10px] text-amber-600">{notice}</p>}

      {/* Error banner — rendered directly ABOVE the input/compose row so it
          pushes up from the input instead of covering messages or sitting in an
          awkward spot. Used for microphone/dictation errors propagated from
          MicDictation. Dismissible. */}
      {error && (
        <div
          role="alert"
          className="relative z-10 mx-2 mb-1 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-flag-red"
        >
          <span className="leading-snug">{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            title="إغلاق"
            className="shrink-0 text-flag-red/70 hover:text-flag-red"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input box with a Copilot-style toolbar: text on top, then a small
          model picker + send button on the action row. */}
      <form onSubmit={send} className="relative z-10 m-2 border border-gray-200 rounded-xl bg-white focus-within:ring-1 focus-within:ring-brand">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-grow up to the max height.
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a new line.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          rows={1}
          placeholder="اكتب رسالتك… (Shift+Enter لسطر جديد)"
          className="w-full text-xs px-3 py-2 bg-transparent focus:outline-none placeholder:text-gray-300 resize-none overflow-y-auto"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          {/* Small inline model selector (like Copilot's) */}
          <div className="relative inline-flex items-center">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!models.length}
              title="اختيار النموذج"
              className="appearance-none max-w-[150px] truncate text-[11px] text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-md ps-2 pe-5 py-1 focus:outline-none cursor-pointer"
            >
              {models.length === 0 && <option>لا نماذج</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {shortName(m.id)}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute left-1.5 text-[9px] text-gray-400">▼</span>
          </div>

          <div className="flex items-center gap-1.5">
            <MicDictation
              compact
              online={online}
              onError={setError}
              onTranscript={(t) => {
                setError(''); // a successful transcript clears any stale mic error
                setInput((prev) => (prev.trim() ? `${prev.trimEnd()} ${t}` : t));
                inputRef.current?.focus();
              }}
            />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                title="مسح المحادثة"
                className="text-[11px] text-gray-400 hover:text-flag-red px-1"
              >
                مسح
              </button>
            )}
            <button
              type="submit"
              disabled={sending || !model || !online}
              title={!online ? 'غير متصل' : undefined}
              className="bg-brand text-white text-xs px-3 py-1 rounded-md disabled:opacity-40"
            >
              إرسال
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
