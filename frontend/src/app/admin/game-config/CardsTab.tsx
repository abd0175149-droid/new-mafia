'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gcFetch } from './helpers';
import * as LucideIcons from 'lucide-react';
import CardEditorModal from './CardEditorModal';
import RankEffectsSection from './RankEffectsSection';

// Helper: render Lucide icon by name
function LucideIcon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  const Icon = (LucideIcons as any)[name];
  if (!Icon) return <span className={className} style={{ fontSize: size }}>✦</span>;
  return <Icon size={size} className={className} />;
}

interface CardTemplate {
  id: string;
  gradient: string;
  borderColor: string;
  textColor: string;
  glowEffect: string;
  teamBadge: { text: string; bgColor: string; textColor: string; borderColor: string; size?: number; position?: string } | null;
  icon: { type: string; value: string; size?: number } | null;
  secretFace: { type: string; customImageUrl?: string; overlayGradient?: string; bgColor?: string } | null;
  elements: {
    showPlayerNumber: boolean; showClubBranding: boolean; showDescription: boolean;
    customFooterText?: string; fontFamily?: string;
    nameSize?: number; iconSize?: number; badgeSize?: number;
    positions?: {
      badge?: { x: number; y: number; s?: number };
      icon?: { x: number; y: number; s?: number };
      title?: { x: number; y: number; s?: number };
      number?: { x: number; y: number; s?: number };
      footer?: { x: number; y: number; s?: number };
      playerName?: { x: number; y: number; s?: number };
      coverNumber?: { x: number; y: number; s?: number };
      coverName?: { x: number; y: number; s?: number };
      coverBranding?: { x: number; y: number; s?: number };
      coverFooter?: { x: number; y: number; s?: number };
      coverPhoto?: { x: number; y: number; s?: number; w?: number; h?: number };
    };
    shapes?: {
      id: string;
      face: 'role' | 'cover';
      type: 'rect' | 'circle';
      x: number; y: number; w: number; h: number;
      bg: string; opacity: number; zIndex: number;
      radius: number;
    }[];
  } | null;
}

interface RoleOption { id: string; nameAr: string; team: string; cardTemplateId: string | null; }

const FONT_OPTIONS = [
  { label: 'أميري (كلاسيكي)', value: 'Amiri, serif' },
  { label: 'القاهرة (حديث)', value: 'Cairo, sans-serif' },
  { label: 'تجوال', value: 'Tajawal, sans-serif' },
  { label: 'نوتو كوفي', value: 'Noto Kufi Arabic, sans-serif' },
  { label: 'ريم كوفي', value: 'Reem Kufi, sans-serif' },
  { label: 'Inter (لاتيني)', value: 'Inter, sans-serif' },
];



const ICON_OPTIONS = [
  { label: 'مستخدم', value: 'User' }, { label: 'قلب', value: 'HeartPulse' },
  { label: 'درع', value: 'Shield' }, { label: 'حقنة', value: 'Syringe' },
  { label: 'نيشان', value: 'Crosshair' }, { label: 'شارة', value: 'BadgeAlert' },
  { label: 'جمجمة', value: 'Skull' }, { label: 'تاج', value: 'Crown' },
  { label: 'قناع', value: 'Drama' }, { label: 'مقص', value: 'Scissors' },
  { label: 'نار', value: 'Flame' }, { label: 'شبح', value: 'Ghost' },
  { label: 'عين', value: 'Eye' }, { label: 'صاعقة', value: 'Zap' },
  { label: 'سيف', value: 'Sword' }, { label: 'قلب ❤', value: 'Heart' },
];

