# -*- coding: utf-8 -*-
"""
مولّد موقع mafia-club.masaros.net — صفحات ثابتة (هبوط + خصوصيّة + شروط + حذف البيانات) بالعربيّة والإنجليزيّة.
المصدر القانونيّ: src/privacy.ar.md و src/terms.ar.md (منسوخان من policy_versions المنشورة في الإنتاج).
التشغيل:  python build.py   →  يكتب في site/
"""
import os, re, html, sys
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, OUT = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'site')

BASE = 'https://mafia-club.masaros.net'
APP_URL = 'https://club-mafia.grade.sbs/player/home'
WA_PHONE = '962793390966'
WA_DISPLAY = '+962 7 9339 0966'
EMAIL = 'privacy@masaros.net'
INSTAGRAM = 'https://www.instagram.com/mafia_club_jo/'
UPDATED = {'ar': '٢٩ آب ٢٠٢٦', 'en': '29 August 2026'}

# ── Markdown مصغّر: ## عناوين، قوائم - و 1.، جداول |، **غامق**، *مائل* ──
def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<!\*)\*(?!\*)(.+?)\*(?!\*)', r'<em>\1</em>', s)
    s = re.sub(r'([\w.+-]+@[\w-]+\.[\w.-]+)', r'<a href="mailto:\1">\1</a>', s)
    return s

def md(text):
    out, lines, i = [], text.strip().split('\n'), 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip(): i += 1; continue
        if ln.startswith('## '):
            t = ln[3:].strip(); sid = re.sub(r'[^\w؀-ۿ]+', '-', t).strip('-')
            out.append(f'<h2 id="{sid}">{inline(t)}</h2>'); i += 1; continue
        if ln.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')]); i += 1
            head, body = rows[0], [r for r in rows[2:]]
            out.append('<div class="tbl"><table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
                       + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body) + '</tbody></table></div>')
            continue
        if re.match(r'^- ', ln):
            items = []
            while i < len(lines) and re.match(r'^- ', lines[i]): items.append(lines[i][2:]); i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ul>'); continue
        if re.match(r'^\d+\. ', ln):
            items = []
            while i < len(lines) and re.match(r'^\d+\. ', lines[i]): items.append(re.sub(r'^\d+\. ', '', lines[i])); i += 1
            out.append('<ol>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ol>'); continue
        para = []
        while i < len(lines) and lines[i].strip() and not re.match(r'^(## |\||- |\d+\. )', lines[i]): para.append(lines[i]); i += 1
        out.append('<p>' + '<br>'.join(inline(x) for x in para) + '</p>')
    return '\n'.join(out)

T = {
  'ar': dict(dir='rtl', lang='ar', brand='مافيا كلوب', home='الرئيسيّة', privacy='سياسة الخصوصيّة', terms='شروط الاستخدام', deletion='حذف البيانات',
             other='English', updated='آخر تحديث', rights='جميع الحقوق محفوظة', open_app='افتح التطبيق', wa='راسلنا على واتساب', contact='تواصل معنا',
             tagline='نادي ألعاب الاستنتاج الاجتماعيّ في الأردنّ'),
  'en': dict(dir='ltr', lang='en', brand='Mafia Club', home='Home', privacy='Privacy Policy', terms='Terms of Use', deletion='Data Deletion',
             other='العربيّة', updated='Last updated', rights='All rights reserved', open_app='Open the app', wa='Message us on WhatsApp', contact='Contact',
             tagline='The social deduction games club in Jordan'),
}
def path(lang, page):  # page: '', 'privacy', 'terms', 'data-deletion'
    p = ('/en' if lang == 'en' else '') + ('/' + page if page else '')
    return (p or '') + '/'

