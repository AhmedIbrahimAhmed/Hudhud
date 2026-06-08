import { useRef, useState, useEffect, useCallback } from 'react';

// ── محرّر الصور ────────────────────────────────────────────────────────────
// كل المعالجة تتم داخل المتصفح (Canvas) — لا تُرفع الصورة إلى أي خادم.
//  • تغيير الأبعاد (الحجم/الدقة) مع إمكانية تثبيت النسبة.
//  • القص عبر تحديد منطقة بالسحب.
//  • جودة/صيغة التصدير (JPEG / WebP / PNG).
//  • علامة مائية / حقوق نشر: نصّ أو صورة يختارها المستخدم.

function humanSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} ب`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
}

export default function ImageEditor() {
  const fileRef = useRef(null);
  const wmFileRef = useRef(null);
  const canvasRef = useRef(null);
  const cropImgRef = useRef(null); // the displayed <img> in crop mode
  const objUrlRef = useRef(null); // current object URL (kept alive for crop preview)

  const [img, setImg] = useState(null); // HTMLImageElement (current working image)
  const [fileName, setFileName] = useState('image');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const aspectRef = useRef(1);

  // Export
  const [format, setFormat] = useState('image/jpeg');
  const [quality, setQuality] = useState(0.85);
  const [outSize, setOutSize] = useState(null);

  // Crop
  const [cropMode, setCropMode] = useState(false);
  const [sel, setSel] = useState(null); // { x, y, w, h } in displayed-pixel coords
  const dragRef = useRef(null);

  // Watermark
  const [wmType, setWmType] = useState('none'); // 'none' | 'text' | 'image'
  const [wmText, setWmText] = useState('© هدهد');
  const [wmColor, setWmColor] = useState('#ffffff');
  const [wmFont, setWmFont] = useState(32);
  const [wmOpacity, setWmOpacity] = useState(0.7);
  const [wmScale, setWmScale] = useState(0.25); // image watermark width as fraction of canvas width
  const [wmImg, setWmImg] = useState(null); // HTMLImageElement for image watermark

  // ── Load main image ──────────────────────────────────────────────────────
  function loadFile(f) {
    if (!f || !f.type?.startsWith('image/')) return;
    setFileName(f.name.replace(/\.[^.]+$/, '') || 'image');
    // Keep the URL alive so the crop-mode <img> can still load it; only revoke
    // the previously loaded file's URL.
    if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current);
    const url = URL.createObjectURL(f);
    objUrlRef.current = url;
    const image = new Image();
    image.onload = () => {
      aspectRef.current = image.naturalWidth / image.naturalHeight;
      setImg(image);
      setWidth(image.naturalWidth);
      setHeight(image.naturalHeight);
      setSel(null);
      setCropMode(false);
    };
    image.src = url;
  }
  function pickFile(e) {
    loadFile(e.target.files?.[0]);
    e.target.value = ''; // allow re-selecting the same file later
  }
  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    loadFile(e.dataTransfer.files?.[0]);
  }

  function pickWatermarkImage(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const image = new Image();
    image.onload = () => {
      setWmImg(image);
      URL.revokeObjectURL(url);
    };
    image.src = url;
    e.target.value = ''; // allow re-selecting the same file later
  }

  // ── Resize handlers ────────────────────────────────────────────────────────
  // Allow the field to be cleared/partly typed (''), only clamping to a valid
  // dimension when a positive number is present.
  function changeWidth(v) {
    if (v === '') return setWidth('');
    const w = Math.max(1, Math.round(Number(v) || 0));
    setWidth(w);
    if (lockAspect) setHeight(Math.max(1, Math.round(w / aspectRef.current)));
  }
  function changeHeight(v) {
    if (v === '') return setHeight('');
    const h = Math.max(1, Math.round(Number(v) || 0));
    setHeight(h);
    if (lockAspect) setWidth(Math.max(1, Math.round(h * aspectRef.current)));
  }
  function scaleBy(pct) {
    if (!img) return;
    setWidth(Math.max(1, Math.round(img.naturalWidth * pct)));
    setHeight(Math.max(1, Math.round(img.naturalHeight * pct)));
  }

  // ── Composite render (resize + watermark) → canvas ─────────────────────────
  const drawComposite = useCallback(
    (canvas) => {
      if (!img || !canvas) return;
      const W = Math.max(1, width);
      const H = Math.max(1, height);
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);

      if (wmType === 'text' && wmText.trim()) {
        ctx.save();
        ctx.globalAlpha = wmOpacity;
        ctx.font = `bold ${wmFont}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = wmColor;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = Math.max(1, wmFont / 16);
        ctx.strokeText(wmText, W / 2, H / 2);
        ctx.fillText(wmText, W / 2, H / 2);
        ctx.restore();
      } else if (wmType === 'image' && wmImg) {
        ctx.save();
        ctx.globalAlpha = wmOpacity;
        const iw = W * wmScale;
        const ih = iw * (wmImg.naturalHeight / wmImg.naturalWidth);
        ctx.drawImage(wmImg, (W - iw) / 2, (H - ih) / 2, iw, ih);
        ctx.restore();
      }
    },
    [img, width, height, wmType, wmText, wmColor, wmFont, wmOpacity, wmScale, wmImg]
  );

  // Re-render the live preview canvas + estimate output size when not cropping.
  useEffect(() => {
    if (cropMode || !img || !width || !height) return;
    const canvas = canvasRef.current;
    drawComposite(canvas);
    canvas.toBlob(
      (b) => setOutSize(b ? b.size : null),
      format,
      format === 'image/png' ? undefined : quality
    );
  }, [drawComposite, cropMode, img, width, height, format, quality]);

  // Revoke the last object URL when leaving the page.
  useEffect(() => () => objUrlRef.current && URL.revokeObjectURL(objUrlRef.current), []);

  // ── Crop interaction (draw selection rectangle) ────────────────────────────
  // Coordinates are measured against the displayed <img> itself and clamped to
  // its bounds, so the selection always maps cleanly back to source pixels.
  function cropPoint(e) {
    const rect = cropImgRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
  }
  function cropDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId); // keep receiving moves off-image
    const p = cropPoint(e);
    dragRef.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function cropMove(e) {
    if (!dragRef.current) return;
    const p = cropPoint(e);
    const s = dragRef.current;
    setSel({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }
  function cropUp() {
    dragRef.current = null;
  }

  function applyCrop() {
    const dispImg = cropImgRef.current;
    if (!img || !dispImg || !sel || sel.w < 5 || sel.h < 5) {
      setCropMode(false);
      return;
    }
    const scaleX = img.naturalWidth / dispImg.clientWidth; // displayed → natural
    const scaleY = img.naturalHeight / dispImg.clientHeight;
    const sx = Math.max(0, sel.x * scaleX);
    const sy = Math.max(0, sel.y * scaleY);
    const sw = Math.min(img.naturalWidth - sx, sel.w * scaleX);
    const sh = Math.min(img.naturalHeight - sy, sel.h * scaleY);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const cropped = new Image();
    cropped.onload = () => {
      aspectRef.current = cropped.naturalWidth / cropped.naturalHeight;
      setImg(cropped);
      setWidth(cropped.naturalWidth);
      setHeight(cropped.naturalHeight);
      setSel(null);
      setCropMode(false);
    };
    cropped.src = canvas.toDataURL();
  }

  function cancelCrop() {
    setSel(null);
    setCropMode(false);
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function download() {
    if (!img) return;
    const canvas = document.createElement('canvas');
    drawComposite(canvas);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}-edited.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      format,
      format === 'image/png' ? undefined : quality
    );
  }

  const hasQuality = format !== 'image/png';

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-800">محرّر الصور</h2>
        <p className="text-xs text-gray-400 mt-1">
          غيّر الأبعاد والجودة، اقصص الصورة، وأضِف علامة حقوق نشر (نصّ أو صورة). كل المعالجة داخل
          متصفّحك — لا تُرفع الصورة لأي خادم.
        </p>
      </div>

      {/* Picker */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`bg-white border rounded-2xl p-4 flex flex-wrap items-center gap-3 transition ${
          dragOver ? 'border-brand bg-brand-light/40 border-2 border-dashed' : 'border-gray-200'
        }`}
      >
        <button
          onClick={() => fileRef.current?.click()}
          className="text-sm border border-gray-200 text-gray-600 rounded-xl px-4 py-2 hover:border-brand hover:text-brand"
        >
          📁 اختر صورة
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
        <span className="text-xs text-gray-400">
          {dragOver ? 'أفلت الصورة هنا…' : 'أو اسحب صورة وأفلتها هنا'}
        </span>
        {img && (
          <span className="text-xs text-gray-400">
            · الأصل: {img.naturalWidth}×{img.naturalHeight} بكسل
          </span>
        )}
      </div>

      {!img ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`rounded-2xl p-12 text-center text-sm cursor-pointer transition border border-dashed ${
            dragOver
              ? 'border-brand bg-brand-light/40 text-brand'
              : 'bg-white border-gray-200 text-gray-400 hover:border-brand hover:text-brand'
          }`}
        >
          🖼️ اسحب صورة وأفلتها هنا، أو اضغط للاختيار.
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-5">
          {/* Preview */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">المعاينة</h3>
              <div className="flex items-center gap-2">
                {!cropMode ? (
                  <button
                    onClick={() => setCropMode(true)}
                    className="text-xs border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-brand hover:text-brand"
                  >
                    ✂️ قصّ
                  </button>
                ) : (
                  <>
                    <button
                      onClick={applyCrop}
                      className="text-xs bg-brand text-white rounded-lg px-3 py-1.5 hover:bg-brand-dark"
                    >
                      تطبيق القصّ
                    </button>
                    <button
                      onClick={cancelCrop}
                      className="text-xs border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:border-gray-400"
                    >
                      إلغاء
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 grid place-items-center min-h-[240px] overflow-auto">
              {cropMode ? (
                <div
                  className="relative inline-block select-none cursor-crosshair touch-none"
                  onPointerDown={cropDown}
                  onPointerMove={cropMove}
                  onPointerUp={cropUp}
                >
                  <img
                    ref={cropImgRef}
                    src={img.src}
                    alt=""
                    className="max-h-[60vh] max-w-full block"
                    draggable={false}
                  />
                  {sel && sel.w > 0 && (
                    <div
                      className="absolute border-2 border-brand bg-brand/10 pointer-events-none"
                      style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
                    />
                  )}
                  {!sel && (
                    <div className="absolute inset-0 grid place-items-center pointer-events-none">
                      <span className="bg-black/50 text-white text-xs rounded-lg px-3 py-1.5">
                        اسحب لتحديد منطقة القصّ
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  className="max-h-[60vh] max-w-full object-contain border border-gray-100 rounded"
                />
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            {/* Dimensions */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-700">الأبعاد والدقة</h3>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-12">العرض</label>
                <input
                  type="number"
                  min="1"
                  value={width}
                  onChange={(e) => changeWidth(e.target.value)}
                  onBlur={() => width === '' && img && changeWidth(img.naturalWidth)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <span className="text-xs text-gray-400">بكسل</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-12">الارتفاع</label>
                <input
                  type="number"
                  min="1"
                  value={height}
                  onChange={(e) => changeHeight(e.target.value)}
                  onBlur={() => height === '' && img && changeHeight(img.naturalHeight)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <span className="text-xs text-gray-400">بكسل</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={lockAspect}
                  onChange={(e) => setLockAspect(e.target.checked)}
                />
                تثبيت النسبة
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[0.25, 0.5, 0.75, 1].map((p) => (
                  <button
                    key={p}
                    onClick={() => scaleBy(p)}
                    className="text-xs border border-gray-200 text-gray-600 rounded-lg px-2.5 py-1 hover:border-brand hover:text-brand"
                  >
                    {p * 100}%
                  </button>
                ))}
              </div>
            </div>

            {/* Watermark */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-700">علامة الحقوق / مائية</h3>
              <div className="flex gap-1.5">
                {[
                  { k: 'none', l: 'بدون' },
                  { k: 'text', l: 'نصّ' },
                  { k: 'image', l: 'صورة' },
                ].map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setWmType(o.k)}
                    className={`flex-1 text-xs rounded-lg px-2 py-1.5 border transition ${
                      wmType === o.k
                        ? 'bg-brand text-white border-brand'
                        : 'border-gray-200 text-gray-600 hover:border-brand'
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>

              {wmType === 'text' && (
                <div className="space-y-2">
                  <input
                    value={wmText}
                    onChange={(e) => setWmText(e.target.value)}
                    placeholder="نصّ العلامة…"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">اللون</label>
                    <input
                      type="color"
                      value={wmColor}
                      onChange={(e) => setWmColor(e.target.value)}
                      className="h-7 w-10 border border-gray-200 rounded"
                    />
                    <label className="text-xs text-gray-500 mr-2">الحجم</label>
                    <input
                      type="range"
                      min="10"
                      max="160"
                      value={wmFont}
                      onChange={(e) => setWmFont(Number(e.target.value))}
                      className="flex-1"
                    />
                  </div>
                </div>
              )}

              {wmType === 'image' && (
                <div className="space-y-2">
                  <button
                    onClick={() => wmFileRef.current?.click()}
                    className="w-full text-xs border border-gray-200 text-gray-600 rounded-lg px-3 py-2 hover:border-brand hover:text-brand"
                  >
                    {wmImg ? '✓ تغيير صورة العلامة' : '📁 اختر صورة العلامة (PNG شفّاف يُفضّل)'}
                  </button>
                  <input
                    ref={wmFileRef}
                    type="file"
                    accept="image/*"
                    onChange={pickWatermarkImage}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 w-12">الحجم</label>
                    <input
                      type="range"
                      min="0.05"
                      max="1"
                      step="0.05"
                      value={wmScale}
                      onChange={(e) => setWmScale(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-10">{Math.round(wmScale * 100)}%</span>
                  </div>
                </div>
              )}

              {wmType !== 'none' && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 w-12">الشفافية</label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={wmOpacity}
                      onChange={(e) => setWmOpacity(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-10">{Math.round(wmOpacity * 100)}%</span>
                  </div>
                  <p className="text-[11px] text-gray-400">توضع العلامة في منتصف الصورة.</p>
                </>
              )}
            </div>

            {/* Export */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-700">التصدير</h3>
              <div className="flex gap-1.5">
                {[
                  { k: 'image/jpeg', l: 'JPG' },
                  { k: 'image/webp', l: 'WebP' },
                  { k: 'image/png', l: 'PNG' },
                ].map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setFormat(o.k)}
                    className={`flex-1 text-xs rounded-lg px-2 py-1.5 border transition ${
                      format === o.k
                        ? 'bg-brand text-white border-brand'
                        : 'border-gray-200 text-gray-600 hover:border-brand'
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              {hasQuality && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-12">الجودة</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-400 w-10">{Math.round(quality * 100)}%</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>الحجم التقريبي للملف</span>
                <span className="text-gray-600">{humanSize(outSize)}</span>
              </div>
              <button
                onClick={download}
                className="w-full bg-brand text-white text-sm py-2.5 rounded-xl hover:bg-brand-dark"
              >
                ⬇️ تنزيل الصورة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