export default function CardsTab() {
  const [items, setItems] = useState<CardTemplate[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CardTemplate> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewFace, setPreviewFace] = useState<'front' | 'secret'>('front');
  const [editorTab, setEditorTab] = useState<'colors' | 'icon' | 'typography' | 'elements' | 'secret'>('colors');

  const load = () => {
    setLoading(true);
    Promise.all([
      gcFetch('/card-templates').then(d => d.data || []),
      gcFetch('/roles').then(d => d.data || []),
    ]).then(([c, r]) => { setItems(c); setRoles(r); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true); setError('');
    try {
      const editId = editing.id;
      const isNew = !editId || !items.find(i => i.id === editId);
      if (isNew) {
        if (!editId) { setError('يجب تعيين معرّف (ID) للقالب'); setSaving(false); return; }
        await gcFetch('/card-templates', { method: 'POST', body: JSON.stringify(editing) });
      } else {
        const { id: _id, createdAt, updatedAt, created_at, updated_at, ...body } = editing as any;
        await gcFetch(`/card-templates/${encodeURIComponent(editId)}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      setEditing(null); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const linkedRoles = useMemo(() => {
    if (!editing?.id) return [];
    return roles.filter(r => r.cardTemplateId === editing.id);
  }, [editing?.id, roles]);

  const openEditor = (t: Partial<CardTemplate>) => {
    setEditing(t); setPreviewFace('front'); setEditorTab('colors');
  };

  const el = editing?.elements || { showPlayerNumber: true, showClubBranding: true, showDescription: true };
  const setEl = (patch: any) => setEditing({ ...editing, elements: { ...el, ...patch } });

  const newTemplate = (): Partial<CardTemplate> => ({
    id: '', gradient: 'linear-gradient(to bottom, #991b1b, #1a0000)', borderColor: 'rgba(239, 68, 68, 0.6)',
    textColor: '#fca5a5', glowEffect: '',
    teamBadge: { text: 'فريق المدينة 🔵', bgColor: 'rgba(30,58,138,0.6)', textColor: '#93c5fd', borderColor: 'rgba(59,130,246,0.3)' },
    icon: { type: 'lucide', value: 'User', size: 48 },
    secretFace: { type: 'GENERATED', bgColor: '#000' },
    elements: { showPlayerNumber: true, showClubBranding: true, showDescription: true, fontFamily: 'Amiri, serif', nameSize: 20, iconSize: 48, badgeSize: 10 },
  });

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      {/* ── قسم قوالب البطاقات ── */}
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{items.length} قالب بطاقة</p>
        <button onClick={() => openEditor(newTemplate())}
          className="px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl text-sm hover:bg-amber-500/25 transition">+ قالب جديد</button>
      </div>

      {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">{error}</div>}

      {/* Grid of cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((card, i) => {
          const cardRoles = roles.filter(r => r.cardTemplateId === card.id);
          return (
            <motion.div key={card.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden hover:border-gray-600/60 transition group cursor-pointer"
              onClick={() => openEditor({ ...card })}
            >
              {/* Card Preview */}
              <div className="h-28 relative overflow-hidden" style={{ background: card.gradient || 'linear-gradient(to bottom, #3f3f46, #18181b)' }}>
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top right, transparent, rgba(255,255,255,0.03), transparent)' }} />
                {/* شارة الفريق */}
                {card.teamBadge && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[8px] font-mono"
                    style={{ backgroundColor: card.teamBadge.bgColor || 'rgba(30,58,138,0.6)', color: card.teamBadge.textColor || '#93c5fd', border: `1px solid ${card.teamBadge.borderColor || 'rgba(59,130,246,0.3)'}` }}>
                    {card.teamBadge.text}
                  </div>
                )}
                {/* الأيقونة */}
                <div className="absolute inset-0 flex items-center justify-center pt-4">
                  {card.icon?.type?.toLowerCase() === 'emoji' ? (
                    <span className="text-3xl">{card.icon.value}</span>
                  ) : card.icon?.type?.toLowerCase() === 'lucide' ? (
                    <LucideIcon name={card.icon.value} size={28} className="" />
                  ) : (
                    <span className="text-3xl">✦</span>
                  )}
                </div>
              </div>
              <div className="p-3">
                <p className="text-white text-sm font-medium">{card.id}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {cardRoles.map(r => (
                    <span key={r.id} className={`text-[9px] px-1.5 py-0.5 rounded ${
                      r.team === 'MAFIA' ? 'bg-rose-500/15 text-rose-400' : r.team === 'NEUTRAL' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                    }`}>{r.nameAr}</span>
                  ))}
                  {cardRoles.length === 0 && <span className="text-[9px] text-gray-600">غير مرتبط</span>}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Modal — Card Editor */}
      <AnimatePresence>
        {editing && (
          <CardEditorModal
            key="card-editor"
            editing={editing}
            setEditing={setEditing}
            isNew={!items.find(i => i.id === editing.id)}
            linkedRoles={linkedRoles}
            onSave={save}
            onClose={() => setEditing(null)}
            saving={saving}
            error={error}
            setError={setError}
            onLoad={load}
          />
        )}
      </AnimatePresence>
      </div>

      {/* ── قسم تأثيرات الرتب ── */}
      <div className="border-t border-gray-700/30 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🎖️</span>
          <h3 className="text-white font-semibold">تأثيرات الرتب البصرية</h3>
          <span className="text-gray-500 text-xs">— طبقة تصميم فوق البطاقة حسب رتبة اللاعب</span>
        </div>
        <RankEffectsSection />
      </div>
    </div>
  );
}

