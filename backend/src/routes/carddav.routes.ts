// ══════════════════════════════════════════════════════
// 📇 خادم CardDAV (قراءةٌ فقط) — /api/carddav
// ══════════════════════════════════════════════════════
// ما يحتاجه تطبيق جهات الاتصال في الآيفون (RFC 4918 / 6352 / 6578 + getctag):
//   /api/carddav/                        جذر: current-user-principal
//   /api/carddav/principals/<user>/       الحساب: addressbook-home-set
//   /api/carddav/addressbooks/            البيت: دفترٌ واحد
//   /api/carddav/addressbooks/mc/         الدفتر: getctag + sync-token + البطاقات
//   /api/carddav/addressbooks/mc/<uid>.vcf
// يُركَّب **قبل** وسيط CORS (يجيب كلّ OPTIONS بنفسه فيضيع رأس DAV). المصادقة Basic
// بجهازٍ من الداشبورد. الكتابة (PUT/DELETE/…) مرفوضة: الدفتر مرآةٌ للنظام.
// ══════════════════════════════════════════════════════

import express, { Router, type Request, type Response } from 'express';
import {
  authDevice, touchDevice, refreshCards, currentVersion, liveCards, cardsByUid, changesSince,
} from '../services/contacts-sync.service.js';
import { env } from '../config/env.js';

const router = Router();
router.use(express.text({ type: () => true, limit: '2mb' }));

const ROOT = '/api/carddav/';
const PRINCIPALS = '/api/carddav/principals/';
const HOME = '/api/carddav/addressbooks/';
const BOOK = '/api/carddav/addressbooks/mc/';
const principalOf = (u: string) => `${PRINCIPALS}${u}/`;
const cardHref = (uid: string) => `${BOOK}${uid}.vcf`;
const baseUrl = () => String(env.PUBLIC_URL || 'https://club-mafia.grade.sbs').replace(/\/$/, '');
const syncToken = (v: number) => `${baseUrl()}/api/carddav/sync/${v}`;

const NS_D = 'DAV:', NS_CARD = 'urn:ietf:params:xml:ns:carddav', NS_CS = 'http://calendarserver.org/ns/';
const PFX: Record<string, string> = { [NS_D]: 'd', [NS_CARD]: 'card', [NS_CS]: 'cs' };
const xe = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── سجلّ آخر الطلبات (للتشخيص من الداشبورد إن تعثّر الإعداد على الهاتف) ──
export const recentRequests: Array<{ at: string; method: string; path: string; depth: string | null; status: number; user: string | null; ua: string }> = [];
function logReq(req: Request, status: number, user: string | null) {
  recentRequests.unshift({ at: new Date().toISOString(), method: req.method, path: req.originalUrl.split('?')[0], depth: (req.headers.depth as string) ?? null, status, user, ua: String(req.headers['user-agent'] || '').slice(0, 90) });
  recentRequests.length = Math.min(recentRequests.length, 60);
}

// ══════════ XML: الخصائص المطلوبة ══════════
export interface QName { ns: string; local: string }
/** يستخرج أسماء الخصائص المطلوبة في <prop> (مع مساحات أسمائها) — null = allprop/جسمٌ فارغ */
export function parseRequestedProps(xml: string): QName[] | null {
  if (!xml || !/<(?:[\w.-]+:)?prop[\s>/]/.test(xml)) return null;
  const nsMap: Record<string, string> = {};
  for (const m of xml.matchAll(/xmlns(?::([\w.-]+))?\s*=\s*"([^"]*)"/g)) nsMap[m[1] || ''] = m[2];
  const open = /<(?:[\w.-]+:)?prop(?:\s[^>]*)?>/.exec(xml);
  if (!open) return [];
  const rest = xml.slice(open.index + open[0].length);
  const out: QName[] = [];
  let depth = 0;
  for (const m of rest.matchAll(/<(\/)?(?:([\w.-]+):)?([\w.-]+)((?:\s[^>]*?)?)(\/)?>/g)) {
    const [, close, prefix, local, attrs, selfClose] = m;
    if (close) { if (depth === 0) break; depth--; continue; }
    if (depth === 0) {
      let ns = nsMap[prefix || ''] || '';
      const inl = /xmlns(?::([\w.-]+))?\s*=\s*"([^"]*)"/.exec(attrs || '');
      if (inl && (inl[1] || '') === (prefix || '')) ns = inl[2];
      out.push({ ns, local });
    }
    if (!selfClose) depth++;
  }
  return out;
}
export function rootElement(xml: string): string {
  const m = /<(?:[\w.-]+:)?([\w.-]+)[\s>/]/.exec(String(xml || '').replace(/<\?xml[^>]*\?>/, '').trim());
  return m ? m[1] : '';
}
export function hrefsIn(xml: string): string[] {
  // الآيفون يضع مساحة الأسماء على كلّ رابط: <A:href xmlns:A="DAV:">
  return [...String(xml || '').matchAll(/<(?:[\w.-]+:)?href(?:\s[^>]*)?>\s*([^<]*?)\s*<\/(?:[\w.-]+:)?href>/g)].map(m => { try { return decodeURIComponent(m[1]); } catch { return m[1]; } });
}
export function syncTokenIn(xml: string): string | null {
  const m = /<(?:[\w.-]+:)?sync-token(?:\s[^>]*?)?\s*(?:\/>|>([^<]*)<\/(?:[\w.-]+:)?sync-token>)/.exec(String(xml || ''));
  return m ? (m[1] || '').trim() : null;
}

