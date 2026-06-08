import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { keepIfSame } from '../utils/keepIfSame.js';
import ImagePreviewModal from './ImagePreviewModal.jsx';

// localStorage key for messages queued while offline (per user).
const pendingKey = (id) => `hudhud_pending_chat_${id}`;

// Team chat for the left sidebar. The user is only ever in one team, so this
// always shows that team's conversation (or a prompt when they have no team).
// Supports text messages and file attachments (uploaded to Cloudinary).
// Props:
//  - active: whether the chat is currently visible/focused. When false (e.g.
//    the user is on the AI tab) incoming messages are counted as unread.
//  - onUnreadChange: called with the current unread count so a parent (the tab
//    bar) can show a badge.
//  - showHeader: hide the internal title when the surrounding tab already labels
//    the panel.
export default function TeamChat({ active = true, onUnreadChange, showHeader = true }) {
  const { user } = useAuth();
  const online = useOnline();
  const [team, setTeam] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState([]); // messages queued while offline
  const [previewImage, setPreviewImage] = useState(null); // { url, name }

  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const flushingRef = useRef(false);

  async function load() {
    try {
      const r = await api.get('/team-messages');
      setTeam((prev) => keepIfSame(prev, r.data.team));
      setMessages((prev) => keepIfSame(prev, r.data.messages));
    } catch {
      // Keep prior state on transient errors.
    } finally {
      setLoading(false);
    }
  }

  async function loadUnreadCount() {
    try {
      const r = await api.get('/team-messages/unread-count');
      onUnreadChange?.(r.data.count || 0);
    } catch (e) {
      console.error('Failed to load unread count:', e);
    }
  }

  async function markAsRead() {
    try {
      await api.post('/team-messages/mark-read');
      onUnreadChange?.(0);
    } catch (e) {
      console.error('Failed to mark messages as read:', e);
    }
  }

  useEffect(() => {
    load();
    loadUnreadCount();
    const id = setInterval(() => {
      load();
      loadUnreadCount();
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // Mark messages as read when chat becomes active
  useEffect(() => {
    if (active) {
      markAsRead();
    }
  }, [active]);

  // Load any messages that were queued offline in a previous session.
  useEffect(() => {
    if (!user?.id) return;
    try {
      setPending(JSON.parse(localStorage.getItem(pendingKey(user.id)) || '[]'));
    } catch {
      setPending([]);
    }
  }, [user?.id]);

  // Persist the queue so it survives reloads while offline.
  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(pendingKey(user.id), JSON.stringify(pending));
  }, [pending, user?.id]);

  // Flush the queue when back online (and after it's loaded from storage). Each
  // success drops one item, which re-runs this effect to send the next; a
  // failure stops the run so it retries on the next reconnect.
  useEffect(() => {
    if (!online || !pending.length || flushingRef.current) return;
    (async () => {
      flushingRef.current = true;
      try {
        for (const item of pending) {
          try {
            await api.post('/team-messages', { body: item.body });
            setPending((prev) => prev.filter((p) => p.tempId !== item.tempId));
          } catch {
            break; // still failing — leave the rest queued for the next attempt
          }
        }
        await load();
      } finally {
        flushingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pending.length]);

  function enqueue(body) {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setPending((prev) => [...prev, { tempId, body }]);
  }

  // Auto-scroll to the newest message when near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, pending.length]);

  async function send() {
    const body = text.trim();
    if ((!body && !file) || busy) return;

    // Offline: attachments need an upload (online only); plain text is queued
    // and sent automatically once the connection is back.
    if (!online) {
      if (file) {
        setError('لا يمكن إرسال المرفقات دون اتصال بالإنترنت.');
        return;
      }
      enqueue(body);
      setText('');
      return;
    }

    setBusy(true);
    setError('');
    try {
      let attachment = {};
      if (file) {
        const form = new FormData();
        form.append('file', file);
        const up = await api.post('/team-messages/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        attachment = {
          file_url: up.data.url,
          file_name: up.data.name,
          file_type: up.data.type,
        };
      }
      const r = await api.post('/team-messages', { body, ...attachment });
      setMessages((prev) => [...prev, r.data.message]);
      setText('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      // A network drop mid-send (no file): keep the text and retry on reconnect.
      if (!file && body) {
        enqueue(body);
        setText('');
      } else {
        setError(e.message || 'تعذّر إرسال الرسالة');
      }
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {showHeader && (
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-bold text-gray-700">💬 محادثة الفريق</h2>
          {team && <p className="text-[11px] text-gray-400 truncate">{team.name}</p>}
        </div>
      )}

      {loading ? (
        <div className="flex-1 grid place-items-center text-xs text-gray-400">جارٍ التحميل…</div>
      ) : !team ? (
        <div className="flex-1 grid place-items-center p-4">
          <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-4 text-center space-y-2">
            <p>لست عضواً في أي فريق بعد.</p>
            <Link to="/team" className="inline-block text-brand hover:underline">
              إنشاء فريق أو الانضمام لفريق
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
            {messages.length === 0 && pending.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">لا توجد رسائل بعد. ابدأ المحادثة!</p>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === user?.id;
                const senderName = m.display_name || m.email;
                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 ${mine ? 'justify-start' : 'justify-end'}`}
                  >
                    {mine && <ChatAvatar name={senderName} src={m.avatar_path} />}
                    <div className={`flex flex-col max-w-[80%] ${mine ? 'items-start' : 'items-end'}`}>
                      <div
                        className={`rounded-2xl px-3 py-2 text-xs ${
                          mine ? 'bg-brand text-white' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <Attachment message={m} mine={mine} onImageClick={(url, name) => setPreviewImage({ url, name })} />
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        <div className={`text-[9px] mt-1 ${mine ? 'text-white/70' : 'text-gray-400'}`}>
                        {new Date(m.created_at + 'Z').toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        </div>
                      </div>
                    </div>
                    {!mine && <ChatAvatar name={senderName} src={m.avatar_path} showName />}
                  </div>
                );
              })
            )}

            {/* Messages queued offline, shown as pending until they send. */}
            {pending.map((p) => (
              <div key={p.tempId} className="flex items-end gap-2 justify-start opacity-70">
                <ChatAvatar name={user?.display_name || user?.email} src={user?.avatar_path} />
                <div className="flex flex-col max-w-[80%] items-start">
                  <div className="rounded-2xl px-3 py-2 text-xs bg-brand text-white">
                    <p className="whitespace-pre-wrap break-words">{p.body}</p>
                    <div className="text-[9px] mt-1 text-white/70 flex items-center gap-1">
                      <span>🕓</span>
                      <span>{online ? 'جارٍ الإرسال…' : 'بانتظار الاتصال'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {error && <p className="text-[11px] text-flag-red px-3 pb-1">{error}</p>}
          {!online && (
            <p className="text-[11px] text-amber-600 bg-amber-50 px-3 py-1 text-center">
              غير متصل — ستُرسل رسائلك تلقائياً عند عودة الاتصال
            </p>
          )}

          <div className="border-t border-gray-100 p-2 shrink-0">
            {file && (
              <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-1 px-1">
                <span className="truncate">📎 {file.name}</span>
                <button
                  onClick={() => {
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  className="text-gray-400 hover:text-flag-red"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                title="إرفاق ملف"
                className="shrink-0 text-lg text-gray-400 hover:text-brand p-1"
              >
                📎
              </button>
              <input ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="اكتب رسالة…"
                className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2 max-h-24 focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-gray-300"
              />
              <button
                onClick={send}
                disabled={busy || (!text.trim() && !file)}
                className="shrink-0 bg-brand text-white text-sm px-4 py-2 rounded-xl hover:bg-brand-dark disabled:opacity-40"
              >
                {busy ? '…' : 'إرسال'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage.url}
          fileName={previewImage.name}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

// Download an attachment through the backend proxy so it keeps its original
// filename + extension (Cloudinary serves it under a random public_id).
async function downloadAttachment(message) {
  try {
    const res = await api.get(`/team-messages/${message.id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = message.file_name || 'ملف';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Download failed:', e);
  }
}

// Classify by MIME type first, then fall back to the file extension — uploads
// sometimes carry a generic type (e.g. application/octet-stream).
function fileKind({ file_type = '', file_name = '', file_url = '' }) {
  const mime = file_type || '';
  const name = (file_name || file_url || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(name)) return 'image';
  if (mime.startsWith('audio/') || /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/.test(name)) return 'audio';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|mkv|avi)$/.test(name)) return 'video';
  return 'file';
}

function ChatAvatar({ name, src, showName = false }) {
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 self-end w-10">
      <div className="w-7 h-7 rounded-full bg-brand-light grid place-items-center overflow-hidden">
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-brand text-[11px] font-medium">{(name || '؟')[0].toUpperCase()}</span>
        )}
      </div>
      {showName && (
        <span
          title={name}
          className="text-[9px] text-gray-400 leading-tight text-center w-full truncate"
        >
          {name}
        </span>
      )}
    </div>
  );
}

function Attachment({ message, mine, onImageClick }) {
  if (!message.file_url) return null;
  const kind = fileKind(message);

  if (kind === 'image') {
    return (
      <button
        type="button"
        onClick={() => onImageClick(message.file_url, message.file_name)}
        className="block mb-1 cursor-pointer"
      >
        <img
          src={message.file_url}
          alt={message.file_name || ''}
          className="rounded-lg max-h-40 w-auto object-cover hover:opacity-90 transition-opacity"
        />
      </button>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="mb-1 space-y-1">
        <audio controls preload="metadata" src={message.file_url} className="w-full max-w-[240px]" />
        {message.file_name && (
          <p className={`text-[10px] truncate ${mine ? 'text-white/80' : 'text-gray-500'}`}>
            🎵 {message.file_name}
          </p>
        )}
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <div className="mb-1 space-y-1">
        <video controls preload="metadata" src={message.file_url} className="rounded-lg max-h-48 w-full max-w-[280px]" />
        {message.file_name && (
          <p className={`text-[10px] truncate ${mine ? 'text-white/80' : 'text-gray-500'}`}>
            🎬 {message.file_name}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => downloadAttachment(message)}
      title="تنزيل الملف"
      className={`flex items-center gap-1.5 mb-1 underline ${
        mine ? 'text-white' : 'text-brand'
      }`}
    >
      📎 <span className="truncate">{message.file_name || 'ملف مرفق'}</span>
      <span className="text-[10px] opacity-70">⬇</span>
    </button>
  );
}
