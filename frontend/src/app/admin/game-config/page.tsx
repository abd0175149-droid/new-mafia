'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import AbilitiesTab from './AbilitiesTab';
import RolesTab from './RolesTab';
import InteractionsTab from './InteractionsTab';

const TABS = [
  { id: 'abilities', label: 'القدرات', icon: '⚡' },
  { id: 'roles', label: 'الأدوار', icon: '🎭' },
  { id: 'interactions', label: 'التفاعلات', icon: '⚔️' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function GameConfigPage() {
  const [activeTab, setActiveTab] = useState<TabId>('abilities');

  return (
    <div className="space-y-6 pb-10" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">🧩 الأدوار والشخصيات</h1>
        <p className="text-gray-500 text-sm mt-1">إدارة القدرات والأدوار وقواعد التفاعل — نظام Data-Driven</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/50 p-1 rounded-xl border border-gray-700/40 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50 border border-transparent'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {activeTab === 'abilities' && <AbilitiesTab />}
        {activeTab === 'roles' && <RolesTab />}
        {activeTab === 'interactions' && <InteractionsTab />}
      </motion.div>
    </div>
  );
}