type Props = Map<string, string>;
const k = (ns: string, local: string) => `${ns}|${local}`;
function el(q: QName, inner: string): string {
  const p = PFX[q.ns];
  if (p) return inner ? `<${p}:${q.local}>${inner}</${p}:${q.local}>` : `<${p}:${q.local}/>`;
  return inner ? `<x:${q.local} xmlns:x="${xe(q.ns)}">${inner}</x:${q.local}>` : `<x:${q.local} xmlns:x="${xe(q.ns)}"/>`;
}
function response(href: string, props: Props, requested: QName[] | null): string {
  const want: QName[] = requested ?? [...props.keys()].map(s => { const i = s.lastIndexOf('|'); return { ns: s.slice(0, i), local: s.slice(i + 1) }; });
  const ok: string[] = [], missing: string[] = [];
  for (const q of want) { const v = props.get(k(q.ns, q.local)); if (v !== undefined) ok.push(el(q, v)); else missing.push(el(q, '')); }
  return `<d:response><d:href>${xe(href)}</d:href>`
    + (ok.length ? `<d:propstat><d:prop>${ok.join('')}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>` : '')
    + (missing.length ? `<d:propstat><d:prop>${missing.join('')}</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>` : '')
    + `</d:response>`;
}
const multistatus = (body: string) => `<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/">${body}</d:multistatus>`;

// ══════════ خصائص كلّ نوع ══════════
const READ_PRIVS = '<d:privilege><d:read/></d:privilege><d:privilege><d:read-current-user-privilege-set/></d:privilege>';
function common(user: string): Props {
  return new Map([
    [k(NS_D, 'current-user-principal'), `<d:href>${principalOf(user)}</d:href>`],
    [k(NS_D, 'principal-collection-set'), `<d:href>${PRINCIPALS}</d:href>`],
    [k(NS_D, 'current-user-privilege-set'), READ_PRIVS],
  ]);
}
function rootProps(user: string): Props {
  const p = common(user);
  p.set(k(NS_D, 'resourcetype'), '<d:collection/>');
  p.set(k(NS_D, 'displayname'), 'Mafia Club');
  return p;
}
function principalProps(user: string): Props {
  const p = common(user);
  p.set(k(NS_D, 'resourcetype'), '<d:principal/><d:collection/>');
  p.set(k(NS_D, 'displayname'), 'Mafia Club');
  p.set(k(NS_D, 'principal-URL'), `<d:href>${principalOf(user)}</d:href>`);
  p.set(k(NS_CARD, 'addressbook-home-set'), `<d:href>${HOME}</d:href>`);
  p.set(k(NS_CS, 'email-address-set'), '');
  p.set(k(NS_D, 'owner'), `<d:href>${principalOf(user)}</d:href>`);
  return p;
}
function homeProps(user: string): Props {
  const p = common(user);
  p.set(k(NS_D, 'resourcetype'), '<d:collection/>');
  p.set(k(NS_D, 'displayname'), 'Mafia Club');
  p.set(k(NS_D, 'owner'), `<d:href>${principalOf(user)}</d:href>`);
  return p;
}
function bookProps(user: string, version: number): Props {
  const p = common(user);
  p.set(k(NS_D, 'resourcetype'), '<d:collection/><card:addressbook/>');
  p.set(k(NS_D, 'displayname'), 'Mafia Club');
  p.set(k(NS_CARD, 'addressbook-description'), 'جهات اتصال لاعبي مافيا كلوب');
  p.set(k(NS_CS, 'getctag'), String(version));
  p.set(k(NS_D, 'sync-token'), syncToken(version));
  p.set(k(NS_D, 'owner'), `<d:href>${principalOf(user)}</d:href>`);
  p.set(k(NS_D, 'supported-report-set'),
    '<d:supported-report><d:report><card:addressbook-multiget/></d:report></d:supported-report>'
    + '<d:supported-report><d:report><card:addressbook-query/></d:report></d:supported-report>'
    + '<d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>');
  p.set(k(NS_CARD, 'supported-address-data'), '<card:address-data-type content-type="text/vcard" version="3.0"/>');
  p.set(k(NS_CARD, 'max-resource-size'), '102400');
  return p;
}
function cardProps(etag: string, vcard?: string): Props {
  const p: Props = new Map([
    [k(NS_D, 'getetag'), `"${etag}"`],
    [k(NS_D, 'getcontenttype'), 'text/vcard; charset=utf-8'],
    [k(NS_D, 'resourcetype'), ''],
    [k(NS_D, 'current-user-privilege-set'), READ_PRIVS],
  ]);
  // CR يُرمَّز &#13;: قارئ XML يحوّل CRLF الخامَ إلى LF فتصل البطاقة بغير نهايات أسطرها
  if (vcard !== undefined) p.set(k(NS_CARD, 'address-data'), xe(vcard).replace(/\r/g, '&#13;'));
  return p;
}
const wantsData = (req: QName[] | null) => !!req?.some(q => q.local === 'address-data');

