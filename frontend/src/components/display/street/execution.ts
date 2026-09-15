// ══════════════════════════════════════════════════════
// ⚖️ مشهد الإقصاء النهاريّ — «ساحة الحُكم» (قرارات المالك 2026-09-13)
// ══════════════════════════════════════════════════════
// الحشد بعدد الأحياء (الجنس من حقل اللاعب) يتجمّع أمام الجدار الأيسر قرب باب النادي، المحكوم يُقاد إلى
// الجدار، طلقةٌ من خارج الكادر (لا منفّذ)، سقوطٌ، ثمّ دخانٌ بلون فريقه: المدينة أزرق، المافيا أحمر، المستقلّ أصفر.
// الضحايا الثانويّة (ديل مرتدّ/توأم/قنبلة/رماد) تسقط من بين الحشد بدخان فريقها.
// المحرّك لا يعرف أسماء ولا أدواراً: يستلم مقاعد وجنساً وفريقاً فقط، والبطاقات على الشاشة تتزامن عبر onBeat.
// الصوت هنا لا شيء: الشاشة تعزف الطلقة بنفسها لحظة بِيت 'shot' (قرار المالك: التزامن التامّ).
// ══════════════════════════════════════════════════════
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { StreetEngine } from './engine';

export type ExecTeam = 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
export type ExecFigure = { id: number; gender: 'M' | 'F' };
export type ExecVictim = ExecFigure & { team: ExecTeam };
export type ExecBeatName = 'gather' | 'escort' | 'close' | 'shot' | 'fall' | 'smoke' | 'flip' | 'gray' | 'pan' | 'victim-fall' | 'victim-smoke' | 'victim-flip' | 'victim-gray' | 'hold' | 'end';
export type ExecBeat = { name: ExecBeatName; victimId: number | null; primary: boolean };
export type ExecTemplate = { scene: THREE.Object3D; h: number; clips: Record<string, THREE.AnimationClip> };

type Fig = { id: number; gender: 'M' | 'F'; root: THREE.Group; tilt: THREE.Group; mixer: THREE.AnimationMixer | null; acts: Record<string, THREE.AnimationAction>; cur: string; spot: [number, number]; home: [number, number]; goal: [number, number] | null; face: [number, number] | null; act: 'idle' | 'stagger' | 'fall' | 'dead'; actT: number; flinch: number; back: number; walk: number };
type Smoke = { ps: { g: THREE.Group; items: { s: THREE.Sprite; life: number; vx?: number; vz?: number }[] }; on: boolean; t: number; origin: THREE.Vector3; light: THREE.PointLight };
type Beat = { t: number; fn: () => void };

export const TEAM_COLOR: Record<ExecTeam, number> = { CITIZEN: 0x4aa3ff, MAFIA: 0xff3b3b, NEUTRAL: 0xffd23f };
const FACE = 12 / 2 + 3.2;
/** موقع الإعدام: الجدار الأيسر شمال باب النادي (اللافتة تبقى في الكادر) */
const WALL = new THREE.Vector3(-FACE + .85, 0, -12);
let seed = 4242; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

