# NOVA Continuous Learning

“Continuous” means continuous ingestion and feedback capture, followed by controlled batch retraining—not automatic online weight updates.

Inputs:
- Demo trade journal and outcome labels;
- model predictions and confidence at decision time;
- missed/false signals and risk-gate abstentions;
- data drift and feature drift reports.

Workflow:
1. Append immutable feedback events with timestamps and model/dataset versions.
2. Review label quality and exclude ambiguous or contaminated outcomes.
3. Build a new versioned training dataset.
4. Queue a batch training run only after data approval.
5. Evaluate against frozen baselines and OOS policy.
6. Require human approval before updating the Demo/Shadow model pointer.

No feedback pipeline may grant broker order permissions or modify live-trading flags.