// ══════════ المعالج ══════════
function send207(res: Response, body: string) {
  res.status(207).set('Content-Type', 'application/xml; charset=utf-8').set('DAV', '1, 3, addressbook').send(multistatus(body));
}
function norm(path: string): string {
  let p = path; try { p = decodeURIComponent(p); } catch { /* كما هو */ }
  p = p.replace(/\/{2,}/g, '/');
  for (const c of [ROOT, PRINCIPALS, HOME, BOOK]) if (p + '/' === c) return c;
  return p;
}

router.use(async (req: Request, res: Response) => {
  const path = norm(req.originalUrl.split('?')[0]);
  if (req.method === 'OPTIONS') {
    res.status(200).set('DAV', '1, 3, addressbook').set('Allow', 'OPTIONS, GET, HEAD, PROPFIND, REPORT').set('Content-Length', '0').end();
    logReq(req, 200, null); return;
  }
  const dev = await authDevice(req.headers.authorization);
  if (!dev) {
    res.status(401).set('WWW-Authenticate', 'Basic realm="Mafia Club Contacts", charset="UTF-8"').send('Unauthorized');
    logReq(req, 401, null); return;
  }
  void touchDevice(dev.id, (req.headers['cf-connecting-ip'] as string) || req.ip);
  const user = dev.username;
  try {
    if (!['GET', 'HEAD', 'PROPFIND', 'REPORT'].includes(req.method)) {
      res.status(403).set('Content-Type', 'application/xml; charset=utf-8').send('<?xml version="1.0" encoding="utf-8"?><d:error xmlns:d="DAV:"><d:need-privileges/></d:error>');
      logReq(req, 403, user); return;
    }
    await refreshCards();
    const version = await currentVersion();
    const body = typeof req.body === 'string' ? req.body : '';
    const depth = String(req.headers.depth ?? '0');
    const isCard = path.startsWith(BOOK) && path.endsWith('.vcf');
    const uid = isCard ? path.slice(BOOK.length, -4) : '';

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!isCard) { res.status(200).set('Content-Type', 'text/plain; charset=utf-8').send(req.method === 'HEAD' ? '' : 'Mafia Club CardDAV'); logReq(req, 200, user); return; }
      const c = (await cardsByUid([uid])).get(uid);
      if (!c) { res.status(404).end(); logReq(req, 404, user); return; }
      res.set('ETag', `"${c.etag}"`).set('Content-Type', 'text/vcard; charset=utf-8');
      if (String(req.headers['if-none-match'] || '').replace(/"/g, '') === c.etag) { res.status(304).end(); logReq(req, 304, user); return; }
      res.status(200).send(req.method === 'HEAD' ? '' : c.vcard); logReq(req, 200, user); return;
    }

    if (req.method === 'PROPFIND') {
      const requested = parseRequestedProps(body);
      const out: string[] = [];
      if (path === ROOT || path === '/api/carddav' || path === PRINCIPALS) {
        out.push(response(path === PRINCIPALS ? PRINCIPALS : ROOT, rootProps(user), requested));
      } else if (path.startsWith(PRINCIPALS)) {
        if (path !== principalOf(user)) { res.status(404).end(); logReq(req, 404, user); return; }
        out.push(response(path, principalProps(user), requested));
      } else if (path === HOME) {
        out.push(response(HOME, homeProps(user), requested));
        if (depth !== '0') out.push(response(BOOK, bookProps(user, version), requested));
      } else if (path === BOOK) {
        out.push(response(BOOK, bookProps(user, version), requested));
        if (depth !== '0') {
          const withData = wantsData(requested);
          const cards = await liveCards();
          const data = withData ? await cardsByUid(cards.map(c => c.uid)) : null;
          for (const c of cards) out.push(response(cardHref(c.uid), cardProps(c.etag, data?.get(c.uid)?.vcard), requested));
        }
      } else if (isCard) {
        const c = (await cardsByUid([uid])).get(uid);
        if (!c) { res.status(404).end(); logReq(req, 404, user); return; }
        out.push(response(path, cardProps(c.etag, wantsData(requested) ? c.vcard : undefined), requested));
      } else { res.status(404).end(); logReq(req, 404, user); return; }
      send207(res, out.join('')); logReq(req, 207, user); return;
    }

    // ── REPORT ──
    if (path !== BOOK && path !== HOME) { res.status(404).end(); logReq(req, 404, user); return; }
    const kind = rootElement(body);
    const requested = parseRequestedProps(body);
    if (kind === 'addressbook-multiget') {
      const uids = hrefsIn(body).map(h => norm(h)).filter(h => h.startsWith(BOOK) && h.endsWith('.vcf')).map(h => h.slice(BOOK.length, -4));
      const got = await cardsByUid(uids);
      const out = uids.map(u => {
        const c = got.get(u);
        return c ? response(cardHref(u), cardProps(c.etag, c.vcard), requested) : `<d:response><d:href>${xe(cardHref(u))}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`;
      });
      send207(res, out.join('')); logReq(req, 207, user); return;
    }
    if (kind === 'addressbook-query') {
      const cards = await liveCards();
      const data = wantsData(requested) ? await cardsByUid(cards.map(c => c.uid)) : null;
      send207(res, cards.map(c => response(cardHref(c.uid), cardProps(c.etag, data?.get(c.uid)?.vcard), requested)).join(''));
      logReq(req, 207, user); return;
    }
    if (kind === 'sync-collection') {
      const tok = syncTokenIn(body) || '';
      let since = 0;
      if (tok) {
        const m = /\/sync\/(\d+)$/.exec(tok);
        since = m ? Number(m[1]) : -1;
        if (since < 0 || since > version) {
          res.status(403).set('Content-Type', 'application/xml; charset=utf-8').send('<?xml version="1.0" encoding="utf-8"?><d:error xmlns:d="DAV:"><d:valid-sync-token/></d:error>');
          logReq(req, 403, user); return;
        }
      }
      const withData = wantsData(requested);
      const out: string[] = [];
      if (!tok) {
        const cards = await liveCards();
        const data = withData ? await cardsByUid(cards.map(c => c.uid)) : null;
        for (const c of cards) out.push(response(cardHref(c.uid), cardProps(c.etag, data?.get(c.uid)?.vcard), requested));
      } else {
        const ch = await changesSince(since);
        const data = withData ? await cardsByUid(ch.filter(c => !c.deleted).map(c => c.uid)) : null;
        for (const c of ch) {
          out.push(c.deleted
            ? `<d:response><d:href>${xe(cardHref(c.uid))}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`
            : response(cardHref(c.uid), cardProps(c.etag, data?.get(c.uid)?.vcard), requested));
        }
      }
      send207(res, out.join('') + `<d:sync-token>${xe(syncToken(version))}</d:sync-token>`); logReq(req, 207, user); return;
    }
    res.status(403).set('Content-Type', 'application/xml; charset=utf-8').send('<?xml version="1.0" encoding="utf-8"?><d:error xmlns:d="DAV:"><d:supported-report/></d:error>');
    logReq(req, 403, user);
  } catch (e: any) {
    console.warn('⚠️ carddav:', e?.message);
    if (!res.headersSent) res.status(500).end();
    logReq(req, 500, user);
  }
});

export default router;