def layout(lang, page, title, desc, body):
    t = T[lang]; o = 'en' if lang == 'ar' else 'ar'
    nav = ''.join(f'<a href="{path(lang, p)}"{" class=on" if p == page else ""}>{t[k]}</a>' for p, k in [('', 'home'), ('privacy', 'privacy'), ('terms', 'terms'), ('data-deletion', 'deletion')])
    return f'''<!doctype html>
<html lang="{t['lang']}" dir="{t['dir']}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} — {t['brand']}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{BASE}{path(lang, page)}">
<link rel="alternate" hreflang="ar" href="{BASE}{path('ar', page)}"><link rel="alternate" hreflang="en" href="{BASE}{path('en', page)}">
<meta property="og:title" content="{html.escape(title)} — {t['brand']}"><meta property="og:description" content="{html.escape(desc)}">
<meta property="og:image" content="{BASE}/icon-1024.png"><meta property="og:url" content="{BASE}{path(lang, page)}"><meta property="og:type" content="website">
<link rel="icon" href="/icon-1024.png"><meta name="theme-color" content="#0a0908">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Amiri:wght@400;700&display=swap">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="top"><div class="in">
  <a class="brand" href="{path(lang, '')}"><img src="/icon-1024.png" alt="" width="34" height="34"><span>{t['brand']}</span></a>
  <nav>{nav}</nav>
  <a class="lang" href="{path(o, page)}">{t['other']}</a>
</div></header>
<main>{body}</main>
<footer><div class="in">
  <div><b>{t['brand']}</b><p>{t['tagline']}</p></div>
  <div class="links"><a href="{path(lang,'privacy')}">{t['privacy']}</a><a href="{path(lang,'terms')}">{t['terms']}</a><a href="{path(lang,'data-deletion')}">{t['deletion']}</a></div>
  <div class="links"><a href="https://wa.me/{WA_PHONE}" dir="ltr">{WA_DISPLAY}</a><a href="mailto:{EMAIL}">{EMAIL}</a><a href="{INSTAGRAM}">Instagram</a></div>
</div><p class="copy">© 2026 {t['brand']} · {t['rights']}</p></footer>
</body></html>'''

def doc(lang, page, title, desc, intro, content_html):
    t = T[lang]
    body = f'''<article class="doc"><p class="eyebrow">{t['brand']}</p><h1>{html.escape(title)}</h1>
<p class="meta">{t['updated']}: {UPDATED[lang]}</p>{('<p class="intro">' + intro + '</p>') if intro else ''}{content_html}</article>'''
    return layout(lang, page, title, desc, body)

