/* eslint-disable no-useless-assignment */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/use-memo */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client.js";
import ArticleEditor from "../components/ArticleEditor.jsx";
import CorrectionReport from "../components/CorrectionReport.jsx";
import NotificationPanel from "../components/NotificationPanel.jsx";
import { useChat } from "../chat/ChatContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Build highlighted HTML for one field: accepted = green, pending = amber
// highlight, rejected = plain original.
function buildHTML(source, corrections, field) {
  const cs = corrections
    .filter((c) => c.field === field)
    .sort((a, b) => a.start - b.start);
  let html = "";
  let cursor = 0;
  for (const c of cs) {
    if (c.start < cursor) continue; // skip overlaps
    html += esc(source.slice(cursor, c.start));
    if (c.status === "accepted") {
      html += `<mark class="bg-brand-light text-brand-dark rounded px-0.5">${esc(c.corrected)}</mark>`;
    } else if (c.status === "rejected") {
      html += `<mark class="bg-red-200 text-red-900 rounded px-0.5">${esc(source.slice(c.start, c.end))}</mark>`;
    } else {
      html += `<mark class="bg-amber-200 text-amber-900 rounded px-0.5">${esc(source.slice(c.start, c.end))}</mark>`;
    }
    cursor = c.end;
  }
  html += esc(source.slice(cursor));
  return html;
}

