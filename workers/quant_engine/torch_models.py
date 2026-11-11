"""Optional PyTorch research model factories.

PyTorch is imported lazily so the core Quant Engine and CI contract tests do
not require heavyweight ML dependencies. These are untrained architectures,
not validated trading models.
"""
from __future__ import annotations


def build_lstm_model(*, input_size: int, hidden_size: int = 64, num_layers: int = 2, dropout: float = 0.1):
    """Return a unidirectional LSTM regressor for forward-return research."""
    try:
        import torch
        from torch import nn
    except ImportError as exc:
        raise RuntimeError("PyTorch is required to construct the LSTM model") from exc
    _validate_dimensions(input_size, hidden_size, num_layers, dropout)

    class LSTMReturnModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = nn.LSTM(
                input_size=input_size, hidden_size=hidden_size, num_layers=num_layers,
                batch_first=True, dropout=dropout if num_layers > 1 else 0.0,
                bidirectional=False,
            )
            self.norm = nn.LayerNorm(hidden_size)
            self.head = nn.Sequential(nn.Linear(hidden_size, hidden_size // 2),
                                      nn.GELU(), nn.Dropout(dropout), nn.Linear(hidden_size // 2, 1))

        def forward(self, values):
            if values.ndim != 3 or values.shape[-1] != input_size:
                raise ValueError("LSTM input must have shape [batch, sequence, input_size]")
            encoded, _ = self.encoder(values)
            return self.head(self.norm(encoded[:, -1, :])).squeeze(-1)

    return LSTMReturnModel()


def build_temporal_cnn_model(*, input_size: int, channels: int = 64, kernel_size: int = 3, dropout: float = 0.1):
    """Return a causal dilated temporal CNN baseline distinct from the LSTM."""
    try:
        import torch
        from torch import nn
        import torch.nn.functional as functional
    except ImportError as exc:
        raise RuntimeError("PyTorch is required to construct the temporal CNN model") from exc
    if any(isinstance(value, bool) or not isinstance(value, int) or value <= 0
           for value in (input_size, channels, kernel_size)):
        raise ValueError("input_size, channels and kernel_size must be positive integers")
    if not 0 <= dropout < 1:
        raise ValueError("dropout must be in [0, 1)")

    class CausalConvBlock(nn.Module):
        def __init__(self, dilation):
            super().__init__()
            self.left_padding = (kernel_size - 1) * dilation
            self.conv = nn.Conv1d(input_size if dilation == 1 else channels, channels,
                                  kernel_size, dilation=dilation)
            self.norm = nn.BatchNorm1d(channels)
            self.dropout = nn.Dropout(dropout)
            self.activation = nn.GELU()

        def forward(self, x):
            x = functional.pad(x, (self.left_padding, 0))
            return self.dropout(self.activation(self.norm(self.conv(x))))

    class TemporalCNNReturnModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.block1 = CausalConvBlock(1)
            self.block2 = CausalConvBlock(2)
            self.block3 = CausalConvBlock(4)
            self.head = nn.Sequential(nn.Linear(channels, channels // 2),
                                      nn.GELU(), nn.Dropout(dropout), nn.Linear(channels // 2, 1))

        def forward(self, values):
            if values.ndim != 3 or values.shape[-1] != input_size:
                raise ValueError("Temporal CNN input must have shape [batch, sequence, input_size]")
            x = values.transpose(1, 2)
            x = self.block1(x)
            x = self.block2(x)
            x = self.block3(x)
            return self.head(x[:, :, -1]).squeeze(-1)

    return TemporalCNNReturnModel()


def _validate_dimensions(input_size: int, hidden_size: int, num_layers: int, dropout: float) -> None:
    if any(isinstance(value, bool) or not isinstance(value, int) or value <= 0
           for value in (input_size, hidden_size, num_layers)):
        raise ValueError("input_size, hidden_size and num_layers must be positive integers")
    if not 0 <= dropout < 1:
        raise ValueError("dropout must be in [0, 1)")


def build_residual_mlp_model(*, input_size: int, sequence_length: int,
                             hidden_size: int = 128, num_blocks: int = 3,
                             dropout: float = 0.1):
    """Return a residual MLP neural network over a fixed causal feature window.

    Input shape is [batch, sequence_length, input_size]. The entire window
    must end at the decision timestamp; no future bars or labels are accepted.
    This is a distinct feed-forward neural baseline, not an LSTM/TCN alias.
    """
    try:
        from torch import nn
    except ImportError as exc:
        raise RuntimeError("PyTorch is required to construct the residual MLP") from exc
    for name, value in (("input_size", input_size), ("sequence_length", sequence_length),
                        ("hidden_size", hidden_size), ("num_blocks", num_blocks)):
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise ValueError(f"{name} must be a positive integer")
    if hidden_size < 4:
        raise ValueError("hidden_size must be at least 4")
    if isinstance(dropout, bool) or not isinstance(dropout, (int, float)) or not 0 <= dropout < 1:
        raise ValueError("dropout must be in [0, 1)")

    class ResidualBlock(nn.Module):
        def __init__(self):
            super().__init__()
            self.norm = nn.LayerNorm(hidden_size)
            self.layers = nn.Sequential(
                nn.Linear(hidden_size, hidden_size),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(hidden_size, hidden_size),
                nn.Dropout(dropout),
            )
            self.activation = nn.GELU()

        def forward(self, x):
            return self.activation(x + self.layers(self.norm(x)))

    class ResidualMLPReturnModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.sequence_length = sequence_length
            self.input_size = input_size
            self.stem = nn.Sequential(
                nn.Linear(sequence_length * input_size, hidden_size),
                nn.LayerNorm(hidden_size),
                nn.GELU(),
            )
            self.blocks = nn.Sequential(*(ResidualBlock() for _ in range(num_blocks)))
            self.head = nn.Sequential(
                nn.LayerNorm(hidden_size),
                nn.Linear(hidden_size, hidden_size // 2),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(hidden_size // 2, 1),
            )

        def forward(self, values):
            if values.ndim != 3 or tuple(values.shape[1:]) != (sequence_length, input_size):
                raise ValueError("Residual MLP input must have shape [batch, sequence_length, input_size]")
            return self.head(self.blocks(self.stem(values.reshape(values.shape[0], -1)))).squeeze(-1)

    return ResidualMLPReturnModel()
