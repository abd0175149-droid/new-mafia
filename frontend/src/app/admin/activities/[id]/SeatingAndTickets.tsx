'use client';

// ══════════════════════════════════════════════════════
// إعدادات الجلوس الذكيّ + التذاكر المستخدمة في النشاط
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { Badge, Banner, Empty, Setting, Skel, Toggle } from '../../whatsapp/wa-ui';
import { apiFetch, fmtDateTime } from '../components/acts-shared';

const CONSTRAINT_INFO: Record<string, { label: string; desc: string; defaultEnabled: boolean }> = {
  NO_ADJACENT_PAIRS: { label: 'أزواج ممنوعة', desc: 'لاعبان محدَّدان يدويّاً لا يجلسان بجانب بعض', defaultEnabled: true },
  PENALTY_NEIGHBOR_AVOIDANCE: { label: 'تجنّب جيران المعاقَب', desc: 'اللاعب المعاقَب لا يجلس بجانب نفس الجيران مرّة أخرى', defaultEnabled: true },
  NEW_PLAYER_SEPARATION: { label: 'فصل اللاعبين الجدد', desc: 'لاعب جديد (أقلّ من 3 فعاليّات) لا يُحاط بلاعبَين جديدَين', defaultEnabled: true },
  HIGH_RANK_SEPARATION: { label: 'فصل الرتب العالية', desc: 'لاعبان بتصنيف عالٍ لا يجلسان بجانب بعض', defaultEnabled: false },
  GENDER_SEPARATION: { label: 'فصل الجنسين', desc: 'ذكر لا يجلس بجانب أنثى (أضعف قيد)', defaultEnabled: false },
};

const defaultConstraints = () => Object.entries(CONSTRAINT_INFO).map(([type, info]) => ({
  type,
  enabled: info.defaultEnabled,
  priority: type === 'NO_ADJACENT_PAIRS' ? 1 : type === 'PENALTY_NEIGHBOR_AVOIDANCE' ? 2 : type === 'NEW_PLAYER_SEPARATION' ? 3 : type === 'HIGH_RANK_SEPARATION' ? 4 : 8,
  params: {},
}));

export function SeatingConstraintsPanel({ activityId }: { activityId: number }) {
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [constraints, setConstraints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/seating/constraints?activityId=${activityId}`);
        setEngineEnabled(res.engineEnabled || false);
        setConstraints(res.constraints && res.constraints.length > 0 ? res.constraints : defaultConstraints());
      } catch (err: any) {
        console.warn('Failed to fetch seating constraints:', err.message);
        setConstraints(defaultConstraints()); // إعدادات افتراضية عند الخطأ
      } finally {
        setLoading(false);
      }
    })();
  }, [activityId]);

  const saveConstraints = async (newEnabled: boolean, newConstraints: any[]) => {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/api/seating/constraints', {
        method: 'PUT',
        body: JSON.stringify({ activityId, engineEnabled: newEnabled, constraints: newConstraints }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.warn('Failed to save seating constraints:', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEngine = () => {
    const next = !engineEnabled;
    setEngineEnabled(next);
    saveConstraints(next, constraints);
  };

  const toggleConstraint = (type: string) => {
    const updated = constraints.map(c => c.type === type ? { ...c, enabled: !c.enabled } : c);
    setConstraints(updated);
    saveConstraints(engineEnabled, updated);
  };

  if (loading) return <div className="stack"><Skel h={60} /><Skel h={60} /></div>;

  return (
    <div className="wa-card">
      <Setting
        title={<>المحرّك الذكيّ {saving ? <Badge>جارٍ الحفظ…</Badge> : saved ? <Badge tone="ok">حُفظ</Badge> : null}</>}
        hint="عند التفعيل يوزّع النظام المقاعد تلقائيّاً حسب القيود أدناه، وتُطبَّق عند دخول اللاعبين للغرفة."
      >
        <Toggle on={engineEnabled} onChange={toggleEngine} label="المحرّك الذكيّ للجلوس" />
      </Setting>
      {engineEnabled && constraints.map(c => {
        const info = CONSTRAINT_INFO[c.type];
        if (!info) return null;
        return (
          <Setting key={c.type} title={info.label} hint={info.desc}>
            <Toggle on={!!c.enabled} onChange={() => toggleConstraint(c.type)} label={info.label} />
          </Setting>
        );
      })}
      {engineEnabled && <Banner>القيود تُحفظ تلقائيّاً وتُطبَّق على كلّ الغرف المرتبطة بهذا النشاط.</Banner>}
    </div>
  );
}

// ── التذاكر المستخدمة مع هذا النشاط (من النظام المركزي) ──
export function TicketsSection({ activityId }: { activityId: number }) {
  const [usedTickets, setUsedTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 1. التذاكر المربوطة بهذا النشاط (assigned)
        const assigned = await apiFetch(`/api/tickets/by-activity/${activityId}`);
        // 2. أيضاً التذاكر المستخدمة فعلياً في هذا النشاط (قد لا تكون مربوطة مسبقاً)
        const all = await apiFetch(`/api/tickets?limit=500`);
        const usedHere = (all || []).filter((t: any) => t.isUsed && Number(t.usedInActivityId) === activityId);
        // دمج بدون تكرار
        const merged = new Map<number, any>();
        for (const t of [...(assigned || []), ...usedHere]) {
          if (t.isUsed) merged.set(t.id, t);
        }
        setUsedTickets(Array.from(merged.values()));
      } catch (err) {
        console.error('Failed to fetch used tickets:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [activityId]);

  return (
    <div className="wa-card">
      <div className="row" style={{ marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Badge tone="violet"><span className="ltr">{usedTickets.length}</span> تذكرة</Badge>
        <span className="grow" />
        <Link href="/admin/tickets" className="wa-btn sm">إدارة التذاكر المركزيّة</Link>
      </div>
      {loading ? (
        <div className="stack"><Skel h={40} /><Skel h={40} /></div>
      ) : usedTickets.length > 0 ? (
        <div className="wa-tablewrap">
          <table className="wa-table cards">
            <thead>
              <tr><th>#</th><th>رقم التذكرة</th><th>اللاعب</th><th>الهاتف</th><th>البائع</th><th>تاريخ الاستخدام</th></tr>
            </thead>
            <tbody>
              {usedTickets.map((t: any, i: number) => (
                <tr key={t.id}>
                  <td data-l="#"><span className="ltr muted">{i + 1}</span></td>
                  <td data-l="رقم التذكرة"><span className="ltr">{t.ticketNumber}</span></td>
                  <td data-l="اللاعب">{t.usedByName || '—'}</td>
                  <td data-l="الهاتف"><span className="ltr">{t.usedByPhone || '—'}</span></td>
                  <td data-l="البائع">{t.sellerName || '—'}</td>
                  <td data-l="تاريخ الاستخدام">{t.usedAt ? fmtDateTime(t.usedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<Ticket />} title="لا تذاكر مستخدمة بعد">لم تُستخدم أيّ تذكرة مع هذا النشاط.</Empty>
      )}
    </div>
  );
}
