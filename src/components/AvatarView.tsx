import React from 'react';
import { UserSettings } from '../../shared/types.ts';
import { AvatarState } from '../types/avatar.ts';
import { useGlobalAvatar } from '../context/AvatarContext.tsx';
import { Mic, Brain, Volume2, Sparkles, AlertCircle, WifiOff } from 'lucide-react';

interface AvatarViewProps {
  settings?: Partial<UserSettings>;
  className?: string;
  size?: 'small' | 'medium' | 'large' | 'full';
  stateOverride?: AvatarState;
  showBadge?: boolean;
  showAura?: boolean;
  onClick?: () => void;
  interactive?: boolean;
}

export const AvatarView: React.FC<AvatarViewProps> = ({
  settings,
  className = '',
  size = 'medium',
  stateOverride,
  showBadge = true,
  showAura = true,
  onClick,
  interactive = false,
}) => {
  const globalAvatar = useGlobalAvatar();
  const currentState: AvatarState = stateOverride || globalAvatar.state;
  const isAnimated = globalAvatar.preferences?.animated ?? true;

  // Determine dynamic animation class based on avatar state (defined in index.css)
  const getAnimationClass = (state: AvatarState): string => {
    if (!isAnimated) return '';

    switch (state) {
      case 'listening':
        return 'anim-chloe-listening';
      case 'thinking':
        return 'anim-chloe-thinking';
      case 'speaking':
        return 'anim-chloe-speaking';
      case 'responding':
        return 'anim-chloe-idle';
      case 'error':
        return 'anim-chloe-idle';
      case 'offline':
        return '';
      case 'idle':
      default:
        return 'anim-chloe-idle';
    }
  };

  // Determine aura glowing effect class
  const getAuraClass = (state: AvatarState): string => {
    if (!isAnimated) return '';
    switch (state) {
      case 'listening':
        return 'anim-chloe-glow-active';
      case 'thinking':
      case 'speaking':
      case 'responding':
      case 'idle':
        return 'anim-chloe-aura';
      default:
        return '';
    }
  };

  // Get state styling metadata
  const getStateMeta = () => {
    switch (currentState) {
      case 'listening':
        return {
          label: 'Écoute active',
          badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          haloClass: 'from-cyan-500/35 via-purple-600/30 to-transparent',
          dotClass: 'bg-cyan-400',
          icon: Mic,
        };
      case 'thinking':
        return {
          label: 'Réflexion IA',
          badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          haloClass: 'from-purple-600/40 via-indigo-600/30 to-transparent',
          dotClass: 'bg-purple-400',
          icon: Brain,
        };
      case 'responding':
        return {
          label: 'Réponse en cours',
          badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
          haloClass: 'from-indigo-500/40 via-purple-600/30 to-transparent',
          dotClass: 'bg-indigo-400',
          icon: Sparkles,
        };
      case 'speaking':
        return {
          label: 'Lecture vocale',
          badgeClass: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
          haloClass: 'from-fuchsia-500/45 via-purple-600/35 to-transparent',
          dotClass: 'bg-fuchsia-400',
          icon: Volume2,
        };
      case 'error':
        return {
          label: 'Alerte temporaire',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          haloClass: 'from-amber-500/30 via-purple-900/20 to-transparent',
          dotClass: 'bg-amber-400',
          icon: AlertCircle,
        };
      case 'offline':
        return {
          label: 'Hors ligne',
          badgeClass: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
          haloClass: 'from-slate-700/20 via-transparent to-transparent',
          dotClass: 'bg-slate-500',
          icon: WifiOff,
        };
      case 'idle':
      default:
        return {
          label: 'En veille attentive',
          badgeClass: 'bg-purple-950/40 text-purple-300 border-purple-500/30',
          haloClass: 'from-purple-600/30 via-indigo-900/20 to-transparent',
          dotClass: 'bg-emerald-400',
          icon: Sparkles,
        };
    }
  };

  const meta = getStateMeta();
  const StateIcon = meta.icon;

  const getHeightClass = () => {
    switch (size) {
      case 'small':
        return 'h-48 sm:h-56 max-h-[250px]';
      case 'large':
        return 'h-[80vh] max-h-[750px]';
      case 'full':
        return 'h-full max-h-[85vh]';
      case 'medium':
      default:
        return 'h-[65vh] max-h-[620px]';
    }
  };

  const avatarUrl = settings?.avatarUrl || '/chloe-avatar-fullbody.webp';

  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col items-center justify-end select-none ${
        interactive ? 'cursor-pointer group' : ''
      } ${className}`}
      style={{ transformOrigin: 'bottom center' }}
    >
      {/* Dynamic Ambient Aura */}
      {showAura && (
        <div
          className={`absolute -inset-10 rounded-full bg-gradient-radial ${meta.haloClass} blur-3xl pointer-events-none transition-all duration-1000 ${getAuraClass(
            currentState
          )}`}
        />
      )}

      {/* Main Avatar Image with Dynamic Animation Class */}
      <div
        className={`relative z-10 flex items-end justify-center transition-transform duration-500 ${getAnimationClass(
          currentState
        )}`}
        style={{ transformOrigin: 'bottom center' }}
      >
        <img
          src={avatarUrl}
          alt="CHLOÉ AI — Présence Virtuelle"
          className={`${getHeightClass()} w-auto object-contain drop-shadow-[0_12px_30px_rgba(0,0,0,0.85)] filter transition-all duration-500`}
          loading="eager"
          decoding="async"
          onError={e => {
            const target = e.currentTarget;
            if (!target.src.includes('chloe-avatar-fullbody_f3fa7d52.webp')) {
              target.src = '/assets/aistudio/chloe-avatar-fullbody_f3fa7d52.webp';
            }
          }}
        />

        {/* Realistic Floor Shadow for grounding */}
        <div className="absolute -bottom-2 w-3/4 h-5 rounded-[100%] bg-black/70 blur-md pointer-events-none" />
      </div>

      {/* Interactive Status Badge */}
      {showBadge && (
        <div className="mt-2.5 z-20">
          <div
            className={`px-3 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1.5 backdrop-blur-md shadow-lg transition-all ${meta.badgeClass}`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${meta.dotClass}`}
              />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${meta.dotClass}`} />
            </span>
            <StateIcon className="w-3 h-3 shrink-0" />
            <span>{meta.label}</span>
          </div>
        </div>
      )}
    </div>
  );
};
