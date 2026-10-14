// ثوابت مشتركة بين شاشة الإرسال والقوالب والسجل.

export const MSG = {
  sent: ['أُرسلت', 'ok'],
  skipped: ['تُخطّيت', 'muted'],
  no_whatsapp: ['ليس على واتساب', 'bad'],
};

// حالة المتابعة بعد الإرسال (تُختار من قائمة، ومعها ملاحظة حرة).
export const OUTCOME = {
  replied: ['تم الرد', 'ok'],
  no_reply: ['لم يرد', 'warn'],
  no_whatsapp: ['لا يوجد واتساب', 'bad'],
  wrong_number: ['رقم خاطئ', 'bad'],
  not_delivered: ['الرسالة لم تصل', 'bad'],
  other: ['أخرى', 'muted'],
};
export const PROBLEM = new Set(['no_whatsapp', 'wrong_number', 'not_delivered']);

export function local(e164 = '') {
  return e164.startsWith('+962') ? `0${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}` : e164;
}
