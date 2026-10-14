-- متابعة ما بعد الإرسال: هل استجاب المستلم؟ مع ملاحظة حرة.
ALTER TABLE wa_messages ADD COLUMN outcome TEXT;
ALTER TABLE wa_messages ADD COLUMN outcome_note TEXT;
ALTER TABLE wa_messages ADD COLUMN outcome_at INTEGER;
