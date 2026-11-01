import React from 'react';
import { AgentInfo } from '../../shared/types.ts';
import {
  Users,
  Search,
  Code2,
  FileText,
  Mail,
  UserCheck,
  Workflow,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Layers
} from 'lucide-react';

interface AgentsViewProps {
  agents: AgentInfo[];
}

const AGENT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  chloe_orchestrator: Users,
  search_agent: Search,
  dev_agent: Code2,
  docs_agent: FileText,
  comm_agent: Mail,
  personal_agent: UserCheck,
  automation_agent: Workflow,
  creative_agent: Sparkles,
  security_agent: ShieldCheck,
  quality_agent: CheckCircle2,
};

export const AgentsView: React.FC<AgentsViewProps> = ({ agents }) => {
  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">Système Multi-Agents Intelligent</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-500/30">
            {agents.length} Agents Spécialisés
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Architecture multi-agents : sélection automatique de l'agent expert selon l'intention utilisateur
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {agents.map(agent => {
          const Icon = AGENT_ICONS[agent.id] || Users;
          const isActive = agent.status === 'active';

          return (
            <div
              key={agent.id}
              className={`rounded-2xl border p-4 transition-all ${
                isActive
                  ? 'bg-[#0f1428] border-purple-900/50 shadow-md'
                  : 'bg-[#0b0e1c] border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-purple-600/30 border border-purple-500/40 text-purple-300'
                      : 'bg-slate-800/60 border border-slate-700/60 text-slate-400'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{agent.name}</h3>
                    <p className="text-[11px] text-purple-300 font-medium">{agent.role}</p>
                  </div>
                </div>

                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                  isActive
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {isActive ? 'Actif' : 'En veille'}
                </span>
              </div>

              <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                {agent.description}
              </p>

              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1 font-mono text-purple-400">
                  <Cpu className="w-3.5 h-3.5" />
                  {agent.model}
                </span>

                <span className="bg-slate-800/80 px-2 py-0.5 rounded text-slate-300">
                  {agent.executionCount} requêtes traitées
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {agent.tools.map((t, idx) => (
                  <span key={idx} className="bg-black/40 text-[10px] font-mono text-purple-300 px-1.5 py-0.5 rounded border border-purple-900/30">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
