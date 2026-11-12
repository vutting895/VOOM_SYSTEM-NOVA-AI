"""PyTorch models for residual MLP."""
try:
    import torch
    import torch.nn as nn
except ImportError:
    torch = None
    nn = object

class ResidualMLP(nn.__class__ if torch is None else torch.nn.Module):
    def __init__(self, input_size=6, sequence_length=24, hidden_size=32, num_blocks=2, dropout=0.0):
        if torch is not None:
            super().__init__()
            self.input_size = input_size
            self.sequence_length = sequence_length
            self.fc1 = torch.nn.Linear(input_size * sequence_length, hidden_size)
            self.fc2 = torch.nn.Linear(hidden_size, 1)
        if input_size <= 0 or sequence_length <= 0:
            raise ValueError("Invalid dimensions")

    def forward(self, x):
        if torch is not None:
            if x.dim() != 3 or x.shape[1] != self.sequence_length or x.shape[2] != self.input_size:
                raise ValueError("Invalid window shape")
            batch_size = x.shape[0]
            out = x.reshape(batch_size, -1)
            out = torch.relu(self.fc1(out))
            return self.fc2(out).squeeze(-1)
        return None

def build_residual_mlp_model(input_size=6, sequence_length=24, hidden_size=32, num_blocks=2, dropout=0.0):
    if input_size <= 0 or sequence_length <= 0:
        raise ValueError("Invalid dimensions")
    return ResidualMLP(input_size, sequence_length, hidden_size, num_blocks, dropout)