export class ExecutionController {
  on = false; warmed = false; state: 'idle' | 'armed' | 'running' | 'holding' | 'ending' = 'idle';
  tpl: { M: ExecTemplate | null; F: ExecTemplate | null } = { M: null, F: null };
  onBeat: ((b: ExecBeat) => void) | null = null; onChange: ((on: boolean) => void) | null = null;
  private figs: Fig[] = []; private beats: Beat[] = []; private bi = 0; private t = 0; private condemned: Fig | null = null; private victim: Fig | null = null;
  private smokes: Smoke[] = []; private flashL: THREE.PointLight | null = null; private flashS: THREE.Sprite | null = null; private flashT = -1; shake = 0; private endTimer: any = null;
  constructor(private E: StreetEngine) { this.ensureFx(); /* الأضواء والرذاذ تُبنى مع المحرّك: إضافة ضوءٍ لاحقاً تعيد تجميع كلّ التظليل */ }
  /** 🔥 إحماء قوالب الحشد بعد تحميلها: نسخةٌ من كلّ قالب تُرسم إطاراً واحداً خارج الكادر فتُجمَّع برامج الجلد قبل أوّل إقصاء */
  async warmTemplates() {
    const E = this.E as any; if (E.disposed) return; /* بعد إحماء الأوضاع (prewarm) لا قبله — كان يسبقه فيُلغيه */ for (let i = 0; i < 1200 && !E.prewarmDone; i++) await new Promise(r => setTimeout(r, 100)); for (let i = 0; i < 200 && E.warming; i++) await new Promise(r => setTimeout(r, 100)); if (E.disposed || this.on) return;
    const t0 = performance.now();
    // نسختان من الحشد في الكادر (مرئيّتان) ليُجمَّع برنامج الجلد؛ لا تغيير في الجودة ولا في القياس هنا (كان يمسح اللوحة ويوقف الحلقة فيظهر وميضٌ أسود)
    const probes: Fig[] = []; for (const g of ['M', 'F'] as const) { if (!this.tpl[g]) continue; const f = this.make(-100 - (g === 'M' ? 0 : 1), g, true); if (!f) continue; f.root.position.set(WALL.x + 2 + (g === 'M' ? 0 : 1.2), f.root.position.y, WALL.z); this.play(f, 'idle'); probes.push(f); }
    // 🔴 الخلفيّة المعتَّمة تُطفئ التوهّج والفيلم والتنعيم والبوكيه، فبرامجها لم تكن تُجمَّع إلا لحظة أوّل إقصاء — على بطاقة ضعيفة تجميدٌ يتجاوز 15 ثانية
    //    فيسقط اتّصال الشاشة (ping timeout) وتبدو معلّقة. نرسم هنا إطاراً مخفيّاً بكلّ المراحل مفعّلة (بلا تغيير قياس، فلا وميض) ثمّ نعيدها.
    const passes = [E.bokeh, E.bloom, E.film, E.smaa] as { enabled: boolean }[]; const was = passes.map(x => x.enabled); const refl = E.reflector.visible; const rainWas = !!E.rain;
    try { await E.renderer.compileAsync(E.scene, E.camera); passes.forEach(x => { x.enabled = true; }); E.reflector.visible = true; /* مرآة البِرَك تُجمَّع هنا أيضاً (تظهر ليلاً بالجودة العليا فقط) */ if (!rainWas) E.makeRain(300); E.renderer.shadowMap.needsUpdate = true; E.composer.renderToScreen = false; E.composer.render(1 / 30); } catch { /* noop */ } finally { passes.forEach((x, i) => { x.enabled = was[i]; }); E.reflector.visible = refl; if (!rainWas) E.makeRain(0); E.composer.renderToScreen = true; }
    probes.forEach(f => this.remove(f));
    this.warmed = true; E.readyAt = performance.now(); E.probe = { frames: 0, t: 0, done: false }; /* فحص الإطارات يُعاد بعد اكتمال كلّ الأصول لا قبلها */ console.info('⚖️ execution scene warmed (hi-quality passes + crowd)', Math.round(performance.now() - t0), 'ms');
  }

