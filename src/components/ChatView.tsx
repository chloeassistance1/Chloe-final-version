import React, { useState, useRef, useEffect } from 'react';
import {
  ChatMessage,
  UserSettings,
  PendingApproval
} from '../../shared/types.ts';
import {
  Send,
  Mic,
  MicOff,
  Camera,
  Paperclip,
  Globe,
  Volume2,
  VolumeX,
  X,
  ExternalLink,
  Wrench,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Sliders,
  UserCheck
} from 'lucide-react';
import { AvatarPresence } from './avatar/AvatarPresence.tsx';
import { AvatarControlsModal } from './avatar/AvatarControlsModal.tsx';
import { useAvatarState } from '../hooks/useAvatarState.ts';

interface ChatViewProps {
  messages: ChatMessage[];
  loading: boolean;
  onSendMessage: (text: string, image?: string, enableSearch?: boolean) => Promise<void>;
  settings: UserSettings;
  approvals: PendingApproval[];
  onOpenApproval: (approval: PendingApproval) => void;
  onSelectTab: (tabId: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  loading,
  onSendMessage,
  settings,
  approvals,
  onOpenApproval,
  onSelectTab,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [isAvatarControlsOpen, setIsAvatarControlsOpen] = useState(false);

  // Hook for avatar virtual presence synchronization
  const avatar = useAvatarState({
    isListening,
    isLoading: loading,
    isSpeaking,
    hasError: false,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Speech Recognition setup (Web Speech API)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = settings.language === 'en' ? 'en-US' : 'fr-FR';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(prev => (prev ? `${prev} ${transcript}` : transcript));
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [settings.language]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("La reconnaissance vocale n'est pas supportée par votre navigateur mobile.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Text-To-Speech (Web Speech Synthesis)
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*_#`\[\]]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = settings.language === 'en' ? 'en-US' : 'fr-FR';
    utterance.rate = settings.voiceSpeed || 1.0;
    utterance.pitch = settings.voicePitch || 1.05;

    // Pick female voice if available
    const voices = window.speechSynthesis.getVoices();
    const frenchVoice =
      voices.find(v => v.lang.startsWith('fr') && /female|femme|amelie|julie|hortense|celia/i.test(v.name)) ||
      voices.find(v => v.lang.startsWith('fr'));
    if (frenchVoice) {
      utterance.voice = frenchVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedImage) || loading) return;

    const text = inputText.trim();
    const img = selectedImage || undefined;

    setInputText('');
    setSelectedImage(null);
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    await onSendMessage(text, img, searchEnabled);
  };

  const toggleToolExpand = (msgId: string) => {
    setExpandedTools(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  // Check if side panel layout should be active on wide desktop
  const isSideModeActive = avatar.preferences.mode === 'side';

  return (
    <div className="flex flex-col h-full bg-[#070913] text-slate-100 relative overflow-hidden">
      {/* CHLOÉ Top Hero Bar */}
      <div className="border-b border-purple-900/30 bg-gradient-to-b from-[#0e1224] to-[#070913] px-3.5 sm:px-4 py-2.5 shrink-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => setIsAvatarControlsOpen(true)}
              className="relative group text-left cursor-pointer focus:outline-none"
              title="Ajuster la présence virtuelle de CHLOÉ"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl overflow-hidden border-2 border-purple-500/40 shadow-lg shadow-purple-950/60 bg-purple-950/40 transition-transform group-hover:scale-105">
                <img
                  src="/chloe-avatar-fullbody.webp"
                  alt="Avatar de CHLOÉ"
                  className="w-full h-full object-cover object-top"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.includes('chloe-avatar-fullbody_f3fa7d52.webp')) {
                      target.src = '/assets/aistudio/chloe-avatar-fullbody_f3fa7d52.webp';
                    }
                  }}
                />
              </div>
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#070913] ${
                  avatar.state === 'listening'
                    ? 'bg-cyan-400 animate-ping'
                    : avatar.state === 'speaking'
                    ? 'bg-fuchsia-400 animate-pulse'
                    : avatar.state === 'thinking'
                    ? 'bg-purple-400 animate-pulse'
                    : 'bg-emerald-500'
                }`}
                title={`État : ${avatar.state}`}
              />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-white text-sm sm:text-base tracking-tight flex items-center gap-1.5">
                  <span>{settings.assistantName} AI</span>
                  <span className="hidden sm:inline-block text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-300 border border-purple-500/30">
                    S24 Pro
                  </span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span className="text-purple-300 font-medium">Présence virtuelle active</span>
                <span>·</span>
                <span className="text-emerald-400 hidden xs:inline">10 compétences</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Avatar Controls Button */}
            <button
              onClick={() => setIsAvatarControlsOpen(true)}
              className="text-xs bg-purple-950/50 hover:bg-purple-900/60 text-purple-200 border border-purple-500/30 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
              title="Ajuster la présence et les animations de CHLOÉ"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-medium">Présence</span>
            </button>

            <button
              onClick={() => onSelectTab('tests')}
              className="text-xs bg-slate-900/70 hover:bg-slate-800 text-slate-300 border border-slate-700/60 rounded-xl px-2.5 py-1.5 hidden sm:flex items-center gap-1 transition-colors"
              title="Espace de tests et validation"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tests 20/20</span>
            </button>
          </div>
        </div>

        {/* Pending approvals alert badge */}
        {approvals.filter(a => a.status === 'pending').length > 0 && (
          <div className="mt-2 p-2 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Action Niveau 3 en attente de votre accord explicite</span>
            </div>
            <button
              onClick={() => {
                const pending = approvals.find(a => a.status === 'pending');
                if (pending) onOpenApproval(pending);
              }}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-2 py-0.5 rounded text-[11px] transition-colors"
            >
              Vérifier
            </button>
          </div>
        )}
      </div>

      {/* Main Conversation & Avatar Composition Area */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Background Presence (Default on mobile and hybrid layouts) */}
        {!isSideModeActive && avatar.preferences.enabled && (
          <div className="absolute inset-0 z-0 pointer-events-none flex items-end justify-center pb-12 sm:pb-16 overflow-hidden">
            <AvatarPresence
              state={avatar.state}
              preferences={avatar.preferences}
              onOpenControls={() => setIsAvatarControlsOpen(true)}
              className="w-full h-full"
            />
          </div>
        )}

        {/* Side Panel Layout (When user explicitly chooses side mode) */}
        {isSideModeActive && avatar.preferences.enabled && (
          <div className="hidden md:flex w-72 lg:w-80 shrink-0 border-r border-purple-900/30 bg-[#090d1c]/80 backdrop-blur-md z-10 flex-col items-center justify-center p-4">
            <AvatarPresence
              state={avatar.state}
              preferences={avatar.preferences}
              onOpenControls={() => setIsAvatarControlsOpen(true)}
              isSidePanel={true}
              className="w-full"
            />
            <div className="mt-4 text-center px-4">
              <h3 className="font-semibold text-white text-xs">{settings.assistantName} AI</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Assistante personnelle connectée</p>
            </div>
          </div>
        )}

        {/* Message Stream (Foreground Layer) */}
        <div className="flex-1 overflow-y-auto px-3.5 sm:px-4 py-4 space-y-4 relative z-10">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shadow-xl shadow-purple-950/50">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Bonjour, je suis CHLOÉ.
              </h2>
              <p className="text-xs text-slate-300 max-w-sm leading-relaxed">
                Votre assistante personnelle intelligente. Posez-moi une question, dictez vocalement ou partagez une photo depuis votre Samsung Galaxy S24.
              </p>
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                {[
                  'Fais-moi un point sur mes rendez-vous',
                  'Génère une synthèse de mes notes',
                  'Planifie ma journée avec un rappel',
                  'Aide-moi à rédiger un email'
                ].map((sugg, i) => (
                  <button
                    key={i}
                    onClick={() => onSendMessage(sugg, undefined, searchEnabled)}
                    className="text-[11px] bg-[#121733]/80 hover:bg-[#1c234a] text-purple-200 border border-purple-500/20 rounded-xl px-3 py-1.5 transition-all shadow-sm active:scale-95"
                  >
                    {sugg}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => {
            const isUser = msg.role === 'user';
            const isExpanded = !!expandedTools[msg.id];

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full`}
              >
                <div
                  className={`flex gap-2.5 max-w-[92%] sm:max-w-[85%] ${
                    isUser ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl overflow-hidden border border-purple-500/30 bg-purple-950/40 shrink-0 mt-1 shadow-md">
                      <img
                        src="/chloe-avatar-fullbody.webp"
                        alt="CHLOÉ"
                        className="w-full h-full object-cover object-top"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.src.includes('chloe-avatar-fullbody_f3fa7d52.webp')) {
                            target.src = '/assets/aistudio/chloe-avatar-fullbody_f3fa7d52.webp';
                          }
                        }}
                      />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl p-3.5 text-sm backdrop-blur-md ${
                      isUser
                        ? 'bg-gradient-to-r from-purple-700/90 to-indigo-700/90 text-white shadow-lg shadow-purple-950/30 rounded-tr-sm border border-purple-400/20'
                        : 'bg-[#101426]/90 border border-slate-800/90 text-slate-200 shadow-xl shadow-black/40 rounded-tl-sm'
                    }`}
                  >
                    {/* Images if attached */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="mb-2.5 space-y-2">
                        {msg.images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt="Pièce jointe"
                            className="max-h-60 rounded-xl object-contain border border-white/10"
                          />
                        ))}
                      </div>
                    )}

                    {/* Message Text */}
                    <div className="whitespace-pre-wrap leading-relaxed space-y-1">
                      {msg.content}
                    </div>

                    {/* Tool Invocations Badge / Expansion */}
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-700/60">
                        <button
                          onClick={() => toggleToolExpand(msg.id)}
                          className="flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 font-medium"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          <span>
                            {msg.toolsUsed.length} outil{msg.toolsUsed.length > 1 ? 's' : ''} exécuté{msg.toolsUsed.length > 1 ? 's' : ''}
                          </span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-1.5 text-[11px] font-mono bg-black/50 p-2 rounded-lg border border-purple-500/20">
                            {msg.toolsUsed.map((t, idx) => (
                              <div key={idx} className="border-b border-slate-800/80 pb-1 last:border-none last:pb-0">
                                <span className="text-purple-400 font-semibold">{t.name}</span>
                                {t.args && (
                                  <p className="text-slate-400 truncate">Args: {JSON.stringify(t.args)}</p>
                                )}
                                {t.result && (
                                  <p className="text-emerald-300 truncate">Résultat: {JSON.stringify(t.result)}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sources from Google Grounding */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-800 text-xs">
                        <p className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                          <Globe className="w-3 h-3 text-cyan-400" />
                          Sources vérifiées :
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((src, idx) => (
                            <a
                              key={idx}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded"
                            >
                              <span className="truncate max-w-[140px]">{src.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pending Approval Button if attached */}
                    {msg.approvalId && (
                      <div className="mt-3 pt-2">
                        <button
                          onClick={() => {
                            const a = approvals.find(x => x.id === msg.approvalId);
                            if (a) onOpenApproval(a);
                          }}
                          className="w-full py-1.5 px-3 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Examiner la confirmation Niveau 3
                        </button>
                      </div>
                    )}

                    {/* Actions Bar (Voice synthesis, timestamp) */}
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>{new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>

                      {!isUser && (
                        <button
                          onClick={() => speakText(msg.content)}
                          className="p-1 hover:text-purple-300 text-slate-400 transition-colors"
                          title="Écouter la réponse oralement"
                        >
                          {isSpeaking ? (
                            <VolumeX className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex items-center gap-2.5 text-xs text-purple-300 bg-[#11162B]/90 backdrop-blur-md border border-purple-500/30 p-3 rounded-2xl w-fit shadow-lg shadow-purple-950/30">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span>CHLOÉ réfléchit et prépare sa réponse...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Image Preview Bar */}
      {selectedImage && (
        <div className="px-4 py-2 bg-[#0c1020] border-t border-purple-900/30 flex items-center gap-3 z-20">
          <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-purple-500/40">
            <img src={selectedImage} alt="Aperçu" className="w-full h-full object-cover" />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center text-[10px]"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-slate-300">
            Image prête à être envoyée. Posez votre question sur cette photo.
          </p>
        </div>
      )}

      {/* Voice Listening Bar */}
      {isListening && (
        <div className="px-4 py-2 bg-purple-950/80 border-t border-purple-500/40 flex items-center justify-between text-xs text-purple-200 animate-pulse z-20">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span>Écoute en cours... CHLOÉ vous écoute attentivement</span>
          </div>
          <button
            onClick={toggleListening}
            className="text-xs bg-red-600 hover:bg-red-500 text-white px-2.5 py-0.5 rounded font-medium shadow-md"
          >
            Arrêter
          </button>
        </div>
      )}

      {/* Samsung Galaxy S24 Thumb Ergonomic Input Area */}
      <div className="border-t border-purple-900/30 bg-[#090C19]/95 backdrop-blur-md px-3 py-2.5 pb-safe z-20">
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          onChange={handleImageUpload}
          className="hidden"
        />
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,.pdf,.txt,.md,.docx,.csv"
          onChange={handleImageUpload}
          className="hidden"
        />

        <form onSubmit={handleSubmit} className="flex items-end gap-1.5">
          {/* Quick Action Buttons Group */}
          <div className="flex items-center gap-0.5 pb-1">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-purple-300 hover:bg-purple-950/40 active:scale-95 transition-all"
              title="Prendre une photo avec l'appareil photo du S24"
            >
              <Camera className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-purple-300 hover:bg-purple-950/40 active:scale-95 transition-all"
              title="Joindre un fichier ou image"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setSearchEnabled(prev => !prev)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
                searchEnabled
                  ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-800/40'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title={searchEnabled ? 'Recherche Google Search activée' : 'Recherche désactivée'}
            >
              <Globe className="w-4 h-4" />
            </button>
          </div>

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={isListening ? 'Transcription vocale...' : 'Écrivez à CHLOÉ...'}
              rows={1}
              className="w-full bg-[#12162B] text-slate-100 placeholder-slate-500 text-sm rounded-2xl px-3.5 py-2.5 border border-slate-700/60 focus:outline-none focus:border-purple-500 resize-none max-h-24 leading-snug"
            />
          </div>

          {/* Voice Microphone */}
          <button
            type="button"
            onClick={toggleListening}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-all shrink-0 ${
              isListening
                ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-900/50'
                : 'bg-slate-800/80 hover:bg-purple-950/60 text-slate-300 hover:text-purple-300 border border-slate-700/60'
            }`}
            title="Activer la reconnaissance vocale"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedImage) || loading}
            className="w-10 h-10 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 text-white flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-purple-950/60 shrink-0"
            title="Envoyer le message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Avatar Customization Modal / Drawer */}
      <AvatarControlsModal
        isOpen={isAvatarControlsOpen}
        onClose={() => setIsAvatarControlsOpen(false)}
        preferences={avatar.preferences}
        onUpdatePreferences={avatar.updatePreferences}
        currentState={avatar.state}
        onPreviewState={avatar.triggerStatePreview}
        onClearPreview={avatar.clearPreview}
        isOverridden={avatar.isOverridden}
      />
    </div>
  );
};
