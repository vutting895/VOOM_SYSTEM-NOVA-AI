import React from 'react';
import { Routes, Route } from 'react-router-dom';
import QuickitMarketFleetView from './components/QuickitMarketFleetView';
import QuantumEngineView from './components/QuantumEngineView';
import LearningWorksheetView from './components/learning/LearningWorksheetView';
import NovaNeuralStudioView from './components/strategy/NovaNeuralStudioView';
import GoogleWorkspaceExportView from './components/workspace/GoogleWorkspaceExportView';
import IndependentAuditView from './components/workspace/IndependentAuditView';
import SupabaseLoginView from './components/auth/SupabaseLoginView';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<QuickitMarketFleetView initialTab="dashboard" />} />
      <Route path="/dashboard" element={<QuickitMarketFleetView initialTab="dashboard" />} />
      <Route path="/overview" element={<QuickitMarketFleetView initialTab="dashboard" />} />
      <Route path="/intelligence" element={<QuickitMarketFleetView initialTab="intelligence" />} />
      <Route path="/backtest" element={<QuickitMarketFleetView initialTab="backtest" />} />
      <Route path="/infrastructure" element={<QuickitMarketFleetView initialTab="infrastructure" />} />
      <Route path="/learning" element={<QuickitMarketFleetView initialTab="learning" />} />
      <Route path="/learning/worksheet" element={<LearningWorksheetView />} />
      <Route path="/markets" element={<QuickitMarketFleetView initialTab="market" />} />
      <Route path="/marketplace" element={<QuickitMarketFleetView initialTab="market" />} />
      <Route path="/strategies" element={<QuickitMarketFleetView initialTab="market" />} />
      <Route path="/live" element={<QuickitMarketFleetView initialTab="trading" />} />
      <Route path="/chat" element={<QuickitMarketFleetView initialTab="trading" />} />
      <Route path="/pro" element={<QuickitMarketFleetView initialTab="portfolio" />} />
      <Route path="/settings" element={<QuickitMarketFleetView initialTab="settings" />} />
      <Route path="/broker" element={<QuickitMarketFleetView initialTab="settings" />} />
      <Route path="/profile" element={<QuickitMarketFleetView initialTab="settings" />} />
      <Route path="/login" element={<SupabaseLoginView />} />
      <Route path="/studio" element={<NovaNeuralStudioView />} />
      <Route path="/neural" element={<NovaNeuralStudioView />} />
      <Route path="/workspace" element={<GoogleWorkspaceExportView />} />
      <Route path="/drive" element={<GoogleWorkspaceExportView />} />
      <Route path="/audit" element={<IndependentAuditView />} />
      <Route path="/evidence" element={<IndependentAuditView />} />
      <Route
        path="/quantum"
        element={
          <div className="min-h-screen bg-[#090912] text-slate-100 p-6">
            <div className="max-w-7xl mx-auto">
              <QuantumEngineView />
            </div>
          </div>
        }
      />
      <Route path="*" element={<QuickitMarketFleetView initialTab="dashboard" />} />
    </Routes>
  );
}
