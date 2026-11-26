"""Evidence-based learning control plane. No synthetic inputs or simulated scores."""
from workers.feature.supervised_xgboost import SupervisedWorker
from workers.learning_orchestrator import LearningGateError

class LearningControlPlane:
    def __init__(self):
        self.workers = {
            "supervised_xgboost": {"instance": SupervisedWorker(), "enabled": True, "status": "READY"},
            "unsupervised": {"instance": None, "enabled": False, "status": "NOT_IMPLEMENTED"},
            "rl": {"instance": None, "enabled": False, "status": "NOT_IMPLEMENTED"},
            "cnn_vision": {"instance": None, "enabled": False, "status": "NOT_IMPLEMENTED"},
            "gnn": {"instance": None, "enabled": False, "status": "NOT_IMPLEMENTED"},
            "mamba": {"instance": None, "enabled": False, "status": "NOT_IMPLEMENTED"},
            "gen_ai": {"instance": None, "enabled": False, "status": "NOT_IMPLEMENTED"},
            "backtest": {"instance": None, "enabled": False, "status": "NOT_IMPLEMENTED"},
            "tuning": {"instance": None, "enabled": False, "status": "NOT_IMPLEMENTED"},
            "risk": {"instance": None, "enabled": False, "status": "NOT_IMPLEMENTED"},
        }

    def list_workers(self):
        return {name: {"enabled": item["enabled"], "status": item["status"]}
                for name, item in self.workers.items()}

    def run_xgboost_training(self, frame, *, dataset_id, source, code_revision):
        worker = self.workers["supervised_xgboost"]
        if not worker["enabled"] or worker["instance"] is None:
            raise LearningGateError("xgboost_worker_not_ready")
        return worker["instance"].train(
            frame, dataset_id=dataset_id, source=source, code_revision=code_revision
        )

    def run_pipeline(self, *_args, **_kwargs):
        raise LearningGateError(
            "explicit_dataset_and_provenance_required; use run_xgboost_training(frame, dataset_id, source, code_revision)"
        )
