'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import MafiaCard from './MafiaCard';
import PlayerPhaseView from './PlayerPhaseView';
import PhoneSpectatorView from './PhoneSpectatorView';
import RemoteVoice from './RemoteVoice';
import { useActiveSpeaker } from '../hooks/useActiveSpeaker';
import ConfrontationControls from './ConfrontationControls';
import InviteModal from './InviteModal';
import RolesInfoModal from './RolesInfoModal';
import PhaseLoading from '@/components/PhaseLoading';
import RoomCodeCard from '@/components/RoomCodeCard';
import { useGameState } from '@/hooks/useGameState';
import { usePlayerCosmetics } from '@/hooks/usePlayerCosmetics';
import { ROLE_NAMES, MAFIA_ROLES } from '@/lib/constants';
import { Users } from 'lucide-react';
import MafiaTeamGallery from './MafiaTeamGallery';
import SecretWatermark from './SecretWatermark';
import PlayerNotepad from './PlayerNotepad';
import OrderPanel from './OrderPanel';
type Step = 'code' | 'phone' | 'login' | 'register' | 'change_password' | 'ticket' | 'auto_joining' | 'done' | 'rejoined';

interface PlayerFlowProps {
  initialRoomCode?: string;
  inviteFlag?: boolean;    // ðŸ“¨ ÙˆØµÙ„ Ø¹Ø¨Ø± Ø¯Ø¹ÙˆØ© (?invite=1) â†’ ÙŠØ¹Ø±Ø¶ ØªØ£ÙƒÙŠØ¯Ø§Ù‹ Ù‚Ø¨Ù„ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ø§Ù„ØµØ§Ù…Øª
  inviterName?: string;    // Ø§Ø³Ù… Ø§Ù„Ø¯Ø§Ø¹ÙŠ (Ù…Ù† ?by=) Ù„Ø¹Ø±Ø¶Ù‡ ÙÙŠ Ø§Ù„ØªØ£ÙƒÙŠØ¯
}

// â”€â”€ SVG Icons â”€â”€
const OperationIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const PhoneIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
  </svg>
);

const SeatIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
    <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"></path>
    <path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 12.5V11a2 2 0 0 0-4 0z"></path>
    <path d="M15 18v2"></path>
    <path d="M9 18v2"></path>
  </svg>
);

const ShieldCheckIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    <polyline points="9 12 11 14 15 10"></polyline>
  </svg>
);

// â”€â”€ Ù‚Ø±Ø§Ø¡Ø© Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù…Ù† Ø¬Ù…ÙŠØ¹ Ù…ØµØ§Ø¯Ø± localStorage â”€â”€
function getSavedToken(): string | null {
  // Ø§Ù„Ù…ØµØ¯Ø± 1: PlayerFlow's own key
  const t1 = localStorage.getItem('mafia_player_token');
  if (t1) return t1;
  // Ø§Ù„Ù…ØµØ¯Ø± 2: PlayerContext's key (mafia_player_auth)
  try {
    const auth = JSON.parse(localStorage.getItem('mafia_player_auth') || '{}');
    if (auth.token) return auth.token;
  } catch {}
  return null;
}

function getSavedPlayerId(): number {
  const id1 = localStorage.getItem('mafia_playerId');
  if (id1 && parseInt(id1)) return parseInt(id1);
  try {
    const auth = JSON.parse(localStorage.getItem('mafia_player_auth') || '{}');
    if (auth.playerId) return auth.playerId;
  } catch {}
  try {
    const info = JSON.parse(localStorage.getItem('mafia_player_info') || '{}');
    if (info.playerId) return info.playerId;
  } catch {}
  return 0;
}

function getSavedPhone(): string {
  try {
    const info = JSON.parse(localStorage.getItem('mafia_player_info') || '{}');
    if (info.phone) return info.phone;
  } catch {}
  try {
    const auth = JSON.parse(localStorage.getItem('mafia_player_auth') || '{}');
    if (auth.phone) return auth.phone;
  } catch {}
  return '';
}

// â”€â”€ ðŸª‘ ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù…ÙÙƒØ±Ø© Ø¨Ø¹Ø¯ Ø¥Ø¹Ø§Ø¯Ø© ØªØ±ØªÙŠØ¨ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯ â”€â”€
// Ø§Ù„Ù…ÙÙƒØ±Ø© Ù‡ÙŠ Ø§Ù„Ø´ÙŠØ¡ Ø§Ù„ÙˆØ­ÙŠØ¯ Ø§Ù„Ø°ÙŠ ÙŠÙ…Ù„ÙƒÙ‡ Ø§Ù„Ø¬Ù‡Ø§Ø² ÙˆÙ„Ø§ ÙŠØ³ØªØ·ÙŠØ¹ Ø§Ù„Ø®Ø§Ø¯Ù… Ø¥Ø¹Ø§Ø¯Ø© Ø¥Ø±Ø³Ø§Ù„Ù‡ØŒ
// ÙÙ‡ÙŠ ØªÙØ±Ø­ÙŽÙ‘Ù„ Ù„Ø§ ØªÙÙ…Ø­Ù‰: Ø§Ù„Ø¯Ù„Ùˆ ÙŠÙ†ØªÙ‚Ù„ Ù„Ù…ÙØªØ§Ø­ Ù…Ù‚Ø¹Ø¯ÙŠ Ø§Ù„Ø¬Ø¯ÙŠØ¯ØŒ ÙˆÙ…ÙØ§ØªÙŠØ­Ù‡ Ø§Ù„Ø¯Ø§Ø®Ù„ÙŠØ©
// (Ù…Ù‚Ø§Ø¹Ø¯ Ø§Ù„Ø¢Ø®Ø±ÙŠÙ†) ØªÙ…Ø±Ù‘ Ø¨Ø®Ø±ÙŠØ·Ø© Ø§Ù„Ø®Ø§Ø¯Ù…. Ø§Ù„Ù…ÙØªØ§Ø­ 0 = Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø© Ø§Ù„Ø¹Ø§Ù…Ù‘Ø© Ø¨Ù„Ø§ Ù…Ù‚Ø¹Ø¯.
// Ù…Ù…Ù†ÙˆØ¹ Ø£ÙŠÙ‘ Ø­Ø³Ø§Ø¨Ù Ù…Ø­Ù„Ù‘ÙŠ Ù„Ù„Ø£Ø±Ù‚Ø§Ù… â€” Ø§Ù„Ø®Ø±ÙŠØ·Ø© ÙˆØ­Ø¯Ù‡Ø§ Ù‡ÙŠ Ø§Ù„Ù…Ø±Ø¬Ø¹.
function migrateNotesForSeatRemap(
  roomId: string, map: Record<string, number>, myOldSeat: number, myNewSeat: number,
): Record<number, any> {
  if (!roomId) return {};
  const oldKey = `mafia_notes_${roomId}_${myOldSeat}`;
  const newKey = `mafia_notes_${roomId}_${myNewSeat}`;
  let bucket: Record<string, any> = {};
  try { bucket = JSON.parse(localStorage.getItem(oldKey) || '{}') || {}; } catch { bucket = {}; }

  const migrated: Record<number, any> = {};
  Object.entries(bucket).forEach(([seat, note]) => {
    const from = parseInt(seat);
    if (isNaN(from)) return;
    migrated[from === 0 ? 0 : (map[String(from)] ?? from)] = note;
  });

  if (oldKey !== newKey) localStorage.removeItem(oldKey);
  if (Object.keys(migrated).length > 0) localStorage.setItem(newKey, JSON.stringify(migrated));
  else localStorage.removeItem(newKey);
  return migrated;
}

