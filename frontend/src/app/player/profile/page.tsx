'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ImageCropper } from '@/components/ImageCropper';

const ROLE_NAMES_AR: Record<string,string> = {
  GODFATHER:'شيخ المافيا',SILENCER:'قص المافيا',CHAMELEON:'حرباية المافيا',
  MAFIA_REGULAR:'مافيا عادي',SHERIFF:'الشريف',DOCTOR:'الطبيب',
  SNIPER:'القناص',POLICEWOMAN:'الشرطية',NURSE:'الممرضة',CITIZEN:'مواطن صالح',
};
const MAFIA_ROLES = ['GODFATHER','SILENCER','CHAMELEON','MAFIA_REGULAR'];

const RANK_TIERS_ORDER = ['INFORMANT','SOLDIER','CAPO','UNDERBOSS','GODFATHER'];

const RANK_CONFIG: Record<string,{name:string;icon:string;color:string;bg:string;glow?:string}> = {
  INFORMANT:{name:'مُخبر',icon:'🕵️',color:'#CD7F32',bg:'from-amber-900/30 to-amber-800/10',},
  SOLDIER:{name:'جندي',icon:'⚔️',color:'#C0C0C0',bg:'from-gray-500/20 to-gray-600/10',},
  CAPO:{name:'كابو',icon:'🎖️',color:'#FFD700',bg:'from-yellow-500/20 to-yellow-600/10',},
  UNDERBOSS:{name:'أندربوس',icon:'💎',color:'#00BFFF',bg:'from-cyan-500/20 to-cyan-600/10',},
  GODFATHER:{name:'الأب الروحي',icon:'👑',color:'#DC2626',bg:'from-red-600/20 to-red-700/10',glow:'shadow-red-500/20 shadow-lg'},
};

/**
 * قص الصورة لمربع (center crop) + تغيير الحجم بجودة عالية
 * - قص مربع من المنتصف (أكبر مربع ممكن)
 * - تغيير الحجم لـ 512x512 (كافي لعرض واضح على الكارد)
 * - JPEG بجودة 95%
 */
function cropAndResizeImage(file: File, targetSize = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));

        // Center crop: أكبر مربع ممكن من المنتصف
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        // تفعيل الـ smoothing بأعلى جودة
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // قص من المصدر + رسم على الـ canvas المربع
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => reject(new Error('فشل'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('فشل'));
    reader.readAsDataURL(file);
  });
}

