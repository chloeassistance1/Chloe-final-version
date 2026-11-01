import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  AvatarState,
  AvatarPreferences,
  DEFAULT_AVATAR_PREFERENCES
} from '../types/avatar.ts';

interface AvatarContextValue {
  state: AvatarState;
  setState: (state: AvatarState) => void;
  preferences: AvatarPreferences;
  updatePreferences: (updates: Partial<AvatarPreferences>) => void;
  triggerStatePreview: (state: AvatarState, durationMs?: number) => void;
  clearPreview: () => void;
  isOverridden: boolean;
}

const STORAGE_KEY = 'chloe_avatar_prefs_v2';

const AvatarContext = createContext<AvatarContextValue | null>(null);

export const AvatarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<AvatarPreferences>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_AVATAR_PREFERENCES, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load avatar preferences from localStorage:', e);
    }
    return DEFAULT_AVATAR_PREFERENCES;
  });

  const [state, setRawState] = useState<AvatarState>('idle');
  const [overrideState, setOverrideState] = useState<AvatarState | null>(null);

  const updatePreferences = useCallback((updates: Partial<AvatarPreferences>) => {
    setPreferences(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save avatar preferences:', e);
      }
      return next;
    });
  }, []);

  const triggerStatePreview = useCallback((previewState: AvatarState, durationMs = 6000) => {
    setOverrideState(previewState);
    if (durationMs > 0) {
      setTimeout(() => {
        setOverrideState(null);
      }, durationMs);
    }
  }, []);

  const clearPreview = useCallback(() => {
    setOverrideState(null);
  }, []);

  const effectiveState = overrideState || state;

  return (
    <AvatarContext.Provider
      value={{
        state: effectiveState,
        setState: setRawState,
        preferences,
        updatePreferences,
        triggerStatePreview,
        clearPreview,
        isOverridden: overrideState !== null,
      }}
    >
      {children}
    </AvatarContext.Provider>
  );
};

export function useGlobalAvatar(): AvatarContextValue {
  const ctx = useContext(AvatarContext);
  if (!ctx) {
    // Return safe fallback if not wrapped in provider
    return {
      state: 'idle',
      setState: () => {},
      preferences: DEFAULT_AVATAR_PREFERENCES,
      updatePreferences: () => {},
      triggerStatePreview: () => {},
      clearPreview: () => {},
      isOverridden: false,
    };
  }
  return ctx;
}
