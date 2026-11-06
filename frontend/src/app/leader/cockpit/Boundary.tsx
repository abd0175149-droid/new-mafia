'use client';
// ══════════════════════════════════════════════════════
// 🛟 شبكةُ أمان القمرة — خطأُ رسمٍ فيها لا يُسقط صفحة الليدر
//
// 🔴 اختيار القمرة محفوظٌ على الجهاز: لو انهارت شاشةٌ فيها لبقيت صفحة الليدر
//    منهارةً عند كلّ فتح، والليدر في منتصف لعبة. هنا نعود للواجهة القديمة
//    فوراً (onFail يُطفئ الاختيار) ونسجّل السبب في الطرفيّة.
// ══════════════════════════════════════════════════════
import { Component, type ReactNode } from 'react';

export default class CockpitBoundary extends Component<{ onFail: (msg: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: any) {
    console.error('🛟 [cockpit] خطأ رسم — عودةٌ للواجهة القديمة:', err);
    this.props.onFail(String(err?.message || err));
  }
  render() { return this.state.failed ? null : this.props.children; }
}