export default function PlayerProfilePage(){
  const [profile,setProfile]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [saveMsg,setSaveMsg]=useState('');
  const [editingName,setEditingName]=useState(false);
  const [nameInput,setNameInput]=useState('');
  const [editingEmail,setEditingEmail]=useState(false);
  const [emailInput,setEmailInput]=useState('');
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [leaderboard,setLeaderboard]=useState<any[]>([]);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const nameInputRef=useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null); // ← ملف ينتظر القص

  const getAuthHeaders=useCallback(():Record<string,string>=>{
    const token=localStorage.getItem('mafia_player_token');
    return token?{'Authorization':`Bearer ${token}`}:{};
  },[]);

  const SOCKET_URL=process.env.NEXT_PUBLIC_SOCKET_URL||'';

  useEffect(()=>{
    // محاولة جلب playerId من الـ context الجديد أو القديم
    let playerId: string | null = null;
    const newAuth = localStorage.getItem('mafia_player_auth');
    if (newAuth) {
      try { playerId = String(JSON.parse(newAuth).playerId); } catch {}
    }
    if (!playerId) playerId = localStorage.getItem('mafia_playerId');
    if(!playerId){setError('لم يتم العثور على حساب');setLoading(false);return;}
    fetch(`/api/player/${playerId}/profile`,{headers:getAuthHeaders()})
      .then(r=>r.json())
      .then(data=>{
        if(data.success){setProfile(data);setNameInput(data.player.name);setEmailInput(data.player.email||'');}
        else setError(data.error||'خطأ');
      })
      .catch(()=>setError('خطأ في الاتصال'))
      .finally(()=>setLoading(false));
    fetch('/api/player-app/leaderboard',{headers:getAuthHeaders()}).then(r=>r.json()).then(d=>{if(Array.isArray(d))setLeaderboard(d.slice(0,5));}).catch(()=>{});
  },[getAuthHeaders]);

  const showToast=(msg:string)=>{setSaveMsg(msg);setTimeout(()=>setSaveMsg(''),3000);};

  const handleSaveName=useCallback(async()=>{
    if(!profile)return;
    const t=nameInput.trim();
    if(!t||t===profile.player.name){setEditingName(false);setNameInput(profile.player.name);return;}
    setSaving(true);
    try{
      const res=await fetch(`/api/player/${profile.player.id}/profile`,{method:'PUT',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({name:t})});
      const d=await res.json();
      if(d.success){setProfile((p:any)=>p?{...p,player:{...p.player,name:t}}:p);showToast('✓ تم حفظ الاسم');}
      else{showToast(d.error||'خطأ');setNameInput(profile.player.name);}
    }catch{showToast('خطأ');setNameInput(profile.player.name);}
    setSaving(false);setEditingName(false);
  },[profile,nameInput,getAuthHeaders]);

  const handleSaveEmail=useCallback(async()=>{
    if(!profile)return;
    const t=emailInput.trim();
    if(t===(profile.player.email||'')){setEditingEmail(false);return;}
    setSaving(true);
    try{
      const res=await fetch(`/api/player/${profile.player.id}/profile`,{method:'PUT',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({email:t||null})});
      const d=await res.json();
      if(d.success){setProfile((p:any)=>p?{...p,player:{...p.player,email:t||undefined}}:p);showToast('✓ تم حفظ الإيميل');}
      else{showToast(d.error||'خطأ');setEmailInput(profile.player.email||'');}
    }catch{showToast('خطأ');setEmailInput(profile.player.email||'');}
    setSaving(false);setEditingEmail(false);
  },[profile,emailInput,getAuthHeaders]);

  // ── اختيار ملف → فتح واجهة القص ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (file.size > 10 * 1024 * 1024) { showToast('الصورة كبيرة جداً (أقصى 10MB)'); return; }
    setCropFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── رفع الصورة بعد القص ──
  const handleCroppedUpload = async (croppedBase64: string) => {
    setCropFile(null);
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/player/${profile.player.id}/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ image: croppedBase64 }),
      });
      const d = await res.json();
      if (d.success) {
        setProfile((p: any) => p ? { ...p, player: { ...p.player, avatarUrl: d.avatarUrl + '?t=' + Date.now() } } : p);
        showToast('✓ تم تحديث الصورة');
      } else showToast(d.error || 'خطأ');
    } catch { showToast('خطأ في رفع الصورة'); }
    setSaving(false);
  };

  if(loading)return(
    <div className="min-h-screen bg-black flex items-center justify-center">
      <motion.div animate={{rotate:360}} transition={{duration:2,repeat:Infinity,ease:'linear'}}>
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full"/>
      </motion.div>
    </div>
  );

  if(error||!profile)return(
    <div className="min-h-screen bg-black flex items-center justify-center text-center p-8">
      <div>
        <p className="text-amber-400 text-xl font-bold mb-4">{error||'لم يتم العثور على البروفايل'}</p>
        <Link href="/player" className="px-6 py-2 bg-gray-900 border border-amber-500/30 text-amber-400 rounded-lg text-sm hover:bg-amber-500/10 transition">العودة</Link>
      </div>
    </div>
  );

  const{player,stats,progression,matchHistory}=profile;
  const avatarSrc=player.avatarUrl?`${SOCKET_URL}${player.avatarUrl}`:null;
  const rank=RANK_CONFIG[progression?.rankTier||'INFORMANT']||RANK_CONFIG.INFORMANT;
  const joinYear=new Date(player.createdAt).getFullYear();

  return(
    <div className="min-h-screen bg-black text-white" dir="rtl">
      {/* ═══ HERO ═══ */}
      <div className="relative overflow-hidden" style={{background:'linear-gradient(180deg,#0a0500 0%,#000 100%)'}}>
        <div className="absolute inset-0 opacity-20" style={{background:`radial-gradient(circle at 50% 30%,${rank.color}44,transparent 50%)`}}/>
        <div className="max-w-lg mx-auto px-6 pt-6 pb-8 text-center relative z-10">
          {/* Settings Icon */}
          <button onClick={()=>setSettingsOpen(!settingsOpen)}
            className="absolute top-6 left-6 w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition z-20">
            ⚙️
          </button>

          {/* Avatar */}
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 w-36 h-36 mx-auto rounded-full" style={{background:`radial-gradient(circle, ${rank.color}30, transparent 60%)`,filter:'blur(25px)',transform:'scale(1.5)'}} />
            <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:'spring',damping:15}}
              className="w-36 h-36 mx-auto rounded-full flex items-center justify-center text-5xl overflow-hidden cursor-pointer relative"
              style={{border:`5px solid ${rank.color}`,background:'linear-gradient(145deg,#1a1a1a,#0d0d0d)',boxShadow:`0 0 40px ${rank.color}30, 0 0 80px ${rank.color}10, inset 0 0 20px ${rank.color}08`}}
              onClick={()=>fileInputRef.current?.click()}>
              {avatarSrc?<img src={avatarSrc} alt="" className="w-full h-full object-cover"/>:
                player.gender==='FEMALE'?'👩':'👤'}
              {saving&&<div className="absolute inset-0 bg-black/60 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full"/></div>}
            </motion.div>
            <button onClick={()=>fileInputRef.current?.click()} className="absolute bottom-0 left-0 w-8 h-8 rounded-full flex items-center justify-center text-black text-sm shadow-lg border-2 border-black" style={{background:rank.color}}>📷</button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect}/>
          </div>

          {/* ── واجهة القص التفاعلية ── */}
          {cropFile && (
            <ImageCropper
              file={cropFile}
              onCrop={handleCroppedUpload}
              onCancel={() => setCropFile(null)}
              outputSize={512}
            />
          )}

          {/* Name */}
          {editingName?(
            <input ref={nameInputRef} value={nameInput} onChange={e=>setNameInput(e.target.value)}
              onBlur={handleSaveName} onKeyDown={e=>e.key==='Enter'&&handleSaveName()}
              className="text-2xl font-black text-center bg-transparent border-b-2 border-amber-500/50 outline-none w-48 mx-auto block mb-2" autoFocus/>
          ):(
            <h1 className="text-2xl font-black mb-1 cursor-pointer hover:text-amber-200 transition" onClick={()=>{setEditingName(true);setTimeout(()=>nameInputRef.current?.focus(),100);}}>
              {player.name}
            </h1>
          )}

          {/* Rank Badge */}
          <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.2}}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-4"
            style={{background:`linear-gradient(135deg, ${rank.color}15, ${rank.color}05)`,border:`2px solid ${rank.color}40`,boxShadow:`0 0 15px ${rank.color}10`}}>
            <span className="text-xl">{rank.icon}</span>
            <span className="font-bold text-sm" style={{color:rank.color}}>{rank.name} {(progression?.rankTier||'INFORMANT')}</span>
          </motion.div>

          {/* Level + XP Bar */}
          <div className="flex items-center gap-3 max-w-xs mx-auto mb-2">
            {/* Level Badge - Shield Style */}
            <div className="shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center relative" style={{background:`linear-gradient(180deg, ${rank.color}25, #0a0a0a)`,border:`2px solid ${rank.color}50`,boxShadow:`0 4px 15px ${rank.color}15`}}>
              <span className="text-[7px] text-gray-400 uppercase tracking-widest font-bold">LEVEL</span>
              <span className="text-2xl font-black" style={{color:rank.color}}>{progression?.level||1}</span>
            </div>
            {/* XP Progress */}
            <div className="flex-1">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-gray-500">التقدم XP</span>
                <span style={{color:rank.color}}>{progression?.xp||0} / {progression?.nextLevelXP||500} XP</span>
              </div>
              <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                <motion.div initial={{width:0}} animate={{width:`${progression?.xpProgress||0}%`}} transition={{duration:1,ease:'easeOut'}}
                  className="h-full rounded-full" style={{background:`linear-gradient(90deg,${rank.color},${rank.color}88)`}}/>
              </div>
              <p className="text-[9px] text-gray-600 mt-0.5">المستوى التالي: {(progression?.nextLevelXP||500) - (progression?.xp||0)} XP</p>
            </div>
          </div>

          <p className="text-gray-600 text-xs">انضم {joinYear}</p>
        </div>
      </div>

      {/* ═══ RANK PROGRESSION ═══ */}
      <div className="max-w-lg mx-auto px-4 -mt-1 mb-2">
        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.3}}
          className="rounded-2xl p-4" style={{background:'linear-gradient(180deg,#111111,#0a0a0a)',border:`1px solid ${rank.color}20`}}>
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-300">الرتبة الحالية</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl">{rank.icon}</span>
                <div>
                  <p className="font-bold text-sm" style={{color:rank.color}}>{rank.name}</p>
                  <p className="text-[10px] text-gray-500">تقدم الرتبة</p>
                </div>
              </div>
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-gray-300">عن الرتب</h3>
              <div className="flex gap-2 mt-1.5">
                {RANK_TIERS_ORDER.map((t,i)=>{const rc=RANK_CONFIG[t];const isActive=t===(progression?.rankTier||'INFORMANT');const idx=RANK_TIERS_ORDER.indexOf(progression?.rankTier||'INFORMANT');const isPast=i<idx;
                  return <div key={t} className="flex flex-col items-center gap-0.5">
                    <span className={`text-2xl ${isActive?'':'opacity-25'} ${isPast?'opacity-50':''}`} style={isActive?{filter:`drop-shadow(0 0 6px ${rc.color})`}:{}}>{rc.icon}</span>
                    <span className={`text-[7px] ${isActive?'font-bold':'text-gray-600'}`} style={isActive?{color:rc.color}:{}}>{rc.name}</span>
                  </div>;
                })}
              </div>
            </div>
          </div>
          {/* RR Progress */}
          <div className="mb-1.5"><div className="flex justify-between text-[10px] text-gray-500 mb-1"><span>{progression?.rankRR||0} / 100 RR</span></div>
            <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden"><motion.div initial={{width:0}} animate={{width:`${progression?.rankRR||0}%`}} transition={{duration:1}} className="h-full rounded-full" style={{background:`linear-gradient(90deg,${rank.color},${rank.color}88)`}}/></div>
          </div>
          <p className="text-[10px] text-gray-600 text-center">تحتاج {100-(progression?.rankRR||0)} RR للترقية • عند 100 RR سوف تترقى</p>
        </motion.div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-20 space-y-5">
        {/* ═══ PERFORMANCE OVERVIEW ═══ */}
        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.4}}
          className="rounded-2xl p-5" style={{background:'linear-gradient(180deg,#111111,#0a0a0a)',border:'1px solid rgba(251,191,36,0.15)'}}>
          <h3 className="text-sm font-bold text-gray-300 mb-3">الأداء العام</h3>
          <div className="flex items-center justify-around">
            {[
              {v:stats.totalMatches,l:'المباريات',icon:'🎮',c:'text-white'},
              {v:stats.totalWins||0,l:'فوز',icon:'🏆',c:'text-emerald-400'},
              {v:(stats.totalMatches||0)-(stats.totalWins||0),l:'خسارة',icon:'💀',c:'text-rose-400'},
            ].map((s,i)=>(
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-2xl">{s.icon}</span>
                <p className={`text-2xl font-black ${s.c} tabular-nums`}>{s.v}</p>
                <p className="text-[10px] text-gray-500">{s.l}</p>
              </div>
            ))}
            {/* Win Rate Circle */}
            <div className="relative w-[72px] h-[72px] shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1a1a2e" strokeWidth="3.5"/>
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#fbbf24" strokeWidth="3.5" strokeLinecap="round"
                  strokeDasharray={`${(stats.winRate/100)*97.4} 97.4`} style={{filter:'drop-shadow(0 0 4px #fbbf2440)'}}/>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-amber-400">{stats.winRate}%</span>
              <p className="text-[9px] text-gray-500 text-center mt-0.5">معدل الفوز</p>
            </div>
          </div>
        </motion.div>

        {/* ═══ EXTRA STATS ═══ */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {v:stats.longestWinStreak||0,l:'🔥 أطول سلسلة فوز',c:'text-amber-400'},
            {v:`${stats.survivalRate}%`,l:'🛡️ معدل النجاة',c:'text-cyan-400'},
            {v:`${progression?.successfulDeals||0}/${progression?.totalDeals||0}`,l:'🤝 الاتفاقيات',c:'text-purple-400'},
          ].map((s,i)=>(
            <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.1*i+0.5}}
              className="rounded-xl p-3 text-center" style={{background:'linear-gradient(180deg,#111111,#0a0a0a)',border:'1px solid rgba(251,191,36,0.12)'}}>
              <p className={`text-xl font-black ${s.c} tabular-nums`}>{s.v}</p>
              <p className="text-[9px] text-gray-500 mt-1">{s.l}</p>
            </motion.div>
          ))}
        </div>

        {/* ═══ PERFORMANCE ANALYTICS ═══ */}
        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.4}}
          className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-gray-300">📊 تحليل الأداء</h3>

          {/* Faction Split */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-red-400">🔴 مافيا {stats.mafiaWinRate}%</span>
              <span className="text-cyan-400">🔵 مواطن {stats.citizenWinRate}%</span>
            </div>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all" style={{width:`${stats.mafiaGames>0?(stats.mafiaGames/(stats.mafiaGames+stats.citizenGames)*100):50}%`}}/>
              <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-500 flex-1"/>
            </div>
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>{stats.mafiaGames} مباراة ({stats.mafiaWins} فوز)</span>
              <span>{stats.citizenGames} مباراة ({stats.citizenWins} فوز)</span>
            </div>
          </div>

          {/* Survival Rate */}
          <div className="flex items-center gap-3">
            <div className="relative w-14 h-14 shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1f2937" strokeWidth="3"/>
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#06b6d4" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(stats.survivalRate/100)*97.4} 97.4`}/>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-cyan-400">{stats.survivalRate}%</span>
            </div>
            <div><p className="text-sm font-bold text-white">معدل النجاة</p><p className="text-[10px] text-gray-500">نسبة البقاء حتى نهاية المباراة</p></div>
          </div>

          {/* Favorite Role + Deals */}
          <div className="grid grid-cols-2 gap-2">
            {stats.favoriteRole&&(
              <div className="bg-purple-500/10 border border-purple-500/15 rounded-xl px-3 py-2">
                <p className="text-[10px] text-gray-500">الدور المفضل</p>
                <p className="text-sm font-bold text-purple-400">{ROLE_NAMES_AR[stats.favoriteRole]||stats.favoriteRole}</p>
              </div>
            )}
            <div className="bg-amber-500/10 border border-amber-500/15 rounded-xl px-3 py-2">
              <p className="text-[10px] text-gray-500">🤝 الاتفاقيات</p>
              <p className="text-sm font-bold text-amber-400">{progression?.successfulDeals||0}/{progression?.totalDeals||0}</p>
              {(progression?.totalDeals||0)>0&&<p className="text-[10px] text-gray-600">{progression.dealSuccessRate}% نجاح</p>}
            </div>
          </div>
        </motion.div>

        {/* ═══ MINI LEADERBOARD ═══ */}
        {leaderboard.length>0&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.55}}
            className="rounded-2xl p-4" style={{background:'linear-gradient(180deg,#111111,#0a0a0a)',border:'1px solid rgba(251,191,36,0.15)'}}>
            <h3 className="text-sm font-bold text-gray-300 mb-3">🏆 لوحة المتصدرين</h3>
            <div className="flex items-center gap-2 px-2 mb-2 pb-2" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
              <span className="w-6" /><span className="w-6" />
              <span className="flex-1 text-[9px] text-gray-600">اللاعب</span>
              <span className="text-[9px] text-gray-600 w-12 text-center">المستوى</span>
              <span className="text-[9px] text-gray-600 w-10 text-center">RR</span>
            </div>
            <div className="space-y-0.5">
              {leaderboard.map((p:any,i:number)=>{
                const isMe=p.id===player?.id;
                const medals=['🥇','🥈','🥉'];
                const rc=RANK_CONFIG[p.rankTier||'INFORMANT']||RANK_CONFIG.INFORMANT;
                return(
                  <div key={p.id} className={`flex items-center gap-2 px-2 py-2.5 rounded-lg transition`}
                    style={isMe?{background:'linear-gradient(90deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04))',border:'1px solid rgba(251,191,36,0.25)'}:{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                    <span className="text-sm w-6 text-center font-bold" style={{color:i<3?'#fbbf24':'#6b7280'}}>{i<3?medals[i]:(i+1)}</span>
                    <span className="text-lg">{rc.icon}</span>
                    <span className={`flex-1 text-xs ${isMe?'text-amber-400 font-bold':'text-gray-300'}`}>{p.name}</span>
                    <span className="text-xs text-gray-500 w-12 text-center tabular-nums">{p.level||1}</span>
                    <span className="text-xs text-amber-400 w-10 text-center tabular-nums font-bold">{p.rankRR||0}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══ MATCH HISTORY ═══ */}
        {matchHistory?.length>0&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.5}}
            className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
            <h3 className="text-sm font-bold text-gray-300 mb-3">📜 آخر المباريات</h3>
            <div className="space-y-1.5">
              {matchHistory.slice(0,8).map((m:any,i:number)=>{
                const isMafia=MAFIA_ROLES.includes(m.role);
                const won=(isMafia&&m.matchWinner==='MAFIA')||(!isMafia&&m.matchWinner==='CITIZEN');
                const dur=m.matchDuration?`${Math.floor(m.matchDuration/60)}:${String(m.matchDuration%60).padStart(2,'0')}`:'—';
                const dt=m.matchDate?new Date(m.matchDate):null;
                const dateStr=dt?`${dt.getDate()}/${dt.getMonth()+1}`:'—';
                return(
                  <motion.div key={i} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:0.05*i}}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 border transition hover:scale-[1.01] ${
                      won?'bg-emerald-500/5 border-emerald-500/10':'bg-rose-500/5 border-rose-500/10'}`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full ${won?'bg-emerald-400':'bg-rose-400'}`}/>
                      <span className="text-xs text-gray-300">{ROLE_NAMES_AR[m.role]||m.role||'—'}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${isMafia?'bg-red-500/10 text-red-400':'bg-cyan-500/10 text-cyan-400'}`}>
                        {isMafia?'مافيا':'مواطن'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-500">
                      <span>{m.survived?'🛡️ نجا':'💀'}</span>
                      {m.xpEarned!==undefined&&<span className="text-amber-400/70">+{m.xpEarned}XP</span>}
                      <span className="font-mono">{dur}</span>
                      <span className="font-mono">{dateStr}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══ SETTINGS TOGGLE ═══ */}
        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.6}}
          className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
          <button onClick={()=>setSettingsOpen(!settingsOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-white transition">
            <span className="flex items-center gap-2">⚙️ إعدادات الحساب</span>
            <span className={`transition-transform ${settingsOpen?'rotate-180':''}`}>▼</span>
          </button>
          <AnimatePresence>
            {settingsOpen&&(
              <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                className="border-t border-white/5 px-4 py-4 space-y-3 overflow-hidden">
                {/* Phone */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">📱 الهاتف</span>
                  <span className="text-xs text-gray-400 font-mono" dir="ltr">{player.phone?.replace(/(\d{3})\d{4}(\d+)/,'$1****$2')}</span>
                </div>
                {/* Email */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">✉️ الإيميل</span>
                  {editingEmail?(
                    <input value={emailInput} onChange={e=>setEmailInput(e.target.value)}
                      onBlur={handleSaveEmail} onKeyDown={e=>e.key==='Enter'&&handleSaveEmail()}
                      className="text-xs bg-transparent border-b border-amber-500/50 outline-none text-white w-40 text-left" dir="ltr" autoFocus placeholder="email@example.com"/>
                  ):(
                    <button onClick={()=>setEditingEmail(true)} className="text-xs text-amber-400/70 hover:text-amber-400 transition">
                      {player.email||'إضافة إيميل'}
                    </button>
                  )}
                </div>
                {/* Gender */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">👤 الجنس</span>
                  <span className="text-xs text-gray-400">{player.gender==='FEMALE'?'أنثى':'ذكر'}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Logout */}
        <div className="text-center pt-4 pb-2 space-y-2">
          <button
            onClick={() => {
              localStorage.removeItem('mafia_player_auth');
              localStorage.removeItem('mafia_playerId');
              localStorage.removeItem('mafia_player_token');
              window.location.href = '/player/login';
            }}
            className="text-xs text-red-500/60 hover:text-red-400 transition px-4 py-2 rounded-xl border border-red-500/10 hover:border-red-500/30"
          >
            🚪 تسجيل الخروج
          </button>
        </div>
      </div>

      {/* ═══ TOAST ═══ */}
      <AnimatePresence>
        {saveMsg&&(
          <motion.div initial={{opacity:0,y:50}} animate={{opacity:1,y:0}} exit={{opacity:0,y:50}}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-sm font-bold bg-gray-800 border border-gray-700 text-amber-400 shadow-xl">
            {saveMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
