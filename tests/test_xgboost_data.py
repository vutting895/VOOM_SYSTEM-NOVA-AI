import unittest
from workers.quant_engine.xgboost_data import FEATURE_NAMES,XGBoostDataError,build_xgboost_samples,split_xgboost_samples

def bars(n=150):
    out=[]
    for i in range(n):
        c=100+i*.1+(i%5)*.03
        out.append({"timestamp":f"2026-01-{1+i//24:02d}T{i%24:02d}:00:00Z","open":c-.02,"high":c+.1,"low":c-.1,"close":c,"volume":1000+i%11})
    return out

class XGBoostDatasetTests(unittest.TestCase):
    def test_features_deterministic_and_fixed_schema(self):
        a=build_xgboost_samples(bars()); self.assertEqual(a,build_xgboost_samples(bars()))
        self.assertEqual(len(a[0].features),len(FEATURE_NAMES)); self.assertEqual(a[-1].source_index,144)
    def test_future_tail_excluded(self):
        data=bars(80); samples=build_xgboost_samples(data)
        self.assertEqual(samples[-1].timestamp,data[-6]["timestamp"])
    def test_chronological_purged_split(self):
        parts=split_xgboost_samples(build_xgboost_samples(bars()),label_horizon_bars=5)
        self.assertEqual(len(parts.purged_indices),10)
        self.assertLess(parts.train[-1].source_index+5,parts.validation[0].source_index+1)
        self.assertLess(parts.validation[-1].source_index+5,parts.test[0].source_index+1)
    def test_invalid_market_data_rejected(self):
        data=bars(80); data[30]["volume"]=-1
        with self.assertRaises(XGBoostDataError): build_xgboost_samples(data)
        data=bars(80); data[30]["timestamp"]=data[29]["timestamp"]
        with self.assertRaises(XGBoostDataError): build_xgboost_samples(data)

if __name__=="__main__": unittest.main(verbosity=2)
