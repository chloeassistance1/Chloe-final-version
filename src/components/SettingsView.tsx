import React, { useState } from 'react';
import { UserSettings } from '../../shared/types.ts';
import {
  Settings,
  User,
  Sliders,
  Volume2,
  Cpu,
  Globe,
  Download,
  AlertOctagon,
  Check,
  Smartphone,
  Shield,
  Sparkles,
  Eye,
  Layers,
  Activity,
  ShieldCheck
} from 'lucide-react';
import { useAvatarState } from '../hooks/useAvatarState.ts';
import { AvatarSize, AvatarPosition, AvatarVisibility, AvatarLayoutMode } from '../types/avatar.ts';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdateSettings: (updates: Partial<UserSettings>) => Promise<void>;
  onExportData: () => void;
  onWipeAccount: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onExportData,
  onWipeAccount,
}) => {
  const [form, setForm] = useState<UserSettings>(settings);
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Avatar state and preferences
  const avatar = useAvatarState();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings(form);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2500);
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto pb-24">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">Paramètres de CHLOÉ</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-500/30">
            Personnalisation
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Ajustez l'identité, la présence virtuelle, la voix, le modèle d'IA et les préférences de votre assistante
        </p>
      </div>

      {savedFeedback && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Paramètres enregistrés avec succès.</span>
        </div>
      )}

      {/* Section 1: Présence Virtuelle & Avatar Full-Body */}
      <div className="p-4 rounded-2xl bg-[#0f1428] border border-purple-500/30 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">
                Présence Virtuelle Immersive (Full-Body)
              </h3>
              <p className="text-[11px] text-purple-300">
                Avatar en pied présent pendant vos conversations sur Samsung Galaxy S24
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-purple-950/70 border border-purple-500/40 text-purple-200 px-2 py-0.5 rounded-full">
            Actif
          </span>
        </div>

        {/* Live Preview Card */}
        <div className="flex flex-col sm:flex-row items-center gap-4 p-3.5 rounded-xl bg-[#080b18] border border-slate-800">
          <div className="w-24 h-36 rounded-xl overflow-hidden bg-gradient-to-b from-purple-950/50 to-black/80 border border-purple-500/30 flex items-end justify-center relative shrink-0 shadow-lg shadow-purple-950/60">
            <img
              src="/chloe-avatar-fullbody.webp"
              alt="Aperçu CHLOÉ en pied"
              className="h-32 object-contain"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes('chloe-avatar-fullbody_f3fa7d52.webp')) {
                  target.src = '/assets/aistudio/chloe-avatar-fullbody_f3fa7d52.webp';
                }
              }}
            />
            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400" />
          </div>

          <div className="space-y-1.5 flex-1 text-[11px]">
            <p className="text-white font-medium">
              Silhouette féminine élégante & naturelle — Tenue soignée
            </p>
            <p className="text-slate-400 leading-relaxed">
              CHLOÉ s'affiche en pied (pull col roulé mauve, pantalon violet) avec une micro-respiration et des postures synchronisées avec la conversation (écoute, réflexion, parole).
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/20 text-[10px]">
                Taille : {avatar.preferences.size}
              </span>
              <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/20 text-[10px]">
                Position : {avatar.preferences.position}
              </span>
              <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/20 text-[10px]">
                Visibilité : {avatar.preferences.visibility}
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/20 text-[10px]">
                {avatar.preferences.animated ? 'Animée (GPU)' : 'Statique'}
              </span>
            </div>
          </div>
        </div>

        {/* Avatar Settings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
          <div>
            <label className="block text-slate-400 font-medium mb-1">Taille à l'écran :</label>
            <select
              value={avatar.preferences.size}
              onChange={e => avatar.updatePreferences({ size: e.target.value as AvatarSize })}
              className="w-full bg-[#12162B] border border-slate-700/80 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
            >
              <option value="small">Compacte (50% de hauteur)</option>
              <option value="medium">Standard (70% de hauteur)</option>
              <option value="large">Grande (85% de hauteur)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Positionnement :</label>
            <select
              value={avatar.preferences.position}
              onChange={e => avatar.updatePreferences({ position: e.target.value as AvatarPosition })}
              className="w-full bg-[#12162B] border border-slate-700/80 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
            >
              <option value="center">Au centre (recommandé fond)</option>
              <option value="left">À gauche</option>
              <option value="right">À droite</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Intensité visuelle / Opacité :</label>
            <select
              value={avatar.preferences.visibility}
              onChange={e => avatar.updatePreferences({ visibility: e.target.value as AvatarVisibility })}
              className="w-full bg-[#12162B] border border-slate-700/80 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
            >
              <option value="low">Discrète (25% en transparence)</option>
              <option value="normal">Équilibrée (55% lisible)</option>
              <option value="high">Affirmée (85% mise en avant)</option>
            </select>
          </div>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 cursor-pointer">
            <span className="text-slate-300">Animations naturelles (respiration/postures)</span>
            <input
              type="checkbox"
              checked={avatar.preferences.animated}
              onChange={e => avatar.updatePreferences({ animated: e.target.checked })}
              className="w-4 h-4 accent-purple-600 rounded"
            />
          </label>

          <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 cursor-pointer">
            <span className="text-slate-300">Synchronisation vocale avec l'aura</span>
            <input
              type="checkbox"
              checked={avatar.preferences.voiceSync}
              onChange={e => avatar.updatePreferences({ voiceSync: e.target.checked })}
              className="w-4 h-4 accent-purple-600 rounded"
            />
          </label>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Identité & Avatar */}
        <div className="p-4 rounded-2xl bg-[#0f1428] border border-slate-800/80 space-y-3">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-purple-400" />
            Identité de l'assistante
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Nom de l'IA :</label>
              <input
                type="text"
                value={form.assistantName}
                onChange={e => setForm({ ...form, assistantName: e.target.value })}
                className="w-full bg-[#12162B] border border-slate-700/80 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Langue principale :</label>
              <select
                value={form.language}
                onChange={e => setForm({ ...form, language: e.target.value })}
                className="w-full bg-[#12162B] border border-slate-700/80 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
              >
                <option value="fr">Français (France)</option>
                <option value="en">English (US)</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Personnalité & Ton (System Instruction) :</label>
            <textarea
              rows={3}
              value={form.personality}
              onChange={e => setForm({ ...form, personality: e.target.value })}
              className="w-full bg-[#12162B] border border-slate-700/80 rounded-xl p-3 text-slate-100 focus:outline-none focus:border-purple-500 leading-relaxed"
            />
          </div>
        </div>

        {/* Voix et Synthèse */}
        <div className="p-4 rounded-2xl bg-[#0f1428] border border-slate-800/80 space-y-3">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-purple-400" />
            Synthèse vocale & Audio
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Vitesse d'élocution : {form.voiceSpeed}x
              </label>
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                value={form.voiceSpeed}
                onChange={e => setForm({ ...form, voiceSpeed: parseFloat(e.target.value) })}
                className="w-full accent-purple-600 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Tonalité de la voix : {form.voicePitch}
              </label>
              <input
                type="range"
                min="0.8"
                max="1.4"
                step="0.05"
                value={form.voicePitch}
                onChange={e => setForm({ ...form, voicePitch: parseFloat(e.target.value) })}
                className="w-full accent-purple-600 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Moteur IA & Limites */}
        <div className="p-4 rounded-2xl bg-[#0f1428] border border-slate-800/80 space-y-3">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            Moteur Gemini & Limites quotidiennes
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Modèle d'IA :</label>
              <select
                value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
                className="w-full bg-[#12162B] border border-slate-700/80 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
              >
                <option value="gemini-3.8-flash">gemini-3.8-flash (Standard équilibré)</option>
                <option value="gemini-4-argon">gemini-4-argon (Raisonnement poussé)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Éco / ultra-rapide)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Plafond requêtes/jour :</label>
              <input
                type="number"
                min="10"
                max="1000"
                value={form.dailyRequestLimit}
                onChange={e => setForm({ ...form, dailyRequestLimit: parseInt(e.target.value) || 100 })}
                className="w-full bg-[#12162B] border border-slate-700/80 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <div>
              <span className="font-medium text-slate-200 block">Mode Économique</span>
              <span className="text-[11px] text-slate-400">Minimise les tokens et privilégie les réponses courtes</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.ecoMode}
                onChange={e => setForm({ ...form, ecoMode: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>

        {/* Bouton de sauvegarde */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-purple-950/60"
          >
            Enregistrer les modifications
          </button>
        </div>
      </form>

      {/* Zone Danger : RGPD Export & Effacement */}
      <div className="mt-6 p-4 rounded-2xl bg-red-950/20 border border-red-900/40 space-y-3">
        <h3 className="font-semibold text-red-300 text-sm flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-red-400" />
          Données personnelles & RGPD
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Propriétaire légitime : <strong>{settings.ownerEmail}</strong> (Samsung Galaxy S24).
          Vous disposez d'un contrôle souverain sur vos informations conformément aux tests 19 et 20.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onExportData}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exporter toutes mes données (JSON)
          </button>

          <button
            type="button"
            onClick={() => {
              if (confirm("ATTENTION : Cette action supprimera définitivement l'ensemble de votre compte, mémoires, documents et conversations. Confirmer ?")) {
                onWipeAccount();
              }
            }}
            className="bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700/60 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            Supprimer tout mon compte
          </button>
        </div>
      </div>
    </div>
  );
};
