// ══════════════════════════════════════════════════════
// 📄→🖼️ تحويل أول صفحة من PDF إلى PNG عالي الدقة (عميل، عبر pdfjs)
// ══════════════════════════════════════════════════════

export async function pdfFileToPng(file: File, scale = 2.5): Promise<{ blob: Blob; width: number; height: number }> {
  const pdfjs: any = await import('pdfjs-dist');
  // عامل pdfjs عبر CDN مطابق للإصدار (يتفادى مشاكل حزم Next للـ worker)
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('فشل توليد الصورة'))), 'image/png'),
  );
  return { blob, width: canvas.width, height: canvas.height };
}
