// ينسخ قارئ الإكسل إلى public/vendor ليُقدَّم كملف ثابت على Cloudflare.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/xlsx/dist/xlsx.full.min.js', 'public/vendor/xlsx.full.min.js');
