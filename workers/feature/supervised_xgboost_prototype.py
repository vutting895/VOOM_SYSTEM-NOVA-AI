
"""
Supervised Learning Worker - XGBoost / LightGBM
งานหลัก: ทำนายทิศทางราคา - แม่นกว่า LLM ในงาน tabular
"""
import xgboost as xgb
import pandas as pd
import numpy as np

class SupervisedWorker:
    def __init__(self):
        self.model = xgb.XGBClassifier(n_estimators=200, max_depth=6, learning_rate=0.05)
        self.trained = False
        
    def create_features(self, df):
        # RSI, MACD, Volume, Funding
        df['rsi'] = self._rsi(df['close'])
        df['macd'] = df['close'].ewm(12).mean() - df['close'].ewm(26).mean()
        df['vol_spike'] = df['volume'] / df['volume'].rolling(20).mean()
        df['funding'] = np.random.uniform(-0.001, 0.001, len(df))
        return df.dropna()
    
    def _rsi(self, series, period=14):
        delta = series.diff()
        gain = (delta.where(delta > 0, 0)).rolling(period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
        rs = gain / loss
        return 100 - (100 / (1 + rs))
    
    def train(self, df):
        df = self.create_features(df)
        df['label'] = (df['close'].shift(-5) > df['close']).astype(int) # 5 แท่งข้างหน้าขึ้น?
        X = df[['rsi','macd','vol_spike','funding']]
        y = df['label']
        self.model.fit(X, y)
        self.trained = True
        acc = self.model.score(X, y)
        print(f"✅ XGBoost Trained - Accuracy {acc*100:.1f}% - ใช้ใน NOVA: ทำนายทิศทาง")
        return acc
    
    def predict(self, features):
        if not self.trained:
            return 0.5
        return self.model.predict_proba([features])[0][1]

# Example
if __name__ == "__main__":
    # Mock data
    df = pd.DataFrame({"close": np.random.randn(1000).cumsum()+50000, "volume": np.random.randint(100,1000,1000)})
    worker = SupervisedWorker()
    worker.train(df)