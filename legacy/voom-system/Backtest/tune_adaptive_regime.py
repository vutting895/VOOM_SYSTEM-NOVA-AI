# -*- coding: utf-8 -*-
"""Bounded walk-forward parameter screening for VOOM. Research only; frozen OOS is not used to tune."""
import argparse, json, hashlib, itertools
from pathlib import Path
import pandas as pd
import adaptive_regime_backtest as bt

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--csv",required=True); p.add_argument("--meta",required=True); p.add_argument("--out",required=True)
    a=p.parse_args()
    path=Path(a.csv); meta=json.loads(Path(a.meta).read_text(encoding="utf-8-sig"))
    df=bt.prepare(path); digest=hashlib.sha256(path.read_bytes()).hexdigest()
    n=len(df); i60=int(n*.6); i80=int(n*.8); rows=[]
    for recency,target_r,min_score in [(r,2.0,80) for r in [8,16,24,32,48]]:
        df["bull_div_recent"]=df.bull_div.rolling(recency,min_periods=1).max().astype(bool)
        df["bear_div_recent"]=df.bear_div.rolling(recency,min_periods=1).max().astype(bool)
        df["long_signal"]=df.long_regime & df["1h_bull_structure"].fillna(False) & df.cross_up & (df.close>df.ema50) & df.bull_div_recent
        df["short_signal"]=df.short_regime & df["1h_bear_structure"].fillna(False) & df.cross_down & (df.close<df.ema50) & df.bear_div_recent
        df["long_score"]=25*df.long_regime.astype(int)+20*df["1h_bull_structure"].fillna(False).astype(int)+20*(df.cross_up&(df.close>df.ema50)).astype(int)+20*df.bull_div_recent.astype(int)+15*(df.close>df.open).astype(int)
        df["short_score"]=25*df.short_regime.astype(int)+20*df["1h_bear_structure"].fillna(False).astype(int)+20*(df.cross_down&(df.close<df.ema50)).astype(int)+20*df.bear_div_recent.astype(int)+15*(df.close<df.open).astype(int)
        dev=bt.run_bt(df,0,i60,10000,.0025,2,min_score,target_r)
        val=bt.run_bt(df,i60,i80,10000,.0025,2,min_score,target_r)
        dm=bt.summarize(dev["trades"]); vm=bt.summarize(val["trades"])
        eligible=(dm["trades"]>=20 and vm["trades"]>=10 and dm["profit_factor"] is not None and vm["profit_factor"] is not None)
        score=None
        if eligible:
            score=(min(dm["profit_factor"],3)+min(vm["profit_factor"],3))/2 + min(dm["expectancy_R_proxy"],1)*.5 + min(vm["expectancy_R_proxy"],1)*.5 - max(0,abs(dev["max_drawdown_pct_proxy"])-15)*.03 - max(0,abs(val["max_drawdown_pct_proxy"])-15)*.03
        rows.append({"divergence_recency_bars":recency,"target_R":target_r,"minimum_score":min_score,"development":dm,"validation":vm,
          "development_max_drawdown_pct_proxy":round(dev["max_drawdown_pct_proxy"],4),"validation_max_drawdown_pct_proxy":round(val["max_drawdown_pct_proxy"],4),
          "eligible":eligible,"selection_score":round(score,6) if score is not None else None})
    eligible_rows=[r for r in rows if r["eligible"]]; eligible_rows.sort(key=lambda x:x["selection_score"],reverse=True)
    best=eligible_rows[0] if eligible_rows else None
    chosen=best or {"divergence_recency_bars":8,"target_R":2.0,"minimum_score":80}
    rec=chosen["divergence_recency_bars"]; target=chosen["target_R"]; score=chosen["minimum_score"]
    df["bull_div_recent"]=df.bull_div.rolling(rec,min_periods=1).max().astype(bool)
    df["bear_div_recent"]=df.bear_div.rolling(rec,min_periods=1).max().astype(bool)
    df["long_signal"]=df.long_regime & df["1h_bull_structure"].fillna(False) & df.cross_up & (df.close>df.ema50) & df.bull_div_recent
    df["short_signal"]=df.short_regime & df["1h_bear_structure"].fillna(False) & df.cross_down & (df.close<df.ema50) & df.bear_div_recent
    df["long_score"]=25*df.long_regime.astype(int)+20*df["1h_bull_structure"].fillna(False).astype(int)+20*(df.cross_up&(df.close>df.ema50)).astype(int)+20*df.bull_div_recent.astype(int)+15*(df.close>df.open).astype(int)
    df["short_score"]=25*df.short_regime.astype(int)+20*df["1h_bear_structure"].fillna(False).astype(int)+20*(df.cross_down&(df.close<df.ema50)).astype(int)+20*df.bear_div_recent.astype(int)+15*(df.close<df.open).astype(int)
    oos=bt.run_bt(df,i80,n-1,10000,.0025,2,score,target)
    out=Path(a.out); out.mkdir(parents=True,exist_ok=True)
    result={"status":"research-only; no MT5 connection; no orders sent","data_sha256":digest,"bars":n,"source_counts":meta.get("sources"),
      "search_grid":{"divergence_recency_bars":[8,16,24,32,48],"target_R":[2.0],"minimum_score":[80],"combinations":len(rows)},
      "selection_method":"Rank using development and validation only; frozen final 20% never used for tuning. Require >=20 development and >=10 validation trades.",
      "eligible_candidates":len(eligible_rows),"best_development_validation_candidate":best,"selected_parameters_for_frozen_oos":chosen,
      "frozen_oos_metrics":bt.summarize(oos["trades"]),"frozen_oos_return_pct_proxy":round(oos["return_pct_proxy"],4),
      "frozen_oos_max_drawdown_pct_proxy":round(oos["max_drawdown_pct_proxy"],4),"frozen_oos_trade_count":len(oos["trades"]),
      "all_candidates":rows,"promotion_decision":"NOT_PROMOTED: no eligible candidate" if best is None else "NOT_PROMOTED: requires broker-native cost model, stronger sample size, and demo verification",
      "limitations":["Bounded parameter search can still overfit visible splits.","Final OOS is not used for parameter ranking.","Hybrid dataset includes external spot XAUUSD, not entirely broker-native XAUUSDc.","P/L uses abstract units; no verified contract size, commissions, swaps, tick replay, or broker-specific execution.","No live trading or MT5 orders are enabled."]}
    (out/"adaptive_regime_tuning_report.json").write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding="utf-8")
    cols=[]
    for r in rows:
        cols.append({"divergence_recency_bars":r["divergence_recency_bars"],"target_R":r["target_R"],"minimum_score":r["minimum_score"],"eligible":r["eligible"],"selection_score":r["selection_score"],
          "development_trades":r["development"]["trades"],"development_PF":r["development"]["profit_factor"],"development_return_pct":r["development"]["return_on_initial_pct_proxy"],
          "validation_trades":r["validation"]["trades"],"validation_PF":r["validation"]["profit_factor"],"validation_return_pct":r["validation"]["return_on_initial_pct_proxy"]})
    pd.DataFrame(cols).to_csv(out/"adaptive_regime_tuning_candidates.csv",index=False)
    pd.DataFrame(oos["trades"]).to_csv(out/"adaptive_regime_tuning_oos_trades.csv",index=False)
    print(json.dumps({"ok":True,"report":str((out/"adaptive_regime_tuning_report.json").resolve()),"grid_combinations":len(rows),"eligible_candidates":len(eligible_rows),"best_candidate":best,
      "oos_trades":len(oos["trades"]),"oos_return_pct_proxy":round(oos["return_pct_proxy"],4),"promotion_decision":result["promotion_decision"]},indent=2,ensure_ascii=False))
if __name__=="__main__": main()
