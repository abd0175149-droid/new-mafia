'use client';
// ══════════════════════════════════════════════════════
// ⚙️ إعدادات اللعبة — مكانٌ واحد في واجهة الليدر، في كلّ المراحل
//
// قرار المالك 2026-09-11: أثناء اللعب يُنسى أحياناً نمط الليل أو غرفة التشاور أو
// المواجهة، ولم يكن هناك طريقٌ لتغييرها إلّا إغلاق اللعبة وفتح أخرى. هنا كلّ ما
// يمكن تغييره، وكلّ تغييرٍ يُحفظ فوراً عبر room:update-settings.
//
// ما لا يجوز أثناء اللعب يُعرض معطَّلاً بسببه (مؤقّت اللعبة، تعارف المافيا)، وما
// يُضبط في صفحة الأدوار (عقود السفّاح، نهوض العنقاء) يُعرض للقراءة فقط.
// ══════════════════════════════════════════════════════
import { useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  gameState: any;
  emit: (event: string, data: any) => Promise<any>;
  onConfig: (config: any) => void;
  onClose: () => void;
  onError: (msg: string) => void;
}

const BETWEEN = ['LOBBY', 'GAME_OVER'];

export default function GameSettingsModal({ gameState, emit, onConfig, onClose, onError }: Props) {
  const c = gameState?.config || {};
  const phase = gameState?.phase;
  const betweenGames = BETWEEN.includes(phase);
  const isNight = phase === 'NIGHT';
  const isRemote = c.isRemote === true;
  const [busy, setBusy] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [gameName, setGameName] = useState<string>(c.gameName || '');

  const save = async (patch: Record<string, any>) => {
    const key = Object.keys(patch)[0];
    setBusy(key);
    try {
      const r = await emit('room:update-settings', { roomId: gameState.roomId, ...patch });
      if (r?.success) { onConfig(r.config); setSavedKey(key); setTimeout(() => setSavedKey(null), 1200); }
      else onError(r?.error || 'تعذّر حفظ الإعداد');
    } catch (e: any) { onError(e?.message || 'تعذّر حفظ الإعداد'); }
    finally { setBusy(null); }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border border-[#1e1e1e] rounded-xl p-4 bg-[#0d0d0d]">
      <p className="text-[#C5A059] text-xs font-black mb-3" style={{ fontFamily: 'Amiri, serif' }}>{title}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
  const Row = ({ label, hint, k, children }: { label: string; hint?: string; k?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <p className="text-white text-xs font-bold">{label} {k && savedKey === k && <span className="text-emerald-400 text-[10px] font-mono">✓ حُفظ</span>}</p>
        {hint && <p className="text-[#777] text-[10px] mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <div className="shrink-0 flex items-center gap-1">{children}</div>
    </div>
  );
  const Toggle = ({ k, value, disabled }: { k: string; value: boolean; disabled?: boolean }) => (
    <button
      disabled={disabled || busy === k}
      onClick={() => save({ [k]: !value })}
      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40 ${value ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300' : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:border-[#555]'}`}
    >
      {value ? '✓ مفعّل' : 'معطّل'}
    </button>
  );
  const Seg = ({ k, value, options, disabled }: { k: string; value: any; options: Array<{ v: any; l: string }>; disabled?: boolean }) => (
    <div className="flex bg-[#050505] rounded-lg border border-[#2a2a2a] p-1">
      {options.map(o => (
        <button
          key={String(o.v)}
          disabled={disabled || busy === k}
          onClick={() => o.v !== value && save({ [k]: o.v })}
          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all disabled:opacity-40 ${o.v === value ? 'bg-[#1a1a1a] text-[#C5A059] border border-[#C5A059]/40' : 'text-[#666] hover:text-[#aaa]'}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
  const Num = ({ k, value, min, max, step = 1, unit, disabled }: { k: string; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean }) => (
    <div className="flex items-center gap-1">
      <button disabled={disabled || busy === k || value <= min} onClick={() => save({ [k]: Math.max(min, value - step) })} className="w-7 h-7 rounded bg-[#1a1a1a] border border-[#333] text-white text-sm disabled:opacity-30">−</button>
      <span className="w-14 text-center text-white font-mono text-sm">{value}{unit ? <span className="text-[#666] text-[10px]"> {unit}</span> : ''}</span>
      <button disabled={disabled || busy === k || value >= max} onClick={() => save({ [k]: Math.min(max, value + step) })} className="w-7 h-7 rounded bg-[#1a1a1a] border border-[#333] text-white text-sm disabled:opacity-30">+</button>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 12 }}
        className="bg-[#0a0a0a] border border-[#C5A059]/30 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e1e1e] bg-[#100d06]">
          <div>
            <h3 className="text-base font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>⚙️ إعدادات اللعبة</h3>
            <p className="text-[10px] font-mono text-[#666]">{betweenGames ? 'بين الألعاب — كلّ شيء قابل للتغيير' : `أثناء اللعب (${phase}) — كلّ تغييرٍ يُحفظ فوراً ويسري من لحظته`}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#1a1a1a] text-gray-400 hover:text-[#C5A059] flex items-center justify-center">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid md:grid-cols-2 gap-3">
          <Section title="🌙 الليل">
            <Row label="نمط الليل" k="nightMode" hint={isNight ? 'الليل جارٍ — غيّره في النهار ليسري على الليلة التالية' : isRemote ? 'الغرف البعيدة أوتوماتيكيّة دائماً' : 'يدويّ: الليدر يمرّ على الأدوار · أوتوماتيكيّ: اللاعبون يرسلون من هواتفهم'}>
              <Seg k="nightMode" value={c.nightMode === 'auto' ? 'auto' : 'manual'} disabled={isNight || isRemote} options={[{ v: 'manual', l: 'يدويّ' }, { v: 'auto', l: 'أوتوماتيكيّ' }]} />
            </Row>
            <Row label="مهلة الإجراء الليليّ" k="autoNightTime" hint="ثوانٍ لكلّ لاعب في النمط الأوتوماتيكيّ">
              <Num k="autoNightTime" value={c.autoNightTime ?? 15} min={5} max={60} step={5} unit="ث" />
            </Row>
          </Section>

          <Section title="🗣️ ⚔️ التفاعل">
            <Row label="غرفة تشاور المافيا" k="mafiaChatEnabled" hint="محادثة سرّيّة للمافيا الأحياء داخل «مفكّرة التحرّي» — تراقبها من زرّ 🕵️">
              <Toggle k="mafiaChatEnabled" value={c.mafiaChatEnabled === true} />
            </Row>
            {!isRemote && (
              <>
                <Row label="مواجهة النهار" k="confrontationEnabled" hint="يطلبها اللاعب من هاتفه أثناء النقاش وتُنفَّذ بعد آخر متحدّث (30ث + 30ث)">
                  <Toggle k="confrontationEnabled" value={c.confrontationEnabled === true} />
                </Row>
                <Row label="حدّ المواجهات لكلّ لاعب" k="confrontationsPerPlayer" hint="في اللعبة الواحدة — يُصفَّر مع كلّ لعبة">
                  <Num k="confrontationsPerPlayer" value={c.confrontationsPerPlayer ?? 1} min={1} max={5} disabled={c.confrontationEnabled !== true} />
                </Row>
              </>
            )}
            {isRemote && (
              <Row label="دعوة اللاعبين لأصدقائهم" k="allowPlayerInvites">
                <Toggle k="allowPlayerInvites" value={c.allowPlayerInvites === true} />
              </Row>
            )}
          </Section>

          <Section title="⚖️ العقوبات والتبرير">
            <Row label="أقصى عدد عقوبات" k="maxPenalties">
              <Num k="maxPenalties" value={c.maxPenalties ?? 3} min={1} max={10} />
            </Row>
            <Row label="نطاق العقوبات" k="penaltyScope" hint="الغرفة: تستمرّ بين الألعاب · اللعبة: تُصفَّر كلّ لعبة">
              <Seg k="penaltyScope" value={c.penaltyScope === 'game' ? 'game' : 'room'} options={[{ v: 'room', l: 'الغرفة' }, { v: 'game', l: 'اللعبة' }]} />
            </Row>
            <Row label="عدد التبريرات" k="maxJustifications">
              <Num k="maxJustifications" value={c.maxJustifications ?? 2} min={1} max={5} />
            </Row>
          </Section>

          <Section title="🎭 قدرات الأدوار">
            <Row label="💣 قنبلة شيخ المافيا" k="bombEnabled">
              <Toggle k="bombEnabled" value={c.bombEnabled !== false} />
            </Row>
            <Row label="🎩 وزن صوت العمدة" k="mayorVoteWeight" hint="بعد كشفه — يُقرأ لحظة التصويت">
              <Num k="mayorVoteWeight" value={c.mayorVoteWeight ?? 2} min={1} max={4} unit="×" />
            </Row>
            <Row label="🧙‍♀️ جولات تعطيل الساحرة" k="witchDisableRounds">
              <Num k="witchDisableRounds" value={c.witchDisableRounds ?? 3} min={1} max={6} />
            </Row>
            <Row label="🤡 جولات نجاة المهرّج" k="jesterSurviveRounds">
              <Num k="jesterSurviveRounds" value={c.jesterSurviveRounds ?? 2} min={1} max={5} />
            </Row>
            <Row label="🔪 عقود السفّاح · 🔥 نهوض العنقاء" hint="تُضبط في صفحة اختيار الأدوار قبل الربط">
              <span className="text-[#888] font-mono text-xs">{c.assassinContractCount ?? 4} · {c.phoenixRebirths ?? 1}</span>
            </Row>
          </Section>

          <Section title="⏱️ المؤقّت والتعارف">
            <Row label="مؤقّت اللعبة" k="gameTimerMinutes" hint={betweenGames ? '0 = بلا مؤقّت' : 'أثناء اللعب عدّله من شريط المؤقّت (±)'}>
              <Num k="gameTimerMinutes" value={c.gameTimerEnabled ? (c.gameTimerMinutes ?? 30) : 0} min={0} max={180} step={15} unit="د" disabled={!betweenGames} />
            </Row>
            <Row label="تعارف المافيا عند الربط" k="allowMafiaReveal" hint={betweenGames ? 'يعرف المافيا بعضهم عند كشف الكروت' : 'يُطبَّق عند ربط الأدوار — يُضبط بين الألعاب'}>
              <Toggle k="allowMafiaReveal" value={c.allowMafiaReveal === true} disabled={!betweenGames} />
            </Row>
          </Section>

          <Section title="📝 الغرفة">
            <Row label="اسم اللعبة" k="gameName">
              <input
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                onBlur={() => { const v = gameName.trim(); if (v && v !== c.gameName) save({ gameName: v }); }}
                className="bg-[#050505] border border-[#2a2a2a] text-white text-xs px-2 py-1.5 rounded w-40 focus:border-[#C5A059] outline-none"
                maxLength={60}
              />
            </Row>
            <Row label="السعة · الكود" hint="السعة من صفحة اللوبي">
              <span className="text-[#888] font-mono text-xs">{c.maxPlayers} · {gameState?.roomCode}</span>
            </Row>
          </Section>
        </div>
      </motion.div>
    </motion.div>
  );
}
