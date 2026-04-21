'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DriveFolderBrowserProps {
  driveLink: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

async function fetchDriveAPI(path: string, options: any = {}) {
  const token = getToken();
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, Authorization: `Bearer ${token}` }
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Server Error');
  }
  return res.json();
}

export default function DriveFolderBrowser({ driveLink }: DriveFolderBrowserProps) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateFileInputRef = useRef<HTMLInputElement>(null);
  const [updatingFileId, setUpdatingFileId] = useState<string | null>(null);

  // Lightbox & Navigation State
  const [history, setHistory] = useState<{ id: string; name: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    // Extract ID
    if (!driveLink) {
      setLoading(false);
      return;
    }
    const match = driveLink.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      setFolderId(match[1]);
      setHistory([{ id: match[1], name: 'الرئيسية' }]);
    } else {
      setErrorMsg('الرابط المرفق لا يبدو كصيغة مجلد جوجل درايف صالحة.');
      setLoading(false);
    }
  }, [driveLink]);

  useEffect(() => {
    if (folderId) loadFiles();
  }, [folderId]);

  async function loadFiles() {
    setLoading(true);
    try {
      const data = await fetchDriveAPI(`/api/drive/list?folderId=${folderId}`);
      setFiles(data);
      
      // ✅ Prefetch Thumbnails to Cache
      data.forEach((f: any) => {
        if (f.mimeType !== 'application/vnd.google-apps.folder') {
          const img = new Image();
          img.src = `${API_URL}/api/drive/thumbnail/${f.id}`;
        }
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل جلب الملفات');
    } finally {
      setLoading(false);
    }
  }

  // UPLOAD NEW FILE
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !folderId) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('media', file);
    formData.append('folderId', folderId);

    try {
      await fetchDriveAPI('/api/drive/upload', {
        method: 'POST',
        body: formData,
      });
      loadFiles();
    } catch (err: any) {
      alert(err.message || 'فشل الرفع');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // UPDATE VERSION
  async function handleUpdateVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !updatingFileId) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('media', file);
    formData.append('replaceFileId', updatingFileId);

    try {
      await fetchDriveAPI('/api/drive/upload', {
        method: 'POST',
        body: formData,
      });
      loadFiles();
    } catch (err: any) {
      alert(err.message || 'فشل التحديث');
    } finally {
      setUploading(false);
      setUpdatingFileId(null);
      if (updateFileInputRef.current) updateFileInputRef.current.value = '';
    }
  }

  // CREATE FOLDER
  async function handleCreateFolder() {
    const name = prompt('اسم المجلد الجديد:');
    if (!name || !folderId) return;
    try {
      await fetchDriveAPI('/api/drive/folder', {
        method: 'POST',
        body: JSON.stringify({ name, parentId: folderId })
      });
      loadFiles();
    } catch (err: any) {
      alert('فشل إنشاء المجلد');
    }
  }

  // RENAME
  async function handleRename(fileId: string, currentName: string) {
    const newName = prompt('الاسم الجديد:', currentName);
    if (!newName || newName === currentName) return;
    setUploading(true);
    try {
      await fetchDriveAPI(`/api/drive/file/${fileId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName })
      });
      await loadFiles();
    } catch (err: any) {
      alert('فشل إعادة التسمية: ' + (err.message || ''));
    } finally {
      setUploading(false);
    }
  }

  // DELETE
  async function handleDelete(fileId: string) {
    if (!confirm('هل أنت متأكد من الحذف النهائي؟')) return;
    setUploading(true);
    try {
      await fetchDriveAPI(`/api/drive/file/${fileId}`, {
        method: 'DELETE'
      });
      await loadFiles();
    } catch (err: any) {
      alert('فشل الحذف');
    } finally {
      setUploading(false);
    }
  }

  // DUPLICATE
  async function handleDuplicate(fileId: string) {
    setUploading(true);
    try {
       await fetchDriveAPI(`/api/drive/file/${fileId}/copy`, {
         method: 'POST'
       });
       await loadFiles();
    } catch (err: any) {
       alert('فشل عملية النسخ');
    } finally {
      setUploading(false);
    }
  }

  // SHARE
  async function handleShare(fileId: string) {
    const email = prompt('أدخل البريد الإلكتروني للمشاركة معه (يجب أن يكون حساب جیمیل):');
    if (!email) return;
    setUploading(true);
    try {
      await fetchDriveAPI(`/api/drive/file/${fileId}/share`, {
        method: 'POST',
        body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email })
      });
      alert('تمت المشاركة بنجاح!');
    } catch (err: any) {
      alert('فشل عملية المشاركة: ' + (err.message || ''));
    } finally {
      setUploading(false);
    }
  }

  // DOWNLOAD
  async function handleDownload(fileId: string, fileName: string) {
    // Rely exclusively on backend Content-Disposition mechanism instead of blob to fix large video crashes
    const url = `${API_URL}/api/drive/file/${fileId}?download=true`;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // NAVIGATE INTO FOLDER
  function navigateToFolder(id: string, name: string) {
    setFolderId(id);
    setHistory(prev => [...prev, { id, name }]);
  }

  // NAVIGATE BACK
  function navigateToCrumb(index: number, id: string) {
    setFolderId(id);
    setHistory(prev => prev.slice(0, index + 1));
  }

  if (!driveLink) {
    return (
      <div className="p-4 bg-gray-800/60 rounded-xl border border-gray-700/50 text-center">
        <p className="text-gray-400">لا يوجد مجلد Google Drive مرتبط بهذا النشاط.</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="p-4 bg-rose-500/10 rounded-xl border border-rose-500/20 text-center">
        <p className="text-rose-400">{errorMsg}</p>
        <a href={driveLink} target="_blank" rel="noreferrer" className="text-xs text-rose-300 underline mt-2 block">
          فتح الرابط يدوياً
        </a>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700/50 rounded-2xl overflow-hidden shadow-lg p-5">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4 border-b border-gray-700/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400 text-xl">📁</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {history.map((crumb, idx) => (
                <div key={crumb.id} className="flex items-center gap-2">
                  <button 
                    onClick={() => navigateToCrumb(idx, crumb.id)}
                    className={`text-sm font-bold hover:underline transition ${idx === history.length - 1 ? 'text-white' : 'text-gray-400'}`}
                  >
                    {crumb.name}
                  </button>
                  {idx < history.length - 1 && <span className="text-gray-600 text-xs text-bold">/</span>}
                </div>
              ))}
            </div>
            <a href={driveLink} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline inline-block mt-1">
              فتح الجذر في Google Drive ↗
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {uploading && <span className="text-xs text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-lg animate-pulse font-bold">جاري المعالجة...</span>}
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
          <input type="file" ref={updateFileInputRef} className="hidden" onChange={handleUpdateVersion} />
          
          <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-600/30 transition">
            + رفع ملف
          </button>
          <button onClick={handleCreateFolder} className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-600 transition">
            + مجلد جديد
          </button>
        </div>
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className="flex justify-center p-10"><div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"/></div>
      ) : files.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500 text-sm">المجلد فارغ حالياً.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AnimatePresence>
            {files.map((f: any) => {
              const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
              const isImage = f.thumbnailLink;
              const mediaFiles = files.filter(file => file.mimeType !== 'application/vnd.google-apps.folder');
              
              return (
                <motion.div key={f.id} initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="group relative bg-gray-900/50 border border-gray-700/50 rounded-xl overflow-hidden hover:border-gray-500/50 transition flex flex-col">
                  {/* Thumbnail / Icon */}
                  {isFolder ? (
                    <button 
                      onClick={() => navigateToFolder(f.id, f.name)}
                      className="block w-full aspect-video bg-gray-800 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-gray-700 transition"
                    >
                      <span className="text-5xl" style={{color: f.folderColorRgb || '#fcc033'}}>📁</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => setLightboxIndex(mediaFiles.findIndex(m => m.id === f.id))}
                      className="block w-full aspect-video bg-gray-800 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-gray-700 transition"
                    >
                      {f.mimeType.startsWith('video/') ? (
                        <div className="relative w-full h-full flex items-center justify-center bg-gray-900 border border-gray-700/50 group-hover:bg-gray-800 transition">
                          <img 
                            src={`${API_URL}/api/drive/thumbnail/${f.id}`} 
                            alt={f.name} 
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition" 
                            onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                          />
                          <span className="hidden text-4xl opacity-50 absolute">🎞️</span>
                          
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <div className="w-12 h-12 bg-emerald-500/80 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-emerald-500 transition-all">
                              <span className="text-xl text-white ml-1">▶</span>
                            </div>
                          </div>
                        </div>
                      ) : f.mimeType.startsWith('image/') ? (
                        <img 
                          src={`${API_URL}/api/drive/thumbnail/${f.id}`} 
                          alt={f.name} 
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" 
                          onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                        />
                      ) : (
                        <span className="text-3xl text-gray-500">📄</span>
                      )}
                      
                      {/* Fallback for broken images (e.g., HEIC) */}
                      {f.mimeType.startsWith('image/') && (
                         <div className="hidden absolute inset-0 w-full h-full flex items-center justify-center bg-gray-900">
                           <span className="text-3xl text-gray-500">🌁</span>
                         </div>
                      )}
                    </button>
                  )}

                  {/* Details */}
                  <div className="p-3">
                    <p className="text-sm font-medium text-white truncate mb-2" dir="ltr" title={f.name}>{f.name}</p>
                    
                    {/* Actions Grid */}
                    <div className="grid grid-cols-3 gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => handleDownload(f.id, f.name)} className="text-[10px] text-blue-400 bg-blue-400/10 px-1 py-1 rounded hover:bg-blue-400/20">تنزيل</button>
                      <button onClick={() => handleShare(f.id)} className="text-[10px] text-indigo-400 bg-indigo-400/10 px-1 py-1 rounded hover:bg-indigo-400/20">مشاركة</button>
                      <button onClick={() => handleRename(f.id, f.name)} className="text-[10px] text-gray-300 bg-gray-700 px-1 py-1 rounded hover:bg-gray-600">تسمية</button>
                      <button onClick={() => handleDuplicate(f.id)} className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1 py-1 rounded hover:bg-emerald-400/20">استنساخ</button>
                      
                      {!isFolder ? (
                         <button onClick={() => { setUpdatingFileId(f.id); updateFileInputRef.current?.click(); }} className="text-[10px] text-amber-400 bg-amber-400/10 px-1 py-1 rounded hover:bg-amber-400/20">
                           تحديث
                         </button>
                      ) : <div />}
                      
                      <button onClick={() => handleDelete(f.id)} className="text-[10px] text-rose-400 bg-rose-400/10 px-1 py-1 rounded hover:bg-rose-400/20">حذف</button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* LIGHTBOX VIEWER */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur flex items-center justify-center p-4"
          >
            {/* Close Button */}
            <button onClick={() => setLightboxIndex(null)} className="absolute top-6 right-6 z-50 text-white bg-white/10 hover:bg-white/25 rounded-full w-10 h-10 flex items-center justify-center text-xl transition">✕</button>
            
            {/* Navigation Arrows */}
            {(() => {
              const mediaFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
              const hasPrev = lightboxIndex > 0;
              const hasNext = lightboxIndex < mediaFiles.length - 1;
              const lightboxFile = mediaFiles[lightboxIndex];

              return (
                <div className="relative w-full max-w-5xl h-full max-h-[85vh] flex flex-col items-center justify-center">
                  
                  {/* Left Button */}
                  {hasPrev && (
                    <button 
                      onClick={() => setLightboxIndex(lightboxIndex - 1)}
                      className="absolute right-0 md:-right-16 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition shadow-lg text-2xl z-50"
                    >
                      ▶
                    </button>
                  )}

                  {/* Right Button */}
                  {hasNext && (
                    <button 
                      onClick={() => setLightboxIndex(lightboxIndex + 1)}
                      className="absolute left-0 md:-left-16 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition shadow-lg text-2xl z-50"
                    >
                      ◀
                    </button>
                  )}

                  {/* Media Content */}
                  <div className="w-full h-full flex items-center justify-center relative">
                    {lightboxFile.mimeType.startsWith('video/') ? (
                      <video 
                        key={lightboxFile.id}
                        src={`${API_URL}/api/drive/file/${lightboxFile.id}`} 
                        poster={`${API_URL}/api/drive/thumbnail/${lightboxFile.id}`}
                        controls 
                        autoPlay 
                        controlsList="nodownload"
                        className="max-w-full max-h-full drop-shadow-2xl rounded-xl"
                      />
                    ) : lightboxFile.mimeType.startsWith('image/') ? (
                      <img 
                        key={lightboxFile.id}
                        src={`${API_URL}/api/drive/file/${lightboxFile.id}`} 
                        alt={lightboxFile.name} 
                        className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-xl" 
                      />
                    ) : (
                      <iframe 
                        key={lightboxFile.id}
                        src={lightboxFile.webViewLink} 
                        className="w-full h-full bg-white rounded-xl shadow-2xl" 
                      />
                    )}
                  </div>
                  
                  {/* Footer Details */}
                  <div className="absolute bottom-[-50px] left-0 right-0 text-center text-white flex items-center justify-center gap-4">
                    <span dir="ltr" className="font-mono bg-black/50 px-3 py-1 rounded-lg">{lightboxFile.name}</span>
                    <button onClick={() => handleDownload(lightboxFile.id, lightboxFile.name)} className="bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition">
                       تنزيل المتصفح الحالي
                    </button>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
