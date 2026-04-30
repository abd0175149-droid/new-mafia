'use client';

/**
 * 📸 مكون قص الصورة التفاعلي — Interactive Image Cropper
 * يسمح للمستخدم بتحريك وتكبير الصورة قبل القص
 * بدون أي مكتبات خارجية — 100% Canvas + Touch/Mouse events
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageCropperProps {
  file: File;
  onCrop: (croppedBase64: string) => void;
  onCancel: () => void;
  outputSize?: number; // حجم الناتج (مربع) — افتراضي 512
}

export function ImageCropper({ file, onCrop, onCancel, outputSize = 512 }: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── حالة التحويل (Pan + Zoom) ──
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Drag state
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // Pinch state
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  const CANVAS_SIZE = 280; // حجم المعاينة

  // ── تحميل الصورة ──
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;

      // حساب الحجم الأولي ليملأ المربع
      const minDim = Math.min(img.width, img.height);
      const initialScale = CANVAS_SIZE / minDim;

      setScale(initialScale);
      setOffset({
        x: (CANVAS_SIZE - img.width * initialScale) / 2,
        y: (CANVAS_SIZE - img.height * initialScale) / 2,
      });
      setImgLoaded(true);
    };

    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.readAsDataURL(file);
  }, [file]);

  // ── رسم المعاينة ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // رسم خلفية شبكية
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // رسم الصورة بالتحويلات
    ctx.save();
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);
    ctx.restore();

    // دائرة حدودية
    ctx.strokeStyle = 'rgba(251,191,36,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [offset, scale]);

  useEffect(() => {
    if (imgLoaded) draw();
  }, [imgLoaded, draw]);

  // ── منع سكرول وتحديث الصفحة تماماً أثناء القص ──
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // حفظ القيم الأصلية
    const prev = {
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyTouch: body.style.touchAction,
      htmlOverscroll: html.style.overscrollBehavior,
      htmlTouch: html.style.touchAction,
    };

    // قفل كامل على body + html
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'none';
    html.style.overscrollBehavior = 'none';
    html.style.touchAction = 'none';

    // منع touchmove على كل الصفحة لإيقاف pull-to-refresh
    const blockTouch = (e: TouchEvent) => {
      // السماح فقط داخل منطقة الـ canvas
      const el = containerRef.current;
      if (el && el.contains(e.target as Node)) return; // لا نمنع — السحب يتم بالـ native listener
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockTouch, { passive: false });

    return () => {
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.touchAction = prev.bodyTouch;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      html.style.touchAction = prev.htmlTouch;
      document.removeEventListener('touchmove', blockTouch);
    };
  }, []);

  // ── تسجيل touch handlers كـ non-passive على container ──
  // نستخدم refs لتجنب إعادة التسجيل عند كل render
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  scaleRef.current = scale;
  offsetRef.current = offset;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        pinchStart.current = { dist, scale: scaleRef.current };
      } else if (e.touches.length === 1) {
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2 && pinchStart.current) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const newScale = pinchStart.current.scale * (dist / pinchStart.current.dist);
        setScale(Math.max(0.1, Math.min(5, newScale)));
      } else if (e.touches.length === 1 && dragStart.current) {
        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;
        setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
      }
    };

    const onTouchEnd = () => {
      dragStart.current = null;
      pinchStart.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []); // ← مرة واحدة فقط

  // ── التعامل مع الماوس ──
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  };

  const handlePointerUp = () => { dragStart.current = null; };

  // ── Scroll to Zoom ──
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setScale(prev => Math.max(0.1, Math.min(5, prev + delta)));
  };

  // ── حفظ الصورة المقصوصة ──
  // ⚠️ الناتج مربع بدون clip دائري — الكارد يعرض الصورة بـ object-cover
  const handleCrop = () => {
    const img = imgRef.current;
    if (!img) return;

    setSaving(true);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outputSize;
    outCanvas.height = outputSize;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    // حساب نسبة التحويل من المعاينة للناتج
    const ratio = outputSize / CANVAS_SIZE;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // بدون clip دائري — مربع كامل لملء الكارد
    ctx.drawImage(
      img,
      offset.x * ratio,
      offset.y * ratio,
      img.width * scale * ratio,
      img.height * scale * ratio,
    );

    const result = outCanvas.toDataURL('image/jpeg', 0.92);
    onCrop(result);
  };

  // ── أزرار Zoom ──
  const zoomIn = () => setScale(prev => Math.min(5, prev + 0.15));
  const zoomOut = () => setScale(prev => Math.max(0.1, prev - 0.15));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 20,
          touchAction: 'none',
          overscrollBehavior: 'none',
        }}
      >
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
          📸 تعديل الصورة
        </h3>

        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 12 }}>
          حرّك الصورة وكبّرها لاختيار المنطقة المطلوبة
        </p>

        {/* ── منطقة المعاينة ── */}
        <div
          ref={containerRef}
          style={{
            width: CANVAS_SIZE, height: CANVAS_SIZE, borderRadius: '50%',
            overflow: 'hidden', cursor: 'grab', touchAction: 'none',
            border: '3px solid rgba(251,191,36,0.4)',
            boxShadow: '0 0 40px rgba(251,191,36,0.1)',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
          />
        </div>

        {/* ── أزرار Zoom ── */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <button onClick={zoomOut} style={zoomBtnStyle}>−</button>
          <div style={{
            width: 120, height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.1)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', height: '100%', borderRadius: 2,
              background: '#fbbf24',
              width: `${Math.min(100, (scale / 3) * 100)}%`,
              transition: 'width 0.1s',
            }} />
          </div>
          <button onClick={zoomIn} style={zoomBtnStyle}>+</button>
        </div>

        {/* ── أزرار الحفظ/الإلغاء ── */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: '#999',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >
            إلغاء
          </button>
          <button
            onClick={handleCrop}
            disabled={saving}
            style={{
              padding: '10px 28px', borderRadius: 12, border: 'none',
              background: saving ? 'rgba(251,191,36,0.3)' : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              color: '#000', fontWeight: 700, fontSize: 14,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? '⏳ جاري الحفظ...' : '✓ حفظ الصورة'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff', fontSize: 18, fontWeight: 700,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
