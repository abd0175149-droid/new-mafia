import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Readable } from 'stream';
import { authenticate } from '../middleware/auth.js';

// Setup multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const router = Router();
const SERVICE_ACCOUNT_FILE = path.resolve(process.cwd(), 'google-service-account.json');

export const getDriveAuth = () => {
  if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    throw new Error('ملف المصادقة google-service-account.json غير موجود في المجلد الجذري للمشروع.');
  }
  return new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
};

export const getDriveService = () => {
  return google.drive({ version: 'v3', auth: getDriveAuth() });
};

// ══ GET /api/drive/list ══
router.get('/list', authenticate, async (req: Request, res: Response) => {
  try {
    const folderId = req.query.folderId as string;
    const searchParams = req.query.q as string;
    if (!folderId) return res.status(400).json({ error: 'مطلوب folderId' });

    let q = `'${folderId}' in parents and trashed=false`;
    if (searchParams) {
      q += ` and name contains '${searchParams.replace(/'/g, "\\'")}'`;
    }

    const drive = getDriveService();
    const response = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, thumbnailLink, size, webViewLink, iconLink, folderColorRgb, description)',
      orderBy: 'folder, name' // Folders first, then alphabetically
    });

    res.json(response.data.files || []);
  } catch (error: any) {
    console.error('Drive API Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ══ POST /api/drive/folder ══
router.post('/folder', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, parentId, folderColorRgb } = req.body;
    if (!name || !parentId) return res.status(400).json({ error: 'مطلوب name و parentId' });

    const drive = getDriveService();
    const requestBody: any = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    };
    if (folderColorRgb) requestBody.folderColorRgb = folderColorRgb;

    const response = await drive.files.create({
      requestBody,
      fields: 'id, name, webViewLink, folderColorRgb, mimeType'
    });
    res.status(201).json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══ PUT /api/drive/file/:id ══
router.put('/file/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    const { name, trashed, addParents, removeParents, folderColorRgb, description } = req.body;
    
    if (!fileId) return res.status(400).json({ error: 'مطلوب fileId' });

    const drive = getDriveService();
    const requestBody: any = {};
    if (name) requestBody.name = name;
    if (trashed !== undefined) requestBody.trashed = trashed;
    if (folderColorRgb !== undefined) requestBody.folderColorRgb = folderColorRgb;
    if (description !== undefined) requestBody.description = description;

    let updateParams: any = {
      fileId,
      requestBody,
      fields: 'id, name, webViewLink'
    };

    if (addParents) updateParams.addParents = addParents;
    if (removeParents) updateParams.removeParents = removeParents;

    const response = await drive.files.update(updateParams);
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══ POST /api/drive/file/:id/copy ══
router.post('/file/:id/copy', authenticate, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    if (!fileId) return res.status(400).json({ error: 'مطلوب fileId' });

    const drive = getDriveService();
    const fileMeta = await drive.files.get({ fileId, fields: 'name, parents' });
    const newName = `نسخة من ${fileMeta.data.name}`;

    const requestBody: any = {
      name: newName,
      parents: fileMeta.data.parents
    };

    const response = await drive.files.copy({
      fileId,
      requestBody,
      fields: 'id, name, mimeType, thumbnailLink, size, webViewLink'
    });

    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══ POST /api/drive/file/:id/share ══
router.post('/file/:id/share', authenticate, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    const { role = 'reader', type = 'anyone', emailAddress } = req.body;
    
    if (!fileId) return res.status(400).json({ error: 'مطلوب fileId' });

    const drive = getDriveService();
    const requestBody: any = { role, type };
    if (emailAddress) requestBody.emailAddress = emailAddress;

    const response = await drive.permissions.create({
      fileId,
      sendNotificationEmail: false, // CRITICAL: Service Accounts cannot send emails
      requestBody,
      fields: 'id'
    });

    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══ POST /api/drive/upload ══
router.post('/upload', authenticate, upload.single('media'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const folderId = req.body.folderId as string;
    const replaceFileId = req.body.replaceFileId as string;

    if (!file) return res.status(400).json({ error: 'لم يتم إرسال أي ملف' });

    const drive = getDriveService();

    const bufferStream = new Readable();
    bufferStream.push(file.buffer);
    bufferStream.push(null);

    const media = {
      mimeType: file.mimetype,
      body: bufferStream,
    };

    let response;
    if (replaceFileId) {
       response = await drive.files.update({
         fileId: replaceFileId,
         media,
         fields: 'id, name, mimeType, thumbnailLink, size, webViewLink, iconLink'
       });
    } else {
       if (!folderId) return res.status(400).json({ error: 'مطلوب folderId' });
       response = await drive.files.create({
         requestBody: {
           name: file.originalname, // Fixed encoding issue handled by express natively
           parents: [folderId],
         },
         media,
         fields: 'id, name, mimeType, thumbnailLink, size, webViewLink, iconLink'
       });
    }

    res.status(201).json(response.data);
  } catch (error: any) {
    console.error('Drive Upload Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ══ GET /api/drive/file/:id ══
router.get('/file/:id', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    const drive = getDriveService();

    const fileMeta = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size'
    });

    const mimeType = fileMeta.data.mimeType || 'application/octet-stream';
    const size = fileMeta.data.size;

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Type', mimeType);
    if (size) res.setHeader('Content-Length', size);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    if (req.query.download === 'true') {
      const fileName = fileMeta.data.name || 'file';
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }
    
    res.status(200);
    
    // Cleanup Google stream silently if client aborts the connection (Crucial for video seeking)
    req.on('close', () => {
      if (response.data && typeof response.data.destroy === 'function') {
        response.data.destroy();
      }
    });

    response.data
      .on('end', () => {})
      .on('error', (err: any) => {
        if (err.message !== 'Premature close') {
           console.error('Stream error:', err.message);
        }
      })
      .pipe(res);

  } catch (error: any) {
    console.error('Error streaming file:', error.message);
    res.status(500).send(error.message);
  }
});

// ══ GET /api/drive/thumbnail/:id ══
router.get('/thumbnail/:id', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    const drive = getDriveService();

    // 1. Get the thumbnailLink
    const fileMeta = await drive.files.get({
      fileId,
      fields: 'thumbnailLink'
    });

    if (!fileMeta.data.thumbnailLink) {
      return res.status(404).send('لا يوجد مصغرة لهذا الملف');
    }

    // Upgrade resolution to 600px safely
    const thumbnailUrl = fileMeta.data.thumbnailLink.replace('=s220', '=s600');

    // 2. Fetch the actual thumbnail using the Service Account Bearer token
    const auth = getDriveAuth();
    const token = await auth.getAccessToken();

    const imgResponse = await fetch(thumbnailUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!imgResponse.ok) {
      return res.status(imgResponse.status).send('فشل الوصول للمصغرة من خوادم Google');
    }

    // 3. Pipe the thumbnail back to frontend securely
    res.setHeader('Content-Type', imgResponse.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    if (imgResponse.body) {
      const readable = Readable.fromWeb(imgResponse.body as any);
      readable.pipe(res);
    } else {
      res.status(500).send('فارغ');
    }

  } catch (error: any) {
    console.error('Error fetching thumbnail:', error.message);
    res.status(500).send(error.message);
  }
});

// ══ DELETE /api/drive/file/:id ══
router.delete('/file/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    if (!fileId) return res.status(400).json({ error: 'مطلوب fileId' });

    const drive = getDriveService();
    
    await drive.files.delete({ fileId });

    res.json({ success: true, message: 'تم حذف الملف بنجاح' });
  } catch (error: any) {
    console.error('Drive Delete Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
