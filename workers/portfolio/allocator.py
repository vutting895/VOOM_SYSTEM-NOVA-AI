"""Conservative portfolio allocation validation for NOVA (no broker actions)."""
from dataclasses import dataclass

@dataclass(frozen=True)
class AllocationDecision:
    accepted: bool
    allocation_pct: float
    reason: str

class PortfolioAllocator:
    def __init__(self, max_strategy_allocation_pct: float = 20.0) -> None:
        if not 0 < max_strategy_allocation_pct <= 100:
            raise ValueError("max_strategy_allocation_pct must be in (0, 100]")
        self.max_allocation = max_strategy_allocation_pct

    def validate(self, allocation_pct: float) -> AllocationDecision:
        if not 0 < allocation_pct <= 100:
            return AllocationDecision(False, allocation_pct, "Allocation must be greater than 0 and at most 100 percent")
        if allocation_pct > self.max_allocation:
            return AllocationDecision(False, allocation_pct, f"Allocation exceeds {self.max_allocation:.1f}% strategy limit")
        return AllocationDecision(True, allocation_pct, "Allocation passed local limit validation; this is not a trade approval")