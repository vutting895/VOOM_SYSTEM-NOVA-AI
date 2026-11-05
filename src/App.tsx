import React from 'react';
import { Routes, Route } from 'react-router-dom';
import QuickitMarketFleetView from './components/QuickitMarketFleetView';
import QuantumEngineView from './components/QuantumEngineView';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<QuickitMarketFleetView initialTab="dashboard" />} />
      <Route path="/overview" element={<QuickitMarketFleetView initialTab="dashboard" />} />
      <Route path="/markets" element={<QuickitMarketFleetView initialTab="market" />} />
      <Route path="/marketplace" element={<QuickitMarketFleetView initialTab="market" />} />
      <Route path="/strategies" element={<QuickitMarketFleetView initialTab="market" />} />
      <Route path="/live" element={<QuickitMarketFleetView initialTab="trading" />} />
      <Route path="/chat" element={<QuickitMarketFleetView initialTab="trading" />} />
      <Route path="/pro" element={<QuickitMarketFleetView initialTab="portfolio" />} />
      <Route path="/settings" element={<QuickitMarketFleetView initialTab="settings" />} />
      <Route path="/broker" element={<QuickitMarketFleetView initialTab="settings" />} />
      <Route path="/profile" element={<QuickitMarketFleetView initialTab="settings" />} />
      <Route path="/login" element={<QuickitMarketFleetView initialTab="settings" />} />
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