  /* ── لقطات المشهد (تُدمج في جدول لقطات المحرّك) ── */
  shots(): Record<string, { len: number; fov: number; at: (t: number) => [THREE.Vector3, THREE.Vector3] }> {
    const C = () => this.condemned?.root.position || new THREE.Vector3(WALL.x + .7, 0, WALL.z); const V = () => this.victim?.root.position || C();
    const HP = (f: Fig | null) => { const p = new THREE.Vector3(); if (f) f.root.getWorldPosition(p); else p.copy(C()); p.y += 1.62; return p; };
    return {
      EX_WIDE: { len: 90, fov: 44, at: t => [new THREE.Vector3(3.2 - t * 1.2, 6.2 - t * 1.2, -1.5 - t * 1.5), new THREE.Vector3(-4.5, 1.3, -12)] },
      EX_ESCORT: { len: 90, fov: 40, at: () => [new THREE.Vector3(C().x + 3.0, 1.8, C().z - 3.6), HP(this.condemned)] },
      EX_CLOSE: { len: 90, fov: 30, at: () => [new THREE.Vector3(C().x + 2.2, 1.7, C().z + 1.1), HP(this.condemned)] },
      EX_LOW: { len: 90, fov: 38, at: t => [new THREE.Vector3(C().x + 2.8, 1.0 + t * .2, C().z - 3.4), new THREE.Vector3(C().x, 1.1 - t * .4, C().z)] },
      EX_SMOKE: { len: 90, fov: 38, at: t => [new THREE.Vector3(C().x + 3.8, 1.3 + t * 1.9, C().z - 4.4), new THREE.Vector3(C().x, .5 + t * 1.3, C().z + .3)] },
      EX_PAN: { len: 90, fov: 40, at: () => [new THREE.Vector3(-1.0, 3.4, -5.0), new THREE.Vector3(V().x, 1.2, V().z)] },
      EX_VICTIM: { len: 90, fov: 36, at: t => [new THREE.Vector3(V().x + 1.9, 2.7 + t * .6, V().z + 1.7), new THREE.Vector3(V().x, .8 + t * .3, V().z)] },
    };
  }
  /** هدف البوكيه أثناء المشهد */
  focus(): THREE.Vector3 | null { return this.on ? (this.victim || this.condemned)?.root.position || WALL : null; }

  private cut(shot: string) { const E = this.E as any; E.evShot = shot; E.shotT = 0; E.dip(240); }
  private emit(name: ExecBeatName, victimId: number | null, primary: boolean) { try { this.onBeat?.({ name, victimId, primary }); } catch { /* noop */ } }
  private setOn(on: boolean) { if (this.on === on) return; this.on = on; const E = this.E as any; E.applyQuality(); E.resize(); try { this.onChange?.(on); } catch { /* noop */ } }

