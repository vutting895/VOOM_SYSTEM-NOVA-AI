#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Smart Scalping System with Auto-Tuning (Backend v2)
ระบบเทรดอัตโนมัติแบบ Smart Scalping พร้อมระบบปรับจูนอัตโนมัติ (รองรับ MT5 Bridge)
"""

import os
import math
import json
import time
import socket
import datetime
import threading
from collections import deque

import joblib
import numpy as np
import pandas as pd
import requests
import MetaTrader5 as mt5
from sklearn.ensemble import RandomForestClassifier

try:
    from dotenv import load_dotenv
    # Load configuration from beside this script; this project uses .env.txt.
    _config_dir = os.path.dirname(os.path.abspath(__file__))
    _env_txt = os.path.join(_config_dir, ".env.txt")
    _env_file = os.path.join(_config_dir, ".env")
    if os.path.isfile(_env_txt):
        load_dotenv(dotenv_path=_env_txt, override=False)
    if os.path.isfile(_env_file):
        load_dotenv(dotenv_path=_env_file, override=True)
except ImportError:
    pass

# ==========================================
# ⚙️ การตั้งค่าระบบ (Configuration)
# ==========================================
SYMBOL = os.getenv("MT5_SYMBOL", "XAUUSDc").strip()
TIMEFRAME = mt5.TIMEFRAME_M15
MT5_PATH = os.getenv("MT5_PATH", r"C:\Program Files\HFM Metatrader 5\terminal64.exe").strip().strip('"')
MAGIC_NUMBER = int(os.getenv("MAGIC_NUMBER", "888888"))

# Risk Management
RISK_PERCENT = 0.25
FALLBACK_LOT = 0.01
MAX_DAILY_TRADES = 5
MAX_DRAWDOWN_STOP = 0.03
MAX_DAILY_LOSS_USD = 300.0  # Hard stop for new entries; includes today's realized P/L + all open floating P/L
MAX_SPREAD_POINTS = 100
ONE_POSITION_AT_A_TIME = True

SL_ATR_MULT = 2.25  # Selected from the 1-year tuning grid; validate on Demo
TP_ATR_MULT = 2.0   # Selected from the 1-year tuning grid; validate on Demo

# AI & Confidence
MIN_CONFIDENCE_LEVEL = 0.60  # Conservative candidate selected from validation + 90-day holdout; Demo only
TRAIN_BARS = 5000
LABEL_HORIZON = 4
LABEL_ATR_THRESHOLD = 0.3
MODEL_MAX_AGE_HOURS = 24
FEATURE_VERSION = 2

# SMC & Event
ENABLE_SMC_ANALYSIS = True
ENABLE_EVENT_DETECTION = True
EVENT_BOOST_STRENGTH = 0.15

# Network
HOST = "127.0.0.1"
PORT = 8081

# Cloud AI secondary veto filter (disabled until local API key is configured)
CLOUD_AI_ENABLED = os.getenv("CLOUD_AI_ENABLED", "false").strip().lower() in ("1", "true", "yes", "on")
CLOUD_AI_URL = os.getenv("CLOUD_AI_URL", "https://smart-scalping-cloud-ai.suwapat787.workers.dev/evaluate").strip()
CLOUD_AI_API_KEY = os.getenv("CLOUD_AI_API_KEY", "").strip()
CLOUD_AI_TIMEOUT_SECONDS = 8

# Telegram
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# Auto-Tuning
AUTO_TUNING_INTERVAL_HOURS = 6
MIN_TRADES_FOR_OPTIMIZATION = 5

# File Paths
MODEL_PATH = "smart_scalping_ai_model.pkl"
PERFORMANCE_LOG = "scalping_performance.log"
AUTO_TUNER_DATA = "auto_tuner_data.json"


# ==========================================
# 📨 Telegram Notifier
# ==========================================
class TelegramNotifier:
    def __init__(self, token, chat_id):
        self.enabled = bool(token and chat_id)
        self.chat_id = chat_id
        self.url = f"https://api.telegram.org/bot{token}/sendMessage" if self.enabled else None
        if not self.enabled:
            print("ℹ️ Telegram ปิดอยู่ (ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)")

    def send(self, text, wait=False):
        if not self.enabled:
            return
        if wait:
            self._send(text)
        else:
            threading.Thread(target=self._send, args=(text,), daemon=True).start()

    def _send(self, text):
        try:
            r = requests.post(self.url, data={'chat_id': self.chat_id, 'text': text}, timeout=10)
            if r.status_code != 200:
                print(f"⚠️ Telegram error {r.status_code}: {r.text[:200]}")
        except requests.RequestException as e:
            print(f"⚠️ Telegram ส่งไม่สำเร็จ: {e}")


# ==========================================
# 📐 Indicators & Features
# ==========================================
FEATURE_COLUMNS = ['ema_diff', 'ema_slope', 'rsi', 'atr_ratio', 'vol_ratio',
                   'ret_1', 'ret_4', 'body_ratio', 'range_pos']

def ema(series, n):
    return series.ewm(span=n, adjust=False).mean()

def rsi(close, n=14):
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50)

def atr(df, n=14):
    prev_close = df['close'].shift(1)
    tr = pd.concat([df['high'] - df['low'],
                    (df['high'] - prev_close).abs(),
                    (df['low'] - prev_close).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()

def compute_features(df):
    f = df.copy()
    f['ema_fast'] = ema(f['close'], 20)
    f['ema_slow'] = ema(f['close'], 50)
    f['atr'] = atr(f)
    a = f['atr'].replace(0, np.nan)

    f['ema_diff'] = (f['ema_fast'] - f['ema_slow']) / a
    f['ema_slope'] = f['ema_fast'].diff(3) / a
    f['rsi'] = rsi(f['close']) / 100
    f['atr_ratio'] = f['atr'] / f['atr'].rolling(100, min_periods=20).mean()
    f['vol_ratio'] = f['tick_volume'] / f['tick_volume'].rolling(20).mean().shift(1)
    f['ret_1'] = f['close'].diff(1) / a
    f['ret_4'] = f['close'].diff(4) / a
    f['body_ratio'] = (f['close'] - f['open']) / a
    hi = f['high'].rolling(20).max()
    lo = f['low'].rolling(20).min()
    f['range_pos'] = (f['close'] - lo) / (hi - lo).replace(0, np.nan)
    return f

def build_dataset(df):
    f = compute_features(df)
    future_move = f['close'].shift(-LABEL_HORIZON) - f['close']
    thr = LABEL_ATR_THRESHOLD * f['atr']
    f['label'] = np.where(future_move > thr, 1, np.where(future_move < -thr, 0, np.nan))
    f = f.iloc[:-LABEL_HORIZON]
    f = f.replace([np.inf, -np.inf], np.nan).dropna(subset=FEATURE_COLUMNS + ['label'])
    return f[FEATURE_COLUMNS].values.astype(float), f['label'].astype(int).values


# ==========================================
# 📊 Performance Monitor
# ==========================================
class PerformanceMonitor:
    def __init__(self, initial_balance, max_history=1000):
        self.trade_history = deque(maxlen=max_history)
        self.processed_tickets = set()
        self.balance = float(initial_balance)
        self.peak_balance = float(initial_balance)
        self.current_drawdown = 0.0
        self.max_drawdown = 0.0
        self._load_history()

    def _load_history(self):
        if not os.path.exists(PERFORMANCE_LOG):
            return
        try:
            with open(PERFORMANCE_LOG, 'r', encoding='utf-8') as f:
                for line in f:
                    try:
                        r = json.loads(line)
                        rec = {
                            'timestamp': datetime.datetime.fromisoformat(r['timestamp']),
                            'symbol': r.get('symbol', SYMBOL),
                            'profit_loss': float(r.get('profit', 0.0)),
                            'duration_minutes': float(r.get('duration', 0.0)),
                            'confidence': float(r.get('confidence', 0.0)),
                            'ticket': int(r.get('ticket', 0)),
                        }
                    except (json.JSONDecodeError, KeyError, ValueError):
                        continue
                    self.trade_history.append(rec)
                    if rec['ticket']:
                        self.processed_tickets.add(rec['ticket'])
            print(f"📂 โหลดประวัติเทรดเดิม {len(self.trade_history)} รายการ")
        except OSError as e:
            print(f"⚠️ อ่าน log ไม่ได้: {e}")

    def add_trade_result(self, trade_data):
        ticket = int(trade_data.get('ticket', 0) or 0)
        if ticket and ticket in self.processed_tickets:
            return False

        profit = float(trade_data.get('profit', 0.0))
        record = {
            'timestamp': datetime.datetime.now(),
            'symbol': str(trade_data.get('symbol', SYMBOL)),
            'profit_loss': profit,
            'duration_minutes': float(trade_data.get('duration', 0.0)),
            'confidence': float(trade_data.get('confidence', 0.0)),
            'ticket': ticket,
        }
        self.trade_history.append(record)
        if ticket:
            self.processed_tickets.add(ticket)
        self._update_drawdown(profit)
        self._log_trade(record)
        return True

    def _update_drawdown(self, profit):
        self.balance += profit
        self.peak_balance = max(self.peak_balance, self.balance)
        if self.peak_balance > 0:
            self.current_drawdown = (self.peak_balance - self.balance) / self.peak_balance
            self.max_drawdown = max(self.max_drawdown, self.current_drawdown)

    def _log_trade(self, record):
        try:
            with open(PERFORMANCE_LOG, 'a', encoding='utf-8') as f:
                f.write(json.dumps({
                    'timestamp': record['timestamp'].isoformat(),
                    'symbol': record['symbol'],
                    'ticket': record['ticket'],
                    'profit': record['profit_loss'],
                    'duration': record['duration_minutes'],
                    'confidence': record['confidence'],
                }, ensure_ascii=False) + '\n')
        except OSError as e:
            print(f"⚠️ Log error: {e}")

    def get_recent_performance(self, days=7):
        cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
        recent = [t for t in self.trade_history if t['timestamp'] >= cutoff]
        if not recent:
            return {'total_trades': 0, 'win_rate': 0.0, 'net_profit': 0.0,
                    'profit_factor': 0.0, 'current_drawdown': self.current_drawdown,
                    'max_drawdown': self.max_drawdown}

        wins = [t['profit_loss'] for t in recent if t['profit_loss'] > 0]
        losses = [t['profit_loss'] for t in recent if t['profit_loss'] < 0]
        decided = len(wins) + len(losses)
        gp, gl = sum(wins), abs(sum(losses))

        return {
            'total_trades': len(recent),
            'win_rate': len(wins) / decided if decided else 0.0,
            'net_profit': sum(t['profit_loss'] for t in recent),
            'profit_factor': gp / gl if gl > 0 else (float('inf') if gp > 0 else 0.0),
            'current_drawdown': self.current_drawdown,
            'max_drawdown': self.max_drawdown,
        }


# ==========================================
# 🔧 Auto-Tuner
# ==========================================
class AutoTuner:
    BOUNDS = {
        'min_conf': (0.60, 0.85),  # Keep Auto-Tuner from lowering the entry threshold below validated candidate
        'risk_percent': (0.25, RISK_PERCENT),
        'max_trades': (5, MAX_DAILY_TRADES),
        'event_boost': (0.0, 0.25),
    }

    def __init__(self, monitor):
        self.monitor = monitor
        self.last_opt = datetime.datetime.now()
        self.current_params = {
            'risk_percent': RISK_PERCENT,
            'max_trades': MAX_DAILY_TRADES,
            'min_conf': MIN_CONFIDENCE_LEVEL,
            'event_boost': EVENT_BOOST_STRENGTH,
        }
        self._load()

    def _load(self):
        if not os.path.exists(AUTO_TUNER_DATA):
            return
        try:
            with open(AUTO_TUNER_DATA, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for k, v in data.get('params', {}).items():
                if k in self.current_params:
                    self.current_params[k] = type(self.current_params[k])(v)
            if data.get('last_opt'):
                self.last_opt = datetime.datetime.fromisoformat(data['last_opt'])
            self._clamp()
            print(f"📂 โหลดพารามิเตอร์ Auto-Tuner: {self.current_params}")
        except (OSError, ValueError, TypeError) as e:
            print(f"⚠️ โหลด {AUTO_TUNER_DATA} ไม่ได้: {e}")

    def _save(self):
        try:
            with open(AUTO_TUNER_DATA, 'w', encoding='utf-8') as f:
                json.dump({'params': self.current_params,
                           'last_opt': self.last_opt.isoformat()}, f, indent=2)
        except OSError as e:
            print(f"⚠️ บันทึก {AUTO_TUNER_DATA} ไม่ได้: {e}")

    def _clamp(self):
        p = self.current_params
        for k, (lo, hi) in self.BOUNDS.items():
            p[k] = max(lo, min(hi, p[k]))
        p['max_trades'] = int(p['max_trades'])
        p['min_conf'] = round(p['min_conf'], 3)
        p['risk_percent'] = round(p['risk_percent'], 3)
        p['event_boost'] = round(p['event_boost'], 3)

    def add_trade(self, data):
        if not self.monitor.add_trade_result(data):
            return None, False
        elapsed = (datetime.datetime.now() - self.last_opt).total_seconds()
        if elapsed >= AUTO_TUNING_INTERVAL_HOURS * 3600:
            return self._optimize(), True
        return None, True

    def _optimize(self):
        perf = self.monitor.get_recent_performance()
        self.last_opt = datetime.datetime.now()

        if perf['total_trades'] < MIN_TRADES_FOR_OPTIMIZATION:
            self._save()
            return None

        print("🔧 กำลังรันระบบ Auto-Tuning ปรับปรุงพารามิเตอร์...")
        p = self.current_params
        old = dict(p)
        wr, pf, dd = perf['win_rate'], perf['profit_factor'], perf['current_drawdown']

        if wr < 0.4 or pf < 1.0:
            p['min_conf'] += 0.03
            p['risk_percent'] *= 0.8
        elif wr > 0.6 and pf > 1.5:
            p['min_conf'] -= 0.02
            p['risk_percent'] *= 1.1

        if dd > 0.05:
            p['risk_percent'] *= 0.7
            p['max_trades'] = int(p['max_trades'] * 0.7)
        elif dd < 0.02:
            p['max_trades'] += 5

        self._clamp()
        changes = {k: {'old_value': old[k], 'new_value': p[k]}
                   for k in p if old[k] != p[k]}
        if changes:
            print(f"🔧 Auto-Tune เปลี่ยนค่า: {changes}")
        self._save()
        return {'changes': changes, 'performance': perf}


# ==========================================
# 🧭 SMC Analyzer
# ==========================================
class SMCAnalyzer:
    def __init__(self, swing_window=3):
        self.w = swing_window

    def analyze(self, f):
        neutral = {'enabled': False, 'bias': 0, 'strength': 0.0, 'note': 'SMC off'}
        if not ENABLE_SMC_ANALYSIS or f is None or len(f) < 30:
            return neutral

        w = self.w
        highs, lows = f['high'].values, f['low'].values
        swing_highs = [i for i in range(w, len(f) - w) if highs[i] == highs[i - w:i + w + 1].max()]
        swing_lows = [i for i in range(w, len(f) - w) if lows[i] == lows[i - w:i + w + 1].min()]
        if not swing_highs or not swing_lows:
            return {'enabled': True, 'bias': 0, 'strength': 0.0, 'note': 'no swings'}

        last_high = highs[swing_highs[-1]]
        last_low = lows[swing_lows[-1]]
        close = f['close'].iloc[-1]
        a = f['atr'].iloc[-1]

        if close > last_high:
            bias, strength, note = 1, 1.0, f"Bullish BOS > {last_high:.2f}"
        elif close < last_low:
            bias, strength, note = -1, 1.0, f"Bearish BOS < {last_low:.2f}"
        elif close - last_low <= 0.5 * a:
            bias, strength, note = 1, 0.6, f"Near support {last_low:.2f}"
        elif last_high - close <= 0.5 * a:
            bias, strength, note = -1, 0.6, f"Near resistance {last_high:.2f}"
        else:
            bias, strength, note = 0, 0.0, "Mid-range"

        return {'enabled': True, 'bias': bias, 'strength': strength, 'note': note,
                'swing_high': float(last_high), 'swing_low': float(last_low)}


# ==========================================
# ⚡ Event Detector
# ==========================================
class EventDetector:
    def analyze(self, f):
        none = {'detected': False, 'score': 0.0, 'direction': 0, 'events': []}
        if not ENABLE_EVENT_DETECTION or f is None or len(f) < 30:
            return none

        last = f.iloc[-1]
        events, score = [], 0.0

        vr, br, ar = last['vol_ratio'], last['body_ratio'], last['atr_ratio']
        if pd.notna(vr) and vr >= 2.0:
            events.append(f"Volume x{vr:.1f}")
            score = max(score, min(1.0, (vr - 1) / 3))
        if pd.notna(br) and abs(br) >= 1.5:
            events.append(f"Big candle {abs(br):.1f} ATR")
            score = max(score, min(1.0, abs(br) / 3))
        if pd.notna(ar) and ar >= 1.5:
            events.append(f"High volatility x{ar:.1f}")
            score = max(score, min(1.0, ar - 1))

        return {'detected': bool(events), 'score': round(score, 3),
                'direction': int(np.sign(last['close'] - last['open'])), 'events': events}


# ==========================================
# 🤖 Smart Scalping AI
# ==========================================
class SmartScalpingAI:
    def __init__(self, mt5_manager):
        self.mt5 = mt5_manager
        self.model = None
        self.trained_at = None

    def initialize(self):
        if self._load():
            return True
        return self.train()

    def _load(self):
        if not os.path.exists(MODEL_PATH):
            return False
        try:
            bundle = joblib.load(MODEL_PATH)
        except Exception as e:
            print(f"⚠️ โหลดโมเดลไม่ได้: {e}")
            return False
        if (not isinstance(bundle, dict) or bundle.get('version') != FEATURE_VERSION
                or bundle.get('symbol') != SYMBOL):
            return False
        self.model = bundle['model']
        self.trained_at = bundle['trained_at']
        if self.needs_retrain():
            return False
        print(f"✅ โหลด AI Model แล้ว (เทรนเมื่อ {self.trained_at:%Y-%m-%d %H:%M})")
        return True

    def needs_retrain(self):
        if self.trained_at is None:
            return True
        age_h = (datetime.datetime.now() - self.trained_at).total_seconds() / 3600
        return age_h > MODEL_MAX_AGE_HOURS

    def train(self):
        print(f"🧠 กำลังเทรนโมเดลด้วยข้อมูลย้อนหลัง {TRAIN_BARS} แท่ง...")
        df = self.mt5.get_history(TRAIN_BARS)
        if df is None or len(df) < 500:
            print("❌ ข้อมูลย้อนหลังไม่พอสำหรับเทรนโมเดล")
            return self.model is not None
        df = df.iloc[:-1]

        X, y = build_dataset(df)
        if len(y) < 300 or len(set(y)) < 2:
            print("❌ ตัวอย่างสำหรับเทรนไม่พอ")
            return self.model is not None

        split = int(len(y) * 0.8)
        model = RandomForestClassifier(n_estimators=200, max_depth=6, min_samples_leaf=20,
                                       random_state=42, n_jobs=-1)
        model.fit(X[:split], y[:split])
        acc = model.score(X[split:], y[split:])
        base = max(y[split:].mean(), 1 - y[split:].mean())
        print(f"📈 Out-of-sample accuracy: {acc:.1%} (baseline {base:.1%})")

        model.fit(X, y)
        self.model = model
        self.trained_at = datetime.datetime.now()
        joblib.dump({'model': model, 'version': FEATURE_VERSION, 'symbol': SYMBOL,
                     'trained_at': self.trained_at, 'oos_accuracy': acc}, MODEL_PATH)
        print("✅ AI Model พร้อมใช้งาน")
        return True

    def _prob_up(self, row):
        x = row[FEATURE_COLUMNS].astype(float).values.reshape(1, -1)
        if not np.isfinite(x).all():
            return None
        proba = self.model.predict_proba(x)[0]
        return float(proba[list(self.model.classes_).index(1)])

    def predict_signal(self, row, smc, event, event_boost):
        p_up = self._prob_up(row)
        if p_up is None:
            return 'HOLD', 0.5, ['features incomplete']

        direction = 'BUY' if p_up >= 0.5 else 'SELL'
        sign = 1 if direction == 'BUY' else -1
        conf = p_up if sign == 1 else 1 - p_up
        reasons = [f"ML p_up={p_up:.2f}"]

        trend = int(np.sign(row['ema_diff']))
        if trend == sign:
            conf += 0.03
            reasons.append("with EMA trend")
        elif trend == -sign:
            conf -= 0.05
            reasons.append("against EMA trend")

        r = row['rsi'] * 100
        if sign == 1 and r > 75:
            conf -= 0.05
            reasons.append(f"RSI overbought {r:.0f}")
        elif sign == -1 and r < 25:
            conf -= 0.05
            reasons.append(f"RSI oversold {r:.0f}")

        if smc.get('enabled') and smc['bias'] != 0:
            adj = 0.05 * smc['strength']
            conf += adj if smc['bias'] == sign else -adj
            reasons.append(smc['note'])

        if event.get('detected'):
            adj = event_boost * event['score']
            conf += adj if event['direction'] == sign else -adj
            reasons.append("Event: " + ", ".join(event['events']))

        return direction, float(np.clip(conf, 0.0, 0.99)), reasons


# ==========================================
# 💰 MT5 Connection Manager
# ==========================================
class MT5Manager:
    def __init__(self, notifier=None):
        self.connected = False
        self.last_error = None
        self.notifier = notifier

    def connect(self):
        if os.path.exists(MT5_PATH):
            initialized = mt5.initialize(path=MT5_PATH)
        else:
            initialized = mt5.initialize()

        if not initialized:
            self.last_error = f"MT5 Initialize failed: {mt5.last_error()}"
        elif not mt5.symbol_select(SYMBOL, True):
            self.last_error = f"ไม่สามารถเลือก Symbol {SYMBOL}"
        else:
            self.connected = True
            acc = mt5.account_info()
            print(f"✅ เชื่อมต่อ MT5 สำเร็จ - {SYMBOL}")
            if acc:
                print(f"📊 Account: {acc.login}")
                print(f"💰 Balance: {acc.balance:.2f} {acc.currency}")
            return True

        print(f"❌ {self.last_error}")
        return False

    def ensure_connection(self):
        ti = mt5.terminal_info()
        if self.connected and ti is not None and ti.connected:
            return True
        print("⚠️ MT5 หลุด กำลังเชื่อมต่อใหม่...")
        if self.notifier and self.connected:
            self.notifier.send(f"⚠️ MT5 connection lost ({SYMBOL}) — reconnecting")
        self.connected = False
        mt5.shutdown()
        return self.connect()

    def disconnect(self):
        mt5.shutdown()
        self.connected = False
        print("🔌 ตัดการเชื่อมต่อ MT5 แล้ว")

    def get_history(self, n):
        if not self.ensure_connection():
            return None
        rates = mt5.copy_rates_from_pos(SYMBOL, TIMEFRAME, 0, n)
        if rates is None or len(rates) == 0:
            return None
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        return df

    def get_closed_bars(self, n=300):
        df = self.get_history(n + 1)
        if df is None or len(df) < 80:
            return None
        return df.iloc[:-1].reset_index(drop=True)

    def get_spread_points(self):
        tick = mt5.symbol_info_tick(SYMBOL)
        info = mt5.symbol_info(SYMBOL)
        if tick is None or info is None or info.point <= 0:
            return None
        return round((tick.ask - tick.bid) / info.point)

    def calc_lot(self, sl_distance, risk_percent):
        info = mt5.symbol_info(SYMBOL)
        acc = mt5.account_info()
        if info is None or acc is None or sl_distance <= 0:
            return 0.0
        if info.trade_tick_size <= 0 or info.trade_tick_value <= 0:
            return 0.0

        loss_per_lot = sl_distance / info.trade_tick_size * info.trade_tick_value
        risk_money = acc.balance * risk_percent / 100
        step = info.volume_step or 0.01
        lot = math.floor(risk_money / loss_per_lot / step) * step

        if lot < info.volume_min:
            return 0.0
        lot = min(lot, info.volume_max)
        decimals = max(0, -int(math.floor(math.log10(step))))
        return round(lot, decimals)

    def count_today_trades(self):
        start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        end = datetime.datetime.now() + datetime.timedelta(days=1)
        deals = mt5.history_deals_get(start, end)
        if deals is None:
            return 0
        return sum(1 for d in deals
                   if d.magic == MAGIC_NUMBER and d.symbol == SYMBOL
                   and d.entry == mt5.DEAL_ENTRY_IN)

    def check_existing_positions(self):
        positions = mt5.positions_get(symbol=SYMBOL)
        if not positions:
            return []
        return [p.ticket for p in positions if p.magic == MAGIC_NUMBER]


# ==========================================
# 🌐 Network Server
# ==========================================
def parse_kv(parts):
    data = {}
    for p in parts:
        if '=' in p:
            k, v = p.split('=', 1)
            k = k.strip()
            try:
                data[k] = float(v)
            except ValueError:
                data[k] = v.strip()
    return data

def clean(text):
    return str(text).replace('|', '/').replace('\n', ' ').replace('\r', ' ')


def get_daily_account_pnl():
    """
    Conservative daily guard: today's realized account deals + current floating
    P/L across all open positions. Uses Thailand local midnight converted to UTC
    because MT5 Python history timestamps are UTC. Returns (pnl, error).
    """
    try:
        tz_th = datetime.timezone(datetime.timedelta(hours=7))
        now_th = datetime.datetime.now(tz_th)
        start_th = now_th.replace(hour=0, minute=0, second=0, microsecond=0)
        start_utc = start_th.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        end_utc = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

        deals = mt5.history_deals_get(start_utc, end_utc)
        if deals is None:
            return None, "Daily deal history unavailable"

        realized = 0.0
        for deal in deals:
            realized += (float(deal.profit) + float(deal.commission)
                         + float(deal.swap) + float(getattr(deal, "fee", 0.0)))

        positions = mt5.positions_get()
        if positions is None:
            return None, "Open positions unavailable"
        floating = sum(float(pos.profit) + float(pos.swap) for pos in positions)
        return realized + floating, None
    except Exception as exc:
        return None, f"Daily P/L check failed ({type(exc).__name__})"


class NetworkServer:
    def __init__(self, host, port, components):
        self.host, self.port = host, port
        self.c = components
        self.running = False
        self.server = None
        self.lock = threading.Lock()

    def start(self):
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind((self.host, self.port))
        self.server.listen(5)
        self.server.settimeout(1.0)
        self.running = True
        print(f"🌐 Python Bridge Server ทำงานที่ {self.host}:{self.port}")

        while self.running:
            try:
                client, addr = self.server.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(target=self.handle_client, args=(client, addr), daemon=True).start()

    def handle_client(self, client, addr):
        buf = ""
        client.settimeout(300)
        with client:
            try:
                while self.running:
                    data = client.recv(4096)
                    if not data:
                        break
                    buf += data.decode('utf-8', errors='ignore')
                    while '\n' in buf:
                        line, buf = buf.split('\n', 1)
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            with self.lock:
                                res = self.process_message(line)
                        except Exception as e:
                            res = f"ERROR|{clean(e)}"
                        client.sendall((res + '\n').encode('utf-8'))
            except (socket.timeout, ConnectionResetError, ConnectionAbortedError, OSError):
                pass

    def process_message(self, msg):
        parts = msg.split('|')
        cmd = parts[0].strip().upper()

        if cmd == "PING":
            return "PONG"

        if cmd == "CONFIG":
            cfg = parse_kv(parts[1:])
            print(f"📥 รับค่า Config จาก MT5: {cfg}")
            return "CONFIG_OK"

        if cmd == "ANALYZE":
            return self._analyze()

        if cmd == "TRADE_RESULT":
            return self._trade_result(parse_kv(parts[1:]))

        if cmd == "GET_PARAMS":
            p = self.c['tuner'].current_params
            return (f"PARAMS|min_conf={p['min_conf']:.2f}|risk={p['risk_percent']:.2f}"
                    f"|max_trades={p['max_trades']}|event_boost={p['event_boost']:.2f}")

        return "UNKNOWN"

    @staticmethod
    def _signal(direction, conf, lot=0.0, sl=0.0, tp=0.0, reason="", digits=2):
        return (f"SIGNAL|dir={direction}|conf={conf:.2f}|lot={lot:.2f}"
                f"|sl={sl:.{digits}f}|tp={tp:.{digits}f}|reason={clean(reason)}")

    def _cloud_ai_veto(self, direction, conf, row, smc, event):
        """Secondary approval only. Never lets cloud AI create/change a trade."""
        if not CLOUD_AI_ENABLED:
            return True, "Cloud AI disabled"
        if not CLOUD_AI_API_KEY or not CLOUD_AI_URL:
            return False, "Cloud AI enabled but API key/URL missing; fail-closed"

        payload = {
            "symbol": SYMBOL,
            "timeframe": "M15",
            "direction": direction,
            "confidence": float(conf),
            "ema_trend": int(np.sign(float(row.get("ema_diff", 0.0)))),
            "rsi": float(row.get("rsi", 0.5)) * 100.0,
            "atr_ratio": float(row.get("atr_ratio", 1.0)),
            "smc_bias": float(smc.get("bias", 0)),
            "smc_strength": float(smc.get("strength", 0.0)),
            "event_direction": float(event.get("direction", 0)) if event.get("detected") else 0,
            "event_score": float(event.get("score", 0.0)) if event.get("detected") else 0.0,
        }
        try:
            response = requests.post(
                CLOUD_AI_URL,
                json=payload,
                headers={"X-API-Key": CLOUD_AI_API_KEY, "Content-Type": "application/json"},
                timeout=CLOUD_AI_TIMEOUT_SECONDS,
            )
            if response.status_code != 200:
                return False, f"Cloud AI HTTP {response.status_code}; fail-closed"
            result = response.json()
            decision = str(result.get("decision", "")).upper()
            reason = clean(result.get("reason", "No reason returned"))[:180]
            if decision != "APPROVE":
                return False, f"Cloud AI HOLD: {reason}"
            return True, f"Cloud AI APPROVE: {reason}"
        except (requests.RequestException, ValueError, TypeError) as exc:
            # Do not log request headers or secrets.
            return False, f"Cloud AI unavailable ({type(exc).__name__}); fail-closed"

    def _analyze(self):
        mt5_m, ai, tuner = self.c['mt5'], self.c['ai'], self.c['tuner']
        p = tuner.current_params

        if ai.needs_retrain():
            ai.train()

        dd = tuner.monitor.current_drawdown
        acc = mt5.account_info()
        if acc is None:
            return self._signal('HOLD', 0, reason="Account info unavailable")

        # Risk Guard entry filters intentionally disabled per approved scope:
        # daily-loss / drawdown / daily trade-count / spread / one-position checks
        # are bypassed. Connection, market-data, sizing and broker execution
        # validation remain enabled. MT5 EA still enforces its own position guard.
        if not mt5_m.ensure_connection():
            return self._signal('HOLD', 0, reason="MT5 disconnected")

        bars = mt5_m.get_closed_bars(300)
        if bars is None:
            return self._signal('HOLD', 0, reason="No data")

        f = compute_features(bars)
        row = f.iloc[-1]
        smc = self.c['smc'].analyze(f)
        event = self.c['events'].analyze(f)
        direction, conf, reasons = ai.predict_signal(row, smc, event, p['event_boost'])
        reason = "; ".join(reasons)

        # Confidence threshold and secondary Cloud AI veto intentionally bypassed
        # under the approved "remove all signal filters" scope. The model's own
        # HOLD output is still respected; signal/data validity checks remain.
        if direction == 'HOLD':
            return self._signal('HOLD', conf, reason=reason)

        info = mt5.symbol_info(SYMBOL)
        tick = mt5.symbol_info_tick(SYMBOL)
        a = row['atr']
        if info is None or tick is None or not np.isfinite(a) or a <= 0:
            return self._signal('HOLD', conf, reason="No tick/ATR")

        sl_dist, tp_dist = SL_ATR_MULT * a, TP_ATR_MULT * a
        if direction == 'BUY':
            entry = tick.ask
            sl, tp = entry - sl_dist, entry + tp_dist
        else:
            entry = tick.bid
            sl, tp = entry + sl_dist, entry - tp_dist

        lot = mt5_m.calc_lot(sl_dist, p['risk_percent'])
        if lot <= 0:
            return self._signal('HOLD', conf, reason="Min lot exceeds risk limit")

        print(f"🎯 {direction} conf={conf:.2f} lot={lot} SL={sl:.{info.digits}f} TP={tp:.{info.digits}f} | {reason}")
        return self._signal(direction, conf, lot, sl, tp, reason, info.digits)

    def _trade_result(self, t_data):
        print(f"📊 ได้รับผลการเทรดจาก EA: {t_data}")
        tune, added = self.c['tuner'].add_trade(t_data)
        if not added:
            return "TRADE_DUP"

        notifier = self.c['notifier']
        profit = float(t_data.get('profit', 0.0))
        perf = self.c['tuner'].monitor.get_recent_performance()
        notifier.send(
            f"{'✅' if profit > 0 else '❌'} {SYMBOL} #{int(t_data.get('ticket', 0))}\n"
            f"P/L: {profit:.2f}\n"
            f"7d: {perf['total_trades']} trades | WR {perf['win_rate']:.0%} | "
            f"Net {perf['net_profit']:.2f} | DD {perf['current_drawdown']:.1%}"
        )
        if tune and tune['changes']:
            lines = [f"{k}: {v['old_value']} -> {v['new_value']}" for k, v in tune['changes'].items()]
            notifier.send("🔧 Auto-Tune updated\n" + "\n".join(lines))
        return "TRADE_OK"

    def stop(self):
        self.running = False
        if self.server:
            try:
                self.server.close()
            except OSError:
                pass


# ==========================================
# 🚀 Main Program
# ==========================================
def main():
    print("🚀 กำลังเปิดระบบ Smart Scalping Backend v2...")
    notifier = TelegramNotifier(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
    mt5_m = MT5Manager(notifier)
    if not mt5_m.connect():
        return

    server = None
    try:
        ai = SmartScalpingAI(mt5_m)
        if not ai.initialize():
            print("❌ ไม่สามารถเตรียม AI Model ได้ — ปิดระบบ")
            return

        acc = mt5.account_info()
        balance = acc.balance if acc else 10000.0
        monitor = PerformanceMonitor(balance)
        tuner = AutoTuner(monitor)

        components = {
            'mt5': mt5_m,
            'smc': SMCAnalyzer(),
            'events': EventDetector(),
            'ai': ai,
            'tuner': tuner,
            'notifier': notifier,
        }
        server = NetworkServer(HOST, PORT, components)
        notifier.send(f"🚀 Smart Scalping Backend started\n{SYMBOL} | Balance {balance:.2f}")
        server.start()

    except KeyboardInterrupt:
        print("\n🛑 หยุดการทำงาน")
    finally:
        if server:
            server.stop()
        mt5_m.disconnect()
        notifier.send(f"🛑 Smart Scalping Backend stopped ({SYMBOL})", wait=True)

if __name__ == "__main__":
    main()
