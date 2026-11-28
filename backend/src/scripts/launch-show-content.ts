// يحمّل محتوى عرض ليلة الإطلاق من ملفّ JSON على السيرفر إلى launch_show.content
// المحتوى (النصوص والتوقيتات وأسماء الكروت) لا يُحفظ في المستودع لأنّه علنيّ.
//   docker compose exec -T backend npx tsx src/scripts/launch-show-content.ts uploads/private/launch/content.json
import 'dotenv/config';
import fs from 'fs';
import { connectDB } from '../config/db.js';
import { ensureLaunchTables, setContent } from '../services/launch-show.service.js';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('أعطني مسار ملفّ المحتوى'); process.exit(1); }
const content = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const k of ['breakAt', 'prophecy', 'cards', 'predict', 'poll']) if (!(k in content)) console.warn('⚠️ ينقص الحقل', k);
const db = await connectDB();
await ensureLaunchTables(db);
await setContent(content);
console.log('✅ حُمّل المحتوى:', Object.keys(content).join('، '), '· كروت:', (content.cards || []).length, '· سطور:', (content.prophecy?.lines || []).length);
process.exit(0);
