-- استثناء ملف بياناته غير صحيحة: يبقى محفوظاً ويمكن إرجاعه، لكن جهاته لا تدخل
-- جهات الاتصال الموحّدة ولا التصدير ولا الإحصائيات.
ALTER TABLE uploads ADD COLUMN excluded_at INTEGER;
ALTER TABLE uploads ADD COLUMN exclude_reason TEXT;
