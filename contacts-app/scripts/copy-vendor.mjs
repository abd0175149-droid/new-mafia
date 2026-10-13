// قبل كل نشر: ينسخ قارئ الإكسل إلى public/vendor، ويكتب رقم إصدار جديداً
// تقارنه الصفحات المفتوحة لتعيد تحميل نفسها حين يصدر تحديث.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/xlsx/dist/xlsx.full.min.js', 'public/vendor/xlsx.full.min.js');
writeFileSync('public/version.json', JSON.stringify({ v: String(Date.now()) }) + '\n');
