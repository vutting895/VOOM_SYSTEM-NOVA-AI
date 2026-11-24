"""Leakage-safe XGBoost research worker. Funding is optional and provenance-gated."""
import math
import xgboost as xgb
import pandas as pd
from workers.learning_orchestrator import LearningOrchestrator, LearningGateError


class SupervisedWorker:
    def __init__(self, horizon=5, seed=42):
        if isinstance(horizon, bool) or not isinstance(horizon, int) or horizon < 1:
            raise LearningGateError("label_horizon_must_be_positive_integer")
        if isinstance(seed, bool) or not isinstance(seed, int):
            raise LearningGateError("seed_must_be_integer")
        self.horizon = horizon
        self.seed = seed
        self.model = None
        self.trained = False
        self.feature_columns = ["rsi", "macd", "vol_spike"]
        self.orchestrator = LearningOrchestrator("xgboost", seed=self.seed)

    @staticmethod
    def _rsi(series, period=14):
        delta = series.diff()
        gain = delta.clip(lower=0).rolling(period, min_periods=period).mean()
        loss = (-delta.clip(upper=0)).rolling(period, min_periods=period).mean()
        rs = gain / loss.where(loss != 0)
        return 100 - (100 / (1 + rs))

    def create_features(self, source_frame):
        frame = source_frame.copy()
        required = {"timestamp", "open", "high", "low", "close", "volume"}
        missing = required.difference(frame.columns)
        if missing:
            raise LearningGateError("missing_required_columns:" + ",".join(sorted(missing)))
        for name in ("open", "high", "low", "close", "volume"):
            try:
                frame[name] = pd.to_numeric(frame[name], errors="coerce")
            except (TypeError, ValueError):
                raise LearningGateError("invalid_numeric:" + name) from None
            if frame[name].isna().any() or not frame[name].map(lambda value: math.isfinite(float(value))).all():
                raise LearningGateError("non_finite_numeric:" + name)

        frame["rsi"] = self._rsi(frame["close"])
        fast = frame["close"].ewm(span=12, adjust=False, min_periods=12).mean()
        slow = frame["close"].ewm(span=26, adjust=False, min_periods=26).mean()
        frame["macd"] = fast - slow
        volume_mean = frame["volume"].rolling(20, min_periods=20).mean()
        frame["vol_spike"] = frame["volume"] / volume_mean.where(volume_mean != 0)

        has_rate = "funding_rate" in frame.columns
        has_available = "funding_available_at" in frame.columns
        has_observed = "funding_observed_at" in frame.columns
        has_source = "funding_source" in frame.columns
        if any((has_rate, has_available, has_observed, has_source)) and not all(
            (has_rate, has_available, has_observed, has_source)
        ):
            raise LearningGateError("funding_requires_rate_source_observed_at_and_available_at")
        if has_rate:
            for name in ("funding_available_at", "funding_observed_at"):
                raw_values = frame[name]
                if raw_values.isna().any():
                    raise LearningGateError("funding_timestamps_invalid")
                for value in raw_values:
                    try:
                        parsed = pd.Timestamp(value)
                    except (TypeError, ValueError):
                        raise LearningGateError("funding_timestamps_invalid") from None
                    if parsed.tzinfo is None or parsed.tzinfo.utcoffset(parsed) is None:
                        raise LearningGateError("funding_timestamps_must_be_timezone_aware")
            frame["funding_available_at"] = pd.to_datetime(frame["funding_available_at"], utc=True, errors="coerce")
            frame["funding_observed_at"] = pd.to_datetime(frame["funding_observed_at"], utc=True, errors="coerce")
            if frame["funding_available_at"].isna().any() or frame["funding_observed_at"].isna().any():
                raise LearningGateError("funding_timestamps_invalid")
            if frame["funding_source"].isna().any() or not frame["funding_source"].map(
                lambda value: isinstance(value, str) and bool(value.strip())
            ).all():
                raise LearningGateError("funding_source_missing")
            if (frame["funding_observed_at"] > frame["funding_available_at"]).any():
                raise LearningGateError("funding_available_before_observation")
            decision_times = pd.to_datetime(frame["timestamp"], utc=True, errors="coerce")
            if decision_times.isna().any() or (frame["funding_available_at"] > decision_times).any():
                raise LearningGateError("funding_not_available_at_decision_time")
            frame["funding_rate"] = pd.to_numeric(frame["funding_rate"], errors="coerce")
            if frame["funding_rate"].isna().any() or not frame["funding_rate"].map(
                lambda value: math.isfinite(float(value))
            ).all():
                raise LearningGateError("funding_rate_invalid")
            self.feature_columns = ["rsi", "macd", "vol_spike", "funding_rate"]
        else:
            self.feature_columns = ["rsi", "macd", "vol_spike"]

        future_close = frame["close"].shift(-self.horizon)
        frame["target"] = (future_close > frame["close"]).where(future_close.notna())
        frame = frame.dropna(subset=self.feature_columns + ["target"]).copy()
        frame["target"] = frame["target"].astype(int)
        return frame.reset_index(drop=True)

    def train(self, frame, *, dataset_id, source, code_revision):
        prepared = self.create_features(frame)
        model_holder = {}

        def trainer(data, split, seed):
            train = data.iloc[:split.train_end]
            if train["target"].nunique() < 2:
                raise LearningGateError("training_partition_has_one_class")
            model = xgb.XGBClassifier(
                n_estimators=300,
                max_depth=4,
                learning_rate=0.03,
                subsample=0.8,
                colsample_bytree=0.8,
                objective="binary:logistic",
                eval_metric="logloss",
                random_state=seed,
                n_jobs=1,
            )
            model.fit(train[self.feature_columns], train["target"])
            model_holder["model"] = model
            return model

        def evaluator(model, data, split):
            train = data.iloc[:split.train_end]
            validation = data.iloc[split.validation_start:split.validation_end]
            test = data.iloc[split.test_start:]
            if validation.empty or test.empty:
                raise LearningGateError("empty_validation_or_test_partition")
            if validation["target"].nunique() < 2 or test["target"].nunique() < 2:
                raise LearningGateError("validation_or_test_has_one_class")
            return {
                "train_accuracy": round(float(model.score(train[self.feature_columns], train["target"])), 6),
                "validation_accuracy": round(float(model.score(validation[self.feature_columns], validation["target"])), 6),
                "test_accuracy": round(float(model.score(test[self.feature_columns], test["target"])), 6),
                "train_rows": int(len(train)),
                "validation_rows": int(len(validation)),
                "test_rows": int(len(test)),
                "feature_columns": list(self.feature_columns),
                "label_horizon_bars": self.horizon,
            }

        result = self.orchestrator.run(
            prepared,
            dataset_id=dataset_id,
            source=source,
            code_revision=code_revision,
            trainer=trainer,
            evaluator=evaluator,
            horizon=self.horizon,
        )
        self.model = model_holder["model"]
        self.trained = True
        result["feature_schema"] = list(self.feature_columns)
        return result

    def predict(self, features):
        if not self.trained or self.model is None:
            raise RuntimeError("model_not_trained")
        if not isinstance(features, dict):
            raise TypeError("features_must_be_a_named_mapping")
        missing = [name for name in self.feature_columns if name not in features]
        if missing:
            raise ValueError("missing_prediction_features:" + ",".join(missing))
        values = []
        for name in self.feature_columns:
            try:
                value = float(features[name])
            except (TypeError, ValueError, OverflowError):
                raise ValueError("invalid_prediction_feature:" + name) from None
            if not math.isfinite(value):
                raise ValueError("invalid_prediction_feature:" + name)
            values.append(value)
        row = pd.DataFrame([values], columns=self.feature_columns)
        return float(self.model.predict_proba(row)[0][1])
