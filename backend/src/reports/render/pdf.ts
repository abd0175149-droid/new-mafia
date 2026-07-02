// ══════════════════════════════════════════════════════
// 🖨️ توليد PDF عبر Puppeteer + Chromium (سيرفر)
// متصفح مفرد (singleton) يُعاد إطلاقه عند الانقطاع؛ صفحة جديدة لكل طلب.
// ══════════════════════════════════════════════════════

import fs from 'node:fs';
import type { Browser } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';
import type { ReportDocument } from '../types.js';
import type { ResolvedLayout } from '../print-layout.service.js';
import { renderDocumentHtml } from './html-template.js';

let browserPromise: Promise<Browser> | null = null;

// مسارات Chrome/Chromium الشائعة (للتطوير المحلي على Windows/Mac إن لم يُضبط المتغيّر)
const FALLBACK_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];

function resolveExecutable(): string {
  for (const p of FALLBACK_PATHS) {
    try { if (fs.existsSync(p)) return p; } catch { /* تجاهل */ }
  }
  // إن لم نجد، نعيد المتغيّر (سيُظهر Puppeteer خطأً واضحاً)
  return process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (b.connected) return b;
    } catch { /* أُعيد الإطلاق أدناه */ }
    browserPromise = null;
  }

  browserPromise = puppeteer.launch({
    executablePath: resolveExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  const browser = await browserPromise;
  browser.on('disconnected', () => { browserPromise = null; });
  return browser;
}

export async function renderPdf(doc: ReportDocument, layout?: ResolvedLayout | null): Promise<Buffer> {
  const html = renderDocumentHtml(doc, layout);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });

    if (layout) {
      // وضع التخطيط: ترقيم صريح — كل صفحة صندوق A4 يدير هوامشه بنفسه،
      // لذلك هوامش Puppeteer صفر (الورق الرسمي يغطي الصفحة كاملة).
      const pdf = await page.pdf({
        format: 'A4',
        landscape: layout.orientation === 'landscape',
        printBackground: true,
        margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      });
      return Buffer.from(pdf);
    }

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#999;text-align:center;direction:rtl;">' +
        'نادي المافيا — تقرير مُعَدّ آلياً — صفحة <span class="pageNumber"></span> من <span class="totalPages"></span>' +
        '</div>',
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

/** إغلاق المتصفح عند إيقاف الخادم. */
export async function closePdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  try { const b = await browserPromise; await b.close(); } catch { /* تجاهل */ }
  browserPromise = null;
}
