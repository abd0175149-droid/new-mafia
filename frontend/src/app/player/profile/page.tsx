'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

const ROLE_NAMES_AR: Record<string,string> = {
  GODFATHER:'شيخ المافيا',SILENCER:'قص المافيا',CHAMELEON:'حرباية المافيا',
  MAFIA_REGULAR:'مافيا عادي',SHERIFF:'الشريف',DOCTOR:'الطبيب',
  SNIPER:'القناص',POLICEWOMAN:'الشرطية',NURSE:'الممرضة',CITIZEN:'مواطن صالح',
};
const MAFIA_ROLES = ['GODFATHER','SILENCER','CHAMELEON','MAFIA_REGULAR'];

const RANK_CONFIG: Record<string,{name:string;icon:string;color:string;bg:string;glow?:string}> = {
  INFORMANT:{name:'مُخبر',icon:'🕵️',color:'#CD7F32',bg:'from-amber-900/30 to-amber-800/10',},
  SOLDIER:{name:'جندي',icon:'⚔️',color:'#C0C0C0',bg:'from-gray-500/20 to-gray-600/10',},
  CAPO:{name:'كابو',icon:'🎖️',color:'#FFD700',bg:'from-yellow-500/20 to-yellow-600/10',},
  UNDERBOSS:{name:'أندربوس',icon:'💎',color:'#00BFFF',bg:'from-cyan-500/20 to-cyan-600/10',},
  GODFATHER:{name:'الأب الروحي',icon:'👑',color:'#DC2626',bg:'from-red-600/20 to-red-700/10',glow:'shadow-red-500/20 shadow-lg'},
};

function resizeImage(file:File,maxSize=400):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=(e)=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement('canvas');
        let w=img.width,h=img.height;
        if(w>maxSize||h>maxSize){if(w>h){h=Math.round(h*maxSize/w);w=maxSize}else{w=Math.round(w*maxSize/h);h=maxSize}}
        canvas.width=w;canvas.height=h;
        canvas.getContext('2d')?.drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg',0.85));
      };
      img.onerror=()=>reject(new Error('فشل'));
      img.src=e.target?.result as string;
    };
    reader.onerror=()=>reject(new Error('فشل'));
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
  const fileInputRef=useRef<HTMLInputElement>(null);
  const nameInputRef=useRef<HTMLInputElement>(null);

  const getAuthHeaders=useCallback(():Record<string,string>=>{
    const token=localStorage.getItem('mafia_player_token');
    return token?{'Authorization':`Bearer ${token}`}:{};
  },[]);

  const SOCKET_URL=process.env.NEXT_PUBLIC_SOCKET_URL||'';

  useEffect(()=>{
    const playerId=localStorage.getItem('mafia_playerId');
    if(!playerId){setError('لم يتم العثور على حساب');setLoading(false);return;}
    fetch(`/api/player/${playerId}/profile`,{headers:getAuthHeaders()})
      .then(r=>r.json())
      .then(data=>{
        if(data.success){setProfile(data);setNameInput(data.player.name);setEmailInput(data.player.email||'');}
        else setError(data.error||'خطأ');
      })
      .catch(()=>setError('خطأ في الاتصال'))
      .finally(()=>setLoading(false));
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

  const handleAvatarUpload=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file||!profile)return;
    if(file.size>10*1024*1024){showToast('الصورة كبيرة جداً');return;}
    setSaving(true);
    try{
      const resized=await resizeImage(file,400);
      const res=await fetch(`/api/player/${profile.player.id}/avatar`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({image:resized})});
      const d=await res.json();
      if(d.success){setProfile((p:any)=>p?{...p,player:{...p.player,avatarUrl:d.avatarUrl+'?t='+Date.now()}}:p);showToast('✓ تم تحديث الصورة');}
      else showToast(d.error||'خطأ');
    }catch{showToast('خطأ في رفع الصورة');}
    setSaving(false);
    if(fileInputRef.current)fileInputRef.current.value='';
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
        <div className="absolute inset-0 opacity-10" style={{background:`radial-gradient(circle at 50% 0%,${rank.color}33,transparent 60%)`}}/>
        <div className="max-w-lg mx-auto px-6 pt-10 pb-8 text-center relative z-10">
          {/* Avatar */}
          <div className="relative inline-block mb-4">
            <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:'spring',damping:15}}
              className="w-28 h-28 mx-auto rounded-full flex items-center justify-center text-4xl overflow-hidden cursor-pointer"
              style={{border:`3px solid ${rank.color}40`,background:'linear-gradient(145deg,#1a1a1a,#2a2a2a)'}}
              onClick={()=>fileInputRef.current?.click()}>
              {avatarSrc?<img src={avatarSrc} alt="" className="w-full h-full object-cover"/>:
                player.gender==='FEMALE'?'👩':'👤'}
              {saving&&<div className="absolute inset-0 bg-black/60 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full"/></div>}
            </motion.div>
            <button onClick={()=>fileInputRef.current?.click()} className="absolute bottom-0 left-0 w-8 h-8 rounded-full flex items-center justify-center text-black text-sm shadow-lg border-2 border-black" style={{background:rank.color}}>📷</button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload}/>
          </div>

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
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r ${rank.bg} border mb-3 ${rank.glow||''}`}
            style={{borderColor:`${rank.color}30`}}>
            <span className="text-lg">{rank.icon}</span>
            <span className="font-bold text-sm" style={{color:rank.color}}>{rank.name}</span>
            <span className="text-gray-400 text-xs">المستوى {progression?.level||1}</span>
          </motion.div>

          {/* XP Progress */}
          <div className="max-w-xs mx-auto mb-2">
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>{progression?.xp||0} XP</span>
              <span>{progression?.nextLevelXP||500} XP</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <motion.div initial={{width:0}} animate={{width:`${progression?.xpProgress||0}%`}} transition={{duration:1,ease:'easeOut'}}
                className="h-full rounded-full" style={{background:`linear-gradient(90deg,${rank.color},${rank.color}88)`}}/>
            </div>
          </div>

          {/* RR */}
          <div className="text-xs text-gray-500 mb-1">{progression?.rankRR||0}/100 RR</div>
          <p className="text-gray-600 text-xs">انضم {joinYear}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-20 space-y-5 -mt-2">
        {/* ═══ QUICK STATS ═══ */}
        <div className="grid grid-cols-4 gap-2">
          {[
            {v:stats.totalMatches,l:'مباريات',c:'text-white'},
            {v:`${stats.winRate}%`,l:'نسبة فوز',c:'text-emerald-400'},
            {v:stats.longestWinStreak||0,l:'🔥 سلسلة',c:'text-amber-400'},
            {v:stats.totalSurvived||player.totalSurvived||0,l:'نجا',c:'text-cyan-400'},
          ].map((s,i)=>(
            <motion.div key={i} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1*i}}
              className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-3 text-center hover:bg-white/[0.06] transition cursor-default">
              <p className={`text-xl font-black ${s.c} tabular-nums`}>{s.v}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">{s.l}</p>
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

        {/* Back */}
        <div className="text-center pt-2">
          <Link href="/player" className="text-xs text-gray-600 hover:text-gray-400 transition">← العودة للعبة</Link>
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