HOME = {
 'ar': dict(title='مافيا كلوب', desc='نادي لعبة المافيا وجهاً لوجه في عمّان والزرقاء: أمسيات أسبوعيّة، أدوار سرّيّة، تطبيق لاعب ورتب ومواسم.',
  h1='المافيا… وجهاً لوجه', sub='أمسيات لعب حقيقيّة في عمّان والزرقاء. كلّ لاعب بدور سرّيّ، موجّه يدير الليل والنهار، وشاشة قاعة تروي القصّة. تعال وحدك أو مع أصحابك — الطاولة تتّسع للجميع.',
  how='كيف تمشي الأمسية؟', steps=[('🎟️ احجز مقعدك', 'من تطبيق اللاعب أو برسالة واتساب. الدفع في المكان.'), ('🎭 استلم دورك', 'مواطن، مافيا، أو دور خاصّ — يصلك على هاتفك سرّاً، ولا يراه غيرك.'), ('🌙 ليل ونهار', 'في الليل تتحرّك الأدوار، وفي النهار نقاش وتصويت. الفريق الذي يكشف خصمه أوّلاً يفوز.')],
  where='أين ومتى؟', venues=[('مزاج افندينا', 'الرابية · عمّان', 'الأحد · الثلاثاء · الخميس · الجمعة — ٧:٠٠ مساءً'), ('Best View', 'الزرقاء الجديدة · شارع الوينك', 'حسب الإعلان في التطبيق')], price='رسم اللعب ٣ دنانير للأمسية. المشروبات والطلبات من منيو المكان.',
  app='تطبيق اللاعب', app_p='حجز الفعاليّات، دورك السرّيّ أثناء اللعب، رتبتك ونقاطك لكلّ مدينة، سجلّ مبارياتك، ومتجر المظاهر. يعمل من المتصفّح وعلى أندرويد.',
  wa_h='على واتساب', wa_p='مساعدنا الآليّ «الدون» يجيب عن الفعاليّات والأسعار ويحجز لك ويحوّلك لموظّف متى طلبت. نردّ فقط على من يراسلنا — لا رسائل دعائيّة.',
  faq='أسئلة سريعة', qa=[('ما لعبت مافيا من قبل؟', 'الموجّه يشرح القواعد قبل كلّ مباراة، وأوّل أمسية كافية لتتقنها.'), ('كم تستغرق المباراة؟', 'بين ٣٠ و٦٠ دقيقة، ونلعب عدّة مباريات في الأمسية.'), ('ما الأعمار المسموحة؟', 'الحساب المستقلّ لمن أتمّ ١٨ سنة. من هو دونها يحتاج موافقة وليّ أمره.'), ('كيف أحذف حسابي وبياناتي؟', 'من مركز الخصوصيّة في التطبيق، أو اتّبع صفحة «حذف البيانات».')]),
 'en': dict(title='Mafia Club', desc='Face-to-face Mafia game nights in Amman and Zarqa, Jordan: weekly events, secret roles, a player app with ranks and seasons.',
  h1='Mafia — face to face', sub='Real game nights in Amman and Zarqa. Every player gets a secret role, a host runs the night and the day, and the venue screen tells the story. Come alone or with friends — there is a seat for everyone.',
  how='How does an evening work?', steps=[('🎟️ Book your seat', 'From the player app or with a WhatsApp message. You pay at the venue.'), ('🎭 Get your role', 'Citizen, Mafia or a special role — delivered privately to your phone.'), ('🌙 Night and day', 'Roles act at night; by day the table debates and votes. The team that exposes its rival first wins.')],
  where='Where and when?', venues=[('Mazaj Afandina', 'Al-Rabieh · Amman', 'Sunday · Tuesday · Thursday · Friday — 7:00 pm'), ('Best View', 'New Zarqa · Al-Wink Street', 'As announced in the app')], price='Play fee is 3 JOD per evening. Drinks and orders are from the venue menu.',
  app='The player app', app_p='Book events, see your secret role during play, track your rank and points per city, browse your match history and the cosmetics store. Works in the browser and on Android.',
  wa_h='On WhatsApp', wa_p='Our automated assistant answers questions about events and prices, books for you, and hands you to a human whenever you ask. We only reply to people who message us — no promotional messages.',
  faq='Quick questions', qa=[('Never played Mafia before?', 'The host explains the rules before every match; one evening is enough to master it.'), ('How long is a match?', '30 to 60 minutes, and we play several matches per evening.'), ('What ages are allowed?', 'Independent accounts are for 18+. Younger players need a guardian’s confirmation.'), ('How do I delete my account and data?', 'From the Privacy Centre in the app, or follow the “Data Deletion” page.')]),
}
def home(lang):
    h, t = HOME[lang], T[lang]
    steps = ''.join(f'<div class="card"><h3>{a}</h3><p>{b}</p></div>' for a, b in h['steps'])
    venues = ''.join(f'<div class="card"><h3>{a}</h3><p class="muted">{b}</p><p>{c}</p></div>' for a, b, c in h['venues'])
    qa = ''.join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in h['qa'])
    body = f'''<section class="hero"><div class="in">
  <div><p class="eyebrow">{t['tagline']}</p><h1>{h['h1']}</h1><p class="sub">{h['sub']}</p>
  <div class="cta"><a class="btn gold" href="{APP_URL}">{t['open_app']}</a><a class="btn wa" href="https://wa.me/{WA_PHONE}">{t['wa']}</a></div></div>
  <img class="logo" src="/logo.png" alt="{t['brand']}" width="300" height="360">
</div></section>
<section class="in"><h2>{h['how']}</h2><div class="grid3">{steps}</div></section>
<section class="in"><h2>{h['where']}</h2><div class="grid2">{venues}</div><p class="note">{h['price']}</p></section>
<section class="in"><div class="grid2">
  <div class="card"><h3>📱 {h['app']}</h3><p>{h['app_p']}</p><a class="btn gold sm" href="{APP_URL}">{t['open_app']}</a></div>
  <div class="card"><h3>💬 {h['wa_h']}</h3><p>{h['wa_p']}</p><a class="btn wa sm" href="https://wa.me/{WA_PHONE}" dir="ltr">{WA_DISPLAY}</a></div>
</div></section>
<section class="in"><h2>{h['faq']}</h2><div class="faq">{qa}</div></section>'''
    return layout(lang, '', h['title'], h['desc'], body)

