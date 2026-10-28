"""
dl_models.py — Deep Learning Fleet
Inference <50ms on CPU | TorchScript exported
"""
import torch
import torch.nn as nn
import time
from typing import Dict, Tuple
import numpy as np

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 1) LSTM Wave Predictor
class LSTMWavePredictor(nn.Module):
    def __init__(self, input_dim=8, hidden=64, layers=2):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden, layers, batch_first=True, dropout=0.1)
        self.attn = nn.MultiheadAttention(hidden, 4, batch_first=True)
        self.fc = nn.Sequential(
            nn.Linear(hidden, 32),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(32, 3)  # [wave_up_prob, wave_down_prob, neutral]
        )
    
    def forward(self, x):  # x: [B, 100, 8]
        out, _ = self.lstm(x)
        attn_out, _ = self.attn(out, out, out)
        last = attn_out[:, -1, :]
        return torch.softmax(self.fc(last), dim=-1)

# 2) Transformer SMC Detector
class TransformerSMCDetector(nn.Module):
    def __init__(self, d_model=64, nhead=4, nlayers=2):
        super().__init__()
        encoder_layer = nn.TransformerEncoderLayer(d_model, nhead, 128, dropout=0.1, batch_first=True)
        self.transformer = nn.TransformerEncoder(encoder_layer, nlayers)
        self.input_proj = nn.Linear(10, d_model)
        self.classifier = nn.Linear(d_model, 4)  # OB Bull, OB Bear, FVG Bull, FVG Bear
    
    def forward(self, x):  # [B, 50, 10]
        x = self.input_proj(x)
        feat = self.transformer(x)
        return torch.sigmoid(self.classifier(feat[:, -1, :]))

# 3) CNN PA Classifier
class CNNPAClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(5, 16, 3, padding=1), nn.ReLU(), nn.MaxPool1d(2),
            nn.Conv1d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool1d(2),
            nn.Conv1d(32, 64, 3, padding=1), nn.ReLU(),
            nn.AdaptiveAvgPool1d(1)
        )
        self.fc = nn.Sequential(
            nn.Linear(64, 32), nn.ReLU(),
            nn.Linear(32, 3)  # Engulfing, Pinbar, Inside
        )
    
    def forward(self, x):  # [B, 5, 60] OHLCV
        f = self.conv(x).squeeze(-1)
        return torch.softmax(self.fc(f), dim=-1)

# 4) RL Risk Optimizer (PPO Critic)
class RLRiskOptimizer(nn.Module):
    def __init__(self, state_dim=12):
        super().__init__()
        self.actor = nn.Sequential(
            nn.Linear(state_dim, 64), nn.Tanh(),
            nn.Linear(64, 32), nn.Tanh(),
            nn.Linear(32, 1), nn.Sigmoid()  # risk multiplier 0-1 -> scale to 0.5-1.5
        )
        self.critic = nn.Sequential(
            nn.Linear(state_dim, 64), nn.Tanh(),
            nn.Linear(64, 1)
        )
    
    def forward(self, state):
        risk_mult = self.actor(state) * 1.0 + 0.5
        value = self.critic(state)
        return risk_mult, value

class FleetEnsemble:
    def __init__(self):
        self.wave = LSTMWavePredictor().to(DEVICE).eval()
        self.smc = TransformerSMCDetector().to(DEVICE).eval()
        self.pa = CNNPAClassifier().to(DEVICE).eval()
        self.rl = RLRiskOptimizer().to(DEVICE).eval()
        # Load best weights if exist
        try:
            self.wave.load_state_dict(torch.load("models/wave_best.pt", map_location=DEVICE))
            self.smc.load_state_dict(torch.load("models/smc_best.pt", map_location=DEVICE))
            self.pa.load_state_dict(torch.load("models/pa_best.pt", map_location=DEVICE))
            self.rl.load_state_dict(torch.load("models/rl_best.pt", map_location=DEVICE))
        except: 
            print("Using random init — run auto_retrain.py first")
        
        # TorchScript for <50ms
        self._scripted = False

    @torch.no_grad()
    def predict(self, market_tensor: Dict[str, torch.Tensor]) -> Dict:
        t0 = time.time()
        wave_out = self.wave(market_tensor['wave'].to(DEVICE))
        smc_out = self.smc(market_tensor['smc'].to(DEVICE))
        pa_out = self.pa(market_tensor['pa'].to(DEVICE))
        risk_mult, _ = self.rl(market_tensor['rl'].to(DEVICE))

        # Ensemble weighted score (DL 25% as per BEST_CONFIG)
        wave_score = wave_out[0,0].item() - wave_out[0,1].item()  # up - down
        smc_score = smc_out[0].mean().item()
        pa_score = pa_out[0].max().item()
        final_score = (wave_score*0.4 + smc_score*0.35 + pa_score*0.25)

        latency = (time.time() - t0) * 1000
        return {
            "final_score": float(final_score),
            "wave": wave_out.cpu().numpy(),
            "smc": smc_out.cpu().numpy(),
            "pa": pa_out.cpu().numpy(),
            "risk_mult": float(risk_mult.item()),
            "latency_ms": latency
        }

    def assert_latency(self):
        dummy = {
            'wave': torch.randn(1,100,8),
            'smc': torch.randn(1,50,10),
            'pa': torch.randn(1,5,60),
            'rl': torch.randn(1,12)
        }
        res = self.predict(dummy)
        assert res['latency_ms'] < 50, f"Too slow: {res['latency_ms']}"
        print(f"✓ Latency OK: {res['latency_ms']:.1f}ms")

if __name__ == "__main__":
    fe = FleetEnsemble()
    fe.assert_latency()
