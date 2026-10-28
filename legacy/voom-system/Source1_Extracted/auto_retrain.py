"""Safe retraining entry point. No random-data training or fabricated-metric promotion."""
def train_wave_model(*args, **kwargs):
    raise RuntimeError("Retraining blocked: real labelled wave dataset is not configured.")
def train_smc_model(*args, **kwargs):
    raise RuntimeError("Retraining blocked: real labelled SMC dataset is not configured.")
def train_pa_model(*args, **kwargs):
    raise RuntimeError("Retraining blocked: real labelled price-action dataset is not configured.")
def train_rl_model(*args, **kwargs):
    raise RuntimeError("Risk model training blocked: validated reward/drawdown dataset is not configured.")
def evaluate_and_promote(*args, **kwargs):
    raise RuntimeError("Model promotion blocked: no genuine holdout metrics available.")
def weekly_job(*args, **kwargs):
    raise RuntimeError("Weekly auto-retrain disabled until real datasets and validation are configured.")
def start_scheduler(*args, **kwargs):
    raise RuntimeError("Scheduler disabled to prevent random-weight models from being promoted.")
