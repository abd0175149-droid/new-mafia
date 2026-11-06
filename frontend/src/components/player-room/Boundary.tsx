'use client';

// 🛟 إن انكسر رسم الواجهة الجديدة على جهازٍ ما يعود اللاعب للواجهة الحاليّة فوراً —
//    لا شاشة بيضاء في منتصف لعبة (نفس نمط قمرة الليدر).

import { Component, type ReactNode } from 'react';
import { clearRoomBus } from './roomBus';

export class PlayerRoomBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) {
    console.error('📱 [player-room] فشل الرسم — العودة للواجهة الحاليّة', err);
    clearRoomBus();
    this.props.onFail();
  }
  render() { return this.state.failed ? null : this.props.children; }
}
