import React, { useState } from 'react';
import { SkillConfig } from '../../shared/types.ts';
import {
  Brain,
  Mic,
  Eye,
  Bookmark,
  Globe,
  Code2,
  Workflow,
  FileText,
  Languages,
  Sparkles,
  CheckCircle,
  Play,
  Shield,
  Layers,
  Settings2
} from 'lucide-react';

interface SkillsViewProps {
  skills: SkillConfig[];
  onToggleSkill: (id: string, enabled: boolean) => Promise<void>;
  onTestSkill: (id: string) => Promise<{ success: boolean; message: string }>;
}

const SKILL_ICONS: Record<string, React.FC<{ className?: string }>> = {
  reasoning: Brain,
  voice: Mic,
  vision: Eye,
  memory: Bookmark,
  web_search: Globe,
  developer: Code2,
  automation: Workflow,
  documents: FileText,
  translation: Languages,
  creative: Sparkles,
};

export const SkillsView: React.FC<SkillsViewProps> = ({ skills, onToggleSkill, onTestSkill }) => {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; message: string; success: boolean } | null>(null);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await onTestSkill(id);
      setTestResult({ id, message: res.message, success: res.success });
    } catch (e: any) {
      setTestResult({ id, message: e.message || 'Erreur lors du test', success: false });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">Skill Manager</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-500/30">
            {skills.filter(s => s.enabled).length}/10 Actives
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Gestionnaire central des 10 compétences de CHLOÉ AI avec contrôle des accès et tests unitaires
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {skills.map(skill => {
          const Icon = SKILL_ICONS[skill.id] || Brain;
          const isConfigOpen = activeConfigId === skill.id;

          return (
            <div
              key={skill.id}
              className={`rounded-2xl border p-4 transition-all ${
                skill.enabled
                  ? 'bg-[#0f1428] border-purple-900/40 shadow-sm'
                  : 'bg-[#0a0d1a] border-slate-800/60 opacity-75'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    skill.enabled
                      ? 'bg-gradient-to-br from-purple-600/30 to-indigo-600/30 border border-purple-500/40 text-purple-300'
                      : 'bg-slate-800/50 border border-slate-700/50 text-slate-500'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{skill.name}</h3>
                    <p className="text-[11px] font-mono text-purple-400/90">{skill.id}</p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skill.enabled}
                    onChange={e => onToggleSkill(skill.id, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                {skill.description}
              </p>

              {/* Badges */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60 flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5 text-indigo-400" />
                  {skill.accessLevel.replace('LEVEL_', 'Niv. ')}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-900/40">
                  {skill.usageCount} utilisations
                </span>
              </div>

              {/* Config & Test Buttons */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => setActiveConfigId(isConfigOpen ? null : skill.id)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>Détails & Permissions</span>
                </button>

                <button
                  onClick={() => handleTest(skill.id)}
                  disabled={testingId === skill.id || !skill.enabled}
                  className="bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-500/30 text-xs font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 disabled:opacity-40 transition-colors"
                >
                  <Play className="w-3 h-3" />
                  <span>{testingId === skill.id ? 'Test...' : 'Tester'}</span>
                </button>
              </div>

              {/* Expanded config */}
              {isConfigOpen && (
                <div className="mt-3 p-3 bg-black/40 rounded-xl border border-slate-800 text-[11px] space-y-2 text-slate-300">
                  <div>
                    <span className="font-semibold text-slate-400">Permissions requises :</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {skill.permissions.map((p, idx) => (
                        <span key={idx} className="bg-slate-800 px-1.5 py-0.5 rounded text-purple-300 font-mono">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400">Dépendances :</span>
                    <p className="text-slate-400 mt-0.5">{skill.dependencies.length > 0 ? skill.dependencies.join(', ') : 'Aucune dépendance externe requise.'}</p>
                  </div>
                  {skill.lastUsed && (
                    <div className="text-[10px] text-slate-500">
                      Dernier usage : {new Date(skill.lastUsed).toLocaleString('fr-FR')}
                    </div>
                  )}
                </div>
              )}

              {/* Test Result Feedback */}
              {testResult && testResult.id === skill.id && (
                <div className={`mt-2 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                    : 'bg-red-950/40 text-red-300 border border-red-800/40'
                }`}>
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