// A contentEditable area that shows the highlighted result AND lets the user
// type. It is uncontrolled: we only reset its HTML when the source text or a
// suggestion's status changes (i.e. when the user clicks accept/reject — the
// cursor isn't in the field then). Manual typing is read back via getText().
const EditablePreview = forwardRef(function EditablePreview(
  { source, corrections, field, className, rebuildKey },
  ref,
) {
  const innerRef = useRef(null);
  const sig = useMemo(
    () =>
      source +
      "|" +
      rebuildKey +
      "|" +
      corrections
        .filter((c) => c.field === field)
        .map((c) => `${c.id}:${c.status}`)
        .join(","),
    [source, corrections, field, rebuildKey],
  );

  useEffect(() => {
    if (innerRef.current)
      innerRef.current.innerHTML = buildHTML(source, corrections, field);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useImperativeHandle(ref, () => ({
    getText: () => innerRef.current?.innerText ?? "",
  }));

  return (
    <div
      ref={innerRef}
      contentEditable
      suppressContentEditableWarning
      dir="rtl"
      className={`focus:outline-none focus:ring-1 focus:ring-brand rounded-xl ${className}`}
    />
  );
});

// Apply accepted suggestions to a field (for the initial save fallback).
function applyField(source, corrections, field) {
  const accepted = corrections
    .filter((c) => c.status === "accepted" && c.field === field)
    .sort((a, b) => b.start - a.start);
  let text = source;
  for (const c of accepted)
    text = text.slice(0, c.start) + c.corrected + text.slice(c.end);
  return text;
}

function getDraftKey(userId) {
  return userId ? `hudhud:draft_${userId}` : "hudhud:draft";
}

function loadDraft(userId) {
  try {
    const key = getDraftKey(userId);
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  // Restore the in-progress draft (survives reload AND navigation).
  const draft0 = useMemo(() => loadDraft(user?.id), [user?.id]);
  const [title, setTitle] = useState(draft0.title || "");
  const [body, setBody] = useState(draft0.body || "");
  const [result, setResult] = useState(draft0.result || null);
  const [collapsed, setCollapsed] = useState(draft0.collapsed || false);
  const [currentId, setCurrentId] = useState(draft0.currentId || null);
  const [autoStatus, setAutoStatus] = useState(""); // '', 'saving', 'saved'
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedContent, setSavedContent] = useState(null);
  const [rebuildKey, setRebuildKey] = useState(0);
  const [sel, setSel] = useState(null); // { text, x, y } for the "ask assistant" button
  const [showNotifications, setShowNotifications] = useState(false);

  // Each article session owns its AI conversation (shared context).
  const { messages: chatMessages, setMessages: setChatMessages } = useChat();
  const [searchParams, setSearchParams] = useSearchParams();

  // Online/offline handling — keep working offline, sync when back.
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const pendingSync = useRef(false); // unsaved-to-server changes exist
  const persistRef = useRef(null); // latest persist() for the online handler

  // Mirror the draft to localStorage instantly (crash/reload safety, free).
  useEffect(() => {
    const key = getDraftKey(user?.id);
    localStorage.setItem(
      key,
      JSON.stringify({ title, body, result, collapsed, currentId }),
    );
  }, [title, body, result, collapsed, currentId, user?.id]);

  // Reload draft when user changes (login/logout with different account)
  useEffect(() => {
    if (user?.id) {
      const draft = loadDraft(user.id);
      setTitle(draft.title || "");
      setBody(draft.body || "");
      setResult(draft.result || null);
      setCollapsed(draft.collapsed || false);
      setCurrentId(draft.currentId || null);
    } else {
      // No user logged in, clear the form
      setTitle("");
      setBody("");
      setResult(null);
      setCollapsed(false);
      setCurrentId(null);
    }
  }, [user?.id]);

  // Capture a text selection inside the result to offer "ask the assistant".
  function onResultMouseUp() {
    const s = window.getSelection();
    const text = s?.toString().trim();
    if (text && s.rangeCount) {
      const rect = s.getRangeAt(0).getBoundingClientRect();
      setSel({ text, x: rect.left + rect.width / 2, y: rect.top });
    } else {
      setSel(null);
    }
  }
  function askAssistant() {
    if (sel)
      window.dispatchEvent(
        new CustomEvent("ask-assistant", { detail: sel.text }),
      );
    setSel(null);
  }

  const titleRef = useRef(null);
  const bodyRef = useRef(null);

  async function process() {
    setProcessing(true);
    setError("");
    setSaved(false);
    try {
      const r = await api.post("/articles/process", { title, body });
      setResult(r.data);
      setCollapsed(true); // hide inputs, reveal the result
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }

  function setStatus(id, status) {
    setSaved(false);
    setResult((prev) => ({
      ...prev,
      corrections: prev.corrections.map((c) =>
        c.id === id ? { ...c, status } : c,
      ),
    }));
  }
  const accept = (id) => setStatus(id, "accepted");
  const reject = (id) => setStatus(id, "rejected");
  function acceptAll() {
    setSaved(false);
    setResult((prev) => ({
      ...prev,
      corrections: prev.corrections.map((c) =>
        c.status === "pending" ? { ...c, status: "accepted" } : c,
      ),
    }));
  }
  // Start a NEW blank session (does not delete the saved one in the DB).
  function resetAll() {
    setTitle("");
    setBody("");
    setResult(null);
    setCollapsed(false);
    setError("");
    setSaved(false);
    setCurrentId(null);
    setAutoStatus("");
    setRebuildKey((k) => k + 1);
    setChatMessages([]); // new session => fresh conversation
    setSearchParams({}, { replace: true }); // drop ?session from the URL
    const key = getDraftKey(user?.id);
    localStorage.removeItem(key);
  }


  const corrections = result?.corrections || [];
  const acceptedCount = corrections.filter(
    (c) => c.status === "accepted",
  ).length;

  // Upsert the current session to the DB. Original title/body are stored (so the
  // session can be reopened and edited); cleaned_text holds the final body.
  async function persist({ silent }) {
    if (!title.trim() && !body.trim()) return null;
    const finalTitle =
      titleRef.current?.getText() ?? applyField(title, corrections, "title");
    const finalBody =
      bodyRef.current?.getText() ?? applyField(body, corrections, "body");
    const payload = {
      title,
      body,
      cleaned_text: finalBody,
      result,
      chat: chatMessages,
    };
    if (silent) setAutoStatus("saving");
    else setSaving(true);
    try {
      let article;
      if (currentId) {
        article = (await api.put(`/articles/${currentId}`, payload)).data
          .article;
      } else {
        article = (await api.post("/articles", payload)).data.article;
        setCurrentId(article.id);
      }
      pendingSync.current = false;
      if (silent) {
        setAutoStatus("saved");
      } else {
        setSaved(true);
        setSavedContent({ id: article.id, title: finalTitle, body: finalBody });
      }
      return article;
    } catch (e) {
      // Network failure (e.g. offline) — keep the local copy and mark pending.
      pendingSync.current = true;
      if (silent) setAutoStatus(navigator.onLine ? "" : "offline");
      else setError(e.message);
      return null;
    } finally {
      if (!silent) setSaving(false);
    }
  }
  const save = () => persist({ silent: false });
  persistRef.current = persist; // keep the online handler pointing at the latest

  // Debounced auto-save while typing (1.2s) — also saves the conversation.
  useEffect(() => {
    if (!title.trim() && !body.trim()) return;
    if (!navigator.onLine) {
      // Offline: the localStorage mirror already has it; sync when back online.
      pendingSync.current = true;
      setAutoStatus("offline");
      return;
    }
    setAutoStatus("saving");
    const t = setTimeout(() => persist({ silent: true }), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, result, chatMessages]);

  // Track connectivity; sync pending changes the moment we come back online.
  useEffect(() => {
    function goOnline() {
      setOnline(true);
      if (pendingSync.current) persistRef.current?.({ silent: true });
    }
    function goOffline() {
      setOnline(false);
      setAutoStatus("offline");
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Apply a fetched session record (object from the API) into the editor.
  function applySession(a) {
    if (!a) return;
    let res = null;
    let chat = [];
    try {
      res = a.result_json ? JSON.parse(a.result_json) : null;
    } catch {
      res = null;
    }
    try {
      chat = a.chat_json ? JSON.parse(a.chat_json) : [];
    } catch {
      chat = [];
    }
    setCurrentId(a.id);
    setTitle(a.title || "");
    setBody(a.body || "");
    setResult(res && res.corrections ? res : null);
    setCollapsed(!!(res && res.corrections));
    setChatMessages(Array.isArray(chat) ? chat : []);
    setSaved(false);
    setRebuildKey((k) => k + 1);
    setSearchParams({ session: String(a.id) }, { replace: true });
  }

  // Load a saved session (from the sessions popup) into the editor.
  useEffect(() => {
    function onLoad(e) {
      applySession(e.detail);
    }
    function onNew() {
      resetAll();
    }
    window.addEventListener("load-session", onLoad);
    window.addEventListener("new-session", onNew);
    return () => {
      window.removeEventListener("load-session", onLoad);
      window.removeEventListener("new-session", onNew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On first mount: if the URL has ?session=<id>, load that session from the DB
  // (so reloading the page restores the exact session).
  useEffect(() => {
    const urlId = searchParams.get("session");
    if (urlId && String(currentId) !== urlId) {
      api
        .get(`/articles/${urlId}`)
        .then((r) => applySession(r.data.article))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync once a session id exists (e.g. after first autosave).
  useEffect(() => {
    if (currentId && searchParams.get("session") !== String(currentId)) {
      setSearchParams({ session: String(currentId) }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  return (
    <div className="max-w-full mx-auto py-6 px-4 space-y-5">
      {/* Article Writing Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">كتابة مقال</h2>
      </div>

      {/* Autosave + connection status */}
      <div className="flex items-center justify-between -mt-2 h-5">
        <span className="text-[11px] text-gray-400">
          {autoStatus === "saving" && "… يتم الحفظ تلقائياً"}
          {autoStatus === "saved" && "✓ تم الحفظ تلقائياً"}
          {autoStatus === "offline" && "💾 محفوظ محلياً — بانتظار الاتصال"}
        </span>
        <span
          className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full ${
            online ? "bg-green-50 text-green-700" : "bg-red-50 text-flag-red"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${online ? "bg-green-500" : "bg-flag-red"}`}
          />
          {online ? "متصل" : "غير متصل"}
        </span>
      </div>

      {/* Editor — full when expanded; an accordion header when collapsed */}
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-4 py-3 hover:bg-gray-50 transition"
        >
          <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
            ✎ المقال الأصلي
            <span className="text-xs font-normal text-gray-400">
              (اضغط للتحرير وإعادة المعالجة)
            </span>
          </span>
          <span className="text-gray-400">▼</span>
        </button>
      ) : (
        <div className="space-y-2">
          {result && (
            <button
              onClick={() => setCollapsed(true)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              ▲ طيّ المقال الأصلي
            </button>
          )}
          <ArticleEditor
            title={title}
            setTitle={setTitle}
            body={body}
            setBody={setBody}
            onProcess={process}
            processing={processing}
            online={online}
          />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-flag-red text-sm rounded-xl p-3">
          {error}
        </div>
      )}

      {/* Live, editable result — updates instantly as you accept/reject */}
      {result && (
        <div
          className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3"
          onMouseUp={onResultMouseUp}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-gray-700">
              النتيجة المباشرة
              <span className="text-[11px] font-normal text-gray-400 me-2">
                ({acceptedCount} تغيير مقبول) — حدّد نصاً لتسأل المساعد، أو عدّل
                مباشرة
              </span>
            </h3>
            <div className="flex gap-2">
              <button
                onClick={resetAll}
                className="text-xs bg-gray-100 text-gray-600 px-4 py-1.5 rounded-lg hover:bg-gray-200"
              >
                إعادة تعيين
              </button>
              <button
                onClick={save}
                disabled={saving || !online}
                title={!online ? "غير متصل" : undefined}
                className="text-xs bg-brand text-white px-4 py-1.5 rounded-lg hover:bg-brand-dark disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving && (
                  <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {saving ? "جارٍ الحفظ…" : "حفظ"}
              </button>
            </div>
          </div>

          <div>
            <span className="text-[11px] text-gray-400">العنوان</span>
            <EditablePreview
              ref={titleRef}
              source={title}
              corrections={corrections}
              field="title"
              rebuildKey={rebuildKey}
              className="text-base font-bold bg-gray-50 p-3 mt-1 min-h-[44px]"
            />
          </div>
          <div>
            <span className="text-[11px] text-gray-400">النص</span>
            <EditablePreview
              ref={bodyRef}
              source={body}
              corrections={corrections}
              field="body"
              rebuildKey={rebuildKey}
              className="text-sm leading-8 whitespace-pre-wrap bg-gray-50 p-3 mt-1 min-h-[120px]"
            />
          </div>

          <p className="text-[11px] text-gray-400">
            <span className="bg-brand-light text-brand-dark rounded px-1">
              أخضر
            </span>{" "}
            = مقبول مُطبّق،
            <span className="bg-red-200 text-red-900 rounded px-1 mx-1">
              أحمر
            </span>{" "}
            = مرفوض،
            <span className="bg-amber-200 text-amber-900 rounded px-1 mx-1">
              أصفر
            </span>{" "}
            = بانتظار قرارك. يمكنك الكتابة داخل النص مباشرة.
          </p>

          {saved && (
            <p className="text-xs text-brand">✓ تم حفظ المقال في حسابك.</p>
          )}
        </div>
      )}

      {/* Floating "ask the assistant about the selected text" button */}
      {sel && (
        <button
          style={{
            position: "fixed",
            left: sel.x,
            top: sel.y - 40,
            transform: "translateX(-50%)",
            zIndex: 40,
          }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={askAssistant}
          className="bg-brand text-white text-xs px-3 py-1.5 rounded-lg shadow-lg hover:bg-brand-dark whitespace-nowrap"
        >
          💬 اسأل المساعد
        </button>
      )}

      {/* Saved-content dialog */}
      {savedContent && (
        <SavedDialog
          content={savedContent}
          onClose={() => setSavedContent(null)}
        />
      )}

      {/* Notification panel */}
      <NotificationPanel open={showNotifications} onClose={() => setShowNotifications(false)} />

      {/* Hints / report */}
      {!result && !processing && (
        <div className="text-center text-gray-400 text-sm py-10">
          اكتب مقالك ثم اضغط «معالجة المقال» لرؤية التصحيحات والإحصائيات.
        </div>
      )}
      {processing && (
        <div className="text-center text-gray-400 text-sm py-10">
          جارٍ تحليل المقال…
        </div>
      )}
      {result && (
        <CorrectionReport
          result={result}
          onAccept={accept}
          onReject={reject}
          onAcceptAll={acceptAll}
        />
      )}
    </div>
  );
}

// Modal that shows the saved title + text, with a copy button.
function SavedDialog({ content, onClose }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = `${content.title}\n\n${content.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked — ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center "
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-bold text-brand">
            ✓ تم حفظ المقال
            {content.id != null && (
              <span className="text-[11px] font-normal text-gray-400 me-2">
                #{content.id}
              </span>
            )}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <span className="text-[11px] text-gray-400">العنوان</span>
            <div className="text-lg font-bold bg-gray-50 rounded-xl p-3 mt-1">
              {content.title || <span className="text-gray-300">—</span>}
            </div>
          </div>
          <div>
            <span className="text-[11px] text-gray-400">النص</span>
            <div className="text-sm leading-8 whitespace-pre-wrap bg-gray-50 rounded-xl p-3 mt-1">
              {content.body || <span className="text-gray-300">—</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={copy}
            className="text-xs border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            {copied ? "تم النسخ ✓" : "نسخ"}
          </button>
          <button
            onClick={onClose}
            className="text-xs bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
