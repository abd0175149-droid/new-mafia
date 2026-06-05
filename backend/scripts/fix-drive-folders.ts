import { getDB, connectDB } from '../src/config/db.js';
import { activities } from '../src/schemas/admin.schema.js';
import { getDriveService } from '../src/routes/drive.routes.js';
import { isNull, eq } from 'drizzle-orm';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PARENT_FOLDER_ID = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || '1MLgq3qx0by7pi_MStkAofEiUYb4n33ml'; // الصحيح لمشروع المافيا

async function fixDriveFolders() {
  console.log('🚀 بدء فحص الأنشطة التي لا تمتلك مجلدات درايف...');
  await connectDB();
  const db = getDB();
  if (!db) {
    console.error('❌ تعذر الاتصال بقاعدة البيانات');
    process.exit(1);
  }

  try {
    // جلب الأنشطة التي ليس لها رابط درايف أو الرابط الخاص بها فارغ
    const acts = await db.select().from(activities);
    const missingActs = acts.filter(a => !a.driveLink || a.driveLink.trim() === '');
    
    console.log(`📋 تم العثور على ${missingActs.length} نشاط بدون مجلد درايف.`);

    if (missingActs.length === 0) {
      console.log('✅ جميع الأنشطة تمتلك مجلدات درايف بالفعل.');
      process.exit(0);
    }

    const drive = getDriveService();

    for (const act of missingActs) {
      try {
        console.log(`⏳ جاري إنشاء مجلد للنشاط: ${act.name} (ID: ${act.id})...`);
        const folderName = `${act.id} - ${act.name} (${new Date(act.date).toISOString().split('T')[0]})`;
        
        const folderRes = await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [PARENT_FOLDER_ID],
          },
          fields: 'id',
        });

        const driveLink = `https://drive.google.com/drive/folders/${folderRes.data.id}`;
        
        // تحديث النشاط في قاعدة البيانات
        await db.update(activities)
          .set({ driveLink } as any)
          .where(eq(activities.id, act.id));

        console.log(`✅ تم الإنشاء والتحديث بنجاح: ${driveLink}`);
      } catch (err: any) {
        console.error(`❌ فشل إنشاء مجلد للنشاط ${act.name}: ${err.message}`);
      }
    }

    console.log('🎉 اكتملت العملية بنجاح.');
  } catch (error: any) {
    console.error('❌ حدث خطأ غير متوقع:', error.message);
  } finally {
    process.exit(0);
  }
}

fixDriveFolders();
