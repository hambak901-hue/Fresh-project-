/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { PhaseTracker, PHASES } from './components/PhaseTracker';
import { Phase1FoundationView } from './components/Phase1FoundationView';
import { WalletModal } from './components/WalletModal';
import { api } from './lib/api';
import { Shield, Sparkles, Server, Terminal, Lock, CheckCircle2, ChevronRight, ExternalLink } from 'lucide-react';

function AppContent() {
  const { user } = useAuth();
  const [selectedPhase, setSelectedPhase] = useState<string>('01');
  const [walletModalOpen, setWalletModalOpen] = useState<boolean>(false);
  const [serverOnline, setServerOnline] = useState<boolean>(true);

  useEffect(() => {
    // Ping backend to verify server health
    api.getSystemStatus()
      .then(() => setServerOnline(true))
      .catch(() => setServerOnline(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        serverOnline={serverOnline}
        onOpenWalletModal={() => setWalletModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Phase Roadmap Progression Tracker */}
        <PhaseTracker
          currentPhaseNumber={selectedPhase}
          onSelectPhase={phaseNum => setSelectedPhase(phaseNum)}
        />

        {/* Phase Views */}
        {selectedPhase === '01' ? (
          <Phase1FoundationView onProceedToPhase2={() => setSelectedPhase('02')} />
        ) : (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mx-auto flex items-center justify-center">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                Phase {selectedPhase} Queued
              </span>
              <h3 className="text-xl font-bold text-white mt-2">
                {PHASES.find(p => p.number === selectedPhase)?.title}
              </h3>
              <p className="text-xs text-slate-400 max-w-lg mx-auto mt-2 leading-relaxed">
                {PHASES.find(p => p.number === selectedPhase)?.description}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 max-w-md mx-auto text-left text-xs space-y-2">
              <div className="font-semibold text-slate-300">Phase Rule Enforced:</div>
              <p className="text-slate-400 text-[11px]">
                Per project specifications, AI Studio completes and tests each phase sequentially. Phase 01 Foundation, Database, and Credentials Vault are completed and verified.
              </p>
            </div>

            <button
              onClick={() => setSelectedPhase('01')}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700"
            >
              Return to Phase 01 Foundation Console
            </button>
          </div>
        )}
      </main>

      {/* Wallet Modal */}
      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-6 mt-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">HambakTech Enterprise</span>
            <span>&bull;</span>
            <span>TrueHost LON110 (51.89.153.183:1624)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-emerald-400 flex items-center gap-1 font-mono text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Credentials Vault Secured
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Phase 01 Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