  /* ── الشخصيّات ── */
  private make(id: number, gender: 'M' | 'F', shadow: boolean): Fig | null {
    const tpl = this.tpl[gender] || this.tpl.M || this.tpl.F; if (!tpl) return null; const E = this.E as any;
    const model = SkeletonUtils.clone(tpl.scene); E.prep(model, shadow, false); E.pinRigidProps(model); model.traverse((o: THREE.Object3D) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
    const tilt = new THREE.Group(); tilt.add(model); const root = new THREE.Group(); root.add(tilt); E.fit(root, tpl.h, 'y'); root.position.y += .16; { const bs = E.blobShadow(1.3); bs.position.y = (-root.position.y + .17) / root.scale.x; bs.scale.setScalar(1 / root.scale.x); root.add(bs); }
    const f: Fig = { id, gender, root, tilt, mixer: null, acts: {}, cur: '', spot: [0, 0], home: [0, 0], goal: null, face: null, act: 'idle', actT: 0, flinch: 0, back: 0, walk: 0 };
    if (Object.keys(tpl.clips).length) { f.mixer = new THREE.AnimationMixer(model); for (const k of Object.keys(tpl.clips)) f.acts[k] = f.mixer.clipAction(tpl.clips[k]); }
    this.E.scene.add(root); return f;
  }
  private play(f: Fig, k: string, once = false) {
    if (!f.mixer || f.cur === k) return; const a = f.acts[k] || f.acts.idle; if (!a) return; const prev = f.acts[f.cur]; if (prev && prev !== a) prev.fadeOut(.4);
    a.reset(); if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else { a.setLoop(THREE.LoopRepeat, Infinity); a.time = rnd() * a.getClip().duration; a.timeScale = .9 + rnd() * .2; }
    a.fadeIn(.4).play(); f.mixer.update(.001); f.cur = k;
  }
  private spotOf(k: number, n: number): [number, number] { const th = .15 + ((k % 9) / 8) * 1.2; const ring = Math.floor(k / 9); const r0 = 4.4 + ring * 1.4 + ((k % 3) * .5); return [WALL.x + Math.sin(th) * r0 + 1.2, WALL.z + Math.cos(th) * r0 - 1.0]; }
  private remove(f: Fig) { this.E.scene.remove(f.root); f.mixer?.stopAllAction(); }
  private clearCrowd() { this.figs.forEach(f => this.remove(f)); this.figs = []; this.condemned = null; this.victim = null; }
  /** يبني الحشد لقائمة الأحياء (يعيد استخدام الموجودين، يضيف الناقصين، يحذف الزائدين) */
  private ensureCrowd(alive: ExecFigure[], instant: boolean) {
    const keep = new Set(alive.map(a => a.id)); this.figs = this.figs.filter(f => { if (keep.has(f.id) || f.act === 'dead') return true; this.remove(f); return false; });
    let k = 0; alive.forEach((a, i) => { let f = this.figs.find(x => x.id === a.id); if (!f) { const nf = this.make(a.id, a.gender, false); /* الحشد بلا ظلال: المحكوم والضحيّة وحدهما يُظلّان */ if (!nf) return; f = nf; this.figs.push(f); const side = i % 2 ? 1 : -1; f.home = [side * (FACE - 2.2), -26 + rnd() * 20]; f.root.position.set(f.home[0], f.root.position.y, f.home[1]); f.root.rotation.y = rnd() * 6.28; }
      if (f.act === 'dead') return; f.spot = this.spotOf(k++, alive.length); if (instant) { f.root.position.set(f.spot[0], f.root.position.y, f.spot[1]); f.goal = null; f.face = [WALL.x, WALL.z]; this.play(f, 'idle'); } else { f.goal = f.spot; f.face = null; } });
  }
  private ensureFx() {
    if (this.smokes.length) return; const E = this.E as any;
    for (let i = 0; i < 3; i++) { const ps = E.particles(70, 0xffffff, 1.4, WALL.clone(), .6); ps.g.visible = false; /* 210 نداء رسم خامل — تُخفى حتى تشتعل */ ps.items.forEach((it: any) => { it.life = 2; }); const light = new THREE.PointLight(0xffffff, 0, 7, 2); this.E.scene.add(light); this.smokes.push({ ps, on: false, t: 0, origin: WALL.clone(), light }); }
    this.flashL = new THREE.PointLight(0xfff0c8, 0, 9, 1.6); this.E.scene.add(this.flashL); this.flashS = new THREE.Sprite(new THREE.SpriteMaterial({ map: (this.E as any).soft, color: 0xffe9b0, transparent: true, opacity: 0, depthWrite: false })); this.flashS.scale.set(.5, .5, 1); this.E.scene.add(this.flashS);
  }
  private startSmoke(pos: THREE.Vector3, team: ExecTeam) {
    const sm = this.smokes.find(s => !s.on) || this.smokes[0]; const c = new THREE.Color(TEAM_COLOR[team]); sm.on = true; sm.ps.g.visible = true; sm.t = 0; sm.origin.set(pos.x, .6, pos.z); sm.light.color.copy(c); sm.light.position.set(pos.x, 1.2, pos.z);
    sm.ps.items.forEach(it => { it.life = 1 + rnd(); (it.s.material as THREE.SpriteMaterial).color.copy(c); });
  }

  /* ── الواجهة العامّة ── */
  /** تلميح الموجّه (مرّ على زرّ الكشف): الحشد يبدأ التجمّع من الرصيفين */
  arm(alive: ExecFigure[]) {
    if (this.state === 'running' || this.state === 'holding') return; if (!this.tpl.M && !this.tpl.F) return;
    this.ensureFx(); this.ensureCrowd(alive, false); if (this.endTimer) { clearTimeout(this.endTimer); this.endTimer = null; }
    this.state = 'armed'; this.setOn(true); this.cut('EX_WIDE'); this.emit('gather', null, true);
  }
  /** تراجع الموجّه عن الزرّ: الحشد يعود إلى الرصيف */
  disarm() { if (this.state !== 'armed') return; this.finish(); }
  /**
   * الكشف وصل: المحكومون بالتتابع عند الجدار. hold = تبقى الساحة قائمةً بانتظار ضحيّةٍ ثانية (قنبلة/رماد)
   */
  fire(primary: ExecVictim[], alive: ExecFigure[], opts?: { hold?: boolean }) {
    if (!this.tpl.M && !this.tpl.F) return false; this.ensureFx();
    const all = alive.slice(); primary.forEach(p => { if (!all.some(a => a.id === p.id)) all.push({ id: p.id, gender: p.gender }); });
    if (this.state !== 'armed') { this.ensureCrowd(all, true); this.setOn(true); } else this.ensureCrowd(all, false);
    if (this.endTimer) { clearTimeout(this.endTimer); this.endTimer = null; }
    this.beats = []; this.bi = 0; this.t = 0; const B = (at: number, fn: () => void) => this.beats.push({ t: at, fn });
    // إن كان الحشد ما زال يمشي إلى مواضعه (تلميحٌ متأخّر) ينتظر الاقتيادُ وصولَه — حتى 5 ثوانٍ
    let remain = 0; this.figs.forEach(f => { if (f.goal && f.act === 'idle') remain = Math.max(remain, Math.hypot(f.goal[0] - f.root.position.x, f.goal[1] - f.root.position.z)); });
    let t = this.state === 'armed' ? Math.min(5, Math.max(1.5, remain / 2.0 + .4)) : 3.0;
    if (this.state !== 'armed') { B(0, () => { this.cut('EX_WIDE'); this.emit('gather', null, true); }); }
    primary.forEach(pv => { const t0 = t;
      B(t0, () => { const f = this.figs.find(x => x.id === pv.id) || null; this.condemned = f; if (f) { this.shadowOn(f); f.goal = [WALL.x + .7, WALL.z]; f.face = [WALL.x + 5, WALL.z + .3];
        // مدّة الاقتياد تتبع المسافة الفعليّة (1.15 م/ث) بين 2.5 و6 ثوانٍ؛ ما بعدها من بِيتات يُزاح بالفرق عن الـ3 ثوانٍ الافتراضيّة
        const d = Math.hypot(WALL.x + .7 - f.root.position.x, WALL.z - f.root.position.z); const dur = Math.min(6, Math.max(2.5, d / 1.15 + .6)); const shift = dur - 3.0; if (Math.abs(shift) > .05) for (let i = this.bi; i < this.beats.length; i++) this.beats[i].t += shift; }
        this.cut('EX_ESCORT'); this.emit('escort', pv.id, true); });
      B(t0 + 3.0, () => { this.figs.forEach(f => { if (f !== this.condemned && f.act === 'idle') f.back = .9; }); this.cut('EX_CLOSE'); this.emit('close', pv.id, true); });
      B(t0 + 4.0, () => { this.flashT = 0; this.shake = .45; const f = this.condemned; if (f) { f.goal = null; this.startFall(f); } this.figs.forEach(o => { if (o !== f && o.act === 'idle') o.flinch = .5; }); this.cut('EX_LOW'); this.emit('shot', pv.id, true); });
      B(t0 + 5.3, () => { if (this.condemned) this.startSmoke(this.condemned.root.position, pv.team); this.cut('EX_SMOKE'); this.emit('smoke', pv.id, true); });
      B(t0 + 6.4, () => this.emit('flip', pv.id, true));
      B(t0 + 8.2, () => this.emit('gray', pv.id, true));
      t = t0 + 10; });
    if (opts?.hold) B(t, () => { this.state = 'holding'; this.cut('EX_WIDE'); this.emit('hold', null, true); });
    else this.pushEnd(t);
    this.state = 'running'; return true;
  }
  /** ضحايا من بين الحشد (ديل مرتدّ/توأم في الحدث نفسه، أو قنبلة/رماد لاحقاً) */
  fireSecondary(victims: ExecVictim[], alive: ExecFigure[], opts?: { hold?: boolean }) {
    if (!victims.length) return false; if (!this.tpl.M && !this.tpl.F) return false; this.ensureFx();
    if (this.state === 'idle' || this.state === 'ending') { const all = alive.slice(); victims.forEach(v => { if (!all.some(a => a.id === v.id)) all.push({ id: v.id, gender: v.gender }); }); if (this.endTimer) { clearTimeout(this.endTimer); this.endTimer = null; } this.ensureCrowd(all, true); this.setOn(true); this.beats = []; this.bi = 0; this.t = 0; }
    // إن كان المشهد جارياً نُلحق بعد آخر بِيت؛ وإن كان معلّقاً (holding) نبدأ فوراً
    const last = this.beats.length ? Math.max(this.t, this.beats[this.beats.length - 1].t) : this.t;
    let t = this.state === 'holding' ? this.t + .3 : last + .5;
    // أزل بِيت الإنهاء/التعليق السابق (سيُعاد بعد الضحايا الجدد)
    this.beats = this.beats.filter(b => !(b as any).tail); const B = (at: number, fn: () => void) => this.beats.push({ t: at, fn });
    victims.forEach(v => { const t0 = t;
      B(t0, () => { let f = this.figs.find(x => x.id === v.id && x.act !== 'dead') || null; if (!f) { f = this.make(v.id, v.gender, true); if (f) { f.spot = this.spotOf(this.figs.length, this.figs.length + 1); f.root.position.set(f.spot[0], f.root.position.y, f.spot[1]); f.face = [WALL.x, WALL.z]; this.play(f, 'idle'); this.figs.push(f); } } this.victim = f; if (f) this.shadowOn(f); this.cut('EX_PAN'); this.emit('pan', v.id, false); });
      B(t0 + 1.4, () => { const f = this.victim; if (f) { f.act = 'stagger'; f.actT = 0; } this.cut('EX_VICTIM'); this.emit('victim-fall', v.id, false); });
      B(t0 + 2.6, () => { if (this.victim) this.startSmoke(this.victim.root.position, v.team); this.emit('victim-smoke', v.id, false); });
      B(t0 + 3.8, () => this.emit('victim-flip', v.id, false));
      B(t0 + 5.4, () => this.emit('victim-gray', v.id, false));
      t = t0 + 6.5; });
    if (opts?.hold) { const b: any = { t, fn: () => { this.state = 'holding'; this.cut('EX_WIDE'); this.emit('hold', null, false); } }; b.tail = true; this.beats.push(b); }
    else this.pushEnd(t);
    this.beats.sort((a, b) => a.t - b.t); this.bi = this.beats.findIndex(b => b.t > this.t); if (this.bi < 0) this.bi = this.beats.length; this.state = 'running'; return true;
  }
  /** لا ضحيّة ثانية (الموجّه تخطّى) أو انتهى الطور: الحشد يتفرّق */
  end() { if (this.state === 'idle') return; if (this.state === 'running') { this.beats = this.beats.filter(b => !(b as any).tail); this.pushEnd(Math.max(this.t, this.beats.length ? this.beats[this.beats.length - 1].t : this.t) + .5); return; } this.finish(); }
  private pushEnd(t: number) { const b: any = { t, fn: () => this.finish() }; b.tail = true; this.beats.push(b); }
  private finish() {
    this.state = 'ending'; this.emit('end', null, true); this.figs.forEach(f => { if (f.act === 'idle') { f.goal = f.home; f.face = null; } });
    const E = this.E as any; E.evShot = null; E.cut('A');
    this.endTimer = setTimeout(() => { this.clearCrowd(); this.smokes.forEach(s => { s.on = false; s.ps.g.visible = false; s.light.intensity = 0; s.ps.items.forEach(it => { (it.s.material as THREE.SpriteMaterial).opacity = 0; }); }); this.state = 'idle'; this.setOn(false); this.endTimer = null; }, 9000);
  }
  private shadowOn(f: Fig) { f.root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; }); }
  private startFall(f: Fig) { f.act = 'fall'; f.actT = 0; if (f.acts.fall) this.play(f, 'fall', true); }

  /* ── كلّ إطار ── */
  update(dt: number, time: number) {
    if (this.state === 'idle') return;
    if (this.state === 'running' || this.state === 'holding' || this.state === 'ending') { if (this.state === 'running') { this.t += dt; while (this.bi < this.beats.length && this.beats[this.bi].t <= this.t) { const b = this.beats[this.bi++]; b.fn(); } } }
    const WX = WALL.x + 5, WZ = WALL.z + .3;
    this.figs.forEach(f => { f.mixer?.update(dt);
      if (f.act === 'idle') {
        if (f.goal) { const dx = f.goal[0] - f.root.position.x, dz = f.goal[1] - f.root.position.z, d = Math.hypot(dx, dz); if (d < .06) { f.goal = null; } else { const sp = f === this.condemned ? 1.15 : 2.0; const st = Math.min(d, sp * dt); f.root.position.x += dx / d * st; f.root.position.z += dz / d * st; const ang = Math.atan2(dx, dz); let da = ang - f.root.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); f.root.rotation.y += da * Math.min(1, dt * 8); if (f.cur !== 'walk') this.play(f, 'walk'); if (f.acts.walk) f.acts.walk.timeScale = sp / 1.25; f.walk = 1; } }
        if (!f.goal) { if (f.cur !== 'idle') this.play(f, 'idle'); const tgt = f.face || (f !== this.condemned ? [WALL.x, WALL.z] : null); if (tgt) { const ang = Math.atan2(tgt[0] - f.root.position.x, tgt[1] - f.root.position.z); let da = ang - f.root.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); f.root.rotation.y += da * Math.min(1, dt * 5); } }
        if (f.flinch > 0) { f.flinch -= dt; f.tilt.position.z = -Math.sin(Math.max(0, f.flinch) * 6) * .12; } else f.tilt.position.z = 0;
        if (f.back > 0) { f.back -= dt; const dx = f.root.position.x - WX, dz = f.root.position.z - WZ, d = Math.hypot(dx, dz) || 1; f.root.position.x += dx / d * dt * .5; f.root.position.z += dz / d * dt * .5; }
      } else if (f.act === 'stagger') { f.actT += dt; const k = Math.min(1, f.actT / .7); f.tilt.rotation.z = Math.sin(k * Math.PI) * .35; if (k >= 1) { f.tilt.rotation.z = 0; this.startFall(f); } }
      else if (f.act === 'fall') { f.actT += dt; if (!f.acts.fall) { const k = Math.min(1, f.actT / 1.1), e = k * k * (3 - 2 * k); f.tilt.rotation.x = Math.PI / 2 * e; f.tilt.position.y = e * .12; /* يسقط إلى الأمام نحو الحشد لا إلى الخلف داخل الواجهة */ } if (f.actT > 1.3) f.act = 'dead'; }
    });
    if (this.flashT >= 0 && this.flashL && this.flashS) { this.flashT += dt; const k = this.flashT; const on = k < .08 || (k > .12 && k < .16); const c = this.condemned?.root.position || WALL; this.flashL.position.set(c.x + 5.5, 1.7, c.z + 1.5); this.flashL.intensity = on ? 30 : 0; this.flashS.position.set(c.x + .15, 1.35, c.z + .05); (this.flashS.material as THREE.SpriteMaterial).opacity = on ? 1 : 0; if (k > .3) { this.flashT = -1; (this.flashS.material as THREE.SpriteMaterial).opacity = 0; this.flashL.intensity = 0; } }
    if (this.shake > 0) { this.shake -= dt; this.E.camera.position.x += (rnd() - .5) * this.shake * .3; this.E.camera.position.y += (rnd() - .5) * this.shake * .3; }
    this.smokes.forEach(sm => { if (!sm.on) return; sm.t += dt; const alive = sm.t < 4.4; sm.light.intensity = alive ? (.45 + Math.sin(sm.t * 9) * .15) * Math.min(1, sm.t * 3) : Math.max(0, sm.light.intensity - dt * 2);
      sm.ps.items.forEach(it => { it.life += dt / 3.8; const m = it.s.material as THREE.SpriteMaterial; if (it.life > 1) { if (!alive) { m.opacity = 0; return; } it.life = 0; it.s.position.set(sm.origin.x + (rnd() - .5) * .6, sm.origin.y, sm.origin.z + (rnd() - .5) * .6); it.vx = (rnd() - .5) * .35; it.vz = (rnd() - .5) * .35; } it.s.position.y += dt * 1.15; it.s.position.x += (it.vx || 0) * dt; it.s.position.z += (it.vz || 0) * dt; m.opacity = .26 * Math.sin(it.life * Math.PI); const sc = 1 + it.life * 2.2; it.s.scale.set(sc, sc, 1); });
      if (sm.t > 9) { sm.on = false; sm.ps.g.visible = false; sm.light.intensity = 0; } });
    void time;
  }
}