DELETION = {
 'ar': ('حذف حسابك وبياناتك', 'كيف تحذف حسابك في مافيا كلوب وكلّ بياناتك، بما فيها محادثات واتساب.', 'لك أن تحذف حسابك وبياناتك في أيّ وقت، مجّاناً وبلا أيّ شرط. أمامك طريقان:', f'''
## الطريق الأوّل: من التطبيق (الأسرع)
1. افتح تطبيق اللاعب وسجّل الدخول.
2. اذهب إلى **حسابي ← مركز الخصوصيّة**.
3. اختر **حذف حسابي** وأكّد.
4. يُجدوَل الحذف فوراً، ولك **٣٠ يوماً للتراجع** من الصفحة نفسها.

من مركز الخصوصيّة نفسه يمكنك قبل الحذف **تنزيل نسخة كاملة من بياناتك**.

## الطريق الثاني: بطلب مباشر
إن لم تستطع الدخول إلى حسابك، أو أردت حذف **محادثاتك معنا على واتساب** فقط:
- راسلنا على واتساب: **{WA_DISPLAY}** من الرقم المسجَّل نفسه، واكتب «أريد حذف بياناتي».
- أو راسلنا على **{EMAIL}** مع ذكر رقم هاتفك المسجَّل.

نتحقّق من أنّك صاحب الرقم، ثمّ ننفّذ الطلب ونؤكّده لك. **نردّ خلال ٣٠ يوماً كحدّ أقصى**، وعادةً خلال أيّام.

## ما الذي يُحذف
| البيان | ما يحدث له |
|---|---|
| الاسم، الهاتف، البريد، تاريخ الميلاد، الصورة | يُمحى نهائيّاً بعد مهلة الثلاثين يوماً |
| رمز الإشعارات وبيانات الجهاز | يُمحى |
| سجلّ الحضور والموقع وإشارات كشف الغشّ | يُمحى |
| محادثات واتساب وملاحظاتنا عنك | تُمحى |
| نتائج المباريات والترتيب | تُجهَّل: تبقى الأرقام بلا اسمك ولا أيّ معرّف يدلّ عليك |
| السجلاّت الماليّة (الفواتير وحركات الرقائق) | تُحفظ المدّة التي يفرضها القانون، مفصولةً عن هويّتك |

## إيقاف الرسائل دون حذف الحساب
أرسل كلمة **إيقاف** (أو STOP) إلى رقمنا على واتساب، فيتوقّف أيّ تواصل غير ضروريّ فوراً. تستطيع دائماً مراسلتنا وسنردّ عليك.

## أسئلة أو شكوى
**{EMAIL}** — ولك حقّ الشكوى إلى وحدة حماية البيانات الشخصيّة في وزارة الاقتصاد الرقميّ والريادة.
'''),
 'en': ('Delete your account and data', 'How to delete your Mafia Club account and all your data, including WhatsApp conversations.', 'You can delete your account and data at any time, free of charge and unconditionally. There are two ways:', f'''
## Option 1: from the app (fastest)
1. Open the player app and sign in.
2. Go to **My Account → Privacy Centre**.
3. Choose **Delete my account** and confirm.
4. Deletion is scheduled immediately, and you have **30 days to change your mind** from the same page.

From the same Privacy Centre you can **download a full copy of your data** before deleting.

## Option 2: by direct request
If you cannot access your account, or you only want to delete **your WhatsApp conversations with us**:
- Message us on WhatsApp: **{WA_DISPLAY}** from the registered number and write “I want to delete my data”.
- Or email **{EMAIL}** stating your registered phone number.

We verify that you own the number, then carry out the request and confirm it to you. **We respond within 30 days at most**, usually within days.

## What gets deleted
| Data | What happens |
|---|---|
| Name, phone, email, date of birth, photo | Permanently erased after the 30-day grace period |
| Notification token and device data | Erased |
| Attendance and location log, cheat-detection signals | Erased |
| WhatsApp conversations and our notes about you | Erased |
| Match results and rankings | Anonymised: the numbers remain without your name or any identifier pointing to you |
| Financial records (invoices and chips movements) | Kept for the period required by law, separated from your identity |

## Stop messages without deleting your account
Send the word **STOP** (or إيقاف) to our WhatsApp number and any non-essential contact stops immediately. You can always message us and we will reply.

## Questions or complaints
**{EMAIL}** — you also have the right to complain to the Personal Data Protection Unit at the Ministry of Digital Economy and Entrepreneurship (Jordan).
'''),
}

def write(rel, content):
    p = os.path.join(OUT, rel.strip('/'), 'index.html') if rel.strip('/') else os.path.join(OUT, 'index.html')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8', newline='\n').write(content); print('wrote', os.path.relpath(p, ROOT))

read = lambda f: open(os.path.join(SRC, f), encoding='utf-8').read()
for lang in ('ar', 'en'):
    t = T[lang]
    write(path(lang, ''), home(lang))
    write(path(lang, 'privacy'), doc(lang, 'privacy', t['privacy'],
          'كيف يجمع مافيا كلوب بياناتك ويستخدمها ويحميها.' if lang == 'ar' else 'How Mafia Club collects, uses and protects your personal data.', '', md(read(f'privacy.{lang}.md'))))
    write(path(lang, 'terms'), doc(lang, 'terms', t['terms'],
          'شروط استخدام تطبيق وخدمات مافيا كلوب.' if lang == 'ar' else 'Terms of use of the Mafia Club app and services.', '', md(read(f'terms.{lang}.md'))))
    d = DELETION[lang]
    write(path(lang, 'data-deletion'), doc(lang, 'data-deletion', d[0], d[1], d[2], md(d[3])))
print('done')
