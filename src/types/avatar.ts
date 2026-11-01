export type AvatarState = 
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'responding'
  | 'speaking'
  | 'error'
  | 'offline';

export type AvatarSize = 'small' | 'medium' | 'large';
export type AvatarPosition = 'left' | 'center' | 'right';
export type AvatarVisibility = 'low' | 'normal' | 'high';
export type AvatarIntensity = 'low' | 'normal' | 'high';
export type AvatarLayoutMode = 'background' | 'side' | 'hybrid';

export interface AvatarPreferences {
  enabled: boolean;
  size: AvatarSize;
  position: AvatarPosition;
  visibility: AvatarVisibility;
  mode: AvatarLayoutMode;
  animated: boolean;
  intensity: AvatarIntensity;
  voiceSync: boolean;
  showStatusBadge: boolean;
  ambientParticles: boolean;
}

export const DEFAULT_AVATAR_PREFERENCES: AvatarPreferences = {
  enabled: true,
  size: 'medium',
  position: 'center',
  visibility: 'normal',
  mode: 'hybrid',
  animated: true,
  intensity: 'normal',
  voiceSync: true,
  showStatusBadge: true,
  ambientParticles: true,
};
