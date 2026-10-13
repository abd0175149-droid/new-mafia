import { colIndex } from '../public/core.js';

// شيت وهمي يحاكي بنية ملف G119: عنوان، بيانات وصفية في السطر 3، عناوين في السطر 5، 45 صفاً.
const FIRST = ['سارة', 'محمد', 'ليلى', 'أحمد', 'هبة', 'يوسف', 'رنا', 'خالد', 'دانا', 'عمر'];
const LAST = ['العلي', 'الخطيب', 'النجار', 'الحسن', 'الزعبي', 'العمري', 'الشامي', 'المصري', 'القاسم'];

export function buildFixture() {
  const W = 35; // A..AI
  const blank = () => Array(W).fill('');
  const grid = [];
  const r1 = blank(); r1[0] = 'كشف أسماء المعلمين الطلبة'; grid.push(r1);
  grid.push(blank());
  const r3 = blank();
  r3[0] = 'قائد الدفعة'; r3[1] = 'أ. فلان';
  r3[4] = 'رقم الشعبة'; r3[5] = 'G119';
  r3[8] = 'عدد المعلمين'; r3[9] = 45;
  grid.push(r3);
  grid.push(blank());
  const h = blank();
  const set = (col, v, row = h) => { row[colIndex(col)] = v; };
  set('A', 'م'); set('B', 'NationAL-ID'); set('C', 'Name EN'); set('D', 'Name AR');
  set('E', 'first name'); set('F', 'second'); set('G', 'third'); set('H', 'last name');
  set('I', 'First Name EN'); set('J', 'Last Name EN');
  set('O', 'Ministry Number'); set('P', 'Job title'); set('Q', 'Job Title');
  set('S', 'Governorate'); set('T', 'Gov'); set('U', 'Phone number MOE DB'); set('V', 'Phone number 2 Form');
  set('W', 'DOB'); set('AA', 'specialty'); set('AB', 'School'); set('AC', 'ئ'); set('AD', 'Email'); set('AG', 'Group Number');
  grid.push(h);

  for (let i = 1; i <= 45; i++) {
    const r = blank();
    const first = FIRST[i % FIRST.length];
    let last = LAST[Math.floor(i / FIRST.length) % LAST.length] + (i > 18 ? i : '');
    let father = 'أحمد', grand = 'محمود';
    if (i === 4 || i === 13) last = 'أبو زيد' + i;
    let firstCell = first;
    if (i === 16) firstCell = 'ضيف.الله';
    const mobile = 790000000 + i * 1000 + 7; // 9 خانات تبدأ بـ 79
    set('A', i, r); set('B', 9900000000 + i, r); set('C', i === 7 ? '#SPILL!' : '*Name ' + i, r);
    set('D', `${firstCell} ${father} ${grand} ${last}`, r);
    set('E', firstCell, r); set('F', father, r); set('G', grand, r); set('H', last, r);
    set('I', 'First', r); set('J', 'Last', r);
    set('O', 1000 + i, r); set('P', '0', r); set('Q', i === 9 ? '#N/A' : 'معلم مساعد', r);
    set('S', 'إربد', r); set('T', 'قصبة إربد', r);
    // MOE DB: أعداد ضاع صفرها، وصفّان مقطوعان إلى 6 خانات
    set('U', i === 5 || i === 14 ? 790012 : mobile, r);
    // Form: 40 بصيغة 962…، 4 بـ 9620…، 1 بلا رمز دولة؛ والصف 12 رقم مختلف
    let form = 962000000000 + mobile;
    if (i >= 41 && i <= 44) form = '9620' + String(mobile);
    if (i === 45) form = mobile;
    if (i === 12) form = 962000000000 + 781234567;
    set('V', form, r);
    set('W', i % 2 ? '3/14/2001' : '##########', r);
    set('AA', 'علوم', r); set('AB', 'مدرسة النموذجية', r);
    set('AD', i === 34 ? 'user34@gmail-com' : `user${i}@gmail.com`, r);
    set('AG', 'G119', r);
    grid.push(r);
  }
  return grid;
}