export default function PlayerFlow({ initialRoomCode = '', inviteFlag = false, inviterName = '' }: PlayerFlowProps) {
  const { joinRoom, isConnected, error, loading, emit, on } = useGameState();
  const [step, setStep] = useState<Step>(() => {
    // Ø¥Ø°Ø§ ÙÙŠÙ‡ ÙƒÙˆØ¯ QR + ØªÙˆÙƒÙ† Ù…Ø­ÙÙˆØ¸ â†’ Ù†Ø¨Ø¯Ø£ Ø¨Ù€ code Ù…Ø¤Ù‚ØªØ§Ù‹ (Ø§Ù„Ù€ auto-find ÙŠØªÙƒÙÙ„)
    if (initialRoomCode && typeof window !== 'undefined' && getSavedToken()) {
      return 'code';
    }
    return initialRoomCode ? 'phone' : 'code';
  });
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [roomId, setRoomId] = useState('');
  const [gameName, setGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [physicalId, setPhysicalId] = useState('');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [apiError, setApiError] = useState('');
  const [requireTicket, setRequireTicket] = useState(false);
  const [ticketNumber, setTicketNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // ðŸª™ Ù…Ø¸Ù‡Ø±Ù‡ Ø§Ù„Ù…Ø´ØªØ±Ù‰ ÙˆØ±ØªØ¨ØªÙ‡ â€” Ø¨Ø·Ø§Ù‚ØªÙ‡ ÙÙŠ ÙŠØ¯Ù‡ ÙŠØ¬Ø¨ Ø£Ù† ØªØ·Ø§Ø¨Ù‚ Ù…Ø§ ØªØ¹Ø±Ø¶Ù‡ Ø´Ø§Ø´Ø© Ø§Ù„Ù‚Ø§Ø¹Ø©
  const { cosmetics: myCosmetics, rankTier: myRankTier } = usePlayerCosmetics();
  const [userExited, setUserExited] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('mafia_user_exited') === 'true';
  }); // ÙŠÙ…Ù†Ø¹ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ Ø¨Ø¹Ø¯ Ø§Ù„Ø®Ø±ÙˆØ¬

  // â”€â”€ ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø£Ø¯ÙˆØ§Ø± Ø§Ù„Ø±Ù‚Ù…ÙŠ â”€â”€
  const [assignedRole, setAssignedRole] = useState<string | null>(null);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [isPlayerDead, setIsPlayerDead] = useState(false);
  const [rejoinLoading, setRejoinLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  // ðŸ½ï¸ Ù‡Ù„ Ù„Ù„Ø§Ø¹Ø¨ Ø³ÙŠØ§Ù‚ Ø·Ù„Ø¨Ù Ø§Ù„Ø¢Ù†ØŸ (Ø­Ø¬Ø² + Ù†Ø§ÙØ°Ø© Ø§Ù„ÙØ¹Ø§Ù„ÙŠÙ‘Ø©) â€” ÙŠØ­ÙƒÙ… Ø¸Ù‡ÙˆØ± Ø²Ø±Ù‘ Ø§Ù„Ù…Ù†ÙŠÙˆ Ø§Ù„Ø¹Ø§Ø¦Ù…
  const [fnbReady, setFnbReady] = useState(false);
  const [isOrderOpen, setIsOrderOpen] = useState(false);
  // ðŸ”´ Ù‚ÙÙ„ ØªÙ…Ø±ÙŠØ± Ø§Ù„Ø®Ù„ÙÙŠÙ‘Ø© â€” Ù‚ÙÙ„Ù Ø§Ù„Ø¬Ø³Ø¯ ÙˆØ­Ø¯Ù‡ØŒ Ù„Ø§ useModalScrollLock:
  //    Ø§Ù„Ù‡ÙˆÙƒ ÙŠÙ…Ù†Ø¹ ÙƒÙ„Ù‘ Ù„Ù…Ø³Ù Ø®Ø§Ø±Ø¬ Ø¹Ù†ØµØ±Ù Ù…Ø±Ø¬Ø¹ÙŠÙÙ‘ ÙˆØ§Ø­Ø¯ØŒ ÙˆÙ„ÙˆØ­Ø© Ø§Ù„Ø·Ù„Ø¨ ÙÙŠÙ‡Ø§ Ø¹Ø¯Ù‘Ø©
  //    Ø­Ø§ÙˆÙŠØ§ØªÙ ØªÙ…Ø±ÙŠØ±Ù Ø¯Ø§Ø®Ù„ÙŠÙ‘Ø© (Ø§Ù„Ø¬Ø³Ù…ØŒ Ø§Ù„Ø£ÙˆØ±Ø§Ù‚ØŒ Ø§Ù„Ø³Ù„Ù‘Ø©) â€” ÙÙƒØ§Ù† ÙŠÙ…Ù†Ø¹Ù‡Ø§ Ø¬Ù…ÙŠØ¹Ø§Ù‹
  //    ÙˆÙŠØªØ¬Ù…Ù‘Ø¯ Ø§Ù„Ù…Ù†ÙŠÙˆ. Ø§Ù„Ù„ÙˆØ­Ø© ØªØ¯ÙŠØ± ØªÙ…Ø±ÙŠØ±Ù‡Ø§ Ø¨Ù†ÙØ³Ù‡Ø§ (overscroll-contain).
  useEffect(() => {
    if (!isOrderOpen) return;
    const y = window.scrollY;
    document.body.classList.add('modal-open');
    document.body.style.top = `-${y}px`;
    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      window.scrollTo(0, y);
    };
  }, [isOrderOpen]);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [seatChangeAlert, setSeatChangeAlert] = useState<string | null>(null);
  const [isExpelled, setIsExpelled] = useState(false);
  const [expulsionReason, setExpulsionReason] = useState('');
  const [penalties, setPenalties] = useState<number>(0);
  const [maxPenalties, setMaxPenalties] = useState<number>(3);
  // ðŸ—£ï¸ Ø¹Ù„Ù… ØªÙØ¹ÙŠÙ„ ØºØ±ÙØ© ØªØ´Ø§ÙˆØ± Ø§Ù„Ù…Ø§ÙÙŠØ§ (Ø¥Ø¹Ø¯Ø§Ø¯ Ø¹Ø§Ù… Ù…Ù† Ø§Ù„Ù„ÙŠØ¯Ø± â€” Ù„Ø§ ÙŠÙƒØ´Ù Ù‡ÙˆÙŠØ© Ø£Ø­Ø¯)
  const [mafiaChatEnabled, setMafiaChatEnabled] = useState(false);
  const [penaltyAlert, setPenaltyAlert] = useState<{
    message: string;
    penalties: number;
    maxPenalties: number;
  } | null>(null);
  const [activeToast, setActiveToast] = useState<{
    message: string;
    type: 'warning' | 'penalty' | 'success' | 'info';
  } | null>(null);
  const [roleAlert, setRoleAlert] = useState(false);
  const [mafiaTeam, setMafiaTeamRaw] = useState<{physicalId: number; name: string; role: string; avatarUrl?: string | null}[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('mafia_mafiaTeam');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const setMafiaTeam = (team: {physicalId: number; name: string; role: string; avatarUrl?: string | null}[]) => {
    setMafiaTeamRaw(team);
    if (team && team.length > 0) {
      localStorage.setItem('mafia_mafiaTeam', JSON.stringify(team));
    } else {
      localStorage.removeItem('mafia_mafiaTeam');
    }
  };

  // ðŸ‘¥ Ø§Ù„Ø£Ø® (ØªØ¹Ø§Ø±Ù Ø§Ù„Ø£Ø®ÙˆÙŠÙ† â€” Ù‚Ù†Ø§Ø© Ø®Ø§ØµØ© Ù…Ù†ÙØµÙ„Ø© Ø¹Ù† ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ø§ÙÙŠØ§)
  const [sibling, setSiblingRaw] = useState<{physicalId: number; name: string; role: string; avatarUrl?: string | null; isAlive: boolean; recipientIsMafia: boolean} | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem('mafia_sibling');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const setSibling = (s: {physicalId: number; name: string; role: string; avatarUrl?: string | null; isAlive: boolean; recipientIsMafia: boolean} | null) => {
    setSiblingRaw(s);
    if (s) {
      localStorage.setItem('mafia_sibling', JSON.stringify(s));
    } else {
      localStorage.removeItem('mafia_sibling');
    }
  };

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  // ðŸ•µï¸ Ù…ÙƒØ§ÙØ­Ø© Ø§Ù„ØºØ´ â€” ØªØªØ¨Ù‘Ø¹ Ù…ØºØ§Ø¯Ø±Ø© Ø§Ù„ØµÙØ­Ø© Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ù…Ø¨Ø§Ø±Ø§Ø© (Ù†Ù…Ø· ØªÙ‡Ø±ÙŠØ¨ Ù…Ø­ØªÙ…Ù„)
  const galleryOpenRef = useRef(false);
  useEffect(() => { galleryOpenRef.current = isGalleryOpen; }, [isGalleryOpen]);
  const bgAtRef = useRef<number | null>(null);
  const bgSecretRef = useRef(false);
  const [assassinContracts, setAssassinContracts] = useState<any>(null);
  const [switchConfirm, setSwitchConfirm] = useState<{
    currentRoomId: string;
    currentGameName: string;
    targetRoomId: string;
    targetGameName: string;
  } | null>(null);
  const [joinConfirmation, setJoinConfirmation] = useState<{message: string} | null>(null);
  // ðŸ“¨ ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø¯Ø¹ÙˆØ© Ù‚Ø¨Ù„ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù…: ÙŠÙØ¹Ø±Ø¶ Ø¹Ù†Ø¯ ÙØªØ­ Ø¥Ø´Ø¹Ø§Ø± Ø¯Ø¹ÙˆØ© (?invite=1)
  const [inviteConfirmed, setInviteConfirmed] = useState(false);
  const [invitePrompt, setInvitePrompt] = useState<{ roomName: string; inviterName: string } | null>(null);
  const [inviteError, setInviteError] = useState<string>('');
  const [switchLoading, setSwitchLoading] = useState(false);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [roster, setRoster] = useState<any[]>([]);
  const [isRemote, setIsRemote] = useState(false); // ðŸŒ ØºØ±ÙØ© Ø¹Ù† Ø¨ÙØ¹Ø¯ â†’ Ø£Ø¸Ù‡Ø± Ø·Ø§ÙˆÙ„Ø© Ø§Ù„Ø·ÙˆØ± Ù„Ù„Ø§Ø¹Ø¨
  const [allowPlayerInvites, setAllowPlayerInvites] = useState(false); // ðŸ“¨ Ø§Ù„Ù‚Ø§Ø¦Ø¯ Ø³Ù…Ø­ Ù„Ù„Ø§Ø¹Ø¨ÙŠÙ† Ø¨Ø¯Ø¹ÙˆØ© Ø£ØµØ¯Ù‚Ø§Ø¦Ù‡Ù…
  const [showInvite, setShowInvite] = useState(false); // ðŸ“¨ Ù…ÙˆØ¯Ø§Ù„ Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¯Ø¹ÙˆØ©
  const [voiceMaps, setVoiceMaps] = useState<{ videoByPid: Record<number, MediaStreamTrack | null>; audioByPid: Record<number, boolean> }>({ videoByPid: {}, audioByPid: {} });
  const [gameOverData, setGameOverData] = useState<{ winner: string | null; players: any[] } | null>(null); // ðŸ ÙƒØ´Ù Ø§Ù„ÙØ§Ø¦Ø² Ø¹Ù„Ù‰ Ø§Ù„Ø·Ø§ÙˆÙ„Ø©
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [notepadNotes, setNotepadNotes] = useState<Record<number, any>>({});
  // ðŸª‘ Ø¹Ø¯Ù‘Ø§Ø¯ Ø¥Ø¹Ø§Ø¯Ø© ØªØ±ØªÙŠØ¨ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯ â€” ÙŠÙØ¬Ø¨Ø± Ø§Ù„Ù…ÙÙƒØ±Ø© Ø¹Ù„Ù‰ Ø¥Ø¹Ø§Ø¯Ø© Ù‚Ø±Ø§Ø¡Ø© Ø¯Ù„ÙˆÙ‡Ø§ Ø¨Ø¹Ø¯ Ø§Ù„ØªØ±Ø­ÙŠÙ„
  const [notepadRemapNonce, setNotepadRemapNonce] = useState(0);
  // ðŸª‘ Ù†Ø§ÙØ°Ø© ÙƒØªÙ… Ø¨Ø§Ù†Ø± Â«ØªÙ… ØªØºÙŠÙŠØ± Ø±Ù‚Ù…ÙƒÂ» Ø§Ù„Ù…Ø´ØªÙ‚Ù‘ Ù…Ù† Ø§Ù„Ø§Ø³ØªØ·Ù„Ø§Ø¹/Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø©: Ø§Ù„ØªÙˆØ³Øª Ø§Ù„Ø®Ø§ØµÙ‘
  // Ø¨Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ±ØªÙŠØ¨ Ù‚Ø§Ù„Ù‡Ø§ Ø¨Ø§Ù„ÙØ¹Ù„ØŒ ÙÙ„Ø§ Ù†ÙÙƒØ±Ù‘Ø±Ù‡Ø§ Ø¨Ø¨Ø§Ù†Ø±Ù Ø«Ø§Ù†Ù ÙÙˆÙ‚Ù‡.
  const seatRemapUntilRef = useRef(0);
  // ðŸ”„ Ø¢Ø®Ø± Ù†Ø³Ø®Ø© Ù…Ù† Ø¯Ø§Ù„Ø© Ø§Ù„Ø§Ø³ØªØ·Ù„Ø§Ø¹ â€” ÙƒÙŠ ÙŠØ³ØªØ¯Ø¹ÙŠÙ‡Ø§ Ù…Ù† ÙŠØ­ØªØ§Ø¬ Ù…Ø²Ø§Ù…Ù†Ø© ÙÙˆØ±ÙŠÙ‘Ø© Ù…ÙˆØ«ÙˆÙ‚Ø©
  // (Ø¥Ø¹Ø§Ø¯Ø© ØªØ±ØªÙŠØ¨ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯) Ø¨Ø¯Ù„ Ø¥Ø¹Ø§Ø¯Ø© Ø¨Ù†Ø§Ø¡ Ù†ÙØ³ Ø§Ù„Ù†Ø¯Ø§Ø¡ Ø¨Ø­Ø§Ù„Ø©Ù Ù†Ø§Ù‚ØµØ©
  const pollStateRef = useRef<(() => void) | null>(null);
  // ðŸª‘ Ø¢Ø®Ø± player:seat-changed ÙˆØµÙ„ â€” Ù…ØµØ¯Ø± Â«Ù…Ù‚Ø¹Ø¯ÙŠ Ù‚Ø¨Ù„ Ø§Ù„Ù†Ù‚Ù„Â» Ù„Ù…Ø¹Ø§Ù„Ø¬ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ±ØªÙŠØ¨
  const lastSeatChangeRef = useRef<{ oldPhysicalId: number; newPhysicalId: number; at: number } | null>(null);
  // ðŸª‘ Ù†Ø§ÙØ°Ø© Â«Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¯ÙØ¹ Ø¨Ø¹Ø¯ Ø§Ù„Ù†Ù‚Ù„Â»: Ø®Ù„Ø§Ù„Ù‡Ø§ player:role-assigned Ø¥Ø¹Ø§Ø¯Ø©Ù ØªØ³Ù„ÙŠÙ…Ù Ù„Ø§ Ù„Ø¹Ø¨Ø©ÙŒ
  // Ø¬Ø¯ÙŠØ¯Ø© â€” ÙÙ„Ø§ ØªÙÙ‚Ù„Ø¨ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© ÙˆÙ„Ø§ ÙŠÙØ·Ù„Ù‚ Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡ ÙˆÙ„Ø§ ÙŠÙØ­ÙŠØ§ Ù„Ø§Ø¹Ø¨ÙŒ Ù…ÙÙ‚ØµÙ‰.
  const seatRemapRepushUntilRef = useRef(0);
  const [nightActionRequired, setNightActionRequired] = useState<{
    actionType: string;
    availableTargets: { physicalId: number; name: string }[];
    timeoutSeconds: number;
    canSkip: boolean;
    stepRole?: string;
    isDecoy?: boolean;
  } | null>(null);
  const [nightActionCountdown, setNightActionCountdown] = useState<number>(0);
  const [nightActionSubmitted, setNightActionSubmitted] = useState(false);
  const [selectedTargetForConfirm, setSelectedTargetForConfirm] = useState<number | null>(null);
  const [nurseActivationPending, setNurseActivationPending] = useState(false);
  const nightCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // â±ï¸ override ÙŠØ­Ù…ÙŠ Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ù…Ø­Ù„ÙŠÙ‘Ø© Ù…Ù† poll Ù‚Ø¯ÙŠÙ… â€” Ù„ÙƒÙ† ÙŠÙ†ØªÙ‡ÙŠ Ø¨Ø¹Ø¯ OVERRIDE_TTL ÙƒÙŠ Ù„Ø§ ÙŠØ¹Ù„Ù‚ Ø¬Ù‡Ø§Ø²ÙŒ ÙÙˆÙ‘Øª Ø­Ø¯Ø« Ø§Ù†ØªÙ‚Ø§Ù„
  const phaseOverrideRef = useRef<{ phase: string; at: number } | null>(null);
  const OVERRIDE_TTL = 6000;
  const setPhaseOverride = (phase: string) => { phaseOverrideRef.current = { phase, at: Date.now() }; };


  const [votingCountdown, setVotingCountdown] = useState<number | null>(null);
  const votingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // â”€â”€ Ø­Ø§Ù„Ø© Ø§Ù„ØªØµÙˆÙŠØª (Ù…Ø¹ Ø­ÙØ¸ ÙÙŠ localStorage Ù„Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„ÙÙˆØ±ÙŠØ© Ø¹Ù†Ø¯ refresh) â”€â”€
  const [gamePhase, setGamePhaseRaw] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('mafia_gamePhase') || null;
  });
  const [votingCandidates, setVotingCandidatesRaw] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('mafia_votingCandidates');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [votingPlayersInfo, setVotingPlayersInfoRaw] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('mafia_votingPlayersInfo');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [myVote, setMyVoteRaw] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('mafia_myVote');
    if (saved !== null && !isNaN(parseInt(saved))) return parseInt(saved);
    return null;
  });
  const [totalVotesCast, setTotalVotesCast] = useState(0);
  const [playerVotes, setPlayerVotesRaw] = useState<Record<number, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('mafia_playerVotes');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [votingComplete, setVotingComplete] = useState(false);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [phasePollData, setPhasePollData] = useState<any>(null);
  // ðŸŽ© Ø§Ù„Ø¹Ù…Ø¯Ø©: Ø¨Ø±ÙˆÙ…Ø¨Øª Ù‚Ø±Ø§Ø±Ù‡ (ÙŠØµÙ„Ù‡ ÙˆØ­Ø¯Ù‡ â€” Ø¹Ù† Ø¨ÙØ¹Ø¯)ØŒ Ø¥Ø¹Ù„Ø§Ù† Ø§Ù„ÙƒØ´Ù Ù„Ù„Ø¬Ù…ÙŠØ¹ØŒ ÙˆÙ…ÙŽÙ† Ø§Ù„Ø¹Ù…Ø¯Ø© Ø§Ù„Ù…ÙƒØ´ÙˆÙ
  const [mayorPrompt, setMayorPrompt] = useState<any>(null);
  const [mayorPromptLeft, setMayorPromptLeft] = useState(30);
  const [mayorBanner, setMayorBanner] = useState<{ physicalId: number; name: string; decision: string; voteWeight?: number } | null>(null);
  const [mayorRevealedId, setMayorRevealedId] = useState<number | null>(null);
  const [mayorWeight, setMayorWeight] = useState(2);
  const [mayorSending, setMayorSending] = useState(false);
  // ðŸŽ™ï¸ Ù…Ù† ÙŠÙØ³Ù…Ø­ Ù„Ù‡ Ø¨Ø§Ù„ÙƒÙ„Ø§Ù… (Ù†Ù‚Ø§Ø´/ØªØ¨Ø±ÙŠØ±/Ù…ÙˆØ§Ø¬Ù‡Ø©) â€” Ù„ÙØªØ­ Ù…Ø§ÙŠÙƒÙŠ + Ø¹Ø±Ø¶ Ø§Ù„Ù…ÙˆØ§Ø¬Ù‡Ø©
  const { confrontation, allowedPids: voiceAllowedPids } = useActiveSpeaker({ on, gamePhase, initialDiscussionState: phasePollData?.discussionState });

  const [lastVoteTime, setLastVoteTimeRaw] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('mafia_lastVoteTime');
    return saved ? parseInt(saved) : null;
  });
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (gamePhase === 'DAY_VOTING') {
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
  }, [gamePhase]);

  // â”€â”€ Wrappers: ØªØ­ÙØ¸ ÙÙŠ localStorage Ø¹Ù†Ø¯ ÙƒÙ„ ØªØºÙŠÙŠØ± â”€â”€
  const setGamePhase = (phase: string | null) => {
    setGamePhaseRaw(phase);
    if (phase) localStorage.setItem('mafia_gamePhase', phase);
    else localStorage.removeItem('mafia_gamePhase');
  };
  const setVotingCandidates = (candidates: any[]) => {
    setVotingCandidatesRaw(candidates);
    if (candidates.length > 0) localStorage.setItem('mafia_votingCandidates', JSON.stringify(candidates));
    else localStorage.removeItem('mafia_votingCandidates');
  };
  const setVotingPlayersInfo = (info: any[]) => {
    setVotingPlayersInfoRaw(info);
    if (info.length > 0) localStorage.setItem('mafia_votingPlayersInfo', JSON.stringify(info));
    else localStorage.removeItem('mafia_votingPlayersInfo');
  };
  const setMyVote = (vote: number | null) => {
    setMyVoteRaw(vote);
    if (vote !== null) localStorage.setItem('mafia_myVote', String(vote));
    else localStorage.removeItem('mafia_myVote');
  };
  const setPlayerVotes = (votes: Record<number, number>) => {
    setPlayerVotesRaw(votes);
    if (Object.keys(votes).length > 0) localStorage.setItem('mafia_playerVotes', JSON.stringify(votes));
    else localStorage.removeItem('mafia_playerVotes');
  };
  const setLastVoteTime = (time: number | null) => {
    setLastVoteTimeRaw(time);
    if (time !== null) localStorage.setItem('mafia_lastVoteTime', time.toString());
    else localStorage.removeItem('mafia_lastVoteTime');
  };

  // â”€â”€ Ù…Ø­Ø§ÙˆÙ„Ø© Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø§ØªØµØ§Ù„ (rejoin) Ø¹Ù†Ø¯ ÙØªØ­ Ø§Ù„ØµÙØ­Ø© â”€â”€
  useEffect(() => {
    if (!isConnected || !emit) {
      // Ù„Ø§ Ù†Ù…Ø³Ø­ rejoinLoading Ù‡Ù†Ø§ â€” Ù†Ù†ØªØ¸Ø± Ø§Ù„Ø§ØªØµØ§Ù„
      return;
    }

    // Ù†Ù†ØªØ¸Ø± ÙØ­Øµ Ø§Ù„ØªÙˆÙƒÙ† Ù„Ø£Ù†Ù‡ Ù…Ù…ÙƒÙ† ÙŠÙÙ†Ø´Ø¦ mafia_session Ù…Ù† activeGame
    if (!tokenChecked) return;

    // Ø¥Ø°Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø®Ø±Ø¬ ÙŠØ¯ÙˆÙŠØ§Ù‹ â†’ Ù„Ø§ Ù†Ø¹ÙŠØ¯ Ø§Ù„Ø¯Ø®ÙˆÙ„
    if (userExited || localStorage.getItem('mafia_user_exited') === 'true') {
      setRejoinLoading(false);
      return;
    }

    const saved = localStorage.getItem('mafia_session');
    if (!saved) {
      setRejoinLoading(false);
      return;
    }

    try {
      const session = JSON.parse(saved);
      if (!session.roomId || !session.physicalId) {
        setRejoinLoading(false);
        return;
      }

      // â”€â”€ ØªØ­Ù‚Ù‚ Ù…Ù† ØªÙˆØ§ÙÙ‚ Ø§Ù„Ø­Ø³Ø§Ø¨: Ø¥Ø°Ø§ ÙÙŠÙ‡ ØªÙˆÙƒÙ† Ù…Ø­ÙÙˆØ¸ Ù„Ø­Ø³Ø§Ø¨ Ù…Ø®ØªÙ„Ù â†’ Ù…Ø³Ø­ Ø§Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© â”€â”€
      const savedToken = getSavedToken();
      const savedPlayerId = String(getSavedPlayerId());
      if (session.playerId && savedPlayerId && String(session.playerId) !== savedPlayerId) {
        console.log(`âš ï¸ Session belongs to player #${session.playerId} but logged in as #${savedPlayerId} â€” clearing stale session`);
        localStorage.removeItem('mafia_session');
        setRejoinLoading(false);
        return;
      }

      // â”€â”€ Ø¥Ø°Ø§ ÙÙŠÙ‡ ÙƒÙˆØ¯ ØºØ±ÙØ© Ø¬Ø¯ÙŠØ¯ (Ù…Ù† QR) Ù…Ø®ØªÙ„Ù Ø¹Ù† Ø§Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© â†’ ØªØ¬Ø§Ù‡Ù„ Ø§Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© â”€â”€
      if (initialRoomCode && session.roomCode && initialRoomCode !== session.roomCode) {
        console.log(`ðŸ”„ New room code ${initialRoomCode} differs from saved session ${session.roomCode} â€” skipping rejoin`);
        localStorage.removeItem('mafia_session');
        setRejoinLoading(false);
        return;
      }

      emit('room:rejoin-player', {
        roomId: session.roomId,
        physicalId: session.physicalId,
        phone: session.phone || undefined,
        // ðŸª‘ Ø§Ù„Ù‡ÙˆÙŠØ© Ø£ÙˆÙ„Ø§Ù‹: Ø¨Ø¹Ø¯ Ù†Ù‚Ù„ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯ Ù„Ù… ÙŠØ¹ÙØ¯ Ø§Ù„Ù…Ù‚Ø¹Ø¯ Ø§Ù„Ù…Ø­ÙÙˆØ¸ Ø¯Ù„ÙŠÙ„Ø§Ù‹ Ø¹Ù„Ù‰ ØµØ§Ø­Ø¨Ù‡ â€”
        // Ø§Ù„Ø­Ø³Ø§Ø¨ Ù‡Ùˆ Ù…Ø§ ÙŠØ¹Ø±Ù‘Ù Ø§Ù„Ù„Ø§Ø¹Ø¨ØŒ ÙˆØ§Ù„Ù…Ù‚Ø¹Ø¯ Ø¢Ø®Ø± Ù…Ø§ ÙŠÙ„Ø¬Ø£ Ø¥Ù„ÙŠÙ‡ Ø§Ù„Ø®Ø§Ø¯Ù…
        playerId: session.playerId || getSavedPlayerId() || undefined,
      }).then((res: any) => {
        if (res.success) {
          setRoomId(session.roomId);
          setRoomCode(session.roomCode || '');
          setGameName(res.gameName || '');
          setPhysicalId(String(res.player.physicalId));
          setDisplayName(res.player.name);
          setGender(res.player.gender === 'FEMALE' ? 'female' : 'male');
          setPlayerId(session.playerId || res.player.playerId || null);

          // Ø­ÙØ¸ playerId Ù„Ù„Ø¨Ø±ÙˆÙØ§ÙŠÙ„
          const pid = res.player.playerId || session.playerId;
          if (pid) localStorage.setItem('mafia_playerId', String(pid));

          if (res.player.role) {
            setAssignedRole(res.player.role);
          }
          if (res.mafiaTeam !== undefined) {
            setMafiaTeam(res.mafiaTeam);
          }
          if (res.sibling !== undefined) {
            setSibling(res.sibling); // ðŸ‘¥ Ø§Ù„Ø£Ø®
          }
          if (res.assassinContracts) {
            setAssassinContracts(res.assassinContracts);
          }
          if (typeof res.mafiaChatEnabled === 'boolean') {
            setMafiaChatEnabled(res.mafiaChatEnabled);
          }

          if (!res.player.isAlive) {
            setIsPlayerDead(true);
            setCardFlipped(true); // Ù…ÙŠØª = ÙƒØ§Ø±Ø¯ Ù…ÙØªÙˆØ­
          }

          // â”€â”€ Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø­Ø§Ù„Ø© Ø§Ù„ØªØµÙˆÙŠØª ÙÙˆØ±ÙŠØ§Ù‹ Ø¹Ù†Ø¯ rejoin â”€â”€
          if (res.phase) setGamePhase(res.phase);
          console.log(`ðŸ” Rejoin phase: ${res.phase}, hasVotingState: ${!!res.votingState}, candidates: ${res.votingState?.candidates?.length || 0}`);
          if (res.votingState && res.phase === 'DAY_VOTING') {
            console.log(`ðŸ—³ï¸ Restoring voting: ${res.votingState.candidates.length} candidates, myVotes: ${JSON.stringify(res.votingState.playerVotes)}`);
            setVotingCandidates(res.votingState.candidates || []);
            setTotalVotesCast(res.votingState.totalVotesCast || 0);
            setPlayerVotes(res.votingState.playerVotes || {});
            if (res.votingState.playersInfo) setVotingPlayersInfo(res.votingState.playersInfo);
            setVotingComplete(false);
            // Ø§Ø³ØªØ¹Ø§Ø¯Ø© ØµÙˆØª Ø§Ù„Ù„Ø§Ø¹Ø¨
            const myPhysId = res.player.physicalId;
            if (res.votingState.playerVotes?.[myPhysId] !== undefined) {
              setMyVote(res.votingState.playerVotes[myPhysId]);
            } else {
              setMyVote(null);
            }
          }

          setStep('rejoined');
          localStorage.removeItem('mafia_user_exited');
          console.log(`â™»ï¸ Rejoin success: #${res.player.physicalId} - ${res.player.name} | role: ${res.player.role} | phase: ${res.phase}`);
        } else if (res.code === 'IDENTITY_REQUIRED') {
          // ðŸª‘ Ø§Ù„Ù…Ù‚Ø¹Ø¯ ÙˆØ­Ø¯Ù‡ Ù„Ù… ÙŠØ¹ÙØ¯ ÙŠÙØ«Ø¨Øª Ø§Ù„Ù‡ÙˆÙŠÙ‘Ø© (Ù†Ù‚Ù„/ØªØ¨Ø¯ÙŠÙ„ Ù…Ù‚Ø§Ø¹Ø¯) â†’ Ù†ÙØ¹ÙŠØ¯Ù‡ Ù„Ø´Ø§Ø´Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„
          // Ø¨Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ø®Ø§Ø¯Ù… Ø¨Ø¯Ù„ ØªØ±ÙƒÙ‡ Ø¹Ø§Ù„Ù‚Ø§Ù‹ Ø¹Ù„Ù‰ Ø¬Ù„Ø³Ø©Ù Ù„Ø§ ÙŠØ³ØªØ·ÙŠØ¹ Ø£Ø­Ø¯ Ø§Ù„ØªØ­Ù‚Ù‘Ù‚ Ù…Ù† ØµØ§Ø­Ø¨Ù‡Ø§
          localStorage.removeItem('mafia_session');
          setApiError(res.error || 'ØªØ¹Ø°Ù‘Ø± Ø§Ù„ØªØ¹Ø±Ù‘Ù Ø¹Ù„ÙŠÙƒ â€” Ø£Ø¹Ø¯ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¨Ø±Ù‚Ù… Ù‡Ø§ØªÙÙƒ Ø£Ùˆ Ù…Ù† Ø­Ø³Ø§Ø¨Ùƒ');
          setStep(initialRoomCode ? 'phone' : 'code');
        } else {
          // Ø§Ù„ØºØ±ÙØ© Ù…Ø´ Ù…ÙˆØ¬ÙˆØ¯Ø© â†’ Ù…Ø³Ø­ Ø§Ù„Ø¬Ù„Ø³Ø©
          localStorage.removeItem('mafia_session');
        }
        setRejoinLoading(false);
      }).catch(() => {
        setRejoinLoading(false);
      });
    } catch {
      localStorage.removeItem('mafia_session');
      setRejoinLoading(false);
    }
  }, [isConnected, emit, tokenChecked]);

  // â”€â”€ ðŸ½ï¸ Ø³ÙŠØ§Ù‚ Ø§Ù„Ø·Ù„Ø¨: Ù‡Ù„ ÙŠØ¸Ù‡Ø± Ø²Ø±Ù‘ Ø§Ù„Ù…Ù†ÙŠÙˆ Ø¯Ø§Ø®Ù„ Ø§Ù„ØºØ±ÙØ©ØŸ â”€â”€
  // Ø§Ù„Ø®Ø§Ø¯Ù… ÙˆØ­Ø¯Ù‡ ÙŠÙ‚Ø±Ù‘Ø± (Ø­Ø¬Ø²ÙŒ Ø¥Ù„Ø²Ø§Ù…ÙŠÙ‘ + Ù†Ø§ÙØ°Ø© Ø§Ù„ÙØ¹Ø§Ù„ÙŠÙ‘Ø©)ØŒ ÙÙ†ÙƒØªÙÙŠ Ø¨Ø³Ø¤Ø§Ù„Ù‡ Ù…Ø±Ù‘Ø©Ù‹ Ø¹Ù†Ø¯
  // Ø¯Ø®ÙˆÙ„ Ø§Ù„ØºØ±ÙØ©. ÙØ´Ù„ Ø§Ù„Ù†Ø¯Ø§Ø¡ ÙŠØ¹Ù†ÙŠ Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ø²Ø±Ù‘ â€” Ù„Ø§ Ø±Ø³Ø§Ù„Ø© Ø®Ø·Ø£ ØªØ²Ø¹Ø¬ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ù„Ø¹Ø¨.
  useEffect(() => {
    if (step !== 'done' && step !== 'rejoined') return;
    const t = playerToken || localStorage.getItem('mafia_player_token');
    if (!t) return;
    let alive = true;
    fetch('/api/fnb/context', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => { if (alive && d?.success && d.context) setFnbReady(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [step, playerToken]);

  // â”€â”€ Ø§Ù„Ø¨Ø­Ø« Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ Ø¹Ù† Ø§Ù„ØºØ±ÙØ© Ø¹Ù†Ø¯ ÙˆØ¬ÙˆØ¯ ÙƒÙˆØ¯ Ù…Ø³Ø¨Ù‚ â”€â”€
  // âš ï¸ ÙŠÙ†ØªØ¸Ø± tokenChecked Ù„Ø£Ù† handleFindRoom ÙŠØªØ­Ù‚Ù‚ Ù…Ù† playerToken/playerId
  useEffect(() => {
    // ðŸ“¨ Ø¹Ù†Ø¯ Ø§Ù„ÙˆØµÙˆÙ„ Ø¹Ø¨Ø± Ø¯Ø¹ÙˆØ©: Ù„Ø§ Ù†Ù†Ø¶Ù…Ù‘ ØµØ§Ù…ØªØ§Ù‹ â€” Ù†Ù†ØªØ¸Ø± ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø£ÙˆÙ„Ø§Ù‹ (invite-resolve Ø£Ø¯Ù†Ø§Ù‡)
    if (inviteFlag && !inviteConfirmed) return;
    if (initialRoomCode && isConnected && !roomId && tokenChecked) {
      // Ø§Ù„Ù„Ø§Ø¹Ø¨ ÙØªØ­ Ø±Ø§Ø¨Ø· ØºØ±ÙØ© Ø¬Ø¯ÙŠØ¯ â†’ ÙŠØ¹Ù†ÙŠ ÙŠØ±ÙŠØ¯ Ø§Ù„Ø¯Ø®ÙˆÙ„ â€” Ù…Ø³Ø­ Ø¹Ù„Ø§Ù…Ø© Ø§Ù„Ø®Ø±ÙˆØ¬
      if (userExited) {
        setUserExited(false);
        localStorage.removeItem('mafia_user_exited');
      }
      handleFindRoom(initialRoomCode);
    }
  }, [initialRoomCode, isConnected, tokenChecked, inviteFlag, inviteConfirmed]);

  // â”€â”€ ðŸ“¨ Ø¯Ø¹ÙˆØ©: Ù†Ø­Ù„Ù‘ Ø§Ø³Ù… Ø§Ù„ØºØ±ÙØ© (Ø¨Ù„Ø§ Ø§Ù†Ø¶Ù…Ø§Ù…) ÙˆÙ†Ø¹Ø±Ø¶ ØªØ£ÙƒÙŠØ¯Ø§Ù‹ Â«Ù‡Ù„ ØªØ±ÙŠØ¯ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù…â€¦ØŸÂ» Ù‚Ø¨Ù„ Ø£ÙŠÙ‘ Ø¯Ø®ÙˆÙ„ â”€â”€
  useEffect(() => {
    if (!inviteFlag || inviteConfirmed || invitePrompt || inviteError) return;
    if (!initialRoomCode || !isConnected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await emit('room:find-by-code', { roomCode: initialRoomCode });
        if (cancelled) return;
        // room:find-by-code Ù‚Ø¯ ÙŠÙØ±Ø¬Ø¹ {success:false} Ø¯ÙˆÙ† Ø±ÙØ¶ Ø§Ù„ÙˆØ¹Ø¯ â†’ Ù†Ø¹Ø§Ù…Ù„Ù‡ ÙƒØºØ±ÙØ© ØºÙŠØ± Ù…ØªØ§Ø­Ø©
        if (!res || res.success === false || !res.roomId) {
          setInviteError('Ø§Ù„ØºØ±ÙØ© Ù„Ù… ØªØ¹Ø¯ Ù…ØªØ§Ø­Ø©');
          return;
        }
        setInvitePrompt({ roomName: res.gameName || 'ØºØ±ÙØ© Ø¹Ù† Ø¨ÙØ¹Ø¯', inviterName: inviterName || 'Ù„Ø§Ø¹Ø¨' });
      } catch {
        if (!cancelled) setInviteError('Ø§Ù„ØºØ±ÙØ© Ù„Ù… ØªØ¹Ø¯ Ù…ØªØ§Ø­Ø©');
      }
    })();
    return () => { cancelled = true; };
  }, [inviteFlag, inviteConfirmed, invitePrompt, inviteError, initialRoomCode, isConnected, emit, inviterName]);

  // â”€â”€ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„ØªÙˆÙƒÙ† Ø§Ù„Ù…Ø­ÙÙˆØ¸ Ø¹Ù†Ø¯ ÙØªØ­ Ø§Ù„ØµÙØ­Ø© â”€â”€
  useEffect(() => {
    const savedToken = getSavedToken();
    if (savedToken) {
      setPlayerToken(savedToken);
      // Ù…Ø²Ø§Ù…Ù†Ø©: Ø­ÙØ¸ Ø§Ù„ØªÙˆÙƒÙ† ÙÙŠ Ø§Ù„Ù…ÙØªØ§Ø­ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ Ø¥Ø°Ø§ Ù…Ø´ Ù…ÙˆØ¬ÙˆØ¯
      if (!localStorage.getItem('mafia_player_token')) {
        localStorage.setItem('mafia_player_token', savedToken);
      }
      // ØªØ­Ù‚Ù‚ Ù…Ù† ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„ØªÙˆÙƒÙ†
      fetch('/api/player-auth/me', {
        headers: { 'Authorization': `Bearer ${savedToken}` },
      }).then(r => r.json()).then(data => {
        if (data.success && data.player) {
          setPlayerId(data.player.id);
          setDisplayName(data.player.name);
          setPhone(data.player.phone || '');
          setGender(data.player.gender === 'FEMALE' ? 'female' : 'male');
          setMustChangePassword(data.player.mustChangePassword || false);
          if (data.player.avatarUrl) setAvatarUrl(data.player.avatarUrl);
          localStorage.setItem('mafia_playerId', String(data.player.id));
          // Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„ØªÙˆÙƒÙ† Ù„ÙƒÙ„ Ø§Ù„Ù…ØµØ§Ø¯Ø±
          localStorage.setItem('mafia_player_token', savedToken);

          // Ø¥Ø°Ø§ ÙÙŠ Ø¬ÙŠÙ… Ù†Ø´Ø· ÙˆÙ…Ø§ ÙÙŠÙ‡ Ø¬Ù„Ø³Ø© Ù…Ø­ÙÙˆØ¸Ø© â†’ Ù†Ù†Ø´Ø¦ Ø¬Ù„Ø³Ø© Ù„ÙŠÙ„ØªÙ‚Ø·Ù‡Ø§ rejoin
          // âš ï¸ Ù„Ø§ Ù†Ù†Ø´Ø¦ Ø¬Ù„Ø³Ø© Ø¥Ø°Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø®Ø±Ø¬ ÙŠØ¯ÙˆÙŠØ§Ù‹ (userExited)
          if (data.activeGame && !localStorage.getItem('mafia_session') && !userExited) {
            localStorage.setItem('mafia_session', JSON.stringify({
              roomId: data.activeGame.roomId,
              roomCode: data.activeGame.roomCode || '',
              physicalId: data.activeGame.physicalId,
              phone: data.player.phone || '',
              playerId: data.player.id,
            }));
            // Ù„Ø§ Ù†Ø¶Ø¨Ø· state Ù…Ø¨Ø§Ø´Ø±Ø© â€” Ù†ØªØ±Ùƒ rejoin useEffect ÙŠØªÙƒÙÙ„ Ø¨ÙƒÙ„ Ø´ÙŠØ¡
            // Ù‡Ø°Ø§ ÙŠÙ…Ù†Ø¹ race condition Ù…Ø¹ rejoin callback
          }
        } else {
          // ØªÙˆÙƒÙ† Ù…Ù†ØªÙ‡ÙŠ â†’ Ù…Ø³Ø­
          localStorage.removeItem('mafia_player_token');
          setPlayerToken(null);
        }
      }).catch(() => {
        localStorage.removeItem('mafia_player_token');
        setPlayerToken(null);
      }).finally(() => {
        setTokenChecked(true);
      });
    } else {
      setTokenChecked(true);
    }
  }, []);

  // â”€â”€ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ù„Ù„ØºØ±ÙØ© Ø¹Ù†Ø¯ reconnect â”€â”€
  // Ø¹Ù†Ø¯ Ù‚Ø·Ø¹ Ø§Ù„Ø§ØªØµØ§Ù„ ÙˆØ¥Ø¹Ø§Ø¯ØªÙ‡ â†’ socket ÙŠØ­ØµÙ„ Ø¹Ù„Ù‰ ID Ø¬Ø¯ÙŠØ¯ ÙˆÙŠØ®Ø±Ø¬ Ù…Ù† Ø§Ù„ØºØ±ÙØ©
  // Ù„Ø§Ø²Ù… ÙŠØ¹ÙˆØ¯ ÙŠÙ†Ø¶Ù… Ø¹Ø´Ø§Ù† ÙŠØ³ØªÙ‚Ø¨Ù„ game:state-sync
  useEffect(() => {
    if (!on || !emit) return;
    if (step !== 'done' && step !== 'rejoined') return;
    if (!roomId) return;

    const cleanupReconnect = on('connect', () => {
      console.log('ðŸ”„ Socket reconnected â€” re-joining room...');
      const normalized = phone.startsWith('0') ? phone : '0' + phone;
      emit('room:rejoin-player', {
        roomId,
        physicalId: parseInt(physicalId) || 0,
        phone: normalized || undefined,
        playerId: playerId || getSavedPlayerId() || undefined, // ðŸª‘ Ø§Ù„Ù‡ÙˆÙŠØ© Ø£ÙˆÙ„Ø§Ù‹ â€” Ø§Ù„Ù…Ù‚Ø¹Ø¯ Ù‚Ø¯ ÙŠÙƒÙˆÙ† ØªØºÙŠÙ‘Ø±
      }).then((res: any) => {
        if (res?.code === 'IDENTITY_REQUIRED') {
          // ØªØ¹Ø°Ù‘Ø± Ø§Ù„ØªØ¹Ø±Ù‘Ù Ø¨Ø¹Ø¯ Ø§Ù†Ù‚Ø·Ø§Ø¹ â†’ Ù„Ø§ Ù†ØªØ±ÙƒÙ‡ Ø¹Ù„Ù‰ Ø´Ø§Ø´Ø© Ù„Ø¹Ø¨Ø©Ù Ù„Ù… ÙŠØ¹ÙØ¯ Ø§Ù„Ø®Ø§Ø¯Ù… ÙŠØ¹ØªØ±Ù Ø¨Ù‡Ø§
          localStorage.removeItem('mafia_session');
          setApiError(res.error || 'ØªØ¹Ø°Ù‘Ø± Ø§Ù„ØªØ¹Ø±Ù‘Ù Ø¹Ù„ÙŠÙƒ â€” Ø£Ø¹Ø¯ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¨Ø±Ù‚Ù… Ù‡Ø§ØªÙÙƒ Ø£Ùˆ Ù…Ù† Ø­Ø³Ø§Ø¨Ùƒ');
          setStep(initialRoomCode ? 'phone' : 'code');
          return;
        }
        if (res?.success && res.player) {
          setPhysicalId(String(res.player.physicalId));
          setDisplayName(res.player.name);
          if (res.player.role) setAssignedRole(res.player.role);
          if (!res.player.isAlive) {
            setIsPlayerDead(true);
            setCardFlipped(true);
          }
          // ØªØ­Ø¯ÙŠØ« Ø§Ù„ÙƒØ§Ø´
          const saved = JSON.parse(localStorage.getItem('mafia_session') || '{}');
          saved.physicalId = res.player.physicalId;
          localStorage.setItem('mafia_session', JSON.stringify(saved));
          console.log(`âœ… Re-joined room: #${res.player.physicalId} - ${res.player.name}`);
        }
      }).catch(() => {
        console.warn('âš ï¸ Re-join failed after reconnect');
      });
    });

    return () => cleanupReconnect();
  }, [on, emit, step, roomId, phone, physicalId, playerId]);

  // â”€â”€ Ø§Ø³ØªÙ‚Ø¨Ø§Ù„ ØªØºÙŠÙŠØ± Ø±Ù‚Ù… Ø§Ù„Ù…Ù‚Ø¹Ø¯ ÙˆØ§Ù„Ø¹Ù‚ÙˆØ¨Ø§Øª ÙˆØ§Ù„Ø·Ø±Ø¯ Ù…Ù† Ø§Ù„Ù„ÙŠØ¯Ø± â”€â”€
  useEffect(() => {
    if (!on) return;

    const cleanupSeat = on('player:seat-changed', (data: { oldPhysicalId: number; newPhysicalId: number }) => {
      // ðŸª‘ ÙŠÙØ¨Ø«Ù‘ Ù‚Ø¨Ù„ room:seats-remapped Ù…Ø¨Ø§Ø´Ø±Ø© â†’ Ù†Ø­ÙØ¸Ù‡ Ù„ÙŠØ¹Ø±Ù Ù…Ø¹Ø§Ù„Ø¬ Ø§Ù„ØªØ±ØªÙŠØ¨ Â«Ù…Ù‚Ø¹Ø¯ÙŠ Ù‚Ø¨Ù„ Ø§Ù„Ù†Ù‚Ù„Â»
      lastSeatChangeRef.current = { oldPhysicalId: data.oldPhysicalId, newPhysicalId: data.newPhysicalId, at: Date.now() };
      setPhysicalId(String(data.newPhysicalId));
      // ØªØ­Ø¯ÙŠØ« localStorage
      const saved = JSON.parse(localStorage.getItem('mafia_session') || '{}');
      saved.physicalId = data.newPhysicalId;
      localStorage.setItem('mafia_session', JSON.stringify(saved));
      // ØªÙ†Ø¨ÙŠÙ‡ Ø¨ØµØ±ÙŠ
      const msg = `ØªÙ… ØªØºÙŠÙŠØ± Ø±Ù‚Ù…Ùƒ: ${data.oldPhysicalId} â† ${data.newPhysicalId}`;
      setActiveToast({
        message: msg,
        type: 'success'
      });
      setTimeout(() => {
        setActiveToast(prev => prev && prev.message === msg ? null : prev);
      }, 5000);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    });

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // ðŸª‘ Ø¥Ø¹Ø§Ø¯Ø© ØªØ±ØªÙŠØ¨ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯ â€” Ø¹Ù‚Ø¯ Ø§Ù„ØªØµØ§Ù„Ø­: Ø§Ù…Ø­Ù â† Ø±Ø­Ù‘Ù„ â† Ø§Ø³Ø£Ù„ â† Ø£Ø¹Ø¯ Ø§Ù„Ø§Ø´ØªÙ‚Ø§Ù‚
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // ÙŠÙ†ÙÙ‘Ø°Ù‡ **ÙƒÙ„** Ù…Ù† ÙÙŠ Ø§Ù„ØºØ±ÙØ© Ù„Ø§ Ø§Ù„Ù…Ù†Ù‚ÙˆÙ„ÙŽÙŠÙ† ÙÙ‚Ø·: ÙƒÙ„ Ø®Ø±ÙŠØ·Ø© Ù…ÙÙ‡Ø±Ø³Ø© Ø¨Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯
    // Ø¹Ù„Ù‰ Ø£ÙŠÙ‘ Ø¬Ù‡Ø§Ø² ØµØ§Ø±Øª ØªØ´ÙŠØ± Ù„Ù„Ø´Ø®Øµ Ø§Ù„Ø®Ø·Ø£. ÙˆÙ…Ù…Ù†ÙˆØ¹ Ø¹Ù„Ù‰ Ø§Ù„Ø¬Ù‡Ø§Ø² Ø£Ù† Â«ÙŠÙØµÙ„Ø­Â» Ø°Ø§ÙƒØ±ØªÙ‡
    // Ø­Ø³Ø§Ø¨ÙŠØ§Ù‹ â€” ÙŠÙ…Ø­ÙˆÙ‡Ø§ Ø«Ù… ÙŠØ³Ø£Ù„ Ø§Ù„Ø®Ø§Ø¯Ù… Ø§Ù„Ø°ÙŠ ÙŠØ­Ù„Ù‘ Ø§Ù„Ù‡ÙˆÙŠØ© Ø¨Ø§Ù„Ø­Ø³Ø§Ø¨/Ø§Ù„Ù‡Ø§ØªÙ Ù„Ø§ Ø¨Ø§Ù„Ù…Ù‚Ø¹Ø¯.
    const cleanupRemap = on('room:seats-remapped', (data: { map: Record<string, number>; swapped: boolean; at: number }) => {
      const map = data?.map || {};

      // Â«Ù…Ù‚Ø¹Ø¯ÙŠ Ù‚Ø¨Ù„ Ø§Ù„Ù†Ù‚Ù„Â»: Ø§Ù„Ø­Ø¯Ø« Ø§Ù„Ø³Ø§Ø¨Ù‚ Ù‚Ø¯ ÙŠÙƒÙˆÙ† Ø­Ø¯Ù‘Ø« Ø§Ù„Ø±Ù‚Ù… ÙØ¹Ù„Ø§Ù‹ØŒ ÙÙ†Ø£Ø®Ø°Ù‡ Ù…Ù†Ù‡
      // Ù…ØªÙ‰ ÙƒØ§Ù† Ø·Ø§Ø²Ø¬Ø§Ù‹ ÙˆÙ…Ø·Ø§Ø¨Ù‚Ø§Ù‹ Ù„Ù„Ø®Ø±ÙŠØ·Ø© (Ø§Ù„ØªØ¨Ø¯ÙŠÙ„ Ù„Ø§ ÙŠÙÙ…ÙŠÙŽÙ‘Ø² Ø¨Ø§Ù„Ø¹ÙƒØ³: 5â†’7 Ùˆ7â†’5).
      const recent = lastSeatChangeRef.current;
      const myOldSeat = (recent && Date.now() - recent.at < 4000 && map[String(recent.oldPhysicalId)] === recent.newPhysicalId)
        ? recent.oldPhysicalId
        : (parseInt(physicalId) || 0);
      const myNewSeat = map[String(myOldSeat)] ?? myOldSeat;
      lastSeatChangeRef.current = null;

      // â‘   Ø§Ù…Ø­Ù ÙƒÙ„ Ù…Ø§ Ù‡Ùˆ Ù…ÙÙ‡Ø±Ø³ Ø¨Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯ ÙˆÙ„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ÙˆØ«ÙˆÙ‚ Ø¨Ù‡ Ø¨Ø¹Ø¯ Ø§Ù„ØªØ±Ù‚ÙŠÙ… Ø§Ù„Ø¬Ø¯ÙŠØ¯
      setVotingCandidates([]);
      setVotingPlayersInfo([]);
      setPlayerVotes({});
      setMyVote(null);
      setVotingComplete(false);
      setTotalVotesCast(0);
      setLastVoteTime(null);
      setVotingCountdown(null);
      if (votingTimerRef.current) clearInterval(votingTimerRef.current);
      setPhasePollData(null);        // ØªØ¨Ø±ÙŠØ±/Ù†Ù‚Ø§Ø´/Ø¥Ù‚ØµØ§Ø¡/Ø§ØªÙØ§Ù‚ÙŠØ§Øª â€” ÙƒÙ„Ù‡Ø§ Ø¨Ø£Ø±Ù‚Ø§Ù… Ù…Ù‚Ø§Ø¹Ø¯
      setRoster([]);                 // Ø§Ù„Ø±ÙˆØ³ØªØ± ÙŠØ¹ÙˆØ¯ ÙƒØ§Ù…Ù„Ø§Ù‹ Ù…Ù† Ø£ÙˆÙ‘Ù„ Ø§Ø³ØªØ·Ù„Ø§Ø¹
      setVoiceMaps({ videoByPid: {}, audioByPid: {} }); // ÙƒØ§Ù…ÙŠØ±Ø§/ÙƒÙ„Ø§Ù… Ø¹Ù„Ù‰ ÙƒØ§Ø±Øª Ø§Ù„Ø´Ø®Øµ Ø§Ù„Ø®Ø·Ø£
      // Ù†Ø§ÙØ°Ø© Ø§Ù„Ù„ÙŠÙ„ Ø§Ù„Ù…ÙØªÙˆØ­Ø© ØªÙØºÙ„Ù‚: Ø´Ø¨ÙƒØ© Ø£Ù…Ø§Ù† Ø§Ù„Ù„ÙŠÙ„ ØªØ¹ÙŠØ¯ ÙØªØ­Ù‡Ø§ Ù…Ù† Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø·Ø§Ø²Ø¬Ø©
      if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
      setNightActionRequired(null);
      setNightActionSubmitted(false);
      setNightActionCountdown(0);
      setSelectedTargetForConfirm(null);
      // Ø§Ù„Ø¹Ù…Ø¯Ø©: Ø¨Ø±ÙˆÙ…Ø¨Øª Ù‚Ø±Ø§Ø±Ù‡ ÙˆØ´Ø§Ø±ØªÙ‡ ÙˆØ¥Ø¹Ù„Ø§Ù†Ù‡ â€” Ø«Ù„Ø§Ø«ØªÙ‡Ø§ Ù…Ø±Ø¨ÙˆØ·Ø© Ø¨Ø±Ù‚Ù… Ù…Ù‚Ø¹Ø¯
      setMayorPrompt(null);
      setMayorBanner(null);
      setMayorRevealedId(null);
      // ðŸ›¡ï¸ Ù†Ø§ÙØ°Ø© ØµÙ…Øª Ù‚ØµÙŠØ±Ø© Ù„Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¯ÙØ¹ Ø§Ù„Ø®Ø§ØµÙ‘Ø©: Ø§Ù„Ø®Ø§Ø¯Ù… ÙŠÙØ¹ÙŠØ¯ Ø¥Ø±Ø³Ø§Ù„ player:role-assigned
      //    Ù„ÙƒÙ„ Ù…Ù†Ù‚ÙˆÙ„ (Ø¨Ù„Ø§ Ø­Ù‚Ù„ Ø­ÙŠØ§Ø©)ØŒ ÙˆÙ…Ø¹Ø§Ù„Ø¬ÙÙ‡ ÙŠÙØªØ±Ø¶ Â«Ø¯ÙˆØ± Ø¬Ø¯ÙŠØ¯Â» ÙÙŠÙØ­ÙŠÙŠ Ù…ÙŠØªØ§Ù‹ ÙˆÙŠÙ‚Ù„Ø¨ Ø¨Ø·Ø§Ù‚ØªÙ‡
      //    ÙˆÙŠÙØ·Ù„Ù‚ ØªÙ†Ø¨ÙŠÙ‡ Ø§Ù„Ø¯ÙˆØ±. Ø§Ù„Ø§Ø³ØªØ·Ù„Ø§Ø¹ Ø§Ù„ØªØ§Ù„ÙŠ Ù‡Ùˆ Ø§Ù„Ù…Ø±Ø¬Ø¹ Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø­ÙŠØ§Ø©.
      seatRemapRepushUntilRef.current = Date.now() + 5000;

      // â‘¡  Ø±Ø­Ù‘Ù„ Ù…Ø§ ÙŠÙ…Ù„ÙƒÙ‡ Ø§Ù„Ø¬Ù‡Ø§Ø² ÙˆÙ„Ø§ ÙŠÙØ¹ÙŠØ¯Ù‡ Ø§Ù„Ø®Ø§Ø¯Ù…: Ø§Ù„Ù…ÙÙƒØ±Ø© Ø§Ù„Ø®Ø§ØµÙ‘Ø© + Ù‡ÙˆÙŠÙ‘Ø§Øª Ø§Ù„ÙØ±ÙŠÙ‚
      //     (Ø§Ù„Ø£Ø³Ù…Ø§Ø¡ ØªØ³Ø§ÙØ± Ù…Ø¹ Ø§Ù„Ø£Ø´Ø®Ø§ØµØŒ ÙØªÙ…Ø±Ù‘ Ø£Ø±Ù‚Ø§Ù…Ù‡Ø§ Ø¨Ø®Ø±ÙŠØ·Ø© Ø§Ù„Ø®Ø§Ø¯Ù… ÙƒÙ…Ø§ ÙØ¹Ù„ Ù‡Ùˆ Ø¨Ø­Ø§Ù„ØªÙ‡)
      setNotepadNotes(migrateNotesForSeatRemap(roomId, map, myOldSeat, myNewSeat));
      setNotepadRemapNonce(n => n + 1);
      setMafiaTeamRaw(prev => {
        const next = prev.map(m => ({ ...m, physicalId: map[String(m.physicalId)] ?? m.physicalId }));
        if (next.length > 0) localStorage.setItem('mafia_mafiaTeam', JSON.stringify(next));
        return next;
      });
      setSiblingRaw(prev => {
        if (!prev) return prev;
        const next = { ...prev, physicalId: map[String(prev.physicalId)] ?? prev.physicalId };
        localStorage.setItem('mafia_sibling', JSON.stringify(next));
        return next;
      });

      // â‘¢  Ø§Ø³Ø£Ù„ Ø§Ù„Ø®Ø§Ø¯Ù… (Ù†ÙØ³ Ù†Ø¯Ø§Ø¡ Ø§Ù„Ø§Ø³ØªØ·Ù„Ø§Ø¹) â€” Ù‡Ùˆ Ø§Ù„Ù…Ø±Ø¬Ø¹ Ù„Ù…Ù‚Ø¹Ø¯ÙŠ ÙˆØ¯ÙˆØ±ÙŠ ÙˆÙ…Ø±Ø­Ù„ØªÙŠ
      // (Ø³Ø¬Ù„Ù‘ Ø¯Ø±Ø¯Ø´Ø© Ø§Ù„Ù…Ø§ÙÙŠØ§ Ø£ÙØ¹ÙŠØ¯ ØªØ±Ù‚ÙŠÙ…Ù‡ Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø§Ø¯Ù… Ø£ÙŠØ¶Ø§Ù‹ â€” ØªÙØ¹ÙŠØ¯ Ø§Ù„Ù…ÙÙƒØ±Ø© Ø¬Ù„Ø¨Ù‡ Ø¨Ø§Ù„Ø¹Ø¯Ù‘Ø§Ø¯ Ø£Ø¹Ù„Ø§Ù‡)
      seatRemapUntilRef.current = Date.now() + 6000; // ÙŠÙƒØªÙ… Ø¨Ø§Ù†Ø± Â«ØªÙ… ØªØºÙŠÙŠØ± Ø±Ù‚Ù…ÙƒÂ» Ø§Ù„Ù…ÙƒØ±Ù‘Ø±
      // â±ï¸ ØªØ£Ø¬ÙŠÙ„ Ù†Ø¯Ø§Ø¡ Ø§Ù„Ø§Ø³ØªØ·Ù„Ø§Ø¹ Ù„Ø¯ÙˆØ±Ø© Ø±Ø³Ù… ÙˆØ§Ø­Ø¯Ø©: Ø§Ù„Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ Ø§Ù„ÙÙˆØ±ÙŠ ÙŠÙ†ÙÙ‘Ø° Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ (closure)
      //    Ø§Ù„Ù…ÙÙ„ØªÙ‚Ø· **Ù‚Ø¨Ù„** ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…Ù‚Ø¹Ø¯ØŒ ÙÙŠØ³ØªØ¹ÙŠØ¯ ØµÙˆØªÙŠ Ù…Ù† Ù…ÙØªØ§Ø­ Ø§Ù„Ù…Ù‚Ø¹Ø¯ Ø§Ù„Ù‚Ø¯ÙŠÙ… â€” Ø£ÙŠ ØµÙˆØª
      //    Ø´Ø±ÙŠÙƒ Ø§Ù„ØªØ¨Ø¯ÙŠÙ„. Ø¨Ø¹Ø¯ Ø§Ù„Ø±Ø³Ù… ÙŠØµÙŠØ± Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ Ù…Ø­Ø¯Ù‘Ø«Ø§Ù‹ Ø¨Ø§Ù„Ù…Ù‚Ø¹Ø¯ Ø§Ù„Ø¬Ø¯ÙŠØ¯.
      setTimeout(() => pollStateRef.current?.(), 0);

      // â‘£  ØªÙˆØ³Øª Ù‚ØµÙŠØ± ØºÙŠØ± Ù…ÙÙ‚Ù„Ù‚ â€” Ø¨Ù„Ø§ Ø£Ø³Ù…Ø§Ø¡ ÙˆÙ„Ø§ ØªÙØ§ØµÙŠÙ„ ØªÙƒØ´Ù Ù…Ù† ØªØ­Ø±Ù‘Ùƒ
      //     (Ø¨Ù„Ø§ Ø§Ù‡ØªØ²Ø§Ø²: Ù…Ù† Ø§Ù†ØªÙ‚Ù„ Ù…Ù‚Ø¹Ø¯Ù‡ Ø§Ù‡ØªØ²Ù‘ Ø¬Ù‡Ø§Ø²Ù‡ Ø£ØµÙ„Ø§Ù‹ Ù…Ø¹ player:seat-changed)
      const msg = myNewSeat !== myOldSeat ? `ØªØºÙŠÙ‘Ø± Ù…Ù‚Ø¹Ø¯Ùƒ Ø¥Ù„Ù‰ Ø±Ù‚Ù… ${myNewSeat}` : 'Ø£ÙØ¹ÙŠØ¯ ØªØ±ØªÙŠØ¨ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯';
      setActiveToast({ message: msg, type: 'info' });
      setTimeout(() => {
        setActiveToast(prev => prev && prev.message === msg ? null : prev);
      }, 4000);
    });

    const cleanupKick = on('player:kicked-self', (data?: { reason?: string }) => {
      localStorage.removeItem('mafia_session');
      localStorage.removeItem('mafia_held_seat'); // Ù„Ø§ ÙŠØ­ØªØ§Ø¬ Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¨Ø¹Ø¯ Ø§Ù„Ø·Ø±Ø¯
      setAssignedRole(null);
      setPhysicalId('');
      setRoomId('');
      setUserExited(true);
      localStorage.setItem('mafia_user_exited', 'true');

      // Ù…Ø³Ø­ ÙƒØ§ÙØ© Ù…ÙØ§ØªÙŠØ­ Ø§Ù„Ø¬Ù„Ø³Ø© Ù„Ù„ØªØµÙÙŠØ± Ø§Ù„ÙƒØ§Ù…Ù„
      localStorage.removeItem('mafia_gamePhase');
      localStorage.removeItem('mafia_votingCandidates');
      localStorage.removeItem('mafia_votingPlayersInfo');
      localStorage.removeItem('mafia_myVote');
      localStorage.removeItem('mafia_playerVotes');
      localStorage.removeItem('mafia_lastVoteTime');
      localStorage.removeItem('mafia_mafiaTeam');
      localStorage.removeItem('mafia_sibling');

      if (data?.reason) {
        setIsExpelled(true);
        setExpulsionReason(data.reason);
      } else {
        setStep(initialRoomCode ? 'phone' : 'code');
        setApiError('ØªÙ… Ø¥Ø²Ø§Ù„ØªÙƒ Ù…Ù† Ø§Ù„Ù„Ø¹Ø¨Ø© Ù…Ù† Ù‚Ø¨Ù„ Ø§Ù„Ù„ÙŠØ¯Ø±');
      }
    });

    // ðŸ—£ï¸ ØªÙØ¹ÙŠÙ„/ØªØ¹Ø·ÙŠÙ„ ØºØ±ÙØ© Ø§Ù„ØªØ´Ø§ÙˆØ± ÙÙˆØ±ÙŠØ§Ù‹ Ù…Ù† Ø§Ù„Ù„ÙŠØ¯Ø± (Ø¥Ø¹Ø¯Ø§Ø¯ Ø¹Ø§Ù… Ù„Ø§ ÙŠÙƒØ´Ù Ù‡ÙˆÙŠØ©)
    const cleanupChatToggle = on('room:config-updated', (data: any) => {
      if (typeof data?.mafiaChatEnabled === 'boolean') setMafiaChatEnabled(data.mafiaChatEnabled);
    });

    const cleanupPenalty = on('game:penalty-recorded', (data: { physicalId: number; penalties: number; maxPenalties: number; message: string; isKicked: boolean }) => {
      const myPhysId = parseInt(physicalId);
      if (data.physicalId === myPhysId) {
        setPenalties(data.penalties);
        setMaxPenalties(data.maxPenalties);
        setPenaltyAlert({
          message: data.message,
          penalties: data.penalties,
          maxPenalties: data.maxPenalties
        });
        setActiveToast({
          message: data.message,
          type: 'penalty'
        });
        if (navigator.vibrate) {
          navigator.vibrate([300, 100, 300, 100, 500]);
        }
      } else {
        setActiveToast({
          message: data.message,
          type: 'warning'
        });
        if (navigator.vibrate) {
          navigator.vibrate([100, 100]);
        }
      }
      
      // Ø¥Ø®ÙØ§Ø¡ Ø§Ù„ØªÙˆØ³Øª ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¨Ø¹Ø¯ 6 Ø«ÙˆØ§Ù†Ù
      setTimeout(() => {
        setActiveToast(prev => prev && prev.message === data.message ? null : prev);
      }, 6000);
    });

    // Ø¥Ù‚ØµØ§Ø¡ Ø¨Ø³Ø¨Ø¨ Ø§Ù„Ø¹Ù‚ÙˆØ¨Ø§Øª â€” Ø§Ù„Ù„Ø§Ø¹Ø¨ ÙŠØ¨Ù‚Ù‰ ÙÙŠ Ø§Ù„ØºØ±ÙØ© Ù„ÙƒÙ† Ù…ÙŠØª
    const cleanupPenaltyEjected = on('player:penalty-ejected', (data: { reason: string; penalties: number; maxPenalties: number }) => {
      setIsPlayerDead(true);
      setCardFlipped(true);
      setPenalties(data.penalties);
      setMaxPenalties(data.maxPenalties);
      setPenaltyAlert({
        message: data.reason,
        penalties: data.penalties,
        maxPenalties: data.maxPenalties
      });
      if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }
    });

    return () => {
      cleanupSeat();
      cleanupRemap();
      cleanupKick();
      cleanupPenalty();
      cleanupPenaltyEjected();
      cleanupChatToggle();
    };
  }, [on, initialRoomCode, physicalId, roomId]);

  // â•â•â• ÙØ­Øµ Ø§Ù„Ù…Ù‚Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø¬ÙˆØ² â€” Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ â•â•â•
  // ÙŠØ¹Ù…Ù„ ÙÙ‚Ø· Ø¹Ù†Ø¯ ÙØªØ­ Ø§Ù„ØµÙØ­Ø© Ù…Ù† Ø¬Ø¯ÙŠØ¯ (Ù…Ø«Ù„Ø§Ù‹ Ù…Ù† Ø²Ø± "Ø§Ù„Ø¹ÙˆØ¯Ø©" ÙÙŠ Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©)
  // Ù„Ø§ ÙŠØ¹Ù…Ù„ Ù…Ø¨Ø§Ø´Ø±Ø© Ø¨Ø¹Ø¯ Ø§Ù„Ø®Ø±ÙˆØ¬ (userExited = true)
  useEffect(() => {
    if (step !== 'code' || initialRoomCode) return;
    // Ø¥Ø°Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù„Ø³Ù‰ Ø·Ø§Ù„Ø¹ â†’ Ù„Ø§ Ù†Ø¹ÙŠØ¯ Ø¯Ø®ÙˆÙ„Ù‡ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹
    if (userExited || localStorage.getItem('mafia_user_exited')) return;
    try {
      const held = localStorage.getItem('mafia_held_seat');
      if (!held) return;
      const data = JSON.parse(held);
      const elapsed = Date.now() - (data.exitedAt || 0);
      const TEN_MIN = 10 * 60 * 1000;
      if (elapsed > TEN_MIN) {
        localStorage.removeItem('mafia_held_seat');
        return;
      }
      if (data.roomCode) {
        setRoomCode(data.roomCode);
        setTimeout(() => {
          handleFindRoom(data.roomCode);
        }, 300);
      }
    } catch { /* ignore parse errors */ }
  }, [step, initialRoomCode]);

  // â”€â”€ ØªØ³Ø¬ÙŠÙ„ Ø®Ø±ÙˆØ¬ Ø§Ù„Ù„Ø§Ø¹Ø¨ (Ù…Ø³Ø­ ÙƒÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©) â”€â”€
  const handleLogout = useCallback(() => {
    // â•â•â• Ø­ÙØ¸ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ø£Ø®ÙŠØ±Ø© Ù‚Ø¨Ù„ Ø§Ù„Ù…Ø³Ø­ (Ù„Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„Ù…Ù‚Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø¬ÙˆØ²) â•â•â•
    const savedRoomCode = roomCode;
    const savedRoomId = roomId;
    if (savedRoomCode && savedRoomId) {
      localStorage.setItem('mafia_held_seat', JSON.stringify({
        roomCode: savedRoomCode,
        roomId: savedRoomId,
        phone,
        playerId: playerId || null,
        displayName,
        exitedAt: Date.now(),
      }));
    }

    // Ø¥Ø±Ø³Ø§Ù„ Ø­Ø¯Ø« Ø§Ù„Ø®Ø±ÙˆØ¬ Ù„Ù„Ø³ÙŠØ±ÙØ± Ø£ÙˆÙ„Ø§Ù‹ (Ù„Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù…Ù† ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ù„ÙŠØ¯Ø±)
    if (emit && roomId) {
      const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;
      emit('room:player-exit', {
        roomId,
        phone: normalizedPhone,
        playerId: playerId || undefined,
      }).catch(() => {}); // Ù„Ø§ Ù†Ù…Ù†Ø¹ Ø§Ù„Ø®Ø±ÙˆØ¬ Ø­ØªÙ‰ Ù„Ùˆ ÙØ´Ù„
    }

    localStorage.removeItem('mafia_session');
    localStorage.removeItem('mafia_player_token');
    localStorage.removeItem('mafia_playerId');
    // ØªÙ†Ø¸ÙŠÙ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØµÙˆÙŠØª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©
    localStorage.removeItem('mafia_gamePhase');
    localStorage.removeItem('mafia_votingCandidates');
    localStorage.removeItem('mafia_votingPlayersInfo');
    localStorage.removeItem('mafia_myVote');
    localStorage.removeItem('mafia_playerVotes');
    setPlayerToken(null);
    setPlayerId(null);
    setDisplayName('');
    setPhone('');
    setPhysicalId('');
    setRoomId('');
    setRoomCode('');
    setAssignedRole(null);
    setIsPlayerDead(false);
    setCardFlipped(false);
    setPassword('');
    setNewPassword('');
    setMustChangePassword(false);
    setApiError('');
    if (initialRoomCode) {
      // Ø¥Ø°Ø§ Ø¯Ø®Ù„ Ø¹Ø¨Ø± Ø²Ø± Ø§Ù„Ø­Ø¬Ø² â†’ Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„ØµÙØ­Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© Ù„ÙŠØ®ØªØ§Ø± ØºØ±ÙØ© Ù…Ù† Ø¬Ø¯ÙŠØ¯
      setStep('code');
      setUserExited(true);
      localStorage.setItem('mafia_user_exited', 'true');
      window.location.href = '/player/home';
      return;
    }
    setStep('code');
    setUserExited(true);
    localStorage.setItem('mafia_user_exited', 'true');
  }, [initialRoomCode, emit, roomId, phone, playerId, roomCode, displayName]);

  // â”€â”€ Ù…Ù†Ø¹ pull-to-refresh Ø¯Ø§Ø®Ù„ Ø§Ù„Ù„Ø¹Ø¨Ø© â”€â”€
  useEffect(() => {
    document.body.classList.add('in-game');
    return () => {
      document.body.classList.remove('in-game');
    };
  }, []);

  // â”€â”€ Ù…Ø²Ø§Ù…Ù†Ø© Ø®ÙÙŠØ© â€” Ø§Ù„Ø§Ø³ØªÙ…Ø§Ø¹ Ù„Ø¨Ø¯Ø¡ Ø§Ù„Ù„Ø¹Ø¨Ø© + ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø£Ø¯ÙˆØ§Ø± â”€â”€
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !on) return;

    // Ø§Ø³ØªÙ‚Ø¨Ø§Ù„ Ø§Ù„Ø¯ÙˆØ± Ù…Ù† Ø§Ù„Ù„ÙŠØ¯Ø± (Ø¹Ù†Ø¯ ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø£Ø¯ÙˆØ§Ø±)
    const cleanupRole = on('player:role-assigned', (data: { role: string; mafiaTeam?: {physicalId: number; name: string; role: string; avatarUrl?: string | null}[]; sibling?: any }) => {
      // ðŸª‘ Ø¥Ø¹Ø§Ø¯Ø© Ø¯ÙØ¹ Ø¨Ø¹Ø¯ Ù†Ù‚Ù„ Ù…Ù‚Ø¹Ø¯ (Ù„Ø§ Ù„Ø¹Ø¨Ø© Ø¬Ø¯ÙŠØ¯Ø©): Ø§Ù„Ø®Ø§Ø¯Ù… ÙŠÙØ¹ÙŠØ¯ Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¯ÙˆØ± Ù„ÙŠØµÙ„ Ù„ØµØ§Ø­Ø¨Ù‡
      //    Ø¨Ø§Ù„Ù…Ù‚Ø¹Ø¯ Ø§Ù„Ø¬Ø¯ÙŠØ¯. Ù„Ø§ ÙŠØ¬ÙˆØ² Ø¹Ù†Ø¯Ù‡Ø§ Ù‚Ù„Ø¨ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© ÙˆÙ„Ø§ Ø¥Ø·Ù„Ø§Ù‚ ØªÙ†Ø¨ÙŠÙ‡ Ø§Ù„Ø¯ÙˆØ± ÙˆÙ„Ø§ Â«Ø¥Ø­ÙŠØ§Ø¡Â» Ù…ÙŠØª.
      const isSeatRepush = Date.now() < seatRemapRepushUntilRef.current;
      setAssignedRole(data.role);
      if (!isSeatRepush) {
        setCardFlipped(false);
        setRoleAlert(true);
        setIsPlayerDead(false); // â† reset: Ù„Ø¹Ø¨Ø© Ø¬Ø¯ÙŠØ¯Ø© = Ø­ÙŠ
      }
      // ðŸ‘¥ Ù†Ø·Ø¨Ù‘Ù‚ Ø¯Ø§Ø¦Ù…Ø§Ù‹ (Ù„Ø§ Ø´Ø±Ø·): Ø¥Ù† Ù„Ù… ÙŠÙƒÙ† Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù…Ø§ÙÙŠØ§ ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„Ù„Ø¹Ø¨Ø© (Ù…Ø«Ù„ Ø§Ù„Ø£Ø® Ø§Ù„Ø£ØµØºØ±/Ø§Ù„Ù…ÙˆØ§Ø·Ù†)
      // ÙŠØ¬Ø¨ Ù…Ø³Ø­ Ø£ÙŠ ÙØ±ÙŠÙ‚ Ù…Ø§ÙÙŠØ§ Ù‚Ø¯ÙŠÙ… Ù…Ø­ÙÙˆØ¸ Ù…Ù† Ù„Ø¹Ø¨Ø© Ø³Ø§Ø¨Ù‚Ø© â€” ÙˆØ¥Ù„Ù‘Ø§ Ø±Ø¢Ù‡ Ø§Ù„Ø£Ø® Ø§Ù„Ø£ØµØºØ± Ù‚Ø¨Ù„ ØªØ­ÙˆÙ‘Ù„Ù‡.
      setMafiaTeam(data.mafiaTeam || []);
      setSibling(data.sibling || null); // ðŸ‘¥ Ø§Ù„Ø£Ø® (null Ù„ØºÙŠØ± Ø§Ù„Ø£Ø®ÙˆÙŠÙ†)
      if (!isSeatRepush && navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 300]);
    });

    // ðŸ‘¥ ØªØ­Ø¯ÙŠØ« Ù‚Ø§Ø¦Ù…Ø© ÙØ±ÙŠÙ‚ Ø§Ù„Ù…Ø§ÙÙŠØ§ (Ø¹Ù†Ø¯ ØªØ­ÙˆÙ‘Ù„ Ø§Ù„Ø£Ø® Ø§Ù„Ø£ØµØºØ± â€” Ø¯ÙˆÙ† Ù„Ù…Ø³ Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„Ù„Ø§Ø¹Ø¨)
    const cleanupMafiaTeam = on('mafia:team-updated', (data: { mafiaTeam?: {physicalId: number; name: string; role: string; avatarUrl?: string | null}[] }) => {
      if (data.mafiaTeam) setMafiaTeam(data.mafiaTeam);
    });

    // ðŸ”ª Ø§Ø³ØªÙ‚Ø¨Ø§Ù„ Ø¹Ù‚ÙˆØ¯ Ø§Ù„Ø³ÙÙ‘Ø§Ø­
    const cleanupAssassin = on('assassin:contracts-update', (data: any) => {
      setAssassinContracts(data);
    });

    const cleanup = on('game:started', () => {
      console.log('ðŸŽ® New game started â€” resetting all game state');
      // â”€â”€ Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø¬ÙˆÙ„Ø© â”€â”€
      setIsPlayerDead(false);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
      setAssassinContracts(null); // ðŸ”ª ØªØµÙÙŠØ± Ø¹Ù‚ÙˆØ¯ Ø§Ù„Ø³ÙÙ‘Ø§Ø­
      if (navigator.vibrate) navigator.vibrate(200);
    });

    // â”€â”€ Ø§Ù„Ø­Ù„ Ø§Ù„Ø¬Ø°Ø±ÙŠ: Ù…Ø²Ø§Ù…Ù†Ø© Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ playerId â”€â”€
    // ÙƒÙ„ Ù…Ø§ ÙŠØªØºÙŠØ± Ø§Ù„Ù€ state Ø¨Ø§Ù„Ø³ÙŠØ±ÙØ± (renumber, kick, etc.)
    // Ù†Ø¨Ø­Ø« Ø¹Ù† Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø¨Ø§Ù„Ù€ playerId Ø£Ùˆ Ø§Ù„Ù‡Ø§ØªÙ ÙˆÙ†Ø­Ø¯Ù‘Ø« physicalId + role + alive
    const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;
    const cleanupSync = on('game:state-sync', (state: any) => {
      if (!state || !state.players) return;
      setRoster(state.players);
      if (state.config?.isRemote != null) setIsRemote(!!state.config.isRemote);
      if (state.config?.allowPlayerInvites != null) setAllowPlayerInvites(!!state.config.allowPlayerInvites);

      // Ø§Ù„Ø¨Ø­Ø« Ø¨Ù€ playerId Ø£ÙˆÙ„Ø§Ù‹ (Ø§Ù„Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ù…ÙˆØ«ÙˆÙ‚Ø©)
      let me = playerId
        ? state.players.find((p: any) => p.playerId === playerId)
        : null;

      // fallback: Ø§Ù„Ø¨Ø­Ø« Ø¨Ø§Ù„Ù‡Ø§ØªÙ
      if (!me && normalizedPhone) {
        me = state.players.find((p: any) => p.phone === normalizedPhone);
      }

      if (me) {
        // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø±Ù‚Ù… Ø¥Ø°Ø§ ØªØºÙŠÙ‘Ø±
        if (String(me.physicalId) !== physicalId) {
          const oldId = physicalId;
          setPhysicalId(String(me.physicalId));
          // ØªØ­Ø¯ÙŠØ« Ø§Ù„ÙƒØ§Ø´
          const saved = JSON.parse(localStorage.getItem('mafia_session') || '{}');
          saved.physicalId = me.physicalId;
          localStorage.setItem('mafia_session', JSON.stringify(saved));
          // ØªÙ†Ø¨ÙŠÙ‡ Ø¨ØµØ±ÙŠ â€” Ø¥Ù„Ø§ Ø¥Ø°Ø§ ÙƒØ§Ù† ØªÙˆØ³Øª Ø¥Ø¹Ø§Ø¯Ø© ØªØ±ØªÙŠØ¨ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯ Ù‚Ø¯ Ù‚Ø§Ù„Ù‡Ø§ Ù„Ù„ØªÙˆ
          if (oldId && oldId !== '0' && Date.now() > seatRemapUntilRef.current) {
            setSeatChangeAlert(`ØªÙ… ØªØºÙŠÙŠØ± Ø±Ù‚Ù…Ùƒ: ${oldId} â† ${me.physicalId}`);
            setTimeout(() => setSeatChangeAlert(null), 5000);
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          }
        }

        // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø§Ø³Ù… Ø¥Ø°Ø§ ØªØºÙŠÙ‘Ø±
        if (me.name && me.name !== displayName) {
          setDisplayName(me.name);
        }

        // ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„Ø­ÙŠØ§Ø©
        if (!me.isAlive && !isPlayerDead) {
          setIsPlayerDead(true);
          setCardFlipped(true);
        }
        // â† Ø¥Ø­ÙŠØ§Ø¡: Ø¥Ø°Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø­ÙŠ ÙÙŠ Ù„Ø¹Ø¨Ø© Ø¬Ø¯ÙŠØ¯Ø© Ø¨Ø³ Ø§Ù„Ù€ state ÙŠÙ‚ÙˆÙ„ Ù…ÙŠØª
        if (me.isAlive && isPlayerDead) {
          setIsPlayerDead(false);
          setCardFlipped(false);
        }

        // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¹Ù‚ÙˆØ¨Ø§Øª ÙˆØ§Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰
        const mePenalties = me.penalties || 0;
        if (mePenalties !== penalties) {
          setPenalties(mePenalties);
        }
        const stateMaxPenalties = state.config?.maxPenalties || 3;
        if (stateMaxPenalties !== maxPenalties) {
          setMaxPenalties(stateMaxPenalties);
        }
      } else {
        // Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù…Ø´ Ù…ÙˆØ¬ÙˆØ¯ Ø¨Ø§Ù„Ù€ state â†’ Ù…Ù…ÙƒÙ† Ø§ØªØ·Ø±Ø¯
        // Ø¨Ø³ Ù…Ø§ Ù†Ù…Ø³Ø­ Ø§Ù„Ø¬Ù„Ø³Ø© Ù‡ÙˆÙ† Ø¹Ø´Ø§Ù† Ù…Ù…ÙƒÙ† ÙŠÙƒÙˆÙ† state-sync Ù„ØºØ±ÙØ© Ø«Ø§Ù†ÙŠØ©
      }
    });

    return () => {
      cleanupRole();
      cleanupMafiaTeam();
      cleanup();
      cleanupSync();
    };
  }, [step, on, playerId, phone, physicalId, displayName, isPlayerDead, penalties, maxPenalties]);

  // â”€â”€ Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø­Ø§Ù„Ø© Ø§Ù„ØªØµÙˆÙŠØª ÙÙˆØ± Ø§ÙƒØªÙ…Ø§Ù„ Ø§Ù„Ù€ rejoin (safety net Ø´Ø§Ù…Ù„) â”€â”€
  // Ù‡Ø°Ø§ ÙŠØ´ØªØºÙ„ Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø© Ø¨Ø¹Ø¯ step = 'rejoined' ÙˆÙŠØ¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØµÙˆÙŠØª Ù…Ø¨Ø§Ø´Ø±Ø©
  useEffect(() => {
    if (step !== 'rejoined' || !emit || !roomId) return;

    // ØªØ£Ø®ÙŠØ± Ø¨Ø³ÙŠØ· Ù„Ø§Ù†ØªØ¸Ø§Ø± React batching ÙŠØ·Ø¨Ù‘Ù‚ ÙƒÙ„ Ø§Ù„Ù€ states Ù…Ù† rejoin callback
    const timer = setTimeout(async () => {
      try {
        const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;
        const res = await emit('room:get-my-state', {
          roomId,
          playerId: playerId || undefined,
          phone: normalizedPhone || undefined,
        });
        console.log(`ðŸ›¡ï¸ Post-rejoin fetch: phase=${res.phase}, hasVotingState=${!!res.votingState}, candidates=${res.votingState?.candidates?.length || 0}`);
        
        if (res.success && res.phase) {
          setGamePhase(res.phase);
          
          if (res.votingState && res.phase === 'DAY_VOTING') {
            console.log(`ðŸ›¡ï¸ Restoring voting state: ${res.votingState.candidates?.length} candidates`);
            setVotingCandidates(res.votingState.candidates || []);
            setTotalVotesCast(res.votingState.totalVotesCast || 0);
            setPlayerVotes(res.votingState.playerVotes || {});
            if (res.votingState.playersInfo) setVotingPlayersInfo(res.votingState.playersInfo);
            const myPhysId = parseInt(physicalId);
            if (res.votingState.playerVotes?.[myPhysId] !== undefined) {
              setMyVote(res.votingState.playerVotes[myPhysId]);
            }
            
            // Ø§Ø³ØªØ¹Ø§Ø¯Ø© ØªØ§ÙŠÙ…Ø± Ø§Ù„ØªØµÙˆÙŠØª
            if (res.votingState.durationSeconds && res.votingState.votingStartTime) {
              const elapsed = Math.floor((Date.now() - res.votingState.votingStartTime) / 1000);
              const remaining = Math.max(0, res.votingState.durationSeconds - elapsed);
              if (remaining > 0) {
                setVotingCountdown(remaining);
                if (votingTimerRef.current) clearInterval(votingTimerRef.current);
                votingTimerRef.current = setInterval(() => {
                  setVotingCountdown(prev => {
                    if (prev === null || prev <= 1) {
                      if (votingTimerRef.current) clearInterval(votingTimerRef.current);
                      return 0;
                    }
                    return prev - 1;
                  });
                }, 1000);
              } else {
                setVotingCountdown(0);
              }
            }
          }

          // â”€â”€ Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ù…Ù‡Ø§Ù… Ø§Ù„Ø³ÙÙ‘Ø§Ø­ â”€â”€
          if (res.assassinContracts) {
            setAssassinContracts(res.assassinContracts);
          }

          // â”€â”€ Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø­Ø§Ù„Ø© Ø§Ù„Ù„ÙŠÙ„ Ø§Ù„Ø£ÙˆØªÙˆ Ø¹Ù†Ø¯ refresh â”€â”€
          if (res.nightState && res.phase === 'NIGHT' && !res.nightState.playerSubmitted) {
            const ns = res.nightState;
            const myPhysId = parseInt(physicalId);
            const isPerformer = myPhysId === ns.autoNightPerformerId;
            const stepActionType = ns.autoNightStepRole === 'SHERIFF' ? 'INVESTIGATE' :
              ns.autoNightStepRole === 'DOCTOR' || ns.autoNightStepRole === 'NURSE' ? 'PROTECT' :
              ns.autoNightStepRole === 'SNIPER' ? 'SNIPE' :
              ns.autoNightStepRole === 'WITCH' ? 'DISABLE' :
              ns.autoNightStepRole === 'SILENCER' && !isPerformer ? 'DECOY' : 'KILL';

            setNightActionRequired({
              actionType: isPerformer ? stepActionType : 'DECOY',
              availableTargets: ns.nightStep.availableTargets || [],
              timeoutSeconds: ns.config.autoNightTime || 15,
              canSkip: ns.nightStep.canSkip || false,
              stepRole: ns.autoNightStepRole,
              isDecoy: !isPerformer,
            });
            setNightActionSubmitted(false);
            setSelectedTargetForConfirm(null);
            // ØªØ§ÙŠÙ…Ø± â€” Ù†Ø¨Ø¯Ø£ Ù…Ù† Ø§Ù„ÙˆÙ‚Øª Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ (ØªÙ‚Ø±ÙŠØ¨ÙŠ)
            const remaining = Math.max(3, ns.config.autoNightTime || 15);
            setNightActionCountdown(remaining);
            if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
            nightCountdownRef.current = setInterval(() => {
              setNightActionCountdown(prev => {
                if (prev <= 1) { clearInterval(nightCountdownRef.current!); return 0; }
                return prev - 1;
              });
            }, 1000);
          }
        }
      } catch { /* ignore */ }
    }, 500);

    return () => clearTimeout(timer);
  }, [step, emit, roomId]); // deps Ø¨Ø³ÙŠØ·Ø© â€” ÙŠØ´ØªØºÙ„ ÙÙ‚Ø· Ø¹Ù†Ø¯ rejoin

  // â”€â”€ ðŸŽ© Ø£Ø­Ø¯Ø§Ø« Ø§Ù„Ø¹Ù…Ø¯Ø©: Ù†Ø§ÙØ°Ø© Ù‚Ø±Ø§Ø±Ù‡ (Ù„Ù‡ ÙˆØ­Ø¯Ù‡) + Ø¥Ø¹Ù„Ø§Ù† Ø§Ù„ÙƒØ´Ù (Ù„Ù„Ø¬Ù…ÙŠØ¹) â”€â”€
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !on) return;

    const cleanupWindow = on('day:mayor-window', (data: any) => {
      if (!data?.forMayor) return; // Ø§Ù„Ø¨Ø«Ù‘ Ø§Ù„Ù…ÙˆØ«ÙˆÙ‚ (Ù„ÙŠØ¯Ø±/Ø¹Ø±Ø¶) Ù„Ø§ ÙŠØ¹Ù†ÙŠÙ†Ø§ Ù‡Ù†Ø§
      setMayorPrompt(data);
      setMayorPromptLeft(data.timeoutSeconds || 30);
      if (navigator.vibrate) navigator.vibrate([120, 80, 120, 80, 240]);
    });
    const cleanupClosed = on('day:mayor-window-closed', () => setMayorPrompt(null));
    const cleanupRevealed = on('day:mayor-revealed', (data: any) => {
      setMayorPrompt(null);
      setMayorRevealedId(data.physicalId);
      if (data.voteWeight) setMayorWeight(data.voteWeight);
      setMayorBanner(data);
      setTimeout(() => setMayorBanner(null), 8000);
    });

    return () => { cleanupWindow?.(); cleanupClosed?.(); cleanupRevealed?.(); };
  }, [step, on]);

  // Ø¹Ø¯Ù‘Ø§Ø¯ Ø¨Ø±ÙˆÙ…Ø¨Øª Ø§Ù„Ø¹Ù…Ø¯Ø© (Ø¥Ø±Ø´Ø§Ø¯ÙŠÙ‘ â€” Ø§Ù†ØªÙ‡Ø§Ø¤Ù‡ Ù„Ø§ ÙŠÙ‚Ø±Ù‘Ø± Ø´ÙŠØ¦Ø§Ù‹Ø› Ø§Ù„Ù„ÙŠØ¯Ø± Ø®Ø·Ù‘ Ø§Ù„Ø±Ø¬Ø¹Ø©)
  useEffect(() => {
    if (!mayorPrompt) return;
    const iv = setInterval(() => setMayorPromptLeft(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(iv);
  }, [mayorPrompt]);

  const sendMayorDecision = async (decision: 'PASS' | 'REVOTE' | 'POSTPONE') => {
    if (mayorSending) return;
    setMayorSending(true);
    try {
      await emit('day:mayor-decision', { roomId, decision });
      setMayorPrompt(null);
    } catch { /* Ø§Ù„Ù„ÙŠØ¯Ø± ÙŠØ³ØªØ·ÙŠØ¹ Ø§Ù„ØªÙ†ÙÙŠØ° ÙŠØ¯ÙˆÙŠÙ‘Ø§Ù‹ */ }
    setMayorSending(false);
  };

  // â”€â”€ Ø§Ø³ØªÙ‚Ø¨Ø§Ù„ Ø£Ø­Ø¯Ø§Ø« Ø§Ù„ØªØµÙˆÙŠØª â”€â”€
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !on) return;

    // Ø¨Ø¯Ø¡ Ø§Ù„ØªØµÙˆÙŠØª
    const cleanupVotingStarted = on('day:voting-started', (data: any) => {
      setGamePhase('DAY_VOTING');
      setPhaseOverride('DAY_VOTING');
      setVotingCandidates(data.candidates || []);
      if (data.playersInfo) setVotingPlayersInfo(data.playersInfo);
      setPlayerVotes(data.playerVotes || {});
      // Ø§Ø³ØªØ¹Ø§Ø¯Ø© ØµÙˆØªÙŠ Ø¥Ø°Ø§ ØµÙˆÙ‘ØªØª Ù…Ø³Ø¨Ù‚Ø§Ù‹ (reconnect)
      const myPhysId = parseInt(physicalId);
      if (data.playerVotes && data.playerVotes[myPhysId] !== undefined) {
        setMyVote(data.playerVotes[myPhysId]);
      } else {
        setMyVote(null);
      }
      setTotalVotesCast(0);
      setVotingComplete(false);
      if (myVote === null) setLastVoteTime(null);
      if (navigator.vibrate) navigator.vibrate([100, 200]);

      if (data.durationSeconds) {
        setVotingCountdown(data.durationSeconds);
        if (votingTimerRef.current) clearInterval(votingTimerRef.current);
        votingTimerRef.current = setInterval(() => {
          setVotingCountdown(prev => {
            if (prev === null || prev <= 1) {
              if (votingTimerRef.current) clearInterval(votingTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setVotingCountdown(null);
        if (votingTimerRef.current) clearInterval(votingTimerRef.current);
      }
    });

    // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø£ØµÙˆØ§Øª Ø§Ù„Ù„Ø­Ø¸ÙŠ
    const cleanupVoteUpdate = on('day:vote-update', (data: any) => {
      setVotingCandidates(data.candidates || []);
      setTotalVotesCast(data.totalVotesCast || 0);
      if (data.playerVotes) {
        setPlayerVotes(data.playerVotes);
        // Ù…Ø²Ø§Ù…Ù†Ø© ØµÙˆØªÙŠ Ù…Ù† Ø§Ù„Ø³ÙŠØ±ÙØ± (Ù…Ù‡Ù… Ù„ØªØºÙŠÙŠØ± Ø§Ù„ØµÙˆØª)
        const myPhysId = parseInt(physicalId);
        if (data.playerVotes[myPhysId] !== undefined) {
          setMyVote(data.playerVotes[myPhysId]);
        } else {
          setMyVote(null);
        }
      }
    });

    // Ø§ÙƒØªÙ…Ø§Ù„ Ø§Ù„ØªØµÙˆÙŠØª
    const cleanupVotingComplete = on('day:voting-complete', () => {
      setVotingComplete(true);
    });

    // ØªØºÙŠÙŠØ± Ø§Ù„Ù…Ø±Ø­Ù„Ø©
    const cleanupPhaseChanged = on('game:phase-changed', (data: any) => {
      console.log(`ðŸ”„ Phase changed event: ${data.phase}`);
      setGamePhase(data.phase);
      if (data.state?.config?.isRemote != null) setIsRemote(!!data.state.config.isRemote); // ðŸŒ ÙƒØ´Ù Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ø¨Ø¹ÙŠØ¯Ø© Ø¹Ù†Ø¯ Ø¨Ø¯Ø¡ Ø§Ù„Ù„Ø¹Ø¨
      if (data.state?.config?.allowPlayerInvites != null) setAllowPlayerInvites(!!data.state.config.allowPlayerInvites);
      // Ø­Ù…Ø§ÙŠØ© Ù…Ù† Ø§Ù„Ù€ polling Ø§Ù„Ù‚Ø¯ÙŠÙ… Ù„Ù…Ø¯Ù‘Ø© OVERRIDE_TTL ÙÙ‚Ø· (Ø«Ù…Ù‘ ÙŠÙØ³Ù…Ø­ Ù„Ù„Ù€ poll Ø¨Ù…Ø²Ø§Ù…Ù†Ø© Ø£ÙŠÙ‘ Ù…Ø±Ø­Ù„Ø© Ø£Ø­Ø¯Ø«)
      setPhaseOverride(data.phase);
      
      // Ù…Ø³Ø­ Ø£Ø¯ÙˆØ§Ø± Ø§Ù„Ù…Ø§ÙÙŠØ§ + Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø¹Ù†Ø¯ Ø¨Ø¯Ø¡ Ø¬ÙˆÙ„Ø© Ø¬Ø¯ÙŠØ¯Ø© Ù„ØªØ¬Ù†Ø¨ ØªØ³Ø±ÙŠØ¨Ù‡Ø§
      if (data.phase === 'LOBBY' || data.phase === 'ROLE_GENERATION' || data.phase === 'ROLE_BINDING') {
        setMafiaTeam([]); setSibling(null);
        setAssignedRole(null);
        setGameOverData(null);
        // Ù…Ø³Ø­ Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ Ø¨Ø¯Ø¡ Ù„Ø¹Ø¨Ø© Ø¬Ø¯ÙŠØ¯Ø© Ø£Ùˆ Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„ØºØ±ÙØ©
        if (roomId && physicalId) {
          localStorage.removeItem(`mafia_notes_${roomId}_${physicalId}`);
          setNotepadNotes({});
        }
      }

      // Ù…Ø³Ø­ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØµÙˆÙŠØª ÙÙ‚Ø· Ø¹Ù†Ø¯ Ø§Ù„Ø®Ø±ÙˆØ¬ Ù…Ù† Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØµÙˆÙŠØª
      if (data.phase !== 'DAY_VOTING' && data.phase !== 'DAY_JUSTIFICATION') {
        setVotingCandidates([]);
        setMyVote(null);
        setVotingComplete(false);
        setPlayerVotes({});
        setLastVoteTime(null);
        setVotingCountdown(null);
        if (votingTimerRef.current) clearInterval(votingTimerRef.current);
      }
    });

    // Ø§Ù„ØªØ¨Ø±ÙŠØ±
    const cleanupJustification = on('day:justification-started', (data: any) => {
      console.log('âš–ï¸ Justification started');
      setGamePhase('DAY_JUSTIFICATION');
      if (data && data.playerVotes) {
        setPlayerVotes(data.playerVotes);
      }
      setPhaseOverride('DAY_JUSTIFICATION');
    });

    // Ø§Ù„Ø¥Ù‚ØµØ§Ø¡
    const cleanupElimination = on('day:elimination-pending', () => {
      console.log('ðŸ’€ Elimination pending');
      setGamePhase('ELIMINATION_PENDING');
      setPhaseOverride('ELIMINATION_PENDING');
      // Ù…Ø³Ø­ Ø§Ù„ØªØµÙˆÙŠØª
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setLastVoteTime(null);
    });

    // Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„Ù„Ø¹Ø¨Ø© â€” Ù„Ø§ Ù†Ù…Ø³Ø­ Ø§Ù„Ø¯ÙˆØ± Ø£Ùˆ Ø­Ø§Ù„Ø© Ø§Ù„Ù…ÙˆØª (Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù„Ø§Ø²Ù… ÙŠØ´ÙˆÙÙ‡Ù…)
    // Ø§Ù„Ù€ full reset ÙŠØ­ØµÙ„ ÙÙ‚Ø· Ø¹Ù†Ø¯ game:started
    const cleanupGameOver = on('game:over', (data: any) => {
      console.log('ðŸ Game over â€” clearing voting only');
      if (data && Array.isArray(data.players)) setGameOverData({ winner: data.winner ?? null, players: data.players });
      setGamePhase('GAME_OVER');
      setPhaseOverride('GAME_OVER');
      // Ù…Ø³Ø­ Ø§Ù„ØªØµÙˆÙŠØª
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
      setMafiaTeam([]); setSibling(null);
      if (roomId && physicalId) {
        localStorage.removeItem(`mafia_notes_${roomId}_${physicalId}`);
        setNotepadNotes({});
      }
    });

    // Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ØºØ±ÙØ© Ù…Ù† Ø§Ù„Ù„ÙŠØ¯Ø±
    const cleanupClosed = on('game:closed', () => {
      console.log('ðŸ”’ Game closed â€” full reset + clear session');
      localStorage.removeItem('mafia_session');
      localStorage.removeItem('mafia_gamePhase');
      localStorage.removeItem('mafia_votingCandidates');
      localStorage.removeItem('mafia_votingPlayersInfo');
      localStorage.removeItem('mafia_myVote');
      localStorage.removeItem('mafia_playerVotes');
      if (roomId && physicalId) {
        localStorage.removeItem(`mafia_notes_${roomId}_${physicalId}`);
      }
      setNotepadNotes({});
      setGamePhase(null);
      setAssignedRole(null);
      setIsPlayerDead(false);
      setMafiaTeam([]); setSibling(null);
      setCardFlipped(false);
      setRoleAlert(false);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
    });

    // Ø­Ø°Ù Ø§Ù„ØºØ±ÙØ© Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹ Ù…Ù† Ø§Ù„Ù‚Ø§Ø¦Ø¯
    const cleanupRoomDeleted = on('game:room-deleted', () => {
      console.log('ðŸ—‘ï¸ Room deleted â€” full cleanup + redirect');
      localStorage.removeItem('mafia_session');
      localStorage.removeItem('mafia_gamePhase');
      localStorage.removeItem('mafia_votingCandidates');
      localStorage.removeItem('mafia_votingPlayersInfo');
      localStorage.removeItem('mafia_myVote');
      localStorage.removeItem('mafia_playerVotes');
      setGamePhase(null);
      setAssignedRole(null);
      setIsPlayerDead(false);
      setMafiaTeam([]); setSibling(null);
      setCardFlipped(false);
      setRoleAlert(false);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
      setRoomId('');
      setRoomCode('');
      setStep(initialRoomCode ? 'phone' : 'code');
      setApiError('ØªÙ… Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ØºØ±ÙØ©');
    });

    // ØªÙ†Ø¸ÙŠÙ ÙƒØ§Ù…Ù„ ÙˆØ¥Ø¹Ø§Ø¯Ø© Ù„Ø´Ø§Ø´Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„ â€” Ù…Ø´ØªØ±Ùƒ Ø¨ÙŠÙ† game:kicked Ùˆ event:closed
    const leaveAndReset = (reason?: string) => {
      console.log('ðŸšª Room ended/kicked â€” full cleanup + redirect');
      localStorage.removeItem('mafia_session');
      localStorage.removeItem('mafia_gamePhase');
      localStorage.removeItem('mafia_votingCandidates');
      localStorage.removeItem('mafia_votingPlayersInfo');
      localStorage.removeItem('mafia_myVote');
      localStorage.removeItem('mafia_playerVotes');
      localStorage.removeItem('mafia_mafiaTeam');
      localStorage.removeItem('mafia_sibling');
      setGamePhase(null);
      setAssignedRole(null);
      setIsPlayerDead(false);
      setMafiaTeam([]); setSibling(null);
      setCardFlipped(false);
      setRoleAlert(false);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
      setRoomId('');
      setRoomCode('');
      setStep(initialRoomCode ? 'phone' : 'code');
      setApiError(reason || 'ØªÙ… Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„ÙØ¹Ø§Ù„ÙŠØ© ÙˆØ¥ØºÙ„Ø§Ù‚ Ø§Ù„ØºØ±ÙØ©');
    };

    // Ø§Ù„Ø·Ø±Ø¯ Ù…Ù† Ø§Ù„Ø³ÙŠØ±ÙØ± (Ø¥ØºÙ„Ø§Ù‚ Ù‚Ø³Ø±ÙŠ Ù…Ù† Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©)
    const cleanupKicked = on('game:kicked', (data: any) => leaveAndReset(data?.reason));
    // Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„ÙØ¹Ø§Ù„ÙŠØ© (ÙŠÙØ¨Ø«Ù‘ Ù„Ù„ØºØ±ÙØ© Ø¹Ù†Ø¯ Ø¥ØºÙ„Ø§Ù‚Ù‡Ø§ Ù…Ù† Ø§Ù„Ù„ÙˆØ­Ø© Ø£Ùˆ ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ù„ÙŠØ¯Ø±)
    const cleanupEventClosed = on('event:closed', (data: any) => leaveAndReset(data?.reason || data?.message));

    return () => {
      cleanupVotingStarted();
      cleanupVoteUpdate();
      cleanupVotingComplete();
      cleanupPhaseChanged();
      cleanupJustification();
      cleanupElimination();
      cleanupGameOver();
      cleanupClosed();
      cleanupRoomDeleted();
      cleanupKicked();
      cleanupEventClosed();
    };
  }, [step, on, physicalId]);

  // â”€â”€ Polling: Ù…Ø²Ø§Ù…Ù†Ø© Ø­Ø§Ù„Ø© Ø§Ù„Ù„Ø§Ø¹Ø¨ ÙƒÙ„ 3 Ø«ÙˆØ§Ù†ÙŠ (Ø¨Ø§Ù„Ù€ phone/playerId Ù…Ø´ physicalId) â”€â”€
  // Ù‡Ø°Ø§ Ù‡Ùˆ Ø§Ù„Ø­Ù„ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ: Ø­ØªÙ‰ Ù„Ùˆ Ø§Ù„Ù€ WebSocket events Ù…Ø§ ÙˆØµÙ„ØªØŒ
  // Ø§Ù„Ù€ polling Ø¨ÙŠØ¬Ù„Ø¨ Ø§Ù„Ø±Ù‚Ù… Ø§Ù„ØµØ­ÙŠØ­ Ù…Ù† Ø§Ù„Ø³ÙŠØ±ÙØ± ÙƒÙ„ 3 Ø«ÙˆØ§Ù†ÙŠ
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !emit) return;
    if (!roomId) return;

    const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;

    const pollState = async () => {
      try {
        const res = await emit('room:get-my-state', {
          roomId,
          playerId: playerId || undefined,
          phone: normalizedPhone || undefined,
        });
        console.log(`ðŸ“Š Poll: phase=${res.phase}, hasVotingState=${!!res.votingState}, candidates=${res.votingState?.candidates?.length || 0}`);
        if (res.success && res.player) {
          // ðŸ—£ï¸ ØªØ­Ø¯ÙŠØ« Ø¹Ù„Ù… ØºØ±ÙØ© Ø§Ù„ØªØ´Ø§ÙˆØ± (Ø¥Ø¹Ø¯Ø§Ø¯ Ø¹Ø§Ù…)
          setMafiaChatEnabled(res.mafiaChatEnabled === true);
          // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø±Ù‚Ù… Ø¥Ø°Ø§ ØªØºÙŠÙ‘Ø±
          if (String(res.player.physicalId) !== physicalId) {
            console.log(`ðŸ”„ Polling: seat changed ${physicalId} â†’ ${res.player.physicalId}`);
            setPhysicalId(String(res.player.physicalId));
            // ØªØ­Ø¯ÙŠØ« Ø§Ù„ÙƒØ§Ø´
            const saved = JSON.parse(localStorage.getItem('mafia_session') || '{}');
            saved.physicalId = res.player.physicalId;
            localStorage.setItem('mafia_session', JSON.stringify(saved));
            // ØªÙ†Ø¨ÙŠÙ‡ â€” Ø¥Ù„Ø§ Ø¥Ø°Ø§ ÙƒØ§Ù† ØªÙˆØ³Øª Ø¥Ø¹Ø§Ø¯Ø© ØªØ±ØªÙŠØ¨ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯ Ù‚Ø¯ Ù‚Ø§Ù„Ù‡Ø§ Ù„Ù„ØªÙˆ
            if (physicalId && physicalId !== '0' && Date.now() > seatRemapUntilRef.current) {
              setSeatChangeAlert(`ØªÙ… ØªØºÙŠÙŠØ± Ø±Ù‚Ù…Ùƒ: ${physicalId} â† ${res.player.physicalId}`);
              setTimeout(() => setSeatChangeAlert(null), 5000);
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
          }
          // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø§Ø³Ù… Ø¥Ø°Ø§ ØªØºÙŠÙ‘Ø±
          if (res.player.name && res.player.name !== displayName) {
            setDisplayName(res.player.name);
          }
          // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¯ÙˆØ±
          if (res.player.role && !assignedRole) {
            setAssignedRole(res.player.role);
            setCardFlipped(false);
            setRoleAlert(true); // â† ØªÙ†Ø¨ÙŠÙ‡ Ø¬Ù„ÙˆÙ†Ø¬
            if (navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 300]);
          }
          // ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„Ø­ÙŠØ§Ø©
          if (!res.player.isAlive && !isPlayerDead) {
            setIsPlayerDead(true);
            setCardFlipped(true);
          }
          // Ø¥Ø­ÙŠØ§Ø¡: Ù„Ø¹Ø¨Ø© Ø¬Ø¯ÙŠØ¯Ø© â†’ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø­ÙŠ Ø¨Ø³ Ø§Ù„Ù€ state ÙŠÙ‚ÙˆÙ„ Ù…ÙŠØª
          if (res.player.isAlive && isPlayerDead) {
            setIsPlayerDead(false);
            setCardFlipped(false);
          }
          // ØªØ­Ø¯ÙŠØ« Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù„Ø§Ø¹Ø¨ÙŠÙ† Ù„Ø²Ø± Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª
          if (res.rosterInfo) {
            setRoster(res.rosterInfo);
          }

          // ØªØ­Ø¯ÙŠØ« Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ù„Ø¹Ø¨Ø© (Ù…Ø¹ Ø­Ù…Ø§ÙŠØ© Ù…Ù† Ø§Ù„Ù€ phase-changed event)
          if (res.phase) {
            // ØªØ­ÙˆÙŠÙ„ DAY_ELIMINATION Ù„Ù„ØªÙˆØ§ÙÙ‚ Ù…Ø¹ ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ù„Ø§Ø¹Ø¨ (Ù†Ø·Ø§Ø¨Ù‚ Ø§Ù„Ù€ override Ø¹Ù„Ù‰ Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…ÙØ­ÙˆÙ‘Ù„Ø©)
            const mappedPhase = res.phase === 'DAY_ELIMINATION' ? 'ELIMINATION_PENDING' : res.phase;
            const override = phaseOverrideRef.current;
            const overrideExpired = override ? (Date.now() - override.at > OVERRIDE_TTL) : false;
            if (override && mappedPhase !== override.phase && !overrideExpired) {
              console.log(`ðŸ›¡ï¸ Poll blocked (fresh override): server=${mappedPhase}, override=${override.phase}`);
              // override Ø­Ø¯ÙŠØ« â†’ Ù„Ø§ Ù†Ø³Ù…Ø­ Ù„Ù„Ù€ poll Ø¨Ø§Ù„ÙƒØªØ§Ø¨Ø© (Ù†Ø­Ù…ÙŠ Ø§Ù†ØªÙ‚Ø§Ù„Ø§Ù‹ Ù…Ø­Ù„ÙŠÙ‘Ø§Ù‹ Ø­Ø¯ÙŠØ«Ø§Ù‹)
            } else {
              // Ø¥Ù…Ù‘Ø§ ØªØ·Ø§Ø¨Ù‚ØŒ Ø£Ùˆ Ù„Ø§ ÙŠÙˆØ¬Ø¯ overrideØŒ Ø£Ùˆ Ø§Ù†ØªÙ‡Øª ØµÙ„Ø§Ø­ÙŠÙ‘ØªÙ‡ â†’ Ù†ÙØ²Ø§Ù…Ù† Ù…Ø¹ Ø§Ù„Ø³ÙŠØ±ÙØ± (ÙŠØ´ÙÙŠ Ø§Ù„Ø£Ø¬Ù‡Ø²Ø© Ø§Ù„ØªÙŠ ÙÙˆÙ‘ØªØª Ø§Ù„Ø­Ø¯Ø«)
              if (override && (mappedPhase === override.phase || overrideExpired)) phaseOverrideRef.current = null;
              setGamePhase(mappedPhase);
            }
          }

          // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØµÙˆÙŠØª Ø¨Ø¹Ø¯ reconnect (Ù…Ø¹ Ø­Ù…Ø§ÙŠØ© override Ø§Ù„Ø­Ø¯ÙŠØ« ÙÙ‚Ø·)
          const ovr = phaseOverrideRef.current;
          const overrideActive = ovr !== null && (Date.now() - ovr.at <= OVERRIDE_TTL);
          if (!overrideActive && res.votingState && res.phase === 'DAY_VOTING') {
            setVotingCandidates(res.votingState.candidates || []);
            setTotalVotesCast(res.votingState.totalVotesCast || 0);
            setPlayerVotes(res.votingState.playerVotes || {});
            if (res.votingState.playersInfo) setVotingPlayersInfo(res.votingState.playersInfo);
            const myPhysId = parseInt(physicalId);
            if (res.votingState.playerVotes?.[myPhysId] !== undefined && myVote === null) {
              setMyVote(res.votingState.playerVotes[myPhysId]);
            }
            // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„ØªØ§ÙŠÙ…Ø± Ø¥Ø°Ø§ ÙƒØ§Ù† Ù…ÙÙ‚ÙˆØ¯Ø§Ù‹
            if (res.votingState.durationSeconds && res.votingState.votingStartTime && votingCountdown === null) {
              const elapsed = Math.floor((Date.now() - res.votingState.votingStartTime) / 1000);
              const remaining = Math.max(0, res.votingState.durationSeconds - elapsed);
              setVotingCountdown(remaining);
              if (votingTimerRef.current) clearInterval(votingTimerRef.current);
              votingTimerRef.current = setInterval(() => {
                setVotingCountdown(prev => {
                  if (prev === null || prev <= 1) {
                    if (votingTimerRef.current) clearInterval(votingTimerRef.current);
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
            }
          } else if (!overrideActive && res.phase && res.phase !== 'DAY_VOTING') {
            // Ø®Ø§Ø±Ø¬ Ø§Ù„ØªØµÙˆÙŠØª â†’ Ù…Ø³Ø­ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØµÙˆÙŠØª Ø¥Ø°Ø§ Ù…ÙˆØ¬ÙˆØ¯Ø©
            if (votingCandidates.length > 0) {
              setVotingCandidates([]);
              setMyVote(null);
              setVotingComplete(false);
              setPlayerVotes({});
            }
          }

          // ðŸŒ ØºØ±ÙØ© Ø¨Ø¹ÙŠØ¯Ø© + Ø·Ø§ÙˆÙ„Ø© Ø§Ù„Ø·ÙˆØ± (Ù„Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„ÙÙˆØ±ÙŠÙ‘Ø© Ø¹Ù†Ø¯ reconnect)
          if (res.isRemote != null) setIsRemote(!!res.isRemote);
          if (res.allowPlayerInvites != null) setAllowPlayerInvites(!!res.allowPlayerInvites);
          if (Array.isArray(res.rosterInfo) && res.rosterInfo.length) setRoster(res.rosterInfo);

          // ØªÙ…Ø±ÙŠØ± Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø±Ø§Ø­Ù„ Ù„Ù€ PlayerPhaseView (Ù„Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø¹Ù†Ø¯ reconnect)
          setPhasePollData({
            justificationData: res.justificationData || null,
            withdrawalState: res.withdrawalState || null,
            discussionState: res.discussionState || null,
            winner: res.winner || null,
            allPlayers: res.allPlayers || null,
            pendingResolution: res.pendingResolution || null,
            round: res.round || 1,
          });

          // ØªØ­Ø¯ÙŠØ« Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„Ù„Ø§Ø¹Ø¨ÙŠÙ† (Ù…Ù‡Ù… Ù„Ø¹Ø±Ø¶ Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„Ù…ØªÙ‡Ù…ÙŠÙ† ÙˆØ§Ù„Ø§ØªÙØ§Ù‚ÙŠØ§Øª)
          if (res.playersInfo) {
            const isDiff = votingPlayersInfo.length !== res.playersInfo.length ||
              res.playersInfo.some((p: any, idx: number) => 
                !votingPlayersInfo[idx] || 
                votingPlayersInfo[idx].physicalId !== p.physicalId || 
                votingPlayersInfo[idx].name !== p.name
              );
            if (isDiff) {
              setVotingPlayersInfo(res.playersInfo);
            }
          }
        }
      } catch (e) { /* ignore polling errors */ }
    };

    // ØªÙ†ÙÙŠØ° ÙÙˆØ±ÙŠ Ø£ÙˆÙ„ Ù…Ø±Ø© + Ø«Ù… ÙƒÙ„ 3 Ø«ÙˆØ§Ù†ÙŠ
    // ðŸª‘ ÙˆÙ†ÙØ¨Ù‚ÙŠ Ù…Ø±Ø¬Ø¹Ø§Ù‹ Ù„Ø£Ø­Ø¯Ø« Ù†Ø³Ø®Ø© ÙƒÙŠ ÙŠØ³ØªØ¯Ø¹ÙŠÙ‡Ø§ Ù…Ø¹Ø§Ù„Ø¬ Ø¥Ø¹Ø§Ø¯Ø© ØªØ±ØªÙŠØ¨ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯ ÙÙˆØ±Ø§Ù‹
    pollStateRef.current = pollState;
    pollState();
    const interval = setInterval(pollState, 3000);

    // ðŸ“² Ù…Ø²Ø§Ù…Ù†Ø© ÙÙˆØ±ÙŠÙ‘Ø© Ø¹Ù†Ø¯ Ø¹ÙˆØ¯Ø© Ø§Ù„ØªØ·Ø¨ÙŠÙ‚ Ù„Ù„Ù…Ù‚Ø¯Ù‘Ù…Ø©/Ø§Ù„ØªØ±ÙƒÙŠØ² â€” Ù…Ø¤Ù‚Ù‘ØªØ§Øª Ø§Ù„Ø®Ù„ÙÙŠÙ‘Ø© ØªÙØ®Ù†ÙŽÙ‚ Ø¹Ù„Ù‰ Ø§Ù„Ù‡Ø§ØªÙ
    // ÙÙ„Ø§ ÙŠÙƒÙÙŠ Ø§Ù„Ù€ interval ÙˆØ­Ø¯Ù‡Ø› Ù‡Ø°Ø§ ÙŠØ¶Ù…Ù† Ø§Ù„ØªÙ‚Ø§Ø· Ø£ÙŠÙ‘ Ø§Ù†ØªÙ‚Ø§Ù„Ù ÙØ§Øª Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø®Ù„ÙÙŠÙ‘Ø© Ø®Ù„Ø§Ù„ Ù„Ø­Ø¸Ø©.
    // ðŸ•µï¸ ÙˆÙŠØ±ØµØ¯ Ù…ØºØ§Ø¯Ø±Ø© Ø§Ù„ØµÙØ­Ø© Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ù…Ø¨Ø§Ø±Ø§Ø©: ØºÙŠØ§Ø¨ÙŒ Ø°Ùˆ Ø¯Ù„Ø§Ù„Ø© (ÙˆØ§Ù„Ø³Ø±Ù‘ Ù…ÙØªÙˆØ­ Ø£Ùˆ Ù…Ø·ÙˆÙ‘Ù„) ÙŠÙØ¨Ø«Ù‘ Ù„Ù„Ù‘ÙŠØ¯Ø±.
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        bgAtRef.current = Date.now();
        bgSecretRef.current = galleryOpenRef.current;
      } else {
        pollState();
        if (bgAtRef.current != null) {
          const durMs = Date.now() - bgAtRef.current;
          bgAtRef.current = null;
          if (bgSecretRef.current || durMs > 4000) {
            import('@/lib/socket').then(m =>
              m.getSocket().emit('cheat:app-departure', { durationMs: durMs, secretOpen: bgSecretRef.current, platform: 'web' }),
            ).catch(() => {});
          }
        }
      }
    };
    const onWake = () => { if (document.visibilityState === 'visible') pollState(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [step, emit, roomId, playerId, phone, physicalId, displayName, assignedRole, isPlayerDead, votingPlayersInfo]);

  // â”€â”€ Auto-Vote on Self â”€â”€
  useEffect(() => {
    if (votingCountdown === 0 && myVote === null && !isPlayerDead && emit && roomId && gamePhase === 'DAY_VOTING') {
      const myPhysId = parseInt(physicalId);
      let voteIndex = votingCandidates.findIndex(c => c.targetPhysicalId === myPhysId);
      
      // ÙÙŠ Ø­Ø§Ù„ Ù„Ù… ÙŠÙƒÙ† Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù…Ù† Ø¶Ù…Ù† Ø§Ù„Ù…Ø±Ø´Ø­ÙŠÙ† (Ø¨Ø³Ø¨Ø¨ Ø¯ÙŠÙ„ Ø£Ùˆ Ø­ØµØ± ØªØµÙˆÙŠØª)
      // ÙˆÙ„Ù… ÙŠØµÙˆØª Ø­ØªÙ‰ Ø§Ù†ØªÙ‡Ù‰ Ø§Ù„ÙˆÙ‚ØªØŒ ÙŠØªÙ… Ø§Ø®ØªÙŠØ§Ø± Ø£ÙˆÙ„ Ù…Ø±Ø´Ø­ ÙƒØ¥Ø¬Ø±Ø§Ø¡ Ø§ÙØªØ±Ø§Ø¶ÙŠ Ù„ØªÙØ§Ø¯ÙŠ ØªØ¹Ù„ÙŠÙ‚ Ø§Ù„Ø¬ÙˆÙ„Ø©
      if (voteIndex === -1 && votingCandidates.length > 0) {
        voteIndex = 0;
      }

      if (voteIndex !== -1) {
        console.log('â° Time expired, auto-voting for candidate index:', voteIndex);
        emit('player:cast-vote', {
          roomId,
          physicalId: myPhysId,
          candidateIndex: voteIndex,
          autoVote: true,
        }).then((res: any) => {
          if (res?.success) {
            setMyVote(voteIndex);
            setLastVoteTime(Date.now());
          }
        }).catch(() => {});
      }
    }
  }, [votingCountdown, myVote, isPlayerDead, emit, roomId, physicalId, votingCandidates, gamePhase]);

  // â”€â”€ Auto Night Mode: Ø§Ø³ØªÙ‚Ø¨Ø§Ù„ Ø·Ù„Ø¨ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ø§Ù„Ù„ÙŠÙ„ÙŠ â”€â”€
  useEffect(() => {
    if (!on) return;

    const handleNightActionRequired = (data: {
      actionType: string;
      availableTargets: { physicalId: number; name: string }[];
      timeoutSeconds: number;
      canSkip: boolean;
    }) => {
      setNightActionRequired(data);
      setNightActionSubmitted(false);
      setSelectedTargetForConfirm(null);
      setNightActionCountdown(data.timeoutSeconds);
      // Ø¨Ø¯Ø¡ Ø§Ù„Ø¹Ø¯Ø§Ø¯ Ø§Ù„ØªÙ†Ø§Ø²Ù„ÙŠ
      if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
      nightCountdownRef.current = setInterval(() => {
        setNightActionCountdown(prev => {
          if (prev <= 1) {
            clearInterval(nightCountdownRef.current!);
            // Ø§Ù„Ø³ÙŠØ±ÙØ± ÙŠØ®ØªØ§Ø± Ø¹Ø´ÙˆØ§Ø¦ÙŠØ§Ù‹ â€” Ù†ØºÙ„Ù‚ Ø§Ù„Ø´Ø§Ø´Ø© Ø¨Ø¹Ø¯ Ø«Ø§Ù†ÙŠØªÙŠÙ†
            setTimeout(() => {
              setNightActionSubmitted(true);
              setTimeout(() => setNightActionRequired(null), 1500);
            }, 2000);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const handleNurseActivation = (data: { message: string }) => {
      setNurseActivationPending(true);
    };

    on('night:action-required', handleNightActionRequired);
    on('nurse:activation-request', handleNurseActivation);

    return () => {
      if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
    };
  }, [on]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ðŸ”´ Ø´Ø¨ÙƒØ© Ø£Ù…Ø§Ù† Ø§Ù„Ù„ÙŠÙ„ â€” Ø§Ø´ØªÙ‚Ø§Ù‚ Ø§Ù„Ø´Ø§Ø´Ø© Ù…Ù† Ø§Ù„Ø­Ø§Ù„Ø© Ù„Ø§ Ù…Ù† Ø§Ù„Ø­Ø¯Ø«
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Ø§Ù„Ø¹Ø·Ù„: `night:action-required` ÙŠÙØ¨Ø«Ù‘ **Ù…Ø±Ù‘Ø© ÙˆØ§Ø­Ø¯Ø©** Ù„Ø³ÙˆÙƒØªØ§Øª Ø§Ù„ØºØ±ÙØ©
  // Ù„Ø­Ø¸Ø© Ø¨Ø¯Ø¡ Ø§Ù„Ø®Ø·ÙˆØ©. Ù…Ù† Ù„Ù… ÙŠÙƒÙ† Ø³ÙˆÙƒØªÙ‡ Ù…ÙˆØ¬ÙˆØ¯Ø§Ù‹ Ø­ÙŠÙ†Ù‡Ø§ â€” Ø¥Ø¹Ø§Ø¯Ø© Ø§ØªØµØ§Ù„ØŒ Ø´Ø§Ø´Ø©
  // Ù…Ù‚ÙÙ„Ø©ØŒ ØªØ¨ÙˆÙŠØ¨ ÙÙŠ Ø§Ù„Ø®Ù„ÙÙŠØ©ØŒ Ø´Ø¨ÙƒØ© Ù…ØªØ°Ø¨Ø°Ø¨Ø© â€” Ù„Ø§ ÙŠØ¹Ù„Ù… Ø¨Ø§Ù„Ø®Ø·ÙˆØ© Ø¥Ø·Ù„Ø§Ù‚Ø§Ù‹
  // ÙˆÙŠØ¨Ù‚Ù‰ Ø¹Ù„Ù‰ Ø§Ù„Ø´Ø§Ø´Ø© Ø§Ù„Ø³Ù„Ø¨ÙŠØ© Ø¨ÙŠÙ†Ù…Ø§ ØªÙ†ØªØ¸Ø±Ù‡ Ø§Ù„Ø·Ø§ÙˆÙ„Ø© ÙƒÙ„Ù‡Ø§. Ø§Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø©
  // Ø§Ù„ÙˆØ­ÙŠØ¯Ø© Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯Ø© ØªØ¹Ù…Ù„ Ø¹Ù†Ø¯ `step === 'rejoined'` ÙÙ‚Ø·ØŒ ÙÙ…Ù† ÙƒØ§Ù† ÙÙŠ
  // Ø§Ù„Ù…Ø³Ø§Ø± Ø§Ù„Ø¹Ø§Ø¯ÙŠ Ù„Ø§ Ù…Ø®Ø±Ø¬ Ù„Ù‡ Ø¥Ù„Ø§ ØªØ­Ø¯ÙŠØ« Ø§Ù„ØµÙØ­Ø© ÙŠØ¯ÙˆÙŠØ§Ù‹.
  //
  // Ø§Ù„Ø­Ù„ Ø§Ù„Ø¬Ø°Ø±ÙŠ: Ù…Ø§ Ø¯Ø§Ù… Ø§Ù„Ø·ÙˆØ± Ù„ÙŠÙ„Ø§Ù‹ ÙˆÙ„Ø§ Ø´Ø§Ø´Ø© Ù…ÙØªÙˆØ­Ø©ØŒ Ø§Ø³Ø£Ù„ Ø§Ù„Ø®Ø§Ø¯Ù… ÙƒÙ„
  // 3 Ø«ÙˆØ§Ù†Ù Â«Ù‡Ù„ Ø«Ù…Ø© Ø®Ø·ÙˆØ© Ø­ÙŠØ© Ù„Ù… Ø£Ø±Ø³Ù„ ÙÙŠÙ‡Ø§ØŸÂ» ÙˆØ§ÙØªØ­ Ø§Ù„Ø´Ø§Ø´Ø© Ù…Ù† Ø§Ù„Ø¬ÙˆØ§Ø¨.
  // Ù„Ø§ ÙŠÙØµÙÙŽÙ‘Ø± Ø¹Ø¯Ø§Ø¯ Ø¬Ø§Ø±Ù: Ø§Ù„Ø´Ø±Ø· ÙŠØ®Ø±Ø¬ Ù…Ø¨ÙƒØ±Ø§Ù‹ Ù…ØªÙ‰ ÙƒØ§Ù†Øª Ø§Ù„Ø´Ø§Ø´Ø© Ù…ÙØªÙˆØ­Ø©.
  useEffect(() => {
    if (gamePhase !== 'NIGHT' || !emit || !roomId) return;
    // Ø§Ù„Ø®Ø±ÙˆØ¬ Ø§Ù„ÙˆØ­ÙŠØ¯: Ø´Ø§Ø´Ø© Ù…ÙØªÙˆØ­Ø© ÙØ¹Ù„Ø§Ù‹ (ÙƒÙŠ Ù„Ø§ ÙŠÙØµÙÙŽÙ‘Ø± Ø¹Ø¯Ø§Ø¯Ù‡Ø§). Ù„Ø§ Ù†ÙØ­Øµ
    // `nightActionSubmitted` Ù‡Ù†Ø§: Ù‡ÙŠ ØªØ¨Ù‚Ù‰ true Ø¨Ø¹Ø¯ Ø¥ØºÙ„Ø§Ù‚ Ø´Ø§Ø´Ø© Ø§Ù„Ø®Ø·ÙˆØ©
    // Ø§Ù„Ø³Ø§Ø¨Ù‚Ø© Ø­ØªÙ‰ ÙŠØµÙ„ Ø­Ø¯Ø« Ø§Ù„Ø®Ø·ÙˆØ© Ø§Ù„ØªØ§Ù„ÙŠØ© â€” ÙˆÙ‡Ùˆ Ø§Ù„Ø­Ø¯Ø« Ù†ÙØ³Ù‡ Ø§Ù„Ø°ÙŠ Ù‚Ø¯ ÙŠØ¶ÙŠØ¹.
    // ÙØ­ØµÙ‡Ø§ ÙƒØ§Ù† Ø³ÙŠØºÙ„Ù‚ Ø§Ù„Ø´Ø¨ÙƒØ© Ø£Ù…Ø§Ù… Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„ØªÙŠ Ø¨ÙÙ†ÙŠØª Ù„Ø£Ø¬Ù„Ù‡Ø§.
    // Ø§Ù„Ù…Ø±Ø¬Ø¹ Ø§Ù„Ù…ÙˆØ«ÙˆÙ‚ Ù„Ù„Ø¥Ø±Ø³Ø§Ù„ Ù‡Ùˆ `playerSubmitted` Ù…Ù† Ø§Ù„Ø®Ø§Ø¯Ù…: Ù„ÙƒÙ„ Ø®Ø·ÙˆØ©
    // Ø¹Ù„Ù‰ Ø­Ø¯Ø©.
    if (nightActionRequired) return;

    let cancelled = false;
    const check = async () => {
      try {
        const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;
        const res = await emit('room:get-my-state', {
          roomId,
          playerId: playerId || undefined,
          phone: normalizedPhone || undefined,
        });
        if (cancelled || !res?.success || res.phase !== 'NIGHT') return;
        const ns = res.nightState;
        if (!ns || ns.playerSubmitted) return;
        // Ø§Ù„Ø®Ø·ÙˆØ© Ø§Ù†ØªÙ‡Øª ÙˆØªÙ†ØªØ¸Ø± Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ù„ÙŠØ¯Ø± â‡’ Ù‚Ø§Ø¦Ù…Ø© Ù…ÙŠØªØ© ÙŠØ±ÙØ¶ Ø§Ù„Ø®Ø§Ø¯Ù… ÙƒÙ„
        // Ø§Ø®ØªÙŠØ§Ø± Ù…Ù†Ù‡Ø§
        if (ns.autoNightStepApproval) return;
        // Ù…Ø¶Ù‰ Ù…ÙˆØ¹Ø¯Ù‡Ø§ â‡’ Ø§Ù„Ø®Ø§Ø¯Ù… Ø§Ø®ØªØ§Ø± Ø¹Ø´ÙˆØ§Ø¦ÙŠØ§Ù‹ Ø¨Ø§Ù„ÙØ¹Ù„
        const deadline: number | null = ns.autoNightStepDeadline || null;
        if (deadline && deadline <= Date.now()) return;
        const myPhysId = parseInt(physicalId);
        const isPerformer = myPhysId === ns.autoNightPerformerId;
        const stepActionType = ns.autoNightStepRole === 'SHERIFF' ? 'INVESTIGATE' :
          ns.autoNightStepRole === 'DOCTOR' || ns.autoNightStepRole === 'NURSE' ? 'PROTECT' :
          ns.autoNightStepRole === 'SNIPER' ? 'SNIPE' :
          ns.autoNightStepRole === 'WITCH' ? 'DISABLE' :
          ns.autoNightStepRole === 'SILENCER' && !isPerformer ? 'DECOY' : 'KILL';

        setNightActionRequired({
          actionType: isPerformer ? stepActionType : 'DECOY',
          availableTargets: ns.nightStep?.availableTargets || [],
          timeoutSeconds: ns.config?.autoNightTime || 15,
          canSkip: ns.nightStep?.canSkip || false,
          stepRole: ns.autoNightStepRole,
          isDecoy: !isPerformer,
        });
        setNightActionSubmitted(false);
        setSelectedTargetForConfirm(null);

        // Ø§Ù„Ø¹Ø¯Ø§Ø¯ Ù…Ù† Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠ â€” ÙˆØ£Ø±Ø¶ÙŠØªÙ‡ 3 Ø«ÙˆØ§Ù†Ù: Ø´Ø§Ø´Ø© ØªÙÙØªØ­ Ø¹Ù„Ù‰
        // Ø«Ø§Ù†ÙŠØ© ÙˆØ§Ø­Ø¯Ø© ØªÙØºÙ„Ù‚ Ù‚Ø¨Ù„ Ø£Ù† ÙŠÙ‚Ø±Ø£Ù‡Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨
        const total = ns.config?.autoNightTime || 15;
        const left = deadline ? Math.ceil((deadline - Date.now()) / 1000) : total;
        setNightActionCountdown(Math.max(3, Math.min(total, left)));
        if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
        nightCountdownRef.current = setInterval(() => {
          setNightActionCountdown(prev => {
            if (prev <= 1) { clearInterval(nightCountdownRef.current!); return 0; }
            return prev - 1;
          });
        }, 1000);
      } catch { /* Ø¯ÙˆØ±Ø© ÙØ§Ø¦ØªØ© ØªÙØ¹ÙˆÙŽÙ‘Ø¶ Ø¨Ø§Ù„ØªØ§Ù„ÙŠØ© */ }
    };

    check();
    const id = setInterval(check, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [gamePhase, emit, roomId, playerId, phone, physicalId, nightActionRequired]);


  // â”€â”€ Ø§Ù„Ø®Ø·ÙˆØ© 1: Ø¥Ø¯Ø®Ø§Ù„ ÙƒÙˆØ¯ Ø§Ù„Ù„Ø¹Ø¨Ø© â”€â”€
  const handleFindRoom = async (code?: string) => {
    const targetCode = code || roomCode.trim();
    setApiError('');
    try {
      const res = await emit('room:find-by-code', { roomCode: targetCode });
      setRoomId(res.roomId);
      setGameName(res.gameName);
      setMaxPlayers(res.maxPlayers || 10);
      const needsTicket = res.requireTicket ?? false;
      setRequireTicket(needsTicket);

      // âœ… Ø¥Ø°Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù…Ø³Ø¬Ù„ Ø¯Ø®ÙˆÙ„ â†’ ØªØ®Ø·ÙŠ phone + login â†’ Ø¯Ø®ÙˆÙ„ Ù…Ø¨Ø§Ø´Ø±
      // Ù†Ù‚Ø±Ø£ Ù…Ù† localStorage ÙƒÙ€ fallback Ù„Ø£Ù† Ø§Ù„Ù€ state Ù…Ù…ÙƒÙ† Ù…Ø§ Ø§ØªØ­Ø¯Ø« Ø¨Ø¹Ø¯
      const savedToken = playerToken || getSavedToken();
      const savedPlayerId = playerId || getSavedPlayerId();

      if (savedToken && savedPlayerId) {
        console.log('âš¡ Player already authenticated â€” skipping phone/login steps');
        let playerPhone = phone || getSavedPhone();
        // Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù…Ù† /me Ø¥Ø°Ø§ Ù…Ø´ Ù…ØªÙˆÙØ±
        if (!playerPhone) {
          // Ù…Ø­Ø§ÙˆÙ„Ø© 2: Ù…Ù† /me endpoint
          try {
            const meRes = await fetch('/api/player-auth/me', {
              headers: { 'Authorization': `Bearer ${savedToken}` },
            });
            const meData = await meRes.json();
            if (meData.success && meData.player) {
              playerPhone = meData.player.phone || '';
              setDisplayName(meData.player.name || '');
              setPlayerId(meData.player.id);
              if (meData.player.gender) setGender(meData.player.gender === 'FEMALE' ? 'female' : 'male');
              if (meData.player.avatarUrl) setAvatarUrl(meData.player.avatarUrl);
            }
          } catch {}
        }
        if (playerPhone) setPhone(playerPhone);
        setPlayerToken(savedToken);
        await tryRejoinCurrentRoom(savedPlayerId, savedToken, playerPhone, needsTicket, res.roomId);
        return;
      }

      if (!code) setStep('phone');
    } catch (err: any) {
      setApiError(err.message || 'Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ù„Ø¹Ø¨Ø©');
    }
  };

  // â”€â”€ Ø§Ù„Ø®Ø·ÙˆØ© 2: Ø§Ù„Ø¨Ø­Ø« Ø¨Ø§Ù„Ù‡Ø§ØªÙ â†’ login Ø£Ùˆ register â”€â”€
  const handlePhoneLookup = async () => {
    setApiError('');
    const normalized = phone.startsWith('0') ? phone : '0' + phone;

    // Ø¥Ø°Ø§ Ø¹Ù†Ø¯Ù‡ ØªÙˆÙƒÙ† ØµØ§Ù„Ø­ â†’ ÙŠØªØ®Ø·Ù‰ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„
    const savedToken = playerToken || getSavedToken();
    const savedPid = playerId || getSavedPlayerId();
    if (savedToken && savedPid) {
      setPlayerToken(savedToken);
      setPlayerId(savedPid);
      if (mustChangePassword) {
        setStep('change_password');
      } else {
        // ØªØ­Ù‚Ù‚ Ø¥Ø°Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø£ØµÙ„Ø§Ù‹ Ø¬ÙˆØ§ Ø§Ù„Ù„Ø¹Ø¨Ø©
        await tryRejoinCurrentRoom(savedPid, savedToken, undefined, requireTicket);
      }
      return;
    }

    try {
      const res = await fetch('/api/player/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      });
      const data = await res.json();

      if (data.found && data.player) {
        setDisplayName(data.player.displayName);
        setPlayerId(data.player.id);
        if (data.player.playerId || data.player.id) localStorage.setItem('mafia_playerId', String(data.player.playerId || data.player.id));
        setStep('login'); // Ø§Ù„Ø­Ø³Ø§Ø¨ Ù…ÙˆØ¬ÙˆØ¯ â†’ ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„
      } else {
        setStep('register'); // Ø­Ø³Ø§Ø¨ Ø¬Ø¯ÙŠØ¯ â†’ ØªØ³Ø¬ÙŠÙ„
      }
    } catch (err) {
      setApiError('Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø§ØªØµØ§Ù„');
    }
  };

  // â”€â”€ Ø§Ù„Ø®Ø·ÙˆØ© 3Ø£: ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„ Ø¨ÙƒÙ„Ù…Ø© Ø³Ø± â”€â”€
  const handleLogin = async () => {
    setApiError('');
    const normalized = phone.startsWith('0') ? phone : '0' + phone;
    try {
      const res = await fetch('/api/player-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, password }),
      });
      const data = await res.json();

      if (data.success) {
        setPlayerToken(data.token);
        localStorage.setItem('mafia_player_token', data.token);
        setPlayerId(data.player.id);
        setDisplayName(data.player.name);
        localStorage.setItem('mafia_playerId', String(data.player.id));
        if (data.player.avatarUrl) setAvatarUrl(data.player.avatarUrl);

        // â”€â”€ Ù…Ø³Ø­ Ø¬Ù„Ø³Ø© Ù„Ø§Ø¹Ø¨ Ø¢Ø®Ø± Ø¥Ø°Ø§ Ù…ÙˆØ¬ÙˆØ¯Ø© â”€â”€
        const oldSession = localStorage.getItem('mafia_session');
        if (oldSession) {
          try {
            const s = JSON.parse(oldSession);
            if (s.playerId && s.playerId !== data.player.id) {
              localStorage.removeItem('mafia_session');
              console.log(`ðŸ§¹ Cleared stale session from player #${s.playerId}`);
            }
          } catch {}
        }

        if (data.player.mustChangePassword) {
          setMustChangePassword(true);
          setStep('change_password');
        } else {
          // â”€â”€ ØªØ­Ù‚Ù‚ Ø¥Ø°Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø£ØµÙ„Ø§Ù‹ Ø¬ÙˆØ§ Ø§Ù„Ù„Ø¹Ø¨Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ© â”€â”€
          await tryRejoinCurrentRoom(data.player.id, data.token, undefined, requireTicket);
        }
      } else {
        setApiError(data.error || 'Ø®Ø·Ø£ ÙÙŠ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„');
      }
    } catch (err) {
      setApiError('Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø§ØªØµØ§Ù„');
    }
  };

  // â”€â”€ Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ Ù„Ù„ØºØ±ÙØ© (Ø¨Ø¹Ø¯ login/register) â”€â”€
  const tryRejoinCurrentRoom = async (pid: number, token: string, phoneOverride?: string, ticketRequired?: boolean, roomIdOverride?: string) => {
    const playerPhone = phoneOverride || phone;
    const effectiveRoomId = roomIdOverride || roomId;
    // 1. Ø¬Ø±Ù‘Ø¨ rejoin Ø¹Ø¨Ø± WebSocket Ø¥Ø°Ø§ Ø¹Ù†Ø§ roomId
    if (emit && effectiveRoomId && playerPhone) {
      try {
        const normalized = playerPhone.startsWith('0') ? playerPhone : '0' + playerPhone;
        const res: any = await emit('room:rejoin-player', {
          roomId: effectiveRoomId,
          physicalId: 0, // Ù†Ø¨Ø­Ø« Ø¨Ø§Ù„Ù‡Ø§ØªÙ
          phone: normalized,
          playerId: pid || undefined, // ðŸª‘ Ø§Ù„Ø­Ø³Ø§Ø¨ Ø£ÙˆØ«Ù‚ Ù…Ù† Ø§Ù„Ù…Ù‚Ø¹Ø¯ â€” Ø§Ù„Ø®Ø§Ø¯Ù… ÙŠØ¬Ø±Ù‘Ø¨Ù‡ Ø£ÙˆÙ„Ø§Ù‹
        });
        if (res?.success && res.player) {
          setPhysicalId(String(res.player.physicalId));
          setDisplayName(res.player.name);
          setGender(res.player.gender === 'FEMALE' ? 'female' : 'male');
          setPlayerId(pid);
          if (res.player.role) setAssignedRole(res.player.role);
          if (res.mafiaTeam !== undefined) setMafiaTeam(res.mafiaTeam);
          if (res.sibling !== undefined) setSibling(res.sibling); // ðŸ‘¥ Ø§Ù„Ø£Ø®
          if (res.assassinContracts) setAssassinContracts(res.assassinContracts);
          if (!res.player.isAlive) {
            setIsPlayerDead(true);
            setCardFlipped(true);
          }
          // Ø­ÙØ¸ Ø§Ù„Ø¬Ù„Ø³Ø©
          localStorage.setItem('mafia_session', JSON.stringify({
            roomId: effectiveRoomId, physicalId: res.player.physicalId, phone: normalized,
            displayName: res.player.name, roomCode, playerId: pid,
          }));
          setStep('rejoined');
          return;
        }
      } catch {}
    }

    // 2. Ø¬Ø±Ù‘Ø¨ /me endpoint Ù„Ù„Ø¨Ø­Ø« Ø¹Ù† Ù„Ø¹Ø¨Ø© Ù†Ø´Ø·Ø©
    try {
      const meRes = await fetch('/api/player-auth/me', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const meData = await meRes.json();
      if (meData.success && meData.activeGame && meData.activeGame.roomId) {
        const ag = meData.activeGame;
        // Ø¥Ø°Ø§ Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ù†Ø´Ø·Ø© Ù‡ÙŠ Ù†ÙØ³ Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ© â†’ Ø¯Ø®ÙˆÙ„ Ù…Ø¨Ø§Ø´Ø±
        if (!effectiveRoomId || ag.roomId === effectiveRoomId) {
          setRoomId(ag.roomId);
          setRoomCode(ag.roomCode || roomCode);
          setPhysicalId(String(ag.physicalId));
          setGameName(ag.gameName || gameName);
          if (ag.role) setAssignedRole(ag.role);
          if (ag.isAlive === false) {
            setIsPlayerDead(true);
            setCardFlipped(true);
          }
          localStorage.setItem('mafia_session', JSON.stringify({
            roomId: ag.roomId, physicalId: ag.physicalId,
            phone: playerPhone.startsWith('0') ? playerPhone : '0' + playerPhone,
            displayName, roomCode: ag.roomCode || roomCode, playerId: pid,
          }));
          setStep('rejoined');
          return;
        }

        // â”€â”€ Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ù†Ø´Ø·Ø© Ù…Ø®ØªÙ„ÙØ© Ø¹Ù† Ø§Ù„Ù‡Ø¯Ù â†’ Ø¹Ø±Ø¶ ØªØ£ÙƒÙŠØ¯ Ø§Ù„ØªØ¨Ø¯ÙŠÙ„ â”€â”€
        if (effectiveRoomId && ag.roomId !== effectiveRoomId) {
          setSwitchConfirm({
            currentRoomId: ag.roomId,
            currentGameName: ag.gameName || 'ØºØ±ÙØ© Ù†Ø´Ø·Ø©',
            targetRoomId: effectiveRoomId,
            targetGameName: gameName || 'ØºØ±ÙØ© Ø¬Ø¯ÙŠØ¯Ø©',
          });
          return;
        }
      }
    } catch {}

    // 3. Ù„Ø§ Ù„Ø¹Ø¨Ø© Ù†Ø´Ø·Ø© â†’ Ø§Ù†Ø¶Ù…Ø§Ù… ØªÙ„Ù‚Ø§Ø¦ÙŠ
    const needTicket = ticketRequired ?? requireTicket;
    // Ø¥Ø°Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù…Ø³Ø¬Ù„ (Ø¹Ù†Ø¯Ù‡ playerId) â†’ Ù†Ø±Ø³Ù„ auto-join Ù…Ø¨Ø§Ø´Ø±Ø©
    // Ø§Ù„Ø¨Ø§ÙƒØ¥Ù†Ø¯ ÙŠÙØ­Øµ Ø¥Ø°Ø§ Ø¹Ù†Ø¯Ù‡ ØªØ°ÙƒØ±Ø© Ù…Ø³Ø¨Ù‚Ø© Ù„Ù†ÙØ³ Ø§Ù„Ù†Ø´Ø§Ø· ÙˆÙŠØªØ®Ø·Ù‰ Ø§Ù„Ø³Ø¤Ø§Ù„
    if (needTicket && pid) {
      setStep('auto_joining');
      setTimeout(() => handleAutoJoin(false, undefined, effectiveRoomId), 100);
    } else if (needTicket) {
      setStep('ticket');
    } else {
      setStep('auto_joining');
      setTimeout(() => handleAutoJoin(false, undefined, effectiveRoomId), 100);
    }
  };

  // â”€â”€ ØªÙ†ÙÙŠØ° Ø§Ù„ØªØ¨Ø¯ÙŠÙ„ Ø¨ÙŠÙ† Ø§Ù„ØºØ±Ù â”€â”€
  const handleSwitchRoom = async () => {
    if (!switchConfirm || !emit) return;
    setSwitchLoading(true);
    try {
      const normalized = phone.startsWith('0') ? phone : '0' + phone;
      // 1. ØªØ¬Ù…ÙŠØ¯ Ø§Ù„Ù„Ø§Ø¹Ø¨ ÙÙŠ Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ©
      await emit('room:freeze-player', {
        roomId: switchConfirm.currentRoomId,
        phone: normalized,
        playerId: playerId || undefined,
      });

      // 2. Ù…Ø³Ø­ Ø§Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø©
      localStorage.removeItem('mafia_session');

      // 3. Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ù„Ø§Ø®ØªÙŠØ§Ø± Ù…Ù‚Ø¹Ø¯ ÙÙŠ Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©
      setRoomId(switchConfirm.targetRoomId);
      setAssignedRole(null);
      setCardFlipped(false);
      setIsPlayerDead(false);
      setPhysicalId('');
      setSwitchConfirm(null);
    setStep(requireTicket ? 'ticket' : 'auto_joining');
    // Ø¥Ø°Ø§ Ù„Ø§ ØªØ°ÙƒØ±Ø© Ù…Ø·Ù„ÙˆØ¨Ø© â†’ Ø¨Ø¯Ø¡ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ Ù…Ø¨Ø§Ø´Ø±Ø©
    if (!requireTicket) {
      setTimeout(() => handleAutoJoin(false), 100);
    }
    } catch (err: any) {
      setApiError(err.message || 'ÙØ´Ù„ ÙÙŠ Ø§Ù„ØªØ¨Ø¯ÙŠÙ„');
    } finally {
      setSwitchLoading(false);
    }
  };

  // â”€â”€ Ø§Ù„Ø®Ø·ÙˆØ© 3Ø¨: ØªØ³Ø¬ÙŠÙ„ Ø­Ø³Ø§Ø¨ Ø¬Ø¯ÙŠØ¯ â”€â”€
  const handleRegister = async () => {
    setApiError('');
    const normalized = phone.startsWith('0') ? phone : '0' + phone;
    const dateOfBirth = dobYear && dobMonth && dobDay
      ? `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`
      : null;

    if (!password || password.length < 4) {
      setApiError('ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† 4 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„');
      return;
    }

    try {
      const res = await fetch('/api/player-auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalized,
          password,
          name: displayName,
          gender: gender || 'MALE',
          dob: dateOfBirth,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPlayerToken(data.token);
        localStorage.setItem('mafia_player_token', data.token);
        setPlayerId(data.player.id);
        localStorage.setItem('mafia_playerId', String(data.player.id));
        // Ù„Ø§Ø¹Ø¨ Ø¬Ø¯ÙŠØ¯ â€” Ù…Ø³ØªØ­ÙŠÙ„ ÙŠÙƒÙˆÙ† Ø¬ÙˆØ§ Ù„Ø¹Ø¨Ø©ØŒ ÙŠØ±ÙˆØ­ Ø¹Ù„Ù‰ Ø§Ø®ØªÙŠØ§Ø± Ù…Ù‚Ø¹Ø¯
        setStep(requireTicket ? 'ticket' : 'auto_joining');
        if (!requireTicket) {
          setTimeout(() => handleAutoJoin(false), 100);
        }
      } else {
        setApiError(data.error);
      }
    } catch (err) {
      setApiError('Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø§ØªØµØ§Ù„');
    }
  };

  // â”€â”€ ØªØºÙŠÙŠØ± ÙƒÙ„Ù…Ø© Ø§Ù„Ø³Ø± (Ù„Ù„Ø§Ø¹Ø¨ÙŠÙ† Ø§Ù„Ù…Ù‡Ø§Ø¬Ø±ÙŠÙ†) â”€â”€
  const handleChangePassword = async () => {
    setApiError('');
    if (!newPassword || newPassword.length < 4) {
      setApiError('ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† 4 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„');
      return;
    }
    try {
      const res = await fetch('/api/player-auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${playerToken}`,
        },
        body: JSON.stringify({ oldPassword: password, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) {
          setPlayerToken(data.token);
          localStorage.setItem('mafia_player_token', data.token);
        }
        setMustChangePassword(false);
        await tryRejoinCurrentRoom(playerId!, data.token || playerToken!);
      } else {
        setApiError(data.error);
      }
    } catch (err) {
      setApiError('Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø§ØªØµØ§Ù„');
    }
  };

  // â”€â”€ Ø§Ù„Ø®Ø·ÙˆØ© 4: Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ Ù„Ù„Ø¹Ø¨Ø© â”€â”€
  const handleAutoJoin = async (forceJoin: boolean = false, ticket?: string, roomIdOverride?: string) => {
    if (!displayName) return;
    const effectiveRoomId = roomIdOverride || roomId;
    if (!effectiveRoomId) {
      setApiError('Ù„Ù… ÙŠØªÙ… ØªØ­Ø¯ÙŠØ¯ Ø§Ù„ØºØ±ÙØ©');
      return;
    }
    setApiError('');
    setStep('auto_joining');
    try {
      const dateOfBirth = dobYear && dobMonth && dobDay
        ? `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`
        : undefined;
      const genderUpper = gender === 'female' ? 'FEMALE' : gender === 'male' ? 'MALE' : undefined;
      
      // âš ï¸ Ù„Ø§ Ù†Ø±Ø³Ù„ preferredSeat â€” Ø§Ù„Ø¨Ø§ÙƒØ¥Ù†Ø¯ ÙŠÙˆØ²Ø¹ Ø¹Ø´ÙˆØ§Ø¦ÙŠØ§Ù‹ Ø¯Ø§Ø¦Ù…Ø§Ù‹ Ø¹Ù†Ø¯ auto-join
      // Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù†ÙØ³ Ø§Ù„Ø±Ù‚Ù… ØªÙØ¹Ø§Ù„Ø¬ Ø¹Ø¨Ø± 'room:rejoin-player' ÙˆÙ„ÙŠØ³ 'room:auto-join'
      const res = await joinRoom(effectiveRoomId, displayName, phone, playerId || undefined, genderUpper, dateOfBirth, forceJoin, ticket || ticketNumber || undefined, undefined);

      const assignedSeat = res?.assignedSeat;
      if (assignedSeat) {
        setPhysicalId(String(assignedSeat));
      }
      if (res?.isRemote != null) setIsRemote(!!res.isRemote); // ðŸŒ ÙƒØ´Ù Ù…Ø¨ÙƒØ± Ù„Ù„ØºØ±ÙØ© Ø§Ù„Ø¨Ø¹ÙŠØ¯Ø©

      // Ø­ÙØ¸ Ø§Ù„Ø¬Ù„Ø³Ø© ÙÙŠ localStorage
      localStorage.setItem('mafia_session', JSON.stringify({
        roomId: effectiveRoomId,
        physicalId: assignedSeat || 0,
        phone,
        displayName,
        roomCode,
        playerId: playerId || null,
      }));

      // Ù…Ø³Ø­ Ø¹Ù„Ø§Ù…Ø© Ø§Ù„Ø®Ø±ÙˆØ¬ â€” Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø§Ù†Ø¶Ù… Ø¨Ù†Ø¬Ø§Ø­
      localStorage.removeItem('mafia_user_exited');
      localStorage.removeItem('mafia_held_seat'); // ØªÙ†Ø¸ÙŠÙ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ù‚Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø¬ÙˆØ²
      setJoinConfirmation(null);
      setStep('done');
    } catch (err: any) {
      const errMsg = err.message || err.response?.error || '';
      // Ø§Ø³ØªØ¨ÙŠØ§Ù†Ø§Øª Ø¥Ù„Ø²Ø§Ù…ÙŠØ© Ù…Ø¹Ù„Ù‘Ù‚Ø© â†’ ØªÙˆØ¬ÙŠÙ‡ Ù„Ø¥ÙƒÙ…Ø§Ù„Ù‡Ø§ Ù‚Ø¨Ù„ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù…
      if (err.response?.code === 'PENDING_SURVEYS') {
        setApiError(err.response.error || 'ÙŠØ¬Ø¨ Ø¥ÙƒÙ…Ø§Ù„ Ø§Ø³ØªØ¨ÙŠØ§Ù†Ø§Øª ÙØ¹Ø§Ù„ÙŠØ§ØªÙƒ Ø§Ù„Ø³Ø§Ø¨Ù‚Ø© Ù‚Ø¨Ù„ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù…');
        setTimeout(() => { window.location.href = '/player/feedback'; }, 1500);
        return;
      }
      // Ø¥Ø°Ø§ Ø§Ù„Ø®Ø·Ø£ Ù…ØªØ¹Ù„Ù‚ Ø¨Ø§Ù„ØªØ°ÙƒØ±Ø© â†’ Ù†Ø¹Ø±Ø¶ Ø´Ø§Ø´Ø© Ø¥Ø¯Ø®Ø§Ù„ Ø§Ù„ØªØ°ÙƒØ±Ø© Ù…Ø¨Ø§Ø´Ø±Ø©
      const isTicketError = errMsg.includes('Ø§Ù„ØªØ°ÙƒØ±Ø©') || errMsg.includes('ticket');
      if (err.response?.requiresConfirmation) {
        setJoinConfirmation({ message: err.response.error });
        setStep(isTicketError || requireTicket ? 'ticket' : 'auto_joining');
      } else {
        setApiError(errMsg || 'Ø­Ø¯Ø« Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù…');
        setStep(isTicketError || requireTicket ? 'ticket' : 'auto_joining');
      }
    }
  };

  // â”€â”€ Ø¯Ø§Ù„Ø© Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© (Ù„Ù„ØªÙˆØ§ÙÙ‚ Ù…Ø¹ confirmation dialog) â”€â”€
  const handleJoinGame = async (forceJoin: boolean = false) => {
    await handleAutoJoin(forceJoin);
  };

  return (
    <div className={`min-h-screen flex flex-col items-center font-sans relative overflow-hidden selection:bg-[#8A0303] selection:text-white ${isRemote ? 'justify-start p-2 pt-3 pb-24 bg-[#050505] remote-vignette' : 'justify-center p-4 sm:p-6 display-bg blood-vignette'}`}>
      {/* â”€â”€ Dynamic Toast Notification Overlay â”€â”€ */}
      <AnimatePresence>
        {activeToast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className="fixed top-6 left-4 right-4 sm:left-auto sm:right-6 z-50 w-auto sm:max-w-md"
          >
            <div
              className={`p-4 rounded-xl border backdrop-blur-md shadow-2xl flex items-center gap-3 ${
                activeToast.type === 'penalty'
                  ? 'bg-red-950/90 border-red-500/40 text-red-200 shadow-red-950/20'
                  : activeToast.type === 'warning'
                  ? 'bg-amber-950/90 border-amber-500/40 text-amber-200 shadow-amber-950/20'
                  : activeToast.type === 'success'
                  ? 'bg-green-950/90 border-green-500/40 text-green-200 shadow-green-950/20'
                  : 'bg-neutral-900/90 border-[#C5A059]/40 text-gray-200'
              }`}
            >
              <div className="text-xl shrink-0">
                {activeToast.type === 'penalty' && 'ðŸ”´'}
                {activeToast.type === 'warning' && 'âš ï¸'}
                {activeToast.type === 'success' && 'âœ…'}
                {activeToast.type === 'info' && 'â„¹ï¸'}
              </div>
              <div className="flex-1 font-bold text-sm text-right" style={{ fontFamily: 'Amiri, serif' }}>
                {activeToast.message}
              </div>
              <button
                onClick={() => setActiveToast(null)}
                className="text-gray-400 hover:text-white shrink-0 text-xs font-mono ml-2 p-1"
              >
                âœ•
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* â”€â”€ Penalty Alert Modal Prompt â”€â”€ */}
      <AnimatePresence>
        {penaltyAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#111] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden text-center"
            >
              {/* Top accent glow */}
              <div className="absolute top-0 left-0 w-full h-[3px] bg-red-600 animate-pulse" />
              
              <div className="mb-4 text-red-500 flex justify-center text-4xl animate-bounce">
                âš ï¸
              </div>
              
              <h3 className="text-red-500 text-xl font-bold mb-3" style={{ fontFamily: 'Amiri, serif' }}>ØªÙ†Ø¨ÙŠÙ‡ Ù…Ø®Ø§Ù„ÙØ© Ø§Ù„Ù‚ÙˆØ§Ù†ÙŠÙ†!</h3>
              
              <p className="text-white mb-5 text-sm leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
                {penaltyAlert.message}
              </p>
              
              {/* Warning dots in modal */}
              <div className="flex justify-center gap-2 mb-6">
                {Array.from({ length: penaltyAlert.maxPenalties }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-4 h-4 rounded-full ${
                      i < penaltyAlert.penalties
                        ? 'bg-red-600 shadow-[0_0_8px_#dc2626]'
                        : 'bg-neutral-800 border border-neutral-700'
                    }`}
                  />
                ))}
              </div>
              
              <p className="text-[#888] text-xs mb-6 font-mono">
                PENALTIES: {penaltyAlert.penalties} / {penaltyAlert.maxPenalties}
              </p>
              
              <button
                onClick={() => setPenaltyAlert(null)}
                className="w-full py-3 rounded-xl bg-red-900 hover:bg-red-800 text-white font-mono text-sm shadow-[0_0_15px_rgba(138,3,3,0.4)] transition-all font-bold"
              >
                ÙÙ‡Ù…Øª ÙˆØªØ¹Ù‡Ø¯Øª Ø¨Ø§Ù„Ø§Ù„ØªØ²Ø§Ù…
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {joinConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#111] border border-[#C5A059]/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-[#C5A059] text-xl font-bold mb-4 text-center">ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„</h3>
              <p className="text-white text-center mb-6 text-sm leading-relaxed">{joinConfirmation.message}</p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setJoinConfirmation(null)}
                  className="flex-1 py-3 rounded-xl border border-[#333] text-[#888] font-mono text-sm hover:bg-[#222] transition-colors"
                >
                  Ø¥Ù„ØºØ§Ø¡
                </button>
                <button
                  onClick={() => handleJoinGame(true)}
                  className="flex-1 py-3 rounded-xl bg-[#8A0303] text-white font-mono text-sm shadow-[0_0_15px_rgba(138,3,3,0.4)] hover:bg-[#a00404] transition-colors"
                >
                  Ù…ÙˆØ§ÙÙ‚ØŒ Ø§Ù†ØªÙ‚Ù„
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ðŸ“¨ ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø¯Ø¹ÙˆØ© Ù‚Ø¨Ù„ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… */}
      <AnimatePresence>
        {invitePrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#0c0c0c] border border-sky-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
              <div className="text-4xl mb-3">ðŸ“¨</div>
              <h3 className="text-sky-300 text-xl font-black mb-2" style={{ fontFamily: 'Amiri, serif' }}>Ø¯Ø¹ÙˆØ© Ù„Ù„Ø§Ù†Ø¶Ù…Ø§Ù…</h3>
              <p className="text-white text-base leading-relaxed mb-1">Ù‡Ù„ ØªØ±ÙŠØ¯ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ø¥Ù„Ù‰ ØºØ±ÙØ© Â«<b className="text-sky-300">{invitePrompt.roomName}</b>Â»ØŸ</p>
              <p className="text-[#888] text-xs mb-6">Ø¯Ø¹Ø§Ùƒ <b className="text-[#C5A059]">{invitePrompt.inviterName}</b></p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setInvitePrompt(null); try { window.location.assign('/player/home'); } catch { /* ignore */ } }}
                  className="flex-1 py-3 rounded-xl border border-[#333] text-[#888] font-mono text-sm hover:bg-[#222] transition-colors"
                >
                  Ù„ÙŠØ³ Ø§Ù„Ø¢Ù†
                </button>
                <button
                  onClick={() => { setInvitePrompt(null); setInviteConfirmed(true); }}
                  className="flex-1 py-3 rounded-xl bg-sky-600 text-white font-bold text-sm shadow-[0_0_15px_rgba(2,132,199,0.4)] hover:bg-sky-500 transition-colors"
                >
                  Ø§Ù†Ø¶Ù…Ø§Ù…
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {inviteError && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#0c0c0c] border border-[#333] rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
              <div className="text-4xl mb-3">ðŸšª</div>
              <p className="text-white text-base leading-relaxed mb-6">{inviteError}</p>
              <button
                onClick={() => { setInviteError(''); try { window.location.assign('/player/home'); } catch { /* ignore */ } }}
                className="w-full py-3 rounded-xl bg-[#1a1a1a] border border-[#333] text-white font-mono text-sm hover:bg-[#222] transition-colors"
              >
                Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„Ø±Ø¦ÙŠØ³ÙŠØ©
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ðŸ“¨ Ù…ÙˆØ¯Ø§Ù„ Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¯Ø¹ÙˆØ© (Ù„Ù„Ø§Ø¹Ø¨ Ø§Ù„Ù…ØµØ±Ù‘Ø­ Ù„Ù‡) */}
      {showInvite && isRemote && roomId && (
        <InviteModal roomId={roomId} emit={emit} onClose={() => setShowInvite(false)} />
      )}

      {/* ðŸŽ© Ø¨Ø±ÙˆÙ…Ø¨Øª Ù‚Ø±Ø§Ø± Ø§Ù„Ø¹Ù…Ø¯Ø© â€” ÙŠØµÙ„ Ù„Ù‡Ø§ØªÙ Ø§Ù„Ø¹Ù…Ø¯Ø© ÙˆØ­Ø¯Ù‡ (Ø§Ù„Ù„Ø¹Ø¨ Ø¹Ù† Ø¨ÙØ¹Ø¯) */}
      <AnimatePresence>
        {mayorPrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md" dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 24 }} animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm rounded-2xl p-5 border-2 border-[#C5A059] shadow-[0_0_40px_rgba(197,160,89,0.3)]"
              style={{ background: 'linear-gradient(170deg,#1d160c,#0f0b06)' }}
            >
              <div className="text-center text-4xl mb-1">ðŸŽ©</div>
              <h3 className="text-center text-[#C5A059] font-black text-lg">Ø£Ù†Øª Ø§Ù„Ø¹Ù…Ø¯Ø© â€” Ù„Ø­Ø¸Ø© Ø§Ù„Ù‚Ø±Ø§Ø±</h3>
              <p className="text-center text-[11px] text-[#9a8f7d] mb-1 leading-relaxed">
                Ù†ØªÙŠØ¬Ø© Ø§Ù„ØªØµÙˆÙŠØª: Ø¥Ø¹Ø¯Ø§Ù…{' '}
                <b className="text-[#ff6b64]">
                  {mayorPrompt.winner?.type === 'DEAL'
                    ? `ØµÙÙ‚Ø© #${mayorPrompt.winner?.initiatorPhysicalId} â† #${mayorPrompt.winner?.targetPhysicalId}`
                    : `#${mayorPrompt.winner?.targetPhysicalId} ${mayorPrompt.winner?.targetName || ''}`}
                </b>{' '}({mayorPrompt.topVotes} Ø£ØµÙˆØ§Øª)
              </p>
              <p className="text-center text-[10px] text-[#655c4e] mb-3">â³ {mayorPromptLeft} Ø«Ø§Ù†ÙŠØ© â€” ÙˆØ¨Ø¹Ø¯Ù‡Ø§ ÙŠØ­Ø³Ù… Ø§Ù„Ù…ÙˆØ¬Ù‘Ù‡</p>
              <div className="space-y-2">
                <button
                  onClick={() => sendMayorDecision('REVOTE')}
                  disabled={mayorSending}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#3b6fd4,#2b4f9e)', border: '1px solid #4f8ef7' }}
                >
                  ðŸ”„ Ø£ÙƒØ´Ù Ù†ÙØ³ÙŠ â€” Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ù… ÙˆØªØµÙˆÙŠØª Ø¬Ø¯ÙŠØ¯ Ø¹Ù„Ù‰ Ø§Ù„Ø¬Ù…ÙŠØ¹
                </button>
                <button
                  onClick={() => sendMayorDecision('POSTPONE')}
                  disabled={mayorSending}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#7a4b8f,#5b3570)', border: '1px solid #9b6dd6' }}
                >
                  ðŸŒ™ Ø£ÙƒØ´Ù Ù†ÙØ³ÙŠ â€” ØªØ£Ø¬ÙŠÙ„: Ù„Ø§ Ù…ÙˆØª Ø§Ù„ÙŠÙˆÙ…
                </button>
                <button
                  onClick={() => sendMayorDecision('PASS')}
                  disabled={mayorSending}
                  className="w-full py-2.5 rounded-xl text-sm border border-[#4a3f31] text-[#9a8f7d] disabled:opacity-50"
                >
                  ðŸ¤ Ø£Ø¨Ù‚Ù‰ Ù…Ø®ÙÙŠÙ‘Ø§Ù‹ â€” Ù†ÙÙ‘Ø°ÙˆØ§ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ù…
                </button>
              </div>
              <p className="text-center text-[10px] text-[#9a9a9a] mt-3">Ø§Ù„ÙƒØ´Ù Ø¯Ø§Ø¦Ù… Ù„Ù„Ø¬Ù…ÙŠØ¹ + ØµÙˆØªÙƒ Ã—{mayorPrompt.voteWeight || 2} ÙÙˆØ±Ø§Ù‹ + Ø§Ù„Ù‚Ø¯Ø±Ø© ØªÙØ³ØªÙ‡Ù„Ùƒ (Ù…Ø±Ù‘Ø© ÙˆØ§Ø­Ø¯Ø©)</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ðŸŽ© Ø¥Ø¹Ù„Ø§Ù† ÙƒØ´Ù Ø§Ù„Ø¹Ù…Ø¯Ø© â€” Ù„ÙƒÙ„Ù‘ Ø§Ù„Ù„Ø§Ø¹Ø¨ÙŠÙ† */}
      <AnimatePresence>
        {mayorBanner && (
          <motion.div
            initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
            className="fixed top-4 inset-x-4 z-[84] flex justify-center" dir="rtl"
          >
            <div className="max-w-sm w-full rounded-2xl px-4 py-3 border border-[#C5A059] text-center shadow-[0_0_30px_rgba(197,160,89,0.25)]"
              style={{ background: 'linear-gradient(170deg,#1d160c,#0f0b06)' }}>
              <p className="text-[#C5A059] font-black text-sm">ðŸŽ© Ø§Ù„Ø¹Ù…Ø¯Ø© ÙŠÙƒØ´Ù Ù†ÙØ³Ù‡: #{mayorBanner.physicalId} {mayorBanner.name}</p>
              <p className="text-[#9a8f7d] text-[11px] mt-0.5">
                {mayorBanner.decision === 'REVOTE' ? 'Ø£ÙÙ„ØºÙŠ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ù… â€” ØªØµÙˆÙŠØª Ø¬Ø¯ÙŠØ¯ Ø¹Ù„Ù‰ Ø§Ù„Ø¬Ù…ÙŠØ¹' : 'Ø£ÙÙ„ØºÙŠ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ù… â€” Ù„Ø§ Ù…ÙˆØª Ø§Ù„ÙŠÙˆÙ…'}
                {' '}â€¢ ØµÙˆØªÙ‡ ÙŠÙØ­Ø³Ø¨ âš–ï¸Ã—{mayorBanner.voteWeight || 2}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ðŸŽ© Ø´Ø§Ø±Ø© Ø¯Ø§Ø¦Ù…Ø© Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„ØªØµÙˆÙŠØª: Ø¹Ù…Ø¯Ø© Ù…ÙƒØ´ÙˆÙ */}
      {gamePhase === 'DAY_VOTING' && mayorRevealedId !== null && !mayorBanner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[40]" dir="rtl">
          <span className="text-[10px] px-2.5 py-1 rounded-full border border-[#C5A059]/60 text-[#C5A059] bg-[#151007]/90">
            {mayorRevealedId === parseInt(physicalId) ? `âš–ï¸ Ø£Ù†Øª Ø§Ù„Ø¹Ù…Ø¯Ø© â€” ØµÙˆØªÙƒ ÙŠÙØ­Ø³Ø¨ Ã—${mayorWeight}` : `ðŸŽ© Ø§Ù„Ø¹Ù…Ø¯Ø© #${mayorRevealedId} â€” ØµÙˆØªÙ‡ Ã—${mayorWeight}`}
          </span>
        </div>
      )}

      {isExpelled ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 sm:p-10 rounded-2xl bg-[#1a0505]/85 backdrop-blur-md border border-red-800/40 shadow-[0_0_50px_rgba(138,3,3,0.3)] text-center relative z-10 overflow-hidden font-sans"
        >
          {/* Glowing pulse effect */}
          <div className="absolute -top-12 -left-12 w-24 h-24 bg-red-600/20 rounded-full blur-2xl animate-pulse" />
          <div className="absolute -bottom-12 -right-12 w-24 h-24 bg-red-600/20 rounded-full blur-2xl animate-pulse" />
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-red-600 to-transparent" />
          
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-red-600/30 rounded-full blur-md animate-ping" />
              <div className="w-20 h-20 bg-red-950/80 border border-red-500/50 rounded-full flex items-center justify-center text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            </div>
          </div>
          
          <h2 className="text-3xl font-black text-red-500 mb-4" style={{ fontFamily: 'Amiri, serif' }}>
            ØªÙ… Ø§Ø³ØªØ¨Ø¹Ø§Ø¯Ùƒ Ù…Ù† Ø§Ù„Ù„Ø¹Ø¨Ø©!
          </h2>
          
          <div className="bg-black/40 border border-red-950 rounded-xl p-4 mb-6">
            <p className="text-gray-400 text-xs font-mono uppercase tracking-widest mb-2">REASON FOR EXPULSION</p>
            <p className="text-white text-base leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
              {expulsionReason || 'Ù„Ù‚Ø¯ ØªÙ… Ø§Ø³ØªØ¨Ø¹Ø§Ø¯Ùƒ Ø¨Ø³Ø¨Ø¨ Ø§Ù†ØªÙ‡Ø§Ùƒ Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ù„Ø¹Ø¨ ÙˆØªØ¬Ø§ÙˆØ² Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰ Ù„Ù„Ø¹Ù‚ÙˆØ¨Ø§Øª.'}
            </p>
          </div>
          
          <p className="text-red-400/80 text-xs leading-relaxed mb-8" style={{ fontFamily: 'Amiri, serif' }}>
            Ù„Ù‚Ø¯ ØªÙ… Ù…Ø³Ø­ Ø¬Ù„Ø³ØªÙƒ Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙˆØ®ØµÙ… Ù†Ù‚Ø§Ø· Ù…Ù† Ø±ØªØ¨ØªÙƒ (RR) ÙƒØ¹Ù‚ÙˆØ¨Ø© ØªÙ†Ø¸ÙŠÙ…ÙŠØ©. Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ù„Ø§Ù„ØªØ²Ø§Ù… Ø¨Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ù„Ø¹Ø¨ Ø§Ù„Ù†Ø¸ÙŠÙ ÙÙŠ Ø§Ù„Ù…Ø±Ø§Øª Ø§Ù„Ù‚Ø§Ø¯Ù…Ø©.
          </p>
          
          <button
            onClick={() => {
              setIsExpelled(false);
              setStep(initialRoomCode ? 'phone' : 'code');
            }}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-red-950 to-red-800 border border-red-700/50 text-white font-mono text-sm tracking-widest font-black shadow-[0_0_20px_rgba(138,3,3,0.4)] hover:from-red-900 hover:to-red-750 transition-all active:scale-98"
          >
            Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„Ø´Ø§Ø´Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©
          </button>
        </motion.div>
      ) : (
        <>
          {/* â”€â”€ Title: MAFIA CLUB + Logo (Ù…Ø®ÙÙŠÙ‘ Ø¹Ù† Ø¨ÙØ¹Ø¯ â€” ÙˆØ§Ø¬Ù‡Ø© Ù…Ù„Ø¡ Ø§Ù„Ø´Ø§Ø´Ø© Ø¨Ù„Ø§ Ù„ÙˆØ¬Ùˆ) â”€â”€ */}
          {!isRemote && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-center gap-4 md:gap-6 mb-8 relative z-10 w-full max-w-md"
          >
            {/* Ø§Ù„Ù†ØµÙˆØµ */}
            <h1 className="text-center md:text-right">
              <span
                className="block text-4xl md:text-5xl font-black tracking-tight text-[#C5A059]"
                style={{
                  fontFamily: 'Amiri, serif',
                  textShadow: '0 0 30px rgba(138,3,3,0.4)',
                }}
              >
                MAFIA
              </span>
              <span
                dir="ltr"
                className="flex justify-between text-xl md:text-2xl font-light text-[#8A0303] mt-1 w-full"
                style={{
                  fontFamily: 'Amiri, serif',
                  textShadow: '0 0 20px rgba(138,3,3,0.3)',
                }}
              >
                {'CLUB'.split('').map((letter, i) => (
                  <span key={i}>{letter}</span>
                ))}
              </span>
            </h1>

            {/* Ø§Ù„Ù„ÙˆØ¬Ùˆ */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.3 }}
              className="shrink-0"
            >
              <Image
                src="/mafia_logo.png"
                alt="Mafia Club Logo"
                width={80}
                height={80}
                className="select-none w-[60px] h-[60px] md:w-[80px] md:h-[80px] drop-shadow-[0_0_20px_rgba(138,3,3,0.3)]"
                priority
              />
            </motion.div>
          </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`w-full rounded-xl backdrop-blur-md relative z-10 ${isRemote ? 'max-w-lg p-2.5 shadow-none' : 'max-w-md p-8 sm:p-10 bg-black/50 border border-[#2a2a2a] shadow-[0_0_40px_rgba(0,0,0,0.8)]'}`}
          >
        {!isRemote && <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#8A0303]/60 to-transparent opacity-80 rounded-t-xl" />}
        
        <AnimatePresence mode="wait">

          {/* â”€â”€ Ø®Ø·ÙˆØ© 1: ÙƒÙˆØ¯ Ø§Ù„Ù„Ø¹Ø¨Ø© â”€â”€ */}
          {step === 'code' && (
            <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center"><OperationIcon /></div>
                <h1 className="text-3xl font-black mb-2 text-white" style={{ fontFamily: 'Amiri, serif' }}>Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù… Ù„Ù„Ø¹Ù…Ù„ÙŠØ©</h1>
                <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em]">INPUT SECURE OPERATION CODE</p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="----"
                className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center font-mono text-4xl tracking-[0.4em] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] focus:outline-none transition-colors mb-6 placeholder-[#222]"
                maxLength={4}
                autoFocus
              />

              {apiError && <p className="text-[#8A0303] text-[11px] font-mono text-center mb-4 bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <button
                onClick={() => handleFindRoom()}
                disabled={roomCode.length !== 4 || !isConnected}
                className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
              >
                <span>{isConnected ? 'ESTABLISH LINK' : 'CONNECTING...'}</span>
              </button>
            </motion.div>
          )}

          {/* â”€â”€ Ø®Ø·ÙˆØ© 2: Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ â”€â”€ */}
          {step === 'phone' && (
           <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center"><PhoneIcon /></div>
                <h1 className="text-2xl font-black mb-2 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>{gameName || 'Ø¹Ù…Ù„ÙŠØ© Ø¬Ø§Ø±ÙŠØ©'}</h1>
                <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em]">AGENT IDENTIFICATION</p>
              </div>

              {initialRoomCode && !roomId && !apiError && !userExited && (
                <div className="text-center mb-4">
                  <p className="text-[#C5A059] text-[10px] font-mono tracking-widest uppercase animate-pulse">LOCATING COMPONENT...</p>
                </div>
              )}

              {initialRoomCode && apiError && !roomId && (
                <div className="text-center mb-6">
                  <p className="text-[#8A0303] text-xs font-mono tracking-widest uppercase">{apiError}</p>
                </div>
              )}

              {(roomId || !initialRoomCode || userExited) && (
                <>
                  <div className="flex items-center gap-2 mb-6 font-mono">
                    <span className="bg-black/40 border border-[#2a2a2a] rounded-lg px-4 py-4 text-[#808080] text-sm shrink-0">
                      +962
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="7XXXXXXXX"
                      className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-lg tracking-widest focus:border-[#C5A059] focus:outline-none transition-colors"
                      maxLength={10}
                      autoFocus
                    />
                  </div>

                  {apiError && roomId && <p className="text-[#8A0303] text-[11px] font-mono text-center mb-4 bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

                  <button
                    onClick={handlePhoneLookup}
                    disabled={phone.length < 9}
                    className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
                  >
                    <span>VERIFY IDENTITY</span>
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* â”€â”€ Ø®Ø·ÙˆØ© 3: Ø§Ù„ØªØ³Ø¬ÙŠÙ„ (Ù„Ù„Ø¬Ø¯Ø¯) â”€â”€ */}
          {step === 'register' && (
            <motion.div key="register" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-6 border-b border-[#2a2a2a]/40 pb-6">
                <h2 className="text-2xl font-black mb-1 text-white" style={{ fontFamily: 'Amiri, serif' }}>Ù‡ÙˆÙŠØ© Ø¬Ø¯ÙŠØ¯Ø©</h2>
                <p className="text-[#808080] text-[10px] font-mono tracking-[0.2em] uppercase">NEW DOSSIER REGISTRATION</p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Codename</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ø§Ù„Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ¹Ø§Ø±"
                    className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none transition-colors"
                    maxLength={20}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Date of Birth</label>
                  <div className="grid grid-cols-3 gap-2 font-mono">
                    <select
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                      className="p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none text-xs"
                    >
                      <option value="">DD</option>
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                      ))}
                    </select>
                    <select
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                      className="p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none text-xs"
                    >
                      <option value="">MM</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                      ))}
                    </select>
                    <select
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      className="p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none text-xs"
                    >
                      <option value="">YYYY</option>
                      {Array.from({ length: 50 }, (_, i) => {
                        const year = new Date().getFullYear() - 8 - i;
                        return <option key={year} value={String(year)}>{year}</option>;
                      })}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Classification</label>
                  <div className="grid grid-cols-2 gap-3 font-mono">
                    <button
                      onClick={() => setGender('male')}
                      className={`p-3 rounded-lg border text-center text-sm font-bold tracking-widest transition-all ${
                        gender === 'male'
                          ? 'bg-blue-900/20 border-blue-500/50 text-blue-400'
                          : 'bg-black/40 border-[#2a2a2a] text-[#555] hover:border-[#555]'
                      }`}
                    >
                      â™‚ Ø°ÙƒØ±
                    </button>
                    <button
                      onClick={() => setGender('female')}
                      className={`p-3 rounded-lg border text-center text-sm font-bold tracking-widest transition-all ${
                        gender === 'female'
                          ? 'bg-purple-900/20 border-purple-500/50 text-purple-400'
                          : 'bg-black/40 border-[#2a2a2a] text-[#555] hover:border-[#555]'
                      }`}
                    >
                      â™€ Ø£Ù†Ø«Ù‰
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± (4 Ø£Ø­Ø±Ù+)"
                    className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none transition-colors font-mono tracking-widest"
                    minLength={4}
                  />
                </div>
              </div>

              {apiError && <p className="text-[#8A0303] text-[11px] font-mono text-center mt-4 bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <div className="mt-6">
                <button
                  onClick={handleRegister}
                  disabled={!displayName || !password || password.length < 4}
                  className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
                >
                  <span>SUBMIT DOSSIER</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* â”€â”€ Ø®Ø·ÙˆØ© 3Ø£: ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ (Ø­Ø³Ø§Ø¨ Ù…ÙˆØ¬ÙˆØ¯) â”€â”€ */}
          {step === 'login' && (
            <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-6 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center"><OperationIcon /></div>
                <h2 className="text-2xl font-black mb-1 text-white" style={{ fontFamily: 'Amiri, serif' }}>Ù…Ø±Ø­Ø¨Ø§Ù‹ {displayName}</h2>
                <p className="text-[#808080] text-[10px] font-mono tracking-[0.2em] uppercase">ENTER ACCESS CODE</p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±"
                    className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center font-mono text-2xl tracking-[0.3em] focus:border-[#C5A059] focus:outline-none transition-colors"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>
              </div>

              {apiError && <p className="text-[#8A0303] text-[11px] font-mono text-center mt-4 bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <div className="mt-6">
                <button
                  onClick={handleLogin}
                  disabled={!password}
                  className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
                >
                  <span>ACCESS GRANTED</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* â”€â”€ Ø®Ø·ÙˆØ© ØªØºÙŠÙŠØ± ÙƒÙ„Ù…Ø© Ø§Ù„Ø³Ø± (Ù„Ù„Ù…Ù‡Ø§Ø¬Ø±ÙŠÙ†) â”€â”€ */}
          {step === 'change_password' && (
            <motion.div key="change_pw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-6 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center"><OperationIcon /></div>
                <h2 className="text-2xl font-black mb-1 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>ØªØºÙŠÙŠØ± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±</h2>
                <p className="text-[#808080] text-[10px] font-mono tracking-[0.2em] uppercase">UPDATE YOUR ACCESS CODE</p>
              </div>

              <div className="space-y-4">
                <p className="text-[#C5A059]/80 text-xs text-center" style={{ fontFamily: 'Amiri, serif' }}>ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ø§Ù„Ø­Ø§Ù„ÙŠØ© Ù…Ø¤Ù‚ØªØ© â€” Ø§Ø®ØªØ± ÙƒÙ„Ù…Ø© Ù…Ø±ÙˆØ± Ø¬Ø¯ÙŠØ¯Ø©</p>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© (4 Ø£Ø­Ø±Ù+)"
                  className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center font-mono text-xl tracking-[0.3em] focus:border-[#C5A059] focus:outline-none transition-colors"
                  autoFocus
                  minLength={4}
                  onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                />
              </div>

              {apiError && <p className="text-[#8A0303] text-[11px] font-mono text-center mt-4 bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <div className="mt-6">
                <button
                  onClick={handleChangePassword}
                  disabled={!newPassword || newPassword.length < 4}
                  className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
                >
                  <span>UPDATE CODE</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* â”€â”€ Ø®Ø·ÙˆØ© 4: Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯ Ø§Ù„Ù…ØªØ§Ø­Ø© â”€â”€ */}
          {/* â”€â”€ Ø®Ø·ÙˆØ©: Ø¥Ø¯Ø®Ø§Ù„ Ø±Ù‚Ù… Ø§Ù„ØªØ°ÙƒØ±Ø© â”€â”€ */}
          {step === 'ticket' && (
            <motion.div key="ticket" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
                    <path d="M13 5v2"></path>
                    <path d="M13 17v2"></path>
                    <path d="M13 11v2"></path>
                  </svg>
                </div>
                <h2 className="text-2xl font-black mb-2 text-white truncate" style={{ fontFamily: 'Amiri, serif' }}>Ù…Ø±Ø­Ø¨Ø§Ù‹ {displayName}</h2>
                <p className="text-[#808080] text-sm" style={{ fontFamily: 'Amiri, serif' }}>Ø£Ø¯Ø®Ù„ Ø±Ù‚Ù… Ø§Ù„ØªØ°ÙƒØ±Ø© Ù„Ù„Ø¯Ø®ÙˆÙ„</p>
              </div>

              <div className="mb-6">
                <input
                  type="text"
                  value={ticketNumber}
                  onChange={e => setTicketNumber(e.target.value)}
                  placeholder="Ø±Ù‚Ù… Ø§Ù„ØªØ°ÙƒØ±Ø©"
                  dir="ltr"
                  className="w-full px-5 py-4 bg-black/40 border border-[#2a2a2a] rounded-xl text-center text-white text-2xl font-mono tracking-[0.3em] placeholder-[#333] focus:outline-none focus:border-[#C5A059]/50 focus:shadow-[0_0_15px_rgba(197,160,89,0.15)] transition-all"
                />
              </div>

              {apiError && <p className="text-[#8A0303] text-[11px] font-mono text-center mb-4 bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <button
                onClick={() => handleAutoJoin(false, ticketNumber)}
                disabled={!ticketNumber.trim() || loading}
                className="w-full py-4 text-lg font-black rounded-lg border-2 transition-all disabled:opacity-50"
                style={{
                  fontFamily: 'Amiri, serif',
                  background: !ticketNumber.trim() || loading ? '#222' : 'linear-gradient(135deg, #166534, #15803d)',
                  borderColor: !ticketNumber.trim() || loading ? '#333' : '#22c55e',
                  color: !ticketNumber.trim() || loading ? '#666' : '#fff',
                  boxShadow: !ticketNumber.trim() || loading ? 'none' : '0 0 25px rgba(34,197,94,0.4), 0 0 50px rgba(34,197,94,0.15)',
                  textShadow: !ticketNumber.trim() || loading ? 'none' : '0 0 10px rgba(34,197,94,0.5)',
                }}
              >
                {loading ? 'Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ù‚Ù‚...' : 'ðŸŽ« ØªØ­Ù‚Ù‚ ÙˆØ§Ø¯Ø®Ù„'}
              </button>
            </motion.div>
          )}

          {/* â”€â”€ Ø®Ø·ÙˆØ©: Ø¬Ø§Ø±ÙŠ ØªØ®ØµÙŠØµ Ø§Ù„Ù…Ù‚Ø¹Ø¯ â”€â”€ */}
          {step === 'auto_joining' && (
            <motion.div key="auto_joining" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-10">
              <div className="mb-6">
                <div className="w-16 h-16 border-3 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-4" />
              </div>
              <h2 className="text-xl font-black text-white mb-2" style={{ fontFamily: 'Amiri, serif' }}>Ø¬Ø§Ø±ÙŠ ØªØ®ØµÙŠØµ Ù…Ù‚Ø¹Ø¯Ùƒ...</h2>
              <p className="text-[#808080] text-sm" style={{ fontFamily: 'Amiri, serif' }}>ÙŠØªÙ… Ø§Ø®ØªÙŠØ§Ø± Ø£ÙØ¶Ù„ Ù…Ù‚Ø¹Ø¯ Ù„Ùƒ</p>
              {apiError && <p className="text-[#8A0303] text-xs font-mono text-center mt-4 bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}
            </motion.div>
          )}

          {/* â”€â”€ Ø®Ø·ÙˆØ© 5: ØªÙ… â”€â”€ */}
          {step === 'done' && (
           <motion.div key="done" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">

              {/* â”€â”€ Ø¨Ø§Ù†Ø± Ø§Ù„Ù…Ù‚Ø¹Ø¯ Ø§Ù„Ù…Ø®ØµØµ (Ù…Ø®ÙÙŠÙ‘ Ø¹Ù† Ø¨ÙØ¹Ø¯ â€” Ø§Ù„Ø·Ø§ÙˆÙ„Ø© ØªÙØ¸Ù‡Ø± Ù…Ù‚Ø¹Ø¯Ùƒ Ø¹Ù„Ù‰ ÙƒØ§Ø±Ø¯ Â«Ø£Ù†ØªÂ») â”€â”€ */}
              {!isRemote && physicalId && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                  className="mb-4 rounded-2xl p-5 relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(197,160,89,0.15), rgba(197,160,89,0.03))',
                    border: '2px solid rgba(197,160,89,0.4)',
                    boxShadow: '0 0 30px rgba(197,160,89,0.1), inset 0 0 30px rgba(197,160,89,0.05)',
                  }}
                >
                  <p className="text-[#808080] text-xs mb-1" style={{ fontFamily: 'Amiri, serif' }}>ðŸª‘ Ù…Ù‚Ø¹Ø¯Ùƒ Ø±Ù‚Ù…</p>
                  <p className="text-5xl font-black text-[#C5A059] mb-2" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 20px rgba(197,160,89,0.4)' }}>{physicalId}</p>
                  <p className="text-[#C5A059]/70 text-xs" style={{ fontFamily: 'Amiri, serif' }}>ÙŠØ±Ø¬Ù‰ Ø§Ù„Ø¬Ù„ÙˆØ³ ÙÙŠ Ù…Ù‚Ø¹Ø¯Ùƒ</p>
                </motion.div>
              )}              {/* â”€â”€ Ø£Ø²Ø±Ø§Ø± Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠ + ØªØ³Ø¬ÙŠÙ„ Ø®Ø±ÙˆØ¬ â”€â”€ */}
              <div className="flex items-center justify-between mb-2 px-0.5">
                <button
                  onClick={() => setRolesModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-[#2a2a2a] text-[#C5A059] hover:border-[#C5A059]/50 hover:bg-[#C5A059]/5 transition-all text-[11px] font-bold"
                >
                  <span className="text-sm">ðŸƒ</span> Ø§Ù„Ø£Ø¯ÙˆØ§Ø±
                </button>
                {isRemote && physicalId && (
                  <span className="text-[11px] font-mono text-[#808080]">Ù…Ù‚Ø¹Ø¯Ùƒ <span className="text-[#C5A059] font-black text-sm">#{physicalId}</span></span>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-red-500/25 text-red-400 hover:bg-red-500/10 transition-all text-[11px] font-bold"
                >
                  <span className="text-sm">ðŸšª</span> Ø®Ø±ÙˆØ¬
                </button>
              </div>

              {/* ðŸ” DEBUG BAR (Ù…Ø¤Ù‚Øª â€” Ù„Ù„ØªØ´Ø®ÙŠØµ) */}
              {!isRemote && (
              <div className="text-[10px] font-mono text-[#9a9a9a] bg-[#0a0a0a] border border-[#1a1a1a] px-2 py-1 rounded mt-1 text-center">
                P:{gamePhase || 'null'} | C:{votingCandidates.length} | R:{assignedRole || 'null'} | S:{step} | v3.0
              </div>
              )}

              {/* ðŸ“± Ø§Ù„Ø·Ø§ÙˆÙ„Ø© 3D Ø£Ø¹Ù„Ù‰ Ø§Ù„Ø´Ø§Ø´Ø© (Ø¨Ø¯ÙŠÙ„ Ø´Ø§Ø´Ø© Ø§Ù„Ø¹Ø±Ø¶ â€” Ø¨Ù„Ø§ ÙƒØ´Ù Ø£Ø¯ÙˆØ§Ø±) */}
              {isRemote && gamePhase && !['LOBBY', 'ROLE_GENERATION', 'ROLE_BINDING'].includes(gamePhase) && (
                <PhoneSpectatorView
                  roster={roster}
                  physicalId={physicalId}
                  gamePhase={gamePhase}
                  on={on}
                  collapsed={gamePhase === 'DAY_VOTING'}
                  initialDiscussionState={phasePollData?.discussionState}
                  videoByPid={voiceMaps.videoByPid}
                  speakingByPid={voiceMaps.audioByPid}
                  winnerReveal={gameOverData}
                />
              )}

              {/* â”€â”€ Ø±ØµÙŠÙ Ø§Ù„Ø£ÙƒØ´Ù† Ø£Ø³ÙÙ„ Ø§Ù„Ø·Ø§ÙˆÙ„Ø© â”€â”€ */}
              {/* ðŸŽ™ï¸ ØµÙˆØª Ø§Ù„Ù„Ø¹Ø¨ Ø¹Ù† Ø¨ÙØ¹Ø¯ (key Ø«Ø§Ø¨Øª ÙŠÙ…Ù†Ø¹ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ±ÙƒÙŠØ¨/Ø§Ù†Ù‚Ø·Ø§Ø¹ Ø§Ù„ØµÙˆØª Ø¹Ù†Ø¯ ØªØ¨Ø¯Ù‘Ù„ Ø§Ù„Ø£Ø·ÙˆØ§Ø±) */}
              {isRemote && (
                <RemoteVoice
                  key="remote-voice"
                  roomId={roomId}
                  enabled={!!gamePhase}
                  isHost={false}
                  selfPhysicalId={parseInt(physicalId) || null}
                  emit={emit}
                  gamePhase={gamePhase}
                  onVoiceMaps={setVoiceMaps}
                  shouldOpenMic={voiceAllowedPids.includes(parseInt(physicalId)) && !isPlayerDead}
                />
              )}

              {/* ðŸ“¨ Ø¯Ø¹ÙˆØ© Ø§Ù„Ø£ØµØ¯Ù‚Ø§Ø¡ â€” ÙŠØ¸Ù‡Ø± Ù„Ù„Ø§Ø¹Ø¨ ÙÙ‚Ø· Ø¥Ø°Ø§ Ø³Ù…Ø­ Ø§Ù„Ù‚Ø§Ø¦Ø¯ Ø¨Ø°Ù„Ùƒ */}
              {isRemote && allowPlayerInvites && roomId && (
                <div className="w-full max-w-lg mx-auto px-1 mt-2">
                  <button
                    onClick={() => setShowInvite(true)}
                    className="w-full py-2.5 rounded-xl border border-sky-600/40 text-sky-300 bg-transparent text-sm font-bold hover:bg-sky-500/10 transition flex items-center justify-center gap-2"
                  >
                    ðŸ“¨ Ø¯Ø¹ÙˆØ© ØµØ¯ÙŠÙ‚ Ù„Ù„ØºØ±ÙØ©
                  </button>
                </div>
              )}

              {/* âš”ï¸ Ø§Ù„Ù…ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ø«Ù†Ø§Ø¦ÙŠØ© */}
              {isRemote && (
                <ConfrontationControls
                  confrontation={confrontation}
                  myPid={parseInt(physicalId) || null}
                  isHost={false}
                  players={roster}
                  emit={emit}
                  roomId={roomId}
                  gamePhase={gamePhase}
                />
              )}

              {/* â”€â”€ Ø¹Ø±Ø¶ Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ù„Ø¹Ø¨Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ© (Ù†ÙØ®ÙÙŠ ÙƒØ´Ù Ø§Ù„ÙØ§Ø¦Ø² Ø¹Ù† Ø¨ÙØ¹Ø¯ â€” Ø§Ù„Ø·Ø§ÙˆÙ„Ø© ØªÙƒØ´ÙÙ‡) â”€â”€ */}
              {gamePhase && gamePhase !== 'DAY_VOTING' && gamePhase !== 'LOBBY' && (
                <PlayerPhaseView
                  gamePhase={gamePhase}
                  physicalId={physicalId}
                  assignedRole={assignedRole}
                  isPlayerDead={isPlayerDead}
                  on={on}
                  emit={emit}
                  myVote={myVote}
                  votingCandidates={votingCandidates}
                  votingPlayersInfo={votingPlayersInfo}
                  pollData={phasePollData}
                  roomId={roomId}
                  isRemote={isRemote}
                />
              )}

              {/* â”€â”€ Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØµÙˆÙŠØª: ØªØ­Ù…ÙŠÙ„ Ø£Ùˆ Ø¹Ø±Ø¶ â”€â”€ */}
              {gamePhase === 'DAY_VOTING' && votingCandidates.length === 0 ? (
                <PhaseLoading icon="ðŸ—³ï¸" text="Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„ØªØµÙˆÙŠØª..." />
              ) : gamePhase === 'DAY_VOTING' && votingCandidates.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {(() => {
                    const timeSinceVote = lastVoteTime ? now - lastVoteTime : 0;
                    const voteWindowOpen = lastVoteTime !== null && timeSinceVote < 10000;
                    const secondsLeft = Math.max(0, 10 - Math.floor(timeSinceVote / 1000));
                    const canVote = (myVote === null || voteWindowOpen) && (votingCountdown === null || votingCountdown > 0);

                    return (
                      <>
                        {/* Ø¹Ù†ÙˆØ§Ù† */}
                        <div className="text-center mb-5">
                          <div className="text-3xl mb-2">ðŸ—³ï¸</div>
                          <h2 className="text-2xl font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                            Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØµÙˆÙŠØª
                          </h2>
                          <p className="text-[#808080] text-xs font-mono mt-2">
                            {isPlayerDead ? 'Ù…Ø´Ø§Ù‡Ø¯Ø© ÙÙ‚Ø· â€” Ø£Ù†Øª Ù…ÙÙ‚ØµÙ‰' : myVote !== null ? (
                              voteWindowOpen ? (
                                <span className="text-amber-500 font-bold">ÙŠÙ…ÙƒÙ†Ùƒ ØªØºÙŠÙŠØ± ØªØµÙˆÙŠØªÙƒ Ø®Ù„Ø§Ù„ {secondsLeft} Ø«Ø§Ù†ÙŠØ©</span>
                              ) : (
                                <span className="text-green-500 font-bold">âœ… ØªÙ… Ø§Ù„ØªØµÙˆÙŠØª (Ù…ØºÙ„Ù‚)</span>
                              )
                            ) : (
                              votingCountdown === 0 ? <span className="text-[#8A0303] font-bold">âŒ Ù„Ù… ØªÙ‚Ù… Ø¨Ø§Ù„ØªØµÙˆÙŠØª</span> : 'ØµÙˆÙ‘Øª Ø¶Ø¯ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø§Ù„Ù…Ø´ØªØ¨Ù‡'
                            )}
                          </p>
                        </div>

                  {votingCountdown !== null && votingCountdown > 0 && (
                    <div 
                      key={votingCountdown <= 10 ? 'red' : 'gold'}
                      className={`text-3xl font-black font-mono text-center mb-5 ${
                        votingCountdown <= 10 ? 'text-red-500 animate-pulse' : 'text-[#C5A059]'
                      }`}
                      style={{ transform: 'translateZ(0)' }}
                    >
                      â± {votingCountdown}Ø«
                    </div>
                  )}

                  {/* Ø´Ø±ÙŠØ· Ø§Ù„ØªÙ‚Ø¯Ù… */}
                  <div className="mb-5 px-2">
                    <div className="flex justify-between text-[10px] text-[#808080] font-mono mb-1">
                      <span>{totalVotesCast} ØµÙˆØª</span>
                      <span>{votingCandidates.reduce((max: number, c: any) => Math.max(max, c.votes || 0), 0)} Ø£Ø¹Ù„Ù‰</span>
                    </div>
                    <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #C5A059, #E8C97A)' }}
                        animate={{ width: `${Math.min(100, (totalVotesCast / Math.max(1, votingCandidates.length)) * 100)}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    {votingComplete && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[#C5A059] text-[10px] font-mono text-center mt-2 tracking-wider"
                      >
                        âœ“ Ø§ÙƒØªÙ…Ù„ Ø§Ù„ØªØµÙˆÙŠØª â€” Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù„ÙŠØ¯Ø±
                      </motion.p>
                    )}
                  </div>

                  {/* ÙƒØ±ÙˆØª Ø§Ù„Ù…Ø±Ø´Ø­ÙŠÙ† */}
                  <div className="grid grid-cols-1 gap-4 px-1 max-h-[55vh] overflow-y-auto pb-4">
                    {votingCandidates.map((candidate: any, index: number) => {
                      const isSelf = candidate.targetPhysicalId === parseInt(physicalId);
                      const isMyChoice = myVote === index;
                      const playerInfo = votingPlayersInfo.find((p: any) => p.physicalId === candidate.targetPhysicalId);
                      const candidateName = playerInfo?.name || `Ù„Ø§Ø¹Ø¨ ${candidate.targetPhysicalId}`;
                      const candidateAvatar = playerInfo?.avatarUrl;
                      const isDeal = candidate.type === 'DEAL';
                      const initiatorInfo = isDeal ? votingPlayersInfo.find((p: any) => p.physicalId === candidate.initiatorPhysicalId) : null;
                      const votersForThisCandidate = Object.entries(playerVotes).filter(([_, targetIdx]) => targetIdx === index).map(([vId]) => parseInt(vId));

                      return (
                        <motion.button
                          key={candidate.id || `c-${index}`}
                          whileTap={!isPlayerDead && !isMyChoice ? { scale: 0.95 } : {}}
                          onClick={() => {
                            if (isPlayerDead || isMyChoice || voteSubmitting || !canVote || isSelf) return;
                            setVoteSubmitting(true);
                            emit('player:cast-vote', {
                              roomId,
                              physicalId: parseInt(physicalId),
                              candidateIndex: index,
                            }).then((res: any) => {
                              if (res?.success) {
                                setMyVote(index);
                                setLastVoteTime(Date.now());
                                if (navigator.vibrate) navigator.vibrate(100);
                              }
                            }).catch(() => {}).finally(() => setVoteSubmitting(false));
                          }}
                          disabled={isPlayerDead}
                          className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all w-full overflow-hidden ${
                            isMyChoice
                              ? 'border-[#C5A059] bg-gradient-to-b from-[#C5A059]/15 to-[#C5A059]/5 shadow-[0_0_20px_rgba(197,160,89,0.2)]'
                              : 'border-[#222] bg-[#111] hover:border-[#C5A059]/30 active:bg-[#1a1a1a]'
                          }`}
                        >
                          {/* ØµÙˆØ±Ø© ÙˆØ§Ø³Ù… */}
                          <div className="flex items-center gap-3 w-full">
                            <div className="relative w-[72px] h-[72px] shrink-0 rounded-full overflow-hidden border-2 border-[#333] bg-[#1a1a1a] flex items-center justify-center shadow-lg">
                              {candidateAvatar ? (
                                <Image src={candidateAvatar} alt="" width={72} height={72} className="object-cover w-full h-full" />
                              ) : (
                                <span className="text-3xl font-black text-[#C5A059] font-mono">#{candidate.targetPhysicalId}</span>
                              )}
                              {isMyChoice && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="absolute inset-0 bg-[#C5A059]/40 flex items-center justify-center rounded-full backdrop-blur-sm"
                                >
                                  <span className="text-3xl drop-shadow-md">âœ…</span>
                                </motion.div>
                              )}
                            </div>

                            <div className="flex flex-col items-start flex-1 min-w-0">
                              <span className="text-sm font-mono text-[#C5A059] mb-1 tracking-widest bg-black/40 px-2 py-0.5 rounded-full border border-[#C5A059]/20">
                                Ù…Ù‚Ø¹Ø¯ #{candidate.targetPhysicalId}
                              </span>
                              
                              <div className="flex items-center gap-2 w-full">
                                <p className="text-xl font-bold text-white leading-snug break-words">
                                  {candidateName}
                                </p>
                                {notepadNotes[candidate.targetPhysicalId] && notepadNotes[candidate.targetPhysicalId].suspicion !== 'none' && (
                                  <span className="text-sm bg-black/50 px-1.5 py-0.5 rounded-md border border-[#333] shadow-inner">
                                    {notepadNotes[candidate.targetPhysicalId].suspicion === 'safe' ? 'ðŸŸ¢' : notepadNotes[candidate.targetPhysicalId].suspicion === 'suspect' ? 'ðŸŸ¡' : 'ðŸ”´'}
                                  </span>
                                )}
                              </div>
                              
                              {isDeal && (
                                <div className="mt-2 bg-red-500/20 border border-red-500/30 px-2.5 py-1 rounded-md flex items-center gap-2">
                                  <span className="text-red-500 text-xs font-bold whitespace-nowrap">ðŸ¤ Ø¯ÙŠÙ„ Ù…Ù†:</span>
                                  <span className="text-white text-xs font-bold truncate">
                                    {initiatorInfo?.name || `Ù„Ø§Ø¹Ø¨ ${candidate.initiatorPhysicalId}`} <span className="font-mono text-red-400">#{candidate.initiatorPhysicalId}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ø£ØµÙˆØ§Øª */}
                          <div className="mt-1.5 flex items-center gap-1 bg-black/30 rounded-full px-2.5 py-0.5 w-fit mx-auto">
                            <span className="text-sm font-black text-[#C5A059]">{candidate.votes || 0}</span>
                            <span className="text-[10px] text-[#808080]">ØµÙˆØª</span>
                          </div>

                          {/* Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„Ù…ØµÙˆØªÙŠÙ† */}
                          {votersForThisCandidate.length > 0 && (
                            <div className="mt-2 w-full flex flex-wrap justify-center gap-1.5 border-t border-[#333]/50 pt-2 px-1">
                              {votersForThisCandidate.map(vId => {
                                const vName = votingPlayersInfo.find((p: any) => p.physicalId === vId)?.name || `Ù„Ø§Ø¹Ø¨ ${vId}`;
                                return (
                                  <span key={vId} className="text-[10px] font-mono bg-[#8A0303]/20 border border-[#8A0303]/40 text-white px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="font-black text-[#ff4444]">{vId}</span>
                                    <span className="truncate max-w-[50px] text-gray-300">{vName}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {/* Ø´Ø§Ø±Ø© "Ø£Ù†Øª" */}
                          {isSelf && (
                            <span className="absolute top-1.5 right-1.5 text-[10px] bg-[#222] text-[#808080] px-1.5 py-0.5 rounded-full font-mono">Ø£Ù†Øª</span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                  </>
                  );
                })()}
                </motion.div>
              ) : (!gamePhase || gamePhase === 'LOBBY' || gamePhase === 'ROLE_BINDING' || gamePhase === 'ROLE_GENERATION') ? (
                assignedRole === null ? (
                  /* â”€â”€ Ø­Ø§Ù„Ø© Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø± (Ù„Ù… ÙŠÙÙˆØ²ÙŽÙ‘Ø¹ Ø§Ù„Ø¯ÙˆØ± Ø¨Ø¹Ø¯) â”€â”€ */
                  <>
                    {penalties > 0 && (
                      <div className="flex flex-col items-center gap-1.5 mb-6 bg-red-950/20 border border-red-900/30 rounded-xl p-3 shadow-[0_0_15px_rgba(220,38,38,0.05)] w-full">
                        <span className="text-red-400 text-[10px] font-mono tracking-widest uppercase">ACTIVE RULE VIOLATIONS</span>
                        <div className="flex gap-2.5">
                          {Array.from({ length: maxPenalties }).map((_, i) => (
                            <span
                              key={i}
                              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                                i < penalties
                                  ? 'bg-red-600 shadow-[0_0_8px_#dc2626]'
                                  : 'bg-neutral-800 border border-neutral-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-red-300/70" style={{ fontFamily: 'Amiri, serif' }}>
                          ØªØ­Ø°ÙŠØ±: ({penalties}/{maxPenalties}) Ø¹Ù‚ÙˆØ¨Ø§Øª. Ø³ÙŠØªÙ… Ø·Ø±Ø¯Ùƒ Ø¹Ù†Ø¯ ØªØ¬Ø§ÙˆØ² Ø§Ù„Ø­Ø¯.
                        </span>
                      </div>
                    )}
                    {isRemote && (!gamePhase || gamePhase === 'LOBBY' || gamePhase === 'ROLE_GENERATION' || gamePhase === 'ROLE_BINDING') ? (
                      /* â”€â”€ Ù„ÙˆØ¨ÙŠ Ø§Ù„Ù„Ø¹Ø¨ Ø¹Ù† Ø¨ÙØ¹Ø¯: Ø­Ù„Ù‚Ø© ÙƒØ±ÙˆØª Ø§Ù„Ø·Ø§ÙˆÙ„Ø© (Ù†ÙØ³ ØªØµÙ…ÙŠÙ… Ø¨Ø§Ù‚ÙŠ Ø§Ù„Ù…Ø±Ø§Ø­Ù„) â”€â”€ */
                      <>
                        <PhoneSpectatorView
                          roster={roster}
                          physicalId={physicalId}
                          gamePhase={gamePhase || 'LOBBY'}
                          on={on}
                          lobby
                          maxPlayers={maxPlayers}
                          videoByPid={voiceMaps.videoByPid}
                          speakingByPid={voiceMaps.audioByPid}
                        />
                        <div className="mt-2">
                          <RoomCodeCard code={roomCode} />
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#C5A059] to-[#E8C97A] transition-[width] duration-500" style={{ width: `${Math.min(100, (roster.length / (maxPlayers || roster.length || 1)) * 100)}%` }} />
                        </div>
                        <div className="mt-1 text-center text-[10px] font-mono text-[#808080]">Ø§Ù†Ø¶Ù…Ù‘ {roster.length} Ù…Ù† {maxPlayers}</div>
                      </>
                    ) : (
                    <>
                    <motion.div
                      className="text-[#C5A059] flex justify-center mb-6"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <ShieldCheckIcon />
                    </motion.div>
                    <h2 className="text-3xl font-black mb-4 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>Ø§ÙƒØªÙ…Ù„ Ø§Ù„ØªØ´ÙÙŠØ±</h2>

                    <div className="flex justify-center mb-8">
                      <MafiaCard
                        key={`card-${physicalId}`}
                        playerNumber={parseInt(physicalId)}
                        playerName={displayName}
                        role={null}
                        gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                        showVoting={false}
                        flippable={false}
                        size="md"
                        avatarUrl={avatarUrl}
                        rankTier={myRankTier || undefined}
                        cosmetics={myCosmetics}
                      />
                    </div>

                    <div className="w-16 h-[1px] bg-[#2a2a2a] mx-auto mb-6" />

                    <p className="text-[#C5A059] text-[11px] font-mono uppercase tracking-[0.2em] leading-relaxed mb-4">
                      SECURE YOUR DEVICE. DIRECT ATTENTION TO PRIMARY MONITOR.
                    </p>
                    <p className="text-[#555] text-[9px] font-mono uppercase tracking-widest">
                      STATUS ACTIVE. INTERFACE LOCKED.
                    </p>
                    </>
                    )}
                  </>
                ) : (
                  /* â”€â”€ Ø­Ø§Ù„Ø© Ø§Ù„Ø¯ÙˆØ± Ø§Ù„Ù…ÙØ¹ÙŠÙŽÙ‘Ù† (ÙƒØ§Ø±Ø¯ Ø³Ø±ÙŠ Ù‚Ø§Ø¨Ù„ Ù„Ù„Ù‚Ù„Ø¨) â”€â”€ */
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <h2 className="text-2xl font-black mb-2 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                      ØªÙ… ØªØ¹ÙŠÙŠÙ† Ù…Ù‡Ù…ØªÙƒ
                    </h2>
                    <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em] mb-6">
                      TAP CARD TO REVEAL YOUR IDENTITY
                    </p>

                    <div className="relative flex justify-center mb-6">
                      {/* ðŸ’§ Ø¨Ø¹Ø¯ Ø§Ù„ÙƒØ´Ù ØªÙØºØ·Ù‘Ù‰ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© Ø¨Ø¹Ù„Ø§Ù…Ø©Ù Ù…Ø§Ø¦ÙŠÙ‘Ø© ØªÙØ¶Ø­ Ù…Ø³Ø±Ù‘Ø¨ Ø£ÙŠÙ‘ Ù„Ù‚Ø·Ø© */}
                      {cardFlipped && (
                        <SecretWatermark opacity={0.08}
                          label={`${displayName || 'Ù„Ø§Ø¹Ø¨'} Â· Ù…Ù‚Ø¹Ø¯ ${physicalId} Â· ${roomCode} Â· ${new Date().toTimeString().slice(0, 5)}`} />
                      )}
                      <MafiaCard
                        key={`card-role-${physicalId}`}
                        playerNumber={parseInt(physicalId)}
                        playerName={displayName}
                        role={assignedRole}
                        isFlipped={cardFlipped}
                        onFlip={() => { setCardFlipped(true); setRoleAlert(false); }}
                        flipDurationMs={1100}
                        gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                        showVoting={false}
                        flippable={true}
                        size="md"
                        avatarUrl={avatarUrl}
                        rankTier={myRankTier || undefined}
                        cosmetics={myCosmetics}
                      />
                    </div>

                    <AnimatePresence mode="wait">
                      {cardFlipped ? (
                        <motion.div
                          key="hide-msg"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center w-full"
                        >
                          <p className="text-[#8A0303] text-[11px] font-mono uppercase tracking-[0.2em] animate-pulse mb-4">
                            âš ï¸ Ø£Ø®ÙÙ Ù‡Ø§ØªÙÙƒ Ø§Ù„Ø¢Ù†!
                          </p>


                        </motion.div>
                      ) : (
                        <motion.p
                          key="tap-msg"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-[#555] text-[9px] font-mono uppercase tracking-widest"
                        >
                          Ø§Ø¶ØºØ· Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© Ù„ÙƒØ´Ù Ø¯ÙˆØ±Ùƒ
                        </motion.p>
                      )}
                    </AnimatePresence>

                  </motion.div>
                )
              ) : null}

            </motion.div>
          )}

          {/* â”€â”€ Ø®Ø·ÙˆØ© Rejoin: Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø¹Ø§Ø¯ â”€â”€ */}
          {step === 'rejoined' && (
            <motion.div key="rejoined" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">

              {/* â”€â”€ Ø£Ø²Ø±Ø§Ø± Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠ + ØªØ³Ø¬ÙŠÙ„ Ø®Ø±ÙˆØ¬ â”€â”€ */}
              <div className="flex items-center justify-between mb-2 px-0.5">
                <button
                  onClick={() => setRolesModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-[#2a2a2a] text-[#C5A059] hover:border-[#C5A059]/50 hover:bg-[#C5A059]/5 transition-all text-[11px] font-bold"
                >
                  <span className="text-sm">ðŸƒ</span> Ø§Ù„Ø£Ø¯ÙˆØ§Ø±
                </button>
                {isRemote && physicalId && (
                  <span className="text-[11px] font-mono text-[#808080]">Ù…Ù‚Ø¹Ø¯Ùƒ <span className="text-[#C5A059] font-black text-sm">#{physicalId}</span></span>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-red-500/25 text-red-400 hover:bg-red-500/10 transition-all text-[11px] font-bold"
                >
                  <span className="text-sm">ðŸšª</span> Ø®Ø±ÙˆØ¬
                </button>
              </div>

              {/* ðŸ” DEBUG BAR (Ù…Ø¤Ù‚Øª â€” Ù„Ù„ØªØ´Ø®ÙŠØµ) */}
              {!isRemote && (
              <div className="text-[10px] font-mono text-[#9a9a9a] bg-[#0a0a0a] border border-[#1a1a1a] px-2 py-1 rounded mt-1 text-center mb-2">
                P:{gamePhase || 'null'} | C:{votingCandidates.length} | R:{assignedRole || 'null'} | S:{step} | v4.0
              </div>
              )}

              {/* ðŸ“± Ø§Ù„Ø·Ø§ÙˆÙ„Ø© 3D Ø£Ø¹Ù„Ù‰ Ø§Ù„Ø´Ø§Ø´Ø© (Ø¨Ø¯ÙŠÙ„ Ø´Ø§Ø´Ø© Ø§Ù„Ø¹Ø±Ø¶ â€” Ø¨Ù„Ø§ ÙƒØ´Ù Ø£Ø¯ÙˆØ§Ø±) */}
              {isRemote && gamePhase && !['LOBBY', 'ROLE_GENERATION', 'ROLE_BINDING'].includes(gamePhase) && (
                <PhoneSpectatorView
                  roster={roster}
                  physicalId={physicalId}
                  gamePhase={gamePhase}
                  on={on}
                  collapsed={gamePhase === 'DAY_VOTING'}
                  initialDiscussionState={phasePollData?.discussionState}
                  videoByPid={voiceMaps.videoByPid}
                  speakingByPid={voiceMaps.audioByPid}
                  winnerReveal={gameOverData}
                />
              )}

              {/* â”€â”€ Ø±ØµÙŠÙ Ø§Ù„Ø£ÙƒØ´Ù† Ø£Ø³ÙÙ„ Ø§Ù„Ø·Ø§ÙˆÙ„Ø© â”€â”€ */}
              {/* ðŸŽ™ï¸ ØµÙˆØª Ø§Ù„Ù„Ø¹Ø¨ Ø¹Ù† Ø¨ÙØ¹Ø¯ (key Ø«Ø§Ø¨Øª ÙŠÙ…Ù†Ø¹ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ±ÙƒÙŠØ¨/Ø§Ù†Ù‚Ø·Ø§Ø¹ Ø§Ù„ØµÙˆØª Ø¹Ù†Ø¯ ØªØ¨Ø¯Ù‘Ù„ Ø§Ù„Ø£Ø·ÙˆØ§Ø±) */}
              {isRemote && (
                <RemoteVoice
                  key="remote-voice"
                  roomId={roomId}
                  enabled={!!gamePhase}
                  isHost={false}
                  selfPhysicalId={parseInt(physicalId) || null}
                  emit={emit}
                  gamePhase={gamePhase}
                  onVoiceMaps={setVoiceMaps}
                  shouldOpenMic={voiceAllowedPids.includes(parseInt(physicalId)) && !isPlayerDead}
                />
              )}

              {/* ðŸ“¨ Ø¯Ø¹ÙˆØ© Ø§Ù„Ø£ØµØ¯Ù‚Ø§Ø¡ â€” ÙŠØ¸Ù‡Ø± Ù„Ù„Ø§Ø¹Ø¨ ÙÙ‚Ø· Ø¥Ø°Ø§ Ø³Ù…Ø­ Ø§Ù„Ù‚Ø§Ø¦Ø¯ Ø¨Ø°Ù„Ùƒ */}
              {isRemote && allowPlayerInvites && roomId && (
                <div className="w-full max-w-lg mx-auto px-1 mt-2">
                  <button
                    onClick={() => setShowInvite(true)}
                    className="w-full py-2.5 rounded-xl border border-sky-600/40 text-sky-300 bg-transparent text-sm font-bold hover:bg-sky-500/10 transition flex items-center justify-center gap-2"
                  >
                    ðŸ“¨ Ø¯Ø¹ÙˆØ© ØµØ¯ÙŠÙ‚ Ù„Ù„ØºØ±ÙØ©
                  </button>
                </div>
              )}

              {/* âš”ï¸ Ø§Ù„Ù…ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ø«Ù†Ø§Ø¦ÙŠØ© */}
              {isRemote && (
                <ConfrontationControls
                  confrontation={confrontation}
                  myPid={parseInt(physicalId) || null}
                  isHost={false}
                  players={roster}
                  emit={emit}
                  roomId={roomId}
                  gamePhase={gamePhase}
                />
              )}

              {/* â”€â”€ Ø¹Ø±Ø¶ Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ù„Ø¹Ø¨Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ© (Ù†ÙØ®ÙÙŠ ÙƒØ´Ù Ø§Ù„ÙØ§Ø¦Ø² Ø¹Ù† Ø¨ÙØ¹Ø¯ â€” Ø§Ù„Ø·Ø§ÙˆÙ„Ø© ØªÙƒØ´ÙÙ‡) â”€â”€ */}
              {gamePhase && gamePhase !== 'DAY_VOTING' && gamePhase !== 'LOBBY' && (
                <PlayerPhaseView
                  gamePhase={gamePhase}
                  physicalId={physicalId}
                  assignedRole={assignedRole}
                  isPlayerDead={isPlayerDead}
                  on={on}
                  emit={emit}
                  myVote={myVote}
                  votingCandidates={votingCandidates}
                  votingPlayersInfo={votingPlayersInfo}
                  pollData={phasePollData}
                  roomId={roomId}
                  isRemote={isRemote}
                />
              )}

              {/* â”€â”€ Ø§Ù„ØªØµÙˆÙŠØª Ø£ÙˆÙ„Ø§Ù‹ (Ø¥Ù† ÙƒØ§Ù† ÙØ¹Ù‘Ø§Ù„) â”€â”€ */}
              {gamePhase === 'DAY_VOTING' && votingCandidates.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
                  <div className="text-3xl mb-3">ðŸ—³ï¸</div>
                  <div className="w-8 h-8 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[#C5A059] text-sm font-mono">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„ØªØµÙˆÙŠØª...</p>
                </motion.div>
              ) : gamePhase === 'DAY_VOTING' && votingCandidates.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* Ø¹Ù†ÙˆØ§Ù† Ø§Ù„ØªØµÙˆÙŠØª */}
                  <div className="text-center mb-5">
                    <div className="text-3xl mb-2">ðŸ—³ï¸</div>
                    <h2 className="text-xl font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                      Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØµÙˆÙŠØª
                    </h2>
                    <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.15em] mt-1">
                      {isPlayerDead ? 'Ù…Ø´Ø§Ù‡Ø¯Ø© ÙÙ‚Ø· â€” Ø£Ù†Øª Ù…ÙÙ‚ØµÙ‰' : myVote !== null ? 'âœ… ØªÙ… Ø§Ù„ØªØµÙˆÙŠØª â€” Ø§Ø¶ØºØ· Ù„Ø§Ø¹Ø¨ Ø¢Ø®Ø± Ù„Ù„ØªØºÙŠÙŠØ±' : (votingCountdown === 0 ? <span className="text-[#8A0303] font-bold">âŒ Ù„Ù… ØªÙ‚Ù… Ø¨Ø§Ù„ØªØµÙˆÙŠØª</span> : 'ØµÙˆÙ‘Øª Ø¶Ø¯ Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø§Ù„Ù…Ø´ØªØ¨Ù‡')}
                    </p>
                  </div>

                  {votingCountdown !== null && votingCountdown > 0 && (
                    <div 
                      key={votingCountdown <= 10 ? 'red' : 'gold'}
                      className={`text-3xl font-black font-mono text-center mb-5 ${
                        votingCountdown <= 10 ? 'text-red-500 animate-pulse' : 'text-[#C5A059]'
                      }`}
                      style={{ transform: 'translateZ(0)' }}
                    >
                      â± {votingCountdown}Ø«
                    </div>
                  )}

                  {/* Ø´Ø±ÙŠØ· Ø§Ù„ØªÙ‚Ø¯Ù… */}
                  <div className="mb-5">
                    <div className="flex justify-between text-[10px] font-mono text-[#9a9a9a] mb-1">
                      <span>VOTES: {totalVotesCast}</span>
                      <span>{votingComplete ? 'âœ… COMPLETE' : 'â³ IN PROGRESS'}</span>
                    </div>
                    <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #C5A059, #D4AF37)' }}
                        initial={{ width: '0%' }}
                        animate={{ width: `${votingPlayersInfo.length > 0 ? (totalVotesCast / votingPlayersInfo.length) * 100 : 0}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>

                  {/* ÙƒØ±ÙˆØª Ø§Ù„Ù…Ø±Ø´Ø­ÙŠÙ† */}
                  <div className="grid grid-cols-1 gap-4 px-1 max-h-[55vh] overflow-y-auto pb-4">
                    {votingCandidates.map((candidate: any, index: number) => {
                      const isSelf = candidate.targetPhysicalId === parseInt(physicalId);
                      const isMyChoice = myVote === index;
                      const playerInfo = votingPlayersInfo.find((p: any) => p.physicalId === candidate.targetPhysicalId);
                      const candidateName = playerInfo?.name || `Ù„Ø§Ø¹Ø¨ ${candidate.targetPhysicalId}`;
                      const candidateAvatar = playerInfo?.avatarUrl;
                      const isDeal = candidate.type === 'DEAL';
                      const initiatorInfo = isDeal ? votingPlayersInfo.find((p: any) => p.physicalId === candidate.initiatorPhysicalId) : null;
                      const votersForThisCandidate = Object.entries(playerVotes).filter(([_, targetIdx]) => targetIdx === index).map(([vId]) => parseInt(vId));

                      return (
                        <motion.button
                          key={candidate.id || `c-${index}`}
                          whileTap={!isPlayerDead && !isMyChoice ? { scale: 0.95 } : {}}
                          onClick={() => {
                            if (isPlayerDead || isMyChoice || voteSubmitting || votingComplete || isSelf) return;
                            setVoteSubmitting(true);
                            emit('player:cast-vote', {
                              roomId,
                              physicalId: parseInt(physicalId),
                              candidateIndex: index,
                            }).then((res: any) => {
                              if (res?.success) {
                                setMyVote(index);
                                if (navigator.vibrate) navigator.vibrate(100);
                              }
                            }).catch(() => {}).finally(() => setVoteSubmitting(false));
                          }}
                          disabled={isPlayerDead}
                          className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all w-full overflow-hidden ${
                            isMyChoice
                              ? 'border-[#C5A059] bg-gradient-to-b from-[#C5A059]/15 to-[#C5A059]/5 shadow-[0_0_20px_rgba(197,160,89,0.2)]'
                              : 'border-[#222] bg-[#111] hover:border-[#C5A059]/30 active:bg-[#1a1a1a]'
                          }`}
                        >
                          {/* ØµÙˆØ±Ø© ÙˆØ§Ø³Ù… */}
                          <div className="flex items-center gap-3 w-full">
                            <div className="relative w-[72px] h-[72px] shrink-0 rounded-full overflow-hidden border-2 border-[#333] bg-[#1a1a1a] flex items-center justify-center shadow-lg">
                              {candidateAvatar ? (
                                <Image src={candidateAvatar} alt="" width={72} height={72} className="object-cover w-full h-full" />
                              ) : (
                                <span className="text-3xl font-black text-[#C5A059] font-mono">#{candidate.targetPhysicalId}</span>
                              )}
                              {isMyChoice && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="absolute inset-0 bg-[#C5A059]/40 flex items-center justify-center rounded-full backdrop-blur-sm"
                                >
                                  <span className="text-3xl drop-shadow-md">âœ…</span>
                                </motion.div>
                              )}
                            </div>

                            <div className="flex flex-col items-start flex-1 min-w-0">
                              <span className="text-sm font-mono text-[#C5A059] mb-1 tracking-widest bg-black/40 px-2 py-0.5 rounded-full border border-[#C5A059]/20">
                                Ù…Ù‚Ø¹Ø¯ #{candidate.targetPhysicalId}
                              </span>
                              
                              <div className="flex items-center gap-2 w-full">
                                <p className="text-xl font-bold text-white leading-snug break-words">
                                  {candidateName}
                                </p>
                                {notepadNotes[candidate.targetPhysicalId] && notepadNotes[candidate.targetPhysicalId].suspicion !== 'none' && (
                                  <span className="text-sm bg-black/50 px-1.5 py-0.5 rounded-md border border-[#333] shadow-inner">
                                    {notepadNotes[candidate.targetPhysicalId].suspicion === 'safe' ? 'ðŸŸ¢' : notepadNotes[candidate.targetPhysicalId].suspicion === 'suspect' ? 'ðŸŸ¡' : 'ðŸ”´'}
                                  </span>
                                )}
                              </div>
                              
                              {isDeal && (
                                <div className="mt-2 bg-red-500/20 border border-red-500/30 px-2.5 py-1 rounded-md flex items-center gap-2">
                                  <span className="text-red-500 text-xs font-bold whitespace-nowrap">ðŸ¤ Ø¯ÙŠÙ„ Ù…Ù†:</span>
                                  <span className="text-white text-xs font-bold truncate">
                                    {initiatorInfo?.name || `Ù„Ø§Ø¹Ø¨ ${candidate.initiatorPhysicalId}`} <span className="font-mono text-red-400">#{candidate.initiatorPhysicalId}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ø£ØµÙˆØ§Øª */}
                          <div className="mt-1.5 flex items-center gap-1 bg-black/30 rounded-full px-2.5 py-0.5 w-fit mx-auto">
                            <span className="text-sm font-black text-[#C5A059]">{candidate.votes || 0}</span>
                            <span className="text-[10px] text-[#808080]">ØµÙˆØª</span>
                          </div>

                          {/* Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„Ù…ØµÙˆØªÙŠÙ† */}
                          {votersForThisCandidate.length > 0 && (
                            <div className="mt-2 w-full flex flex-wrap justify-center gap-1.5 border-t border-[#333]/50 pt-2 px-1">
                              {votersForThisCandidate.map(vId => {
                                const vName = votingPlayersInfo.find((p: any) => p.physicalId === vId)?.name || `Ù„Ø§Ø¹Ø¨ ${vId}`;
                                return (
                                  <span key={vId} className="text-[10px] font-mono bg-[#8A0303]/20 border border-[#8A0303]/40 text-white px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="font-black text-[#ff4444]">{vId}</span>
                                    <span className="truncate max-w-[50px] text-gray-300">{vName}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {/* Ø´Ø§Ø±Ø© "Ø£Ù†Øª" */}
                          {isSelf && (
                            <span className="absolute top-1.5 right-1.5 text-[10px] bg-[#222] text-[#808080] px-1.5 py-0.5 rounded-full font-mono">Ø£Ù†Øª</span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : (!gamePhase || gamePhase === 'LOBBY' || gamePhase === 'ROLE_BINDING' || gamePhase === 'ROLE_GENERATION') ? (
                isPlayerDead ? (
                  /* â”€â”€ Ø­Ø§Ù„Ø© Ø§Ù„Ù…ÙŠØª: ÙƒØ§Ø±Ø¯ Ù…ÙØªÙˆØ­ + grayscale â”€â”€ */
                  <>
                    <h2 className="text-2xl font-black mb-2 text-[#555]" style={{ fontFamily: 'Amiri, serif' }}>
                      ØªÙ… Ø¥Ù‚ØµØ§Ø¤Ùƒ
                    </h2>
                    <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em] mb-6">
                      AGENT ELIMINATED â€” IDENTITY EXPOSED
                    </p>
                    <div className="flex justify-center mb-6 grayscale opacity-70">
                      <MafiaCard
                        key={`rj-dead-${physicalId}`}
                        playerNumber={parseInt(physicalId)}
                        playerName={displayName}
                        role={assignedRole}
                        isFlipped={true}
                        gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                        showVoting={false}
                        flippable={false}
                        size="md"
                        avatarUrl={avatarUrl}
                        rankTier={myRankTier || undefined}
                        cosmetics={myCosmetics}
                      />
                    </div>
                    <p className="text-[#8A0303] text-[11px] font-mono uppercase tracking-[0.2em]">
                      â˜ ï¸ STATUS: ELIMINATED
                    </p>
                  </>
                ) : assignedRole ? (
                  /* â”€â”€ Ø­Ø§Ù„Ø© Ø­ÙŠ Ù…Ø¹ Ø¯ÙˆØ±: ÙƒØ§Ø±Ø¯ Ù‚Ø§Ø¨Ù„ Ù„Ù„Ù‚Ù„Ø¨ â”€â”€ */
                  <>
                    <h2 className="text-2xl font-black mb-2 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                      Ù…Ø±Ø­Ø¨Ø§Ù‹ Ø¨Ø¹ÙˆØ¯ØªÙƒ
                    </h2>
                    <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em] mb-6">
                      TAP CARD TO REVEAL YOUR IDENTITY
                    </p>
                    <div className="flex justify-center mb-6">
                      <MafiaCard
                        key={`rj-role-${physicalId}`}
                        playerNumber={parseInt(physicalId)}
                        playerName={displayName}
                        role={assignedRole}
                        isFlipped={cardFlipped}
                        onFlip={() => { setCardFlipped(true); setRoleAlert(false); }}
                        flipDurationMs={1100}
                        gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                        showVoting={false}
                        flippable={true}
                        size="md"
                        avatarUrl={avatarUrl}
                        rankTier={myRankTier || undefined}
                        cosmetics={myCosmetics}
                      />
                    </div>
                    <AnimatePresence mode="wait">
                      {cardFlipped ? (
                        <motion.p key="hide2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[#8A0303] text-[11px] font-mono uppercase tracking-[0.2em] animate-pulse">
                          âš ï¸ Ø£Ø®ÙÙ Ù‡Ø§ØªÙÙƒ Ø§Ù„Ø¢Ù†!
                        </motion.p>
                      ) : (
                        <motion.p key="tap2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[#555] text-[9px] font-mono uppercase tracking-widest">
                          Ø§Ø¶ØºØ· Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© Ù„ÙƒØ´Ù Ø¯ÙˆØ±Ùƒ
                        </motion.p>
                      )}
                    </AnimatePresence>

                  </>
                ) : (
                  /* â”€â”€ Ø­Ø§Ù„Ø© Ø­ÙŠ Ø¨Ø¯ÙˆÙ† Ø¯ÙˆØ± (ÙÙŠ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±) â”€â”€ */
                  <>
                    {penalties > 0 && (
                      <div className="flex flex-col items-center gap-1.5 mb-6 bg-red-950/20 border border-red-900/30 rounded-xl p-3 shadow-[0_0_15px_rgba(220,38,38,0.05)] w-full">
                        <span className="text-red-400 text-[10px] font-mono tracking-widest uppercase">ACTIVE RULE VIOLATIONS</span>
                        <div className="flex gap-2.5">
                          {Array.from({ length: maxPenalties }).map((_, i) => (
                            <span
                              key={i}
                              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                                i < penalties
                                  ? 'bg-red-600 shadow-[0_0_8px_#dc2626]'
                                  : 'bg-neutral-800 border border-neutral-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-red-300/70" style={{ fontFamily: 'Amiri, serif' }}>
                          ØªØ­Ø°ÙŠØ±: ({penalties}/{maxPenalties}) Ø¹Ù‚ÙˆØ¨Ø§Øª. Ø³ÙŠØªÙ… Ø·Ø±Ø¯Ùƒ Ø¹Ù†Ø¯ ØªØ¬Ø§ÙˆØ² Ø§Ù„Ø­Ø¯.
                        </span>
                      </div>
                    )}
                    {isRemote && (!gamePhase || gamePhase === 'LOBBY' || gamePhase === 'ROLE_GENERATION' || gamePhase === 'ROLE_BINDING') ? (
                      /* â”€â”€ Ù„ÙˆØ¨ÙŠ Ø§Ù„Ù„Ø¹Ø¨ Ø¹Ù† Ø¨ÙØ¹Ø¯ (Ø¨Ø¹Ø¯ Ø¹ÙˆØ¯Ø© Ø§Ù„Ù„Ø§Ø¹Ø¨): Ø­Ù„Ù‚Ø© ÙƒØ±ÙˆØª Ø§Ù„Ø·Ø§ÙˆÙ„Ø© â”€â”€ */
                      <>
                        <PhoneSpectatorView
                          roster={roster}
                          physicalId={physicalId}
                          gamePhase={gamePhase || 'LOBBY'}
                          on={on}
                          lobby
                          maxPlayers={maxPlayers}
                          videoByPid={voiceMaps.videoByPid}
                          speakingByPid={voiceMaps.audioByPid}
                        />
                        <div className="mt-2">
                          <RoomCodeCard code={roomCode} />
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#C5A059] to-[#E8C97A] transition-[width] duration-500" style={{ width: `${Math.min(100, (roster.length / (maxPlayers || roster.length || 1)) * 100)}%` }} />
                        </div>
                        <div className="mt-1 text-center text-[10px] font-mono text-[#808080]">Ø§Ù†Ø¶Ù…Ù‘ {roster.length} Ù…Ù† {maxPlayers}</div>
                      </>
                    ) : (
                    <>
                    <motion.div className="text-[#C5A059] flex justify-center mb-6"
                      animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }}>
                      <ShieldCheckIcon />
                    </motion.div>
                    <h2 className="text-3xl font-black mb-4 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                      Ù…Ø±Ø­Ø¨Ø§Ù‹ Ø¨Ø¹ÙˆØ¯ØªÙƒ
                    </h2>
                    <div className="flex justify-center mb-8">
                      <MafiaCard
                        key={`rj-wait-${physicalId}`}
                        playerNumber={parseInt(physicalId)}
                        playerName={displayName}
                        role={null}
                        gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                        showVoting={false}
                        flippable={false}
                        size="md"
                        avatarUrl={avatarUrl}
                        rankTier={myRankTier || undefined}
                        cosmetics={myCosmetics}
                      />
                    </div>
                    <p className="text-[#C5A059] text-[11px] font-mono uppercase tracking-[0.2em]">
                      SECURE YOUR DEVICE. AWAIT ROLE ASSIGNMENT.
                    </p>
                    </>
                    )}
                  </>
                )
              ) : null}
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
        </>
      )}

      {/* â”€â”€ Ø´Ø§Ø´Ø© Ø§Ù„ØªØ­Ù…ÙŠÙ„ Ø£Ø«Ù†Ø§Ø¡ Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ù„Ù€ Rejoin â”€â”€ */}
      {rejoinLoading && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              className="text-[#C5A059] flex justify-center mb-4"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <ShieldCheckIcon />
            </motion.div>
            <p className="text-[#808080] text-[10px] font-mono uppercase tracking-widest">
              RESTORING SESSION...
            </p>
          </motion.div>
        </div>
      )}

      {/* â”€â”€ ØªÙ†Ø¨ÙŠÙ‡ ØªØºÙŠÙŠØ± Ø±Ù‚Ù… Ø§Ù„Ù…Ù‚Ø¹Ø¯ â”€â”€ */}
      {seatChangeAlert && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-4 right-4 z-50 bg-[#C5A059] text-black p-4 rounded-lg text-center font-bold shadow-lg"
          style={{ fontFamily: 'Amiri, serif' }}
        >
          {seatChangeAlert}
        </motion.div>
      )}

      {/* â”€â”€ ØªÙ†Ø¨ÙŠÙ‡ Ø¬Ù„ÙˆÙ†Ø¬ â€” Ø§Ù‚Ù„Ø¨ Ø§Ù„ÙƒØ§Ø±Ø¯ Ù„Ù…Ø¹Ø±ÙØ© Ø¯ÙˆØ±Ùƒ â”€â”€ */}
      <AnimatePresence>
        {roleAlert && !cardFlipped && assignedRole && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className="fixed bottom-6 left-4 right-4 z-[200] flex flex-col items-center"
          >
            <motion.div
              animate={{
                boxShadow: [
                  '0 0 15px rgba(197,160,89,0.4), 0 0 30px rgba(197,160,89,0.2)',
                  '0 0 25px rgba(197,160,89,0.7), 0 0 50px rgba(197,160,89,0.35)',
                  '0 0 15px rgba(197,160,89,0.4), 0 0 30px rgba(197,160,89,0.2)',
                ],
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              onClick={() => setRoleAlert(false)}
              className="w-full max-w-md rounded-2xl border-2 border-[#C5A059] bg-gradient-to-b from-[#1a1508] to-[#0d0a02] p-5 cursor-pointer"
              style={{ backdropFilter: 'blur(20px)' }}
            >
              {/* Ø§Ù„Ø£ÙŠÙ‚ÙˆÙ†Ø© Ø§Ù„Ù…ØªØ­Ø±ÙƒØ© */}
              <motion.div
                className="text-4xl text-center mb-2"
                animate={{ rotateY: [0, 180, 360] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                ðŸŽ´
              </motion.div>
                          {/* Ø§Ù„Ù†Øµ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ */}
              <h3
                className="text-[#C5A059] text-xl font-black text-center mb-1"
                style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 20px rgba(197,160,89,0.5)' }}
              >
                ØªÙ… ØªØ¹ÙŠÙŠÙ† Ø¯ÙˆØ±Ùƒ!
              </h3>
              <p className="text-[#C5A059]/80 text-sm text-center font-bold" style={{ fontFamily: 'Amiri, serif' }}>
                Ø§Ù‚Ù„Ø¨ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© Ù„Ù…Ø¹Ø±ÙØ© Ù‡ÙˆÙŠØªÙƒ Ø§Ù„Ø³Ø±ÙŠØ©
              </p>

              {/* Ø´Ø±ÙŠØ· Ù…ØªØ­Ø±Ùƒ */}
              <motion.div
                className="mt-3 h-[2px] bg-gradient-to-r from-transparent via-[#C5A059] to-transparent rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />

              <p className="text-[#555] text-[8px] font-mono uppercase tracking-[0.2em] text-center mt-2">
                TAP CARD TO REVEAL Â· TAP HERE TO DISMISS
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* â”€â”€ Ù†Ø§ÙØ°Ø© ØªØ£ÙƒÙŠØ¯ Ø§Ù„ØªØ¨Ø¯ÙŠÙ„ Ø¨ÙŠÙ† Ø§Ù„ØºØ±Ù â”€â”€ */}
      <AnimatePresence>
        {switchConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4"
            style={{ backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="w-full max-w-sm rounded-2xl border-2 border-[#C5A059]/50 bg-gradient-to-b from-[#1a1508] to-[#0a0804] p-6"
              style={{ boxShadow: '0 0 40px rgba(197,160,89,0.2)' }}
            >
              {/* Ø£ÙŠÙ‚ÙˆÙ†Ø© */}
              <div className="text-5xl text-center mb-4">ðŸ”„</div>

              {/* Ø§Ù„Ø¹Ù†ÙˆØ§Ù† */}
              <h3
                className="text-[#C5A059] text-xl font-black text-center mb-4"
                style={{ fontFamily: 'Amiri, serif' }}
              >
                ØªØ¨Ø¯ÙŠÙ„ Ø§Ù„ØºØ±ÙØ©
              </h3>

              {/* Ø§Ù„ØªÙØ§ØµÙŠÙ„ */}
              <div className="space-y-3 mb-6">
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                  <p className="text-[9px] font-mono text-red-400/70 uppercase tracking-widest mb-1">Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ©</p>
                  <p className="text-red-300 font-bold text-sm" style={{ fontFamily: 'Amiri, serif' }}>
                    {switchConfirm.currentGameName}
                  </p>
                </div>
                <div className="text-center text-[#C5A059] text-lg">â†“</div>
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                  <p className="text-[9px] font-mono text-green-400/70 uppercase tracking-widest mb-1">Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©</p>
                  <p className="text-green-300 font-bold text-sm" style={{ fontFamily: 'Amiri, serif' }}>
                    {switchConfirm.targetGameName}
                  </p>
                </div>
              </div>

              {/* Ø±Ø³Ø§Ù„Ø© ØªÙˆØ¶ÙŠØ­ÙŠØ© */}
              <p className="text-[#808080] text-xs text-center mb-5 leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
                Ø³ÙŠØªÙ… ØªØ¬Ù…ÙŠØ¯ Ù…Ø´Ø§Ø±ÙƒØªÙƒ ÙÙŠ Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙˆÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„ÙŠÙ‡Ø§ Ù„Ø§Ø­Ù‚Ø§Ù‹
              </p>

              {/* Ø§Ù„Ø£Ø²Ø±Ø§Ø± */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Ø§Ø¨Ù‚Ù‰ ÙÙŠ Ø§Ù„ØºØ±ÙØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ© â†’ Ø­Ø§ÙˆÙ„ rejoin
                    if (switchConfirm && emit) {
                      const normalized = phone.startsWith('0') ? phone : '0' + phone;
                      emit('room:rejoin-player', {
                        roomId: switchConfirm.currentRoomId,
                        physicalId: 0,
                        phone: normalized,
                        playerId: playerId || getSavedPlayerId() || undefined, // ðŸª‘ Ø§Ù„Ù‡ÙˆÙŠØ© Ø£ÙˆÙ„Ø§Ù‹
                      }).then((res: any) => {
                        if (res?.success && res.player) {
                          setRoomId(switchConfirm.currentRoomId);
                          setPhysicalId(String(res.player.physicalId));
                          setDisplayName(res.player.name);
                          if (res.player.role) setAssignedRole(res.player.role);
                          if (!res.player.isAlive) { setIsPlayerDead(true); setCardFlipped(true); }
                          setStep('rejoined');
                        } else if (res?.code === 'IDENTITY_REQUIRED') {
                          // ðŸªª Ø§Ù„Ø®Ø§Ø¯Ù… Ù„Ù… ÙŠØªØ¹Ø±Ù‘Ù Ø¹Ù„ÙŠÙ†Ø§ (Ù„Ø§ Ø­Ø³Ø§Ø¨ ÙˆÙ„Ø§ Ù‡Ø§ØªÙ Ù…Ø·Ø§Ø¨Ù‚) â€” Ù„Ø§ Ù†ØªØ±ÙƒÙ‡
                          // Ù…Ø¹Ù„Ù‘Ù‚Ø§Ù‹ Ø¹Ù„Ù‰ Ø²Ø±ÙÙ‘ Ù„Ø§ ÙŠÙØ¹Ù„ Ø´ÙŠØ¦Ø§Ù‹: Ù†Ø¹ÙŠØ¯Ù‡ Ù„Ø´Ø§Ø´Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¨Ø±Ø³Ø§Ù„ØªÙ‡
                          setActiveToast({ message: res.error || 'ØªØ¹Ø°Ù‘Ø± Ø§Ù„ØªØ¹Ø±Ù‘Ù Ø¹Ù„ÙŠÙƒ â€” Ø£Ø¹Ø¯ Ø§Ù„Ø¯Ø®ÙˆÙ„', type: 'warning' });
                          setStep('phone');
                        }
                      }).catch((e: any) => {
                        if (e?.response?.code === 'IDENTITY_REQUIRED') {
                          setActiveToast({ message: e.response.error || 'ØªØ¹Ø°Ù‘Ø± Ø§Ù„ØªØ¹Ø±Ù‘Ù Ø¹Ù„ÙŠÙƒ â€” Ø£Ø¹Ø¯ Ø§Ù„Ø¯Ø®ÙˆÙ„', type: 'warning' });
                          setStep('phone');
                        }
                      });
                    }
                    setSwitchConfirm(null);
                  }}
                  disabled={switchLoading}
                  className="flex-1 py-3 rounded-xl border border-[#333] bg-black/60 text-[#888] font-bold text-sm transition-all hover:border-[#555] hover:text-white disabled:opacity-50"
                  style={{ fontFamily: 'Amiri, serif' }}
                >
                  Ø§Ø¨Ù‚ÙŽ Ù‡Ù†Ø§
                </button>
                <button
                  onClick={handleSwitchRoom}
                  disabled={switchLoading}
                  className="flex-1 py-3 rounded-xl border-2 border-[#C5A059] text-[#C5A059] font-black text-sm transition-all hover:bg-[#C5A059]/10 disabled:opacity-50"
                  style={{ fontFamily: 'Amiri, serif', boxShadow: '0 0 15px rgba(197,160,89,0.2)' }}
                >
                  {switchLoading ? 'â³ Ø¬Ø§Ø±Ù...' : 'Ø§Ù†ØªÙ‚Ù„ Ù„Ù„ØºØ±ÙØ©'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Mafia Team Gallery Modal */}
      <MafiaTeamGallery
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        /* ðŸ‘¥ Ø¯ÙØ§Ø¹: Ù„Ø§ ØªÙØ¹Ø±Ø¶ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø§ÙÙŠØ§ Ø¥Ù„Ø§ Ø¥Ø°Ø§ ÙƒØ§Ù† Ø¯ÙˆØ± Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø§Ù„Ø­Ø§Ù„ÙŠ Ù…Ø§ÙÙŠØ§ ÙØ¹Ù„Ø§Ù‹ â€”
           ÙŠÙ…Ù†Ø¹ ØªØ³Ø±Ù‘Ø¨ ÙØ±ÙŠÙ‚ Ù…Ø­ÙÙˆØ¸ Ù…Ù† Ù„Ø¹Ø¨Ø© Ø³Ø§Ø¨Ù‚Ø© Ù„Ù„Ø£Ø® Ø§Ù„Ø£ØµØºØ±/Ø§Ù„Ù…ÙˆØ§Ø·Ù† Ø­ØªÙ‰ Ù„Ùˆ Ø¨Ù‚ÙŠ ÙÙŠ Ø§Ù„Ø­Ø§Ù„Ø© Ù„Ø­Ø¸ÙŠØ§Ù‹.
           Ø¨Ø¹Ø¯ ØªØ­ÙˆÙ‘Ù„ Ø§Ù„Ø£Ø® Ø§Ù„Ø£ØµØºØ± ÙŠØµØ¨Ø­ Ø¯ÙˆØ±Ù‡ Ù…Ø§ÙÙŠØ§ÙˆÙŠØ§Ù‹ ÙØªØ¸Ù‡Ø± Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø·Ø¨ÙŠØ¹ÙŠØ§Ù‹. */
        team={assignedRole && (MAFIA_ROLES as unknown as string[]).includes(assignedRole) ? mafiaTeam : []}
        /* Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„ØªØ¹Ø§Ø±Ù Ù„Ù„Ø£Ø® Ø§Ù„Ø£ÙƒØ¨Ø± (Ù…Ø§ÙÙŠØ§) ÙÙ‚Ø· â€” Ù†ÙØ³ Ø§Ù„Ø­Ù…Ø§ÙŠØ© Ø¶Ø¯ Ø¨Ù‚Ø§ÙŠØ§ Ù„Ø¹Ø¨Ø© Ø³Ø§Ø¨Ù‚Ø© */
        sibling={assignedRole && (MAFIA_ROLES as unknown as string[]).includes(assignedRole) ? sibling : null}
        isAssassin={assignedRole === 'ASSASSIN'}
        assassinContracts={assassinContracts}
        /* ðŸ’§ ÙˆØ³Ù…ÙŒ ÙŠÙØ¶Ø­ Ù…Ø³Ø±Ù‘Ø¨ Ø£ÙŠÙ‘ Ù„Ù‚Ø·Ø© â€” Ø§Ù„Ø§Ø³Ù… ÙˆØ§Ù„Ù…Ù‚Ø¹Ø¯ ÙˆØ§Ù„ØºØ±ÙØ© ÙˆØ§Ù„ÙˆÙ‚Øª */
        watermark={`${displayName || 'Ù„Ø§Ø¹Ø¨'} Â· Ù…Ù‚Ø¹Ø¯ ${physicalId} Â· ${roomCode} Â· ${new Date().toTimeString().slice(0, 5)}`}
      />

      {/* â”€â”€ Ø²Ø± Ø´Ø±ÙƒØ§Ø¡ Ø§Ù„Ù…Ø§ÙÙŠØ§ Ø§Ù„Ø¹Ø§Ø¦Ù… (Ù…ÙˆØ¬ÙˆØ¯ ÙƒØ´ÙƒÙ„ Ù„Ù„Ø¬Ù…ÙŠØ¹ Ù„ØªØ¬Ù†Ø¨ ÙƒØ´Ù Ø§Ù„Ø¯ÙˆØ±) â”€â”€ */}
      {assignedRole !== null && gamePhase !== 'GAME_OVER' && (step === 'done' || step === 'rejoined') && (
        <button
          onClick={() => {
            // ðŸ•µï¸ ØªÙ†Ø¨ÙŠÙ‡ Ù„Ø­Ø¸ÙŠ Ù„Ù„ÙŠØ¯Ø± Ø¨Ø£Ù† Ø§Ù„Ù„Ø§Ø¹Ø¨ ÙØªØ­/Ø­Ø§ÙˆÙ„ ÙØªØ­ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ØªØ¹Ø±Ù (fire-and-forget)
            import('@/lib/socket').then(m => m.getSocket().emit('player:mafia-gallery-open', { roomId })).catch(() => {});
            // Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø§Ù„Ù…ÙÙ‚ØµÙ‰ Ù…Ù…Ù†ÙˆØ¹ Ù…Ù† ÙØªØ­ Ø§Ù„Ù…Ø¹Ø±Ø¶ (Ø§Ù„Ø³ÙŠØ±ÙØ± ÙŠÙ…ÙŠÙ‘Ø²Ù‡ ÙˆÙŠÙÙ†Ø¨Ù‘Ù‡ Ø§Ù„Ù„ÙŠØ¯Ø± Ø¨Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©)
            if (isPlayerDead) return;
            setIsGalleryOpen(true);
          }}
          className="fixed bottom-[110px] left-4 z-[90] bg-[#8A0303]/90 hover:bg-[#8A0303] text-white border border-red-500/50 p-3 rounded-full shadow-[0_0_15px_rgba(138,3,3,0.5)] transition-transform hover:scale-110 flex items-center justify-center backdrop-blur-sm"
          title="Ø§Ù„ØªØ¹Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø§ÙÙŠØ§"
        >
          <Users className="w-6 h-6" />
        </button>
      )}

      {/* Player Notepad FAB â€” ÙÙˆÙ‚ Ø§Ù„Ø¨ÙˆØªÙˆÙ… Ø¨Ø§Ø± */}
      {(step === 'done' || step === 'rejoined') && (
        <button
          onClick={() => setIsNotepadOpen(true)}
          className="fixed bottom-[88px] right-4 w-12 h-12 bg-[#111] border-2 border-[#C5A059] text-xl flex items-center justify-center rounded-full shadow-[0_0_20px_rgba(197,160,89,0.3)] z-[90] hover:scale-105 transition-transform"
          title="Ù…ÙÙƒØ±Ø© Ø§Ù„ØªØ­Ø±ÙŠ"
        >
          ðŸ“
        </button>
      )}

      {/* ðŸ½ï¸ Ø²Ø±Ù‘ Ø§Ù„Ø·Ù„Ø¨ Ù…Ù† Ø§Ù„Ù…ÙƒØ§Ù† â€” Ø¯Ø§Ø®Ù„ Ø§Ù„ØºØ±ÙØ© Ø­ÙŠØ« ÙŠØ·Ù„Ø¨ Ø§Ù„Ù„Ø§Ø¹Ø¨ ÙØ¹Ù„Ø§Ù‹.
          ÙŠØ¸Ù‡Ø± ÙÙ‚Ø· Ø¥Ø°Ø§ Ø£Ø¹Ø§Ø¯ /api/fnb/context Ø³ÙŠØ§Ù‚Ø§Ù‹ (Ø­Ø¬Ø²ÙŒ + Ù†Ø§ÙØ°Ø© Ø§Ù„Ø·Ù„Ø¨)ØŒ
          ÙÙ„Ø§ ÙŠØ²Ø­Ù… Ø§Ù„Ø´Ø§Ø´Ø© ÙÙŠ Ø§Ù„ØºØ±Ù Ø§Ù„ØªÙŠ Ù„Ø§ Ù…Ù†ÙŠÙˆ ÙÙŠÙ‡Ø§. */}
      {(step === 'done' || step === 'rejoined') && fnbReady && (
        <button
          onClick={() => setIsOrderOpen(true)}
          className="fixed bottom-[152px] right-4 w-12 h-12 bg-[#0d1f18] border-2 border-emerald-500/70 text-xl flex items-center justify-center rounded-full shadow-[0_0_20px_rgba(16,185,129,0.35)] z-[90] hover:scale-105 transition-transform"
          title="Ø§Ø·Ù„Ø¨ Ù…Ù† Ø§Ù„Ù…ÙƒØ§Ù†"
        >
          ðŸ½ï¸
        </button>
      )}

      {/* ðŸ½ï¸ ÙˆØ±Ù‚Ø© Ø§Ù„Ø·Ù„Ø¨ â€” ØªÙÙØªØ­ ÙÙˆÙ‚ Ø´Ø§Ø´Ø© Ø§Ù„Ù„Ø¹Ø¨Ø© ÙˆÙ„Ø§ ØªØºØ§Ø¯Ø±Ù‡Ø§.
          Ø§Ù„Ù„Ø§Ø¹Ø¨ ÙÙŠ Ø¬ÙˆÙ„Ø©Ù Ø¬Ø§Ø±ÙŠØ©: Ù…ØºØ§Ø¯Ø±Ø© Ø§Ù„ØµÙØ­Ø© ØªÙ‚Ø·Ø¹ Ø§Ù„Ø³ÙˆÙƒÙŠØª ÙˆØªØ¹ÙŠØ¯ Ø§Ù„Ø§Ù†Ø¶Ù…Ø§Ù…. */}
      {isOrderOpen && (
        <div
          className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setIsOrderOpen(false)}
        >
          {/* ðŸ”´ Ø§Ø±ØªÙØ§Ø¹ÙŒ Ø«Ø§Ø¨ØªÙŒ Ø¨Ù„Ø§ ØªÙ…Ø±ÙŠØ±Ù Ù‡Ù†Ø§: Ø§Ù„Ù„ÙˆØ­Ø© ØªØ¯ÙŠØ± ØªÙ…Ø±ÙŠØ±Ù‡Ø§ Ø§Ù„Ø¯Ø§Ø®Ù„ÙŠÙ‘ Ø¨ÙŠÙ†
              ØªØ±ÙˆÙŠØ³Ø©Ù ÙˆØ´Ø±ÙŠØ·Ù Ø«Ø§Ø¨ØªÙŽÙŠÙ†. ØªÙ…Ø±ÙŠØ±ÙŒ Ø®Ø§Ø±Ø¬ÙŠÙŒÙ‘ Ù‡Ù†Ø§ ÙƒØ§Ù† ÙŠÙØ®ÙÙŠ Ø´Ø±ÙŠØ· Ø§Ù„Ø³Ù„Ù‘Ø©. */}
          <div
            className="w-full max-w-lg h-[88dvh] overflow-hidden rounded-t-3xl sm:rounded-2xl border-t sm:border border-emerald-500/25"
            style={{ background: '#050505' }}
            onClick={e => e.stopPropagation()}
          >
            <OrderPanel embedded onClose={() => setIsOrderOpen(false)} onEmptyContext={() => setFnbReady(false)} />
          </div>
        </div>
      )}


      {/* Player Notepad Modal */}
      <PlayerNotepad
        roomId={roomId}
        myPhysicalId={parseInt(physicalId) || 0}
        players={roster.length > 0 ? roster : votingPlayersInfo}
        isOpen={isNotepadOpen}
        onClose={() => setIsNotepadOpen(false)}
        onNotesChange={setNotepadNotes}
        /* ðŸª‘ ÙŠØªØºÙŠÙ‘Ø± Ø¨Ø¹Ø¯ Ø¥Ø¹Ø§Ø¯Ø© ØªØ±ØªÙŠØ¨ Ø§Ù„Ù…Ù‚Ø§Ø¹Ø¯: ÙŠÙØ¬Ø¨Ø± Ø§Ù„Ù…ÙÙƒØ±Ø© Ø¹Ù„Ù‰ Ø¥Ø¹Ø§Ø¯Ø© Ù‚Ø±Ø§Ø¡Ø© Ø¯Ù„ÙˆÙ‡Ø§
           Ø§Ù„Ù…ÙØ±Ø­ÙŽÙ‘Ù„ ÙˆØ¥Ø¹Ø§Ø¯Ø© Ø¬Ù„Ø¨ Ø³Ø¬Ù„Ù‘ Ø§Ù„ØªØ´Ø§ÙˆØ± (ÙƒÙ„Ø§Ù‡Ù…Ø§ Ø£ÙØ¹ÙŠØ¯ ØªØ±Ù‚ÙŠÙ…Ù‡) */
        remapNonce={notepadRemapNonce}
        chatVisible={
          // ðŸ—£ï¸ ØªØ¨ÙˆÙŠØ¨ Ø§Ù„ØªØ´Ø§ÙˆØ±: Ù…Ø§ÙÙŠØ§ Ø­ÙŠÙ‘ + Ø§Ù„ØºØ±ÙØ© Ù…ÙØ¹Ù‘Ù„Ø© Ù…Ù† Ø§Ù„Ù„ÙŠØ¯Ø± + Ù…Ø±Ø­Ù„Ø© Ù„Ø¹Ø¨ ÙØ¹Ù„ÙŠØ©.
          // ÙŠÙØ­Ø³Ø¨ Ø¹Ù„Ù‰ Ø¬Ù‡Ø§Ø² Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù†ÙØ³Ù‡ ÙÙ‚Ø· (Ù„Ø§ ÙŠÙØ¨Ø«Ù‘ Ø´ÙŠØ¡)Ø› ÙˆØ§Ù„Ø³ÙŠØ±ÙØ± ÙŠØªØ­Ù‚Ù‚ Ø³ÙŠØ§Ø¯ÙŠØ§Ù‹ Ø¹Ù„Ù‰ ÙƒÙ„ Ø¹Ù…Ù„ÙŠØ©.
          mafiaChatEnabled &&
          !isPlayerDead &&
          (['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'].includes(assignedRole || '') || mafiaTeam.length > 0) &&
          // ROLE_BINDING Ù…Ø³Ù…ÙˆØ­Ø©: Ø§Ù…ØªÙ„Ø§Ùƒ assignedRole ÙŠØ¹Ù†ÙŠ Ø£Ù† Ø§Ù„Ø£Ø¯ÙˆØ§Ø± Ø§Ø¹ØªÙÙ…Ø¯Øª ÙˆÙˆÙØ²Ù‘Ø¹Øª ÙØ¹Ù„Ø§Ù‹
          !['LOBBY', 'ROLE_GENERATION', 'GAME_OVER'].includes(gamePhase || '')
        }
      />

      {/* â•â• Auto Night: Ø´Ø§Ø´Ø© Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ø§Ù„Ù„ÙŠÙ„ÙŠ â€” ØªØµÙ…ÙŠÙ… Ù…Ø·Ø§Ø¨Ù‚ Ù„Ù„ØªØµÙˆÙŠØª â•â• */}
      {nightActionRequired && !nightActionSubmitted && (
        <div className="fixed inset-0 z-[200] bg-gradient-to-b from-[#0a0812] via-[#070510] to-[#000]" style={{ fontFamily: 'Amiri, serif' }}>
          <div className="flex flex-col h-full safe-area-inset">
            {/* Header */}
            <div className="text-center pt-8 pb-3 px-4">
              <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-4xl mb-2"
              >ðŸŒ™</motion.div>
              <p className="text-[9px] font-mono text-[#666] tracking-[0.2em] uppercase mb-1">Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ù„ÙŠÙ„</p>
              <h2 className="text-xl font-black text-[#C5A059]">
                {nightActionRequired.stepRole === 'MAFIA' ? 'Ø§Ù„Ù…Ø§ÙÙŠØ§' :
                  nightActionRequired.stepRole === 'GODFATHER' ? 'Ø§Ù„Ø¹Ø±Ø§Ø¨' :
                  nightActionRequired.stepRole === 'SILENCER' ? 'Ø§Ù„Ù…ÙØ³ÙƒØª' :
                  nightActionRequired.stepRole === 'SHERIFF' ? 'Ø§Ù„Ù…Ø­Ù‚Ù‚' :
                  nightActionRequired.stepRole === 'DOCTOR' ? 'Ø§Ù„Ø·Ø¨ÙŠØ¨' :
                  nightActionRequired.stepRole === 'NURSE' ? 'Ø§Ù„Ù…Ù…Ø±Ø¶Ø©' :
                  nightActionRequired.stepRole === 'SNIPER' ? 'Ø§Ù„Ù‚Ù†Ø§Øµ' :
                  nightActionRequired.stepRole === 'CHAMELEON' ? 'Ø§Ù„Ø­Ø±Ø¨Ø§Ø¡' :
                  nightActionRequired.stepRole || 'Ù…Ø¬Ù‡ÙˆÙ„'}
              </h2>
              <p className="text-[#888] text-xs mt-1">
                {nightActionRequired.isDecoy
                  ? 'Ø§Ø®ØªØ± Ø£ÙŠ Ø´Ø®Øµ Ù„Ù„ØªÙ…ÙˆÙŠÙ‡...'
                  : (
                    (nightActionRequired.actionType === 'KILL' && 'Ø§Ø®ØªØ± Ù‡Ø¯Ù Ø§Ù„Ø§ØºØªÙŠØ§Ù„') ||
                    (nightActionRequired.actionType === 'INVESTIGATE' && 'Ù…Ù† ØªØ±ÙŠØ¯ Ø§Ù„ØªØ­Ù‚ÙŠÙ‚ Ù…Ø¹Ù‡ØŸ') ||
                    (nightActionRequired.actionType === 'PROTECT' && 'Ù…Ù† ØªØ±ÙŠØ¯ Ø­Ù…Ø§ÙŠØªÙ‡ Ø§Ù„Ù„ÙŠÙ„Ø©ØŸ') ||
                    (nightActionRequired.actionType === 'SNIPE' && 'Ø§Ø®ØªØ± Ù‡Ø¯Ù Ø§Ù„Ù‚Ù†Øµ') ||
                    (nightActionRequired.actionType === 'SILENCE' && 'Ù…Ù† ØªØ±ÙŠØ¯ Ø¥Ø³ÙƒØ§ØªÙ‡ØŸ') ||
                    (nightActionRequired.actionType === 'DISABLE' && 'Ø§Ø®ØªØ± Ù„Ø§Ø¹Ø¨Ø§Ù‹ Ù„ØªØ¹Ø·ÙŠÙ„ Ù‚Ø¯Ø±ØªÙ‡') ||
                    (nightActionRequired.actionType === 'DECOY' && 'Ø§Ø®ØªØ± Ø£ÙŠ Ø´Ø®Øµ')
                  )
                }
              </p>
            </div>

            {/* Ø§Ù„ØªØ§ÙŠÙ…Ø± Ø§Ù„Ø¯Ø§Ø¦Ø±ÙŠ */}
            <div className="flex justify-center py-2">
              <div className="relative w-16 h-16">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1a1a2e" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none"
                    stroke={nightActionCountdown <= 5 ? '#ef4444' : nightActionCountdown <= 10 ? '#f59e0b' : '#C5A059'}
                    strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${Math.max(0, (nightActionCountdown / (nightActionRequired.timeoutSeconds || 15)) * 97.4)} 97.4`}
                    style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.3s ease' }}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-lg font-black font-mono ${
                  nightActionCountdown <= 5 ? 'text-red-400 animate-pulse' : nightActionCountdown <= 10 ? 'text-amber-400' : 'text-white'
                }`}>
                  {nightActionCountdown}
                </span>
              </div>
            </div>

            {/* Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ù‡Ø¯Ø§Ù â€” ØªØµÙ…ÙŠÙ… Ù…Ø·Ø§Ø¨Ù‚ Ù„Ù„ØªØµÙˆÙŠØª */}
            <div className="flex-1 overflow-y-auto px-4 pb-2">
              <div className="space-y-2">
                {nightActionRequired.availableTargets.map(target => {
                  return (
                    <motion.button
                      key={target.physicalId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={async () => {
                        if (!emit || nightActionSubmitted) return;
                        setNightActionSubmitted(true);
                        if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
                        await emit('player:night-action', {
                          roomId,
                          actionType: nightActionRequired.actionType,
                          targetPhysicalId: target.physicalId,
                        }).catch(() => {});
                        setTimeout(() => setNightActionRequired(null), 1500);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 border rounded-2xl transition-all text-right ${
                        'bg-gradient-to-r from-white/[0.03] to-transparent border-[#2a2a2a] hover:border-[#C5A059]/40 hover:bg-[#C5A059]/5 active:bg-[#8A0303]/20 active:border-[#8A0303]/60'
                      }`}
                    >
                      <div className={`relative w-11 h-11 rounded-full border-2 flex items-center justify-center shrink-0 overflow-hidden border-[#C5A059]/30`}>
                        {(target as any).avatarUrl ? (
                          <>
                            <img src={(target as any).avatarUrl} alt="" className="w-full h-full object-cover grayscale opacity-80" />
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="text-sm font-black drop-shadow-md text-white">#{target.physicalId}</span>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#C5A059]/10">
                            <span className="text-sm font-black text-[#C5A059]">#{target.physicalId}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">
                          {target.name || `Ù„Ø§Ø¹Ø¨ #${target.physicalId}`}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Ø²Ø± ØªØ®Ø·ÙŠ */}
            {nightActionRequired.canSkip && !nightActionRequired.isDecoy && (
              <div className="px-4 pb-4 pt-2">
                <button
                  onClick={async () => {
                    if (!emit || nightActionSubmitted) return;
                    setNightActionSubmitted(true);
                    if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
                    await emit('player:night-action', {
                      roomId,
                      actionType: nightActionRequired.actionType,
                      targetPhysicalId: null,
                    }).catch(() => {});
                    setTimeout(() => setNightActionRequired(null), 1500);
                  }}
                  className="w-full py-2.5 text-[#666] hover:text-[#999] text-xs font-mono transition-colors border border-[#1a1a1a] rounded-xl hover:border-[#333]"
                >
                  ØªØ®Ø·ÙŠ Ù‡Ø°Ù‡ Ø§Ù„Ø®Ø·ÙˆØ© â†
                </button>
              </div>
            )}
          </div>

          {/* Ø±Ø³Ø§Ù„Ø© ØªØ£ÙƒÙŠØ¯ */}
          {nightActionSubmitted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center bg-black/90"
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-6xl mb-4"
                >âœ…</motion.div>
                <p className="text-white font-black text-xl">ØªÙ… Ø§Ù„Ø¥Ø±Ø³Ø§Ù„</p>
                <p className="text-[#666] text-xs font-mono mt-2 tracking-widest">WAITING FOR RESULTS...</p>
              </motion.div>
            </motion.div>
          )}
        </div>
      )}

      {/* â•â• Nurse Activation Prompt â•â• */}
      {nurseActivationPending && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center px-4" style={{ fontFamily: 'Amiri, serif' }}>
          <div className="bg-[#111] border border-[#C5A059]/30 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="text-5xl mb-4">ðŸ¥</div>
            <h2 className="text-2xl font-black text-[#C5A059] mb-2">Ø§Ù„Ù…Ù…Ø±Ø¶Ø©</h2>
            <p className="text-gray-300 text-sm mb-6 leading-relaxed">
              Ø§Ù„Ø·Ø¨ÙŠØ¨ ØºÙŠØ± Ù…ØªØ§Ø­ Ù‡Ø°Ù‡ Ø§Ù„Ù„ÙŠÙ„Ø©.<br/>
              Ù‡Ù„ ØªØ±ÙŠØ¯ÙŠÙ† ØªÙØ¹ÙŠÙ„ ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„Ø­Ù…Ø§ÙŠØ©ØŸ
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  setNurseActivationPending(false);
                  if (!emit) return;
                  await emit('nurse:activation-response', { roomId, activate: false }).catch(() => {});
                }}
                className="flex-1 py-3 rounded-xl border border-[#333] bg-black/60 text-[#888] font-bold text-sm"
              >
                Ù„Ø§ØŒ ØªØ®Ø·ÙŠ
              </button>
              <button
                onClick={async () => {
                  setNurseActivationPending(false);
                  if (!emit) return;
                  await emit('nurse:activation-response', { roomId, activate: true }).catch(() => {});
                }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black text-sm"
              >
                Ù†Ø¹Ù…ØŒ Ø£Ø±ÙŠØ¯ Ø§Ù„Ø­Ù…Ø§ÙŠØ©
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â•â• Roles Modal â•â• */}
      <RolesInfoModal isOpen={rolesModalOpen} onClose={() => setRolesModalOpen(false)} />
    </div>
  );
}

