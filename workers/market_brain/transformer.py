"""Causal patch Transformer for intraday market research; no execution integration."""
from __future__ import annotations
try:
    import torch
    from torch import nn
except ImportError as exc:  # pragma: no cover - optional runtime dependency
    raise ImportError("VOOM Market Brain requires optional PyTorch to load the model") from exc

class IntradayPatchTransformer(nn.Module):
    """Patch-based causal encoder with direction, regime and volatility heads."""
    def __init__(self, *, feature_count: int = 5, patch_size: int = 4,
                 d_model: int = 64, nhead: int = 4, layers: int = 3,
                 dropout: float = 0.10, max_patches: int = 256) -> None:
        super().__init__()
        if feature_count < 1 or patch_size < 1 or d_model < 8 or d_model % nhead:
            raise ValueError("invalid Transformer dimensions")
        if layers < 1 or max_patches < 1 or not 0 <= dropout < 1:
            raise ValueError("invalid Transformer depth, capacity or dropout")
        self.feature_count, self.patch_size, self.max_patches = feature_count, patch_size, max_patches
        self.patch_projection = nn.Linear(feature_count * patch_size, d_model)
        self.position = nn.Parameter(torch.zeros(1, max_patches, d_model))
        layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead,
            dim_feedforward=d_model * 4, dropout=dropout, batch_first=True,
            norm_first=True, activation="gelu")
        self.encoder = nn.TransformerEncoder(layer, num_layers=layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d_model)
        self.direction_head = nn.Linear(d_model, 3)  # SELL / WAIT / BUY
        self.regime_head = nn.Linear(d_model, 3)     # trend / range / high-volatility
        self.volatility_head = nn.Linear(d_model, 1)

    def forward(self, features: torch.Tensor) -> dict[str, torch.Tensor]:
        if features.ndim != 3 or features.shape[-1] != self.feature_count:
            raise ValueError("features must have shape [batch, bars, feature_count]")
        batch, bars, feature_count = features.shape
        usable = (bars // self.patch_size) * self.patch_size
        if usable < self.patch_size:
            raise ValueError("input must contain at least one complete patch")
        x = features[:, bars - usable:, :].reshape(batch, usable // self.patch_size,
                                                   self.patch_size * feature_count)
        x = self.patch_projection(x)
        patches = x.shape[1]
        if patches > self.max_patches:
            raise ValueError("input exceeds configured max_patches")
        x = x + self.position[:, :patches, :]
        causal_mask = torch.triu(torch.ones(patches, patches, device=x.device, dtype=torch.bool), diagonal=1)
        encoded = self.norm(self.encoder(x, mask=causal_mask))[:, -1, :]
        return {"direction_logits": self.direction_head(encoded),
                "regime_logits": self.regime_head(encoded),
                "volatility_log_scale": self.volatility_head(encoded).squeeze(-1)}
