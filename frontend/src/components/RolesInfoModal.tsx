import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RolesInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLES = {
  mafia: [
    {
      name: 'شيخ المافيا',
      icon: '🎩',
      desc: 'قائد فريق المافيا. هو من يصدر قرار القتل ليلاً. يتمتع بحصانة ضد كشف "الشريف"، حيث يظهر له على أنه "مواطن صالح".',
    },
    {
      name: 'قص المافيا',
      icon: '🤫',
      desc: 'يستطيع اختيار لاعب واحد ليلاً ليتم "قصه"، مما يمنعه من التبرير والتصويت نهائياً في نهار اليوم التالي.',
    },
    {
      name: 'حرباية المافيا',
      icon: '🦎',
      desc: 'فرد متخفي من فريق المافيا. يمتلك قدرة على التلاعب وقد يظهر بأدوار مختلفة لمنع كشفه.',
    },
    {
      name: 'مافيا عادي',
      icon: '🔪',
      desc: 'عضو في المافيا لا يملك قدرات خاصة ليلاً، لكنه يستيقظ معهم ويتفق على الضحية، ويساعد في توجيه التصويت نهاراً.',
    },
  ],
  citizen: [
    {
      name: 'الشريف',
      icon: '🕵️',
      desc: 'المحقق الخاص بالمواطنين. يستيقظ ليلاً ليتفحص هوية شخص واحد ليعرف ما إذا كان من "المافيا" أم لا (باستثناء شيخ المافيا).',
    },
    {
      name: 'الطبيب',
      icon: '🩺',
      desc: 'يستيقظ ليلاً لاختيار شخص واحد لحمايته. إذا حاولت المافيا قتل هذا الشخص في نفس الليلة، فإنه يعيش ولن يتم إقصاؤه.',
    },
    {
      name: 'القناص',
      icon: '🎯',
      desc: 'يمتلك طلقة يستطيع إطلاقها في أي ليلة لقتل شخص يشك بأنه مافيا. إذا أخطأ وقتل مواطناً، فقد يموت هو أيضاً أو يخسر طلقته.',
    },
    {
      name: 'الشرطية',
      icon: '👮‍♀️',
      desc: 'تلعب دوراً حاسماً في النهار أو تمتلك درعاً خاصاً يحميها. قد تساعد في كشف الأكاذيب وتوجيه دفة التصويت.',
    },
    {
      name: 'الممرضة',
      icon: '💉',
      desc: 'مساعدة الطبيب. قد ترث قدرة الطبيب على الحماية في حال موته، وتعتبر عضواً مهماً في دعم المواطنين.',
    },
    {
      name: 'مواطن صالح',
      icon: '👤',
      desc: 'لا يملك قدرات ليلية. سلاحه الوحيد هو صوته وقدرته على الإقناع والتبرير في النهار لكشف المافيا وطردهم.',
    },
  ],
};

export default function RolesInfoModal({ isOpen, onClose }: RolesInfoModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" dir="rtl">
        {/* خلفية معتمة للتسكير عند النقر عليها */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* الموديل الأساسي */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-3xl max-h-[85vh] bg-gray-900 border border-gray-800 shadow-2xl rounded-3xl overflow-hidden flex flex-col"
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

          {/* Body (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-8 custom-scrollbar">
            
            {/* فريق المافيا */}
            <section>
              <h3 className="text-lg font-bold text-rose-500 mb-4 flex items-center gap-2">
                <span className="w-2 h-6 bg-rose-500 rounded-full inline-block"></span>
                فريق المافيا
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ROLES.mafia.map((role, idx) => (
                  <div key={idx} className="bg-gray-800/40 border border-rose-900/30 p-4 rounded-2xl hover:bg-gray-800/60 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{role.icon}</span>
                      <h4 className="font-bold text-rose-100">{role.name}</h4>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{role.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* فريق المواطنين */}
            <section>
              <h3 className="text-lg font-bold text-emerald-500 mb-4 flex items-center gap-2">
                <span className="w-2 h-6 bg-emerald-500 rounded-full inline-block"></span>
                فريق المواطنين
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ROLES.citizen.map((role, idx) => (
                  <div key={idx} className="bg-gray-800/40 border border-emerald-900/30 p-4 rounded-2xl hover:bg-gray-800/60 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{role.icon}</span>
                      <h4 className="font-bold text-emerald-100">{role.name}</h4>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{role.desc}</p>
                  </div>
                ))}
              </div>
            </section>

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
