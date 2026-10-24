
"""
Self-supervised Vision Worker - MAE (Masked Autoencoder)
แบบเดียวกับ LLM แต่ใช้กับรูปกราฟ
ปิดบังกราฟ 30% ให้มันเดาเอง
"""
import torch
import torch.nn as nn

class MAEChartWorker(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(32, 64, 3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d(1)
        )
        self.decoder = nn.Linear(64, 3*10*10) # recon masked patch
        
    def forward(self, x, mask_ratio=0.3):
        # x: chart image (B,3,H,W)
        # Mask 30%
        B, C, H, W = x.shape
        masked = x.clone()
        mask = torch.rand(B,1,H,W) < mask_ratio
        masked[mask.expand_as(masked)] = 0
        feat = self.encoder(masked).squeeze()
        return feat

    def train_step(self):
        print("🖼️ CNN Vision Worker - MAE Chart Understanding - Mask 30% -> เข้าใจแพทเทิร์นแท่งเทียน")

if __name__ == "__main__":
    worker = MAEChartWorker()
    dummy = torch.randn(2,3,64,64)
    feat = worker(dummy)
    print(f"Feature shape: {feat.shape}")
