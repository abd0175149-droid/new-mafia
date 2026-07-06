'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RolesInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RoleDef {
  id: string;
  nameAr: string;
  nameEn: string;
  team: 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
  abilities: string[];
  description: string | null;
  winConditionType: string | null;
  winConditionDescription: string | null;
  genPriority: number;
}

// أيقونات افتراضية للأدوار المعروفة — الأدوار الجديدة تحصل على أيقونة حسب الفريق
const ROLE_ICONS: Record<string, string> = {
  GODFATHER: '🎩', SILENCER: '🤫', CHAMELEON: '🦎', MAFIA_REGULAR: '🔪',
  SHERIFF: '🕵️', DOCTOR: '🩺', SNIPER: '🎯', POLICEWOMAN: '👮‍♀️',
  NURSE: '💉', CITIZEN: '👤', JESTER: '🃏',
};

const TEAM_DEFAULT_ICON: Record<string, string> = {
  MAFIA: '🎭', CITIZEN: '🛡️', NEUTRAL: '⚖️',
};

const TEAM_CONFIG = {
  MAFIA: {
    title: 'فريق المافيا',
    color: 'text-rose-500',
    barColor: 'bg-rose-500',
    cardBorder: 'border-rose-900/30',
    cardBg: 'bg-gray-800/40 hover:bg-gray-800/60',
    nameColor: 'text-rose-100',
  },
  CITIZEN: {
    title: 'فريق المواطنين',
    color: 'text-emerald-500',
    barColor: 'bg-emerald-500',
    cardBorder: 'border-emerald-900/30',
    cardBg: 'bg-gray-800/40 hover:bg-gray-800/60',
    nameColor: 'text-emerald-100',
  },
  NEUTRAL: {
    title: 'الأدوار المستقلة',
    color: 'text-amber-500',
    barColor: 'bg-amber-500',
    cardBorder: 'border-amber-900/30',
    cardBg: 'bg-gray-800/40 hover:bg-gray-800/60',
    nameColor: 'text-amber-100',
  },
};

export default function RolesInfoModal({ isOpen, onClose }: RolesInfoModalProps) {
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(false);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${API_URL}/api/game-config/roles`)
      .then(r => r.json())
      .then(d => {
        if (d.data && Array.isArray(d.data)) {
          setRoles(d.data);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  // تجميع الأدوار حسب الفريق
  const grouped: Record<string, RoleDef[]> = { MAFIA: [], CITIZEN: [], NEUTRAL: [] };
  for (const role of roles) {
    if (grouped[role.team]) {
      grouped[role.team].push(role);
    }
  }
  // ترتيب حسب الأولوية
  for (const team of Object.keys(grouped)) {
    grouped[team].sort((a, b) => a.genPriority - b.genPriority);
  }

  const getIcon = (role: RoleDef) => ROLE_ICONS[role.id] || TEAM_DEFAULT_ICON[role.team] || '🎭';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" dir="rtl">
        {/* خلفية معتمة */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* الموديل */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-3xl max-h-[85vh] bg-gray-900 border border-gray-800 shadow-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 bg-gray-800/50 border-b border-gray-700/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl shadow-lg">
                🃏
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">الكروت والأدوار</h2>
                <p className="text-sm text-gray-400">تعرف على قدرات كل دور في اللعبة</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition-colors flex items-center justify-center text-lg"
            >
              ✖
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-8 custom-scrollbar">
            {loading && (
              <div className="flex justify-center py-16">
                <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
              </div>
            )}

            {error && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-2xl mb-2">⚠️</p>
                <p className="text-sm">تعذّر تحميل الأدوار</p>
              </div>
            )}

            {!loading && !error && (['MAFIA', 'CITIZEN', 'NEUTRAL'] as const).map(team => {
              const teamRoles = grouped[team];
              if (teamRoles.length === 0) return null;
              const config = TEAM_CONFIG[team];

              return (
                <section key={team}>
                  <h3 className={`text-lg font-bold ${config.color} mb-4 flex items-center gap-2`}>
                    <span className={`w-2 h-6 ${config.barColor} rounded-full inline-block`}></span>
                    {config.title}
                    <span className="text-xs text-gray-600 font-normal">({teamRoles.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {teamRoles.map((role) => (
                      <motion.div
                        key={role.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`${config.cardBg} border ${config.cardBorder} p-4 rounded-2xl transition-colors`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">{getIcon(role)}</span>
                          <div>
                            <h4 className={`font-bold ${config.nameColor}`}>{role.nameAr}</h4>
                            <span className="text-[10px] text-gray-600">{role.nameEn}</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          {role.description || 'لا يوجد وصف'}
                        </p>
                        {role.winConditionType && (
                          <div className="mt-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/15">
                            <p className="text-[10px] text-amber-400">
                              🏆 {role.winConditionDescription || role.winConditionType}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Footer */}
          <div className="p-4 bg-gray-800/50 border-t border-gray-700/50 text-center shrink-0">
            <button
              onClick={onClose}
              className="px-8 py-2.5 bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-white rounded-xl font-medium transition-all shadow-lg"
            >
              حسناً، فهمت الأدوار
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
