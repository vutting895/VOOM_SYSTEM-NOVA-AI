"""Deterministic point-in-time OHLCV dataset builder for XGBoost research."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
import math
from typing import Mapping, Sequence

class XGBoostDataError(ValueError):
    pass

@dataclass(frozen=True)
class TabularSample:
    timestamp: str
    features: tuple[float, ...]
    forward_return: float
    label: int
    source_index: int

@dataclass(frozen=True)
class TabularPartitions:
    train: tuple[TabularSample, ...]
    validation: tuple[TabularSample, ...]
    test: tuple[TabularSample, ...]
    purged_indices: tuple[int, ...]

FEATURE_NAMES = ("return_1", "return_5", "rsi_14", "macd_12_26", "volume_ratio_20", "range_pct")

def _num(value, name):
    if isinstance(value, bool) or not isinstance(value, (int,float)) or not math.isfinite(float(value)):
        raise XGBoostDataError(f"{name} must be finite numeric data")
    return float(value)

def _time(value, name):
    if not isinstance(value,str) or not value:
        raise XGBoostDataError(f"{name} must be ISO-8601")
    try: parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
    except ValueError as exc: raise XGBoostDataError(f"{name} must be ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None: raise XGBoostDataError(f"{name} must include timezone")
    return parsed

def build_xgboost_samples(rows: Sequence[Mapping[str,object]], *, label_horizon_bars: int=5, deadband_return: float=0.0):
    if isinstance(label_horizon_bars,bool) or not isinstance(label_horizon_bars,int) or label_horizon_bars<1:
        raise XGBoostDataError("label_horizon_bars must be positive")
    deadband=_num(deadband_return,"deadband_return")
    if deadband<0 or len(rows)<max(27,label_horizon_bars+27): raise XGBoostDataError("invalid deadband or insufficient OHLCV history")
    times=[]; closes=[]; highs=[]; lows=[]; volumes=[]
    for i,row in enumerate(rows):
        if not isinstance(row,Mapping): raise XGBoostDataError(f"row {i} must be a mapping")
        times.append(_time(row.get("timestamp"),f"row {i} timestamp"))
        o=_num(row.get("open"),f"row {i} open"); h=_num(row.get("high"),f"row {i} high")
        l=_num(row.get("low"),f"row {i} low"); c=_num(row.get("close"),f"row {i} close")
        v=_num(row.get("volume"),f"row {i} volume")
        if min(o,h,l,c)<=0 or h<max(o,c,l) or l>min(o,c) or v<0: raise XGBoostDataError(f"row {i} invalid OHLCV")
        closes.append(c); highs.append(h); lows.append(l); volumes.append(v)
    if any(times[i]<=times[i-1] for i in range(1,len(times))): raise XGBoostDataError("timestamps must strictly increase")
    out=[]
    for i in range(26,len(rows)-label_horizon_bars):
        changes=[closes[j]-closes[j-1] for j in range(i-13,i+1)]
        gain=sum(max(x,0) for x in changes)/14; loss=sum(max(-x,0) for x in changes)/14
        rsi=100.0 if loss==0 and gain>0 else 50.0 if loss==0 else 100-100/(1+gain/loss)
        ema12=closes[i-25]; ema26=closes[i-25]
        for j in range(i-24,i+1):
            ema12=(2/13)*closes[j]+(1-2/13)*ema12
            ema26=(2/27)*closes[j]+(1-2/27)*ema26
        volmean=sum(volumes[i-19:i+1])/20
        if volmean<=0: raise XGBoostDataError(f"row {i} rolling volume mean must be positive")
        feats=(closes[i]/closes[i-1]-1,closes[i]/closes[i-5]-1,rsi,ema12-ema26,volumes[i]/volmean,(highs[i]-lows[i])/closes[i])
        future=closes[i+label_horizon_bars]/closes[i]-1
        label=1 if future>deadband else 0 if future < -deadband else -1
        out.append(TabularSample(rows[i]["timestamp"],feats,future,label,i))
    return tuple(out)

def split_xgboost_samples(samples: Sequence[TabularSample], *, label_horizon_bars: int, train_fraction: float=.70, validation_fraction: float=.15):
    if isinstance(label_horizon_bars,bool) or not isinstance(label_horizon_bars,int) or label_horizon_bars<1: raise XGBoostDataError("label horizon must be positive")
    if not (0<train_fraction<1 and 0<validation_fraction<1 and train_fraction+validation_fraction<1): raise XGBoostDataError("invalid split fractions")
    if len(samples)<20: raise XGBoostDataError("at least 20 samples required")
    a=int(len(samples)*train_fraction); b=int(len(samples)*(train_fraction+validation_fraction))
    stop=a-label_horizon_bars; vstop=b-label_horizon_bars
    if stop<2 or vstop<=a or b>=len(samples): raise XGBoostDataError("purging leaves empty partition")
    return TabularPartitions(tuple(samples[:stop]),tuple(samples[a:vstop]),tuple(samples[b:]),tuple(range(stop,a))+tuple(range(vstop,b)))

def fit_xgboost_classifier(partitions: TabularPartitions, *, seed: int=42):
    try: import xgboost as xgb
    except ImportError as exc: raise RuntimeError("xgboost is required for optional training") from exc
    if isinstance(seed,bool) or not isinstance(seed,int) or seed<0: raise XGBoostDataError("seed must be non-negative integer")
    train=[s for s in partitions.train if s.label in (0,1)]
    valid=[s for s in partitions.validation if s.label in (0,1)]
    if len(train)<10 or len(valid)<2 or len({s.label for s in train})<2: raise XGBoostDataError("insufficient non-neutral train/validation examples")
    model=xgb.XGBClassifier(n_estimators=300,max_depth=3,learning_rate=.03,subsample=.8,colsample_bytree=.8,reg_lambda=2,objective="binary:logistic",eval_metric="logloss",random_state=seed,n_jobs=1,tree_method="hist",early_stopping_rounds=20)
    model.fit([s.features for s in train],[s.label for s in train],eval_set=([s.features for s in valid],[s.label for s in valid]),verbose=False)
    return model
