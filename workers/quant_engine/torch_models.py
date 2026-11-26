"""Optional PyTorch residual MLP for fixed-length market sequences."""
from __future__ import annotations

try:
    import torch
    from torch import nn
except ImportError:  # Keep the research package importable without the ML extra.
    torch = None
    nn = None


if torch is not None:
    class _ResidualBlock(nn.Module):
        def __init__(self, hidden_size: int, dropout: float):
            super().__init__()
            self.norm = nn.LayerNorm(hidden_size)
            self.linear1 = nn.Linear(hidden_size, hidden_size)
            self.activation = nn.GELU()
            self.dropout = nn.Dropout(dropout)
            self.linear2 = nn.Linear(hidden_size, hidden_size)

        def forward(self, x):
            residual = x
            x = self.norm(x)
            x = self.linear1(x)
            x = self.activation(x)
            x = self.dropout(x)
            x = self.linear2(x)
            return residual + x


    class ResidualMLP(nn.Module):
        def __init__(self, input_size=6, sequence_length=24, hidden_size=32,
                     num_blocks=2, dropout=0.0):
            super().__init__()
            if any(isinstance(v, bool) or not isinstance(v, int) or v <= 0
                   for v in (input_size, sequence_length, hidden_size, num_blocks)):
                raise ValueError("input_size, sequence_length, hidden_size and num_blocks must be positive integers")
            if isinstance(dropout, bool) or not isinstance(dropout, (int, float)) or not 0 <= dropout < 1:
                raise ValueError("dropout must be in [0, 1)")
            self.input_size = input_size
            self.sequence_length = sequence_length
            self.input_projection = nn.Linear(input_size * sequence_length, hidden_size)
            self.blocks = nn.Sequential(*[_ResidualBlock(hidden_size, float(dropout)) for _ in range(num_blocks)])
            self.output_norm = nn.LayerNorm(hidden_size)
            self.output = nn.Linear(hidden_size, 1)

        def forward(self, x):
            if x.ndim != 3 or x.shape[1] != self.sequence_length or x.shape[2] != self.input_size:
                raise ValueError(
                    f"expected [batch, {self.sequence_length}, {self.input_size}] input"
                )
            x = x.reshape(x.shape[0], -1)
            x = torch.nn.functional.gelu(self.input_projection(x))
            x = self.blocks(x)
            return self.output(self.output_norm(x)).squeeze(-1)
else:
    class ResidualMLP:
        def __init__(self, *args, **kwargs):
            raise ImportError("PyTorch is required to construct ResidualMLP")


def build_residual_mlp_model(input_size=6, sequence_length=24, hidden_size=32,
                             num_blocks=2, dropout=0.0):
    """Build a residual sequence regressor; PyTorch remains an optional dependency."""
    return ResidualMLP(input_size, sequence_length, hidden_size, num_blocks, dropout)
