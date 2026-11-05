
"""
Unsupervised Worker - K-Means, DBSCAN, PCA
หาความสัมพันธ์เอง ไม่มีเฉลย - Clustering สภาวะตลาด
"""
from sklearn.cluster import KMeans, DBSCAN
from sklearn.decomposition import PCA
import pandas as pd

class UnsupervisedWorker:
    def __init__(self, n_clusters=4):
        self.kmeans = KMeans(n_clusters=n_clusters)
        self.pca = PCA(n_components=2)
        
    def detect_regime(self, df):
        # Features: volatility, trend, volume
        features = df[['volatility','trend_strength','volume']].dropna()
        regimes = self.kmeans.fit_predict(features)
        df['regime'] = regimes
        # 0=Bull, 1=Bear, 2=Sideway, 3=High Vol
        mapping = {0: "Bull", 1: "Bear", 2: "Sideway", 3: "HighVol"}
        df['regime_name'] = df['regime'].map(mapping)
        print(f"🔍 Detected regimes: {df['regime_name'].value_counts().to_dict()}")
        return df

if __name__ == "__main__":
    print("Unsupervised Worker - Clustering ตลาด")