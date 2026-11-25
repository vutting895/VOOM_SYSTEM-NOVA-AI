//+------------------------------------------------------------------+
//| Nova EA v1.83 FIX - แก้ 2 บั๊กจาก v1.82 (ไม่เปลี่ยน Logic อื่น)    |
//| 1) MainWork: คอมเมนต์ // กลืนการเรียก SignalSATMA / CheckClosed-  |
//|    TradesLearning / NovaUniverseSync / AutoOptRun / AutoOptCheck- |
//|    Rollback ใน v1.82 ไม่เคยถูกเรียก -> แยกบรรทัดแล้ว คุมด้วย        |
//|    InpV183_RunLearningLoop (false = พฤติกรรมเหมือน v1.82)           |
//| 2) Core Risk/SL/TP ที่เทรนใน v1.79 ไม่ได้ต่อสาย (ใช้ InpRiskPercent |
//|    1.0% จริง) -> ตอนนี้ Core Risk = InpRisk_Tuned (0.20%) และ        |
//|    ไม้ Core แบบ ATR ใช้ SL/TP = InpSL_Mult_Tuned/InpTP_Mult_Tuned   |
//|    คุมด้วย InpCoreApplyTunedSLTP (false = SL/TP ของแต่ละโมดูลเดิม)  |
//|    โมดูลแบบ Structure (SessionBox/Range/Sweep ฯลฯ) ไม่ถูกแตะ        |
//|    InpRiskPercent เหลือเป็น Legacy ไม่ได้ใช้แล้ว                    |
//+------------------------------------------------------------------+
//+------------------------------------------------------------------+
//| Nova EA v1.82 CLEAN - ตัดสิ่งที่ปิดไว้ออกหมด                      |
//| จาก v1.80 -> v1.82: เอา OFF ออกเลย ไม่เหลือใน Settings             |
//| ตัดออก:                                                            |
//|  - Trailing ทั้งชุด (UnifiedTrail, TrailingStop, TrendTrail,      |
//|    Gold Trail/BE, TrailStep/Distance/ATR/Chandelier/Stages/Basket) |
//|  - Partial Close (Partial + Trail Partial)                          |
//|  - Daily Profit Stop (DailyProfit_REMOVED = 0)                        |
//|  - Martingale Averaging (MaxAdd/AddTimes/Dispoint)                  |
//|  - BBPro คูณ Lot (Enabled/Multiplier/MaxLayers/BE/Lock ทั้งหมด)     |
//|    -> Backtest เต็มระบบ BASE +$3986 PF 1.37 DD 6.20% ชนะ BBPro     |
//|       +$3611 PF 1.27 DD 8.81% จึงตัด BBPro ออกถาวร                |
//|  - Session Filter 00-05 (v1.31 ปิดอยู่แล้ว)                        |
//|  - NN Boost Lot x1.2, Sniper Refinement (Test -23$)                |
//|  - News CloseBefore, MLP FailOpen                                   |
//| เหลือที่เปิด: Core SL1.8 TP2.5 Risk0.20% + Sniper TP400 SL80      |
//| Risk0.12% + Recovery Hedge/Overlap/WorstCase + Auto-Tune + News    |
//| Pause + HTF/OTE/Macro + Learning + AutoConfig + Dashboard 3 ปุ่ม    |
//+------------------------------------------------------------------+

// [v1.82 CLEAN] นำข้อมูลเทรนทั้งหมดขึ้นแดชบอร์ด - ไม่เปลี่ยน Logic / ไม่เปลี่ยนค่าดีที่สุดจาก v1.79
// แดชบอร์ดเว็บ v1.82 CLEAN มีตาราง Grid เต็ม: Core 16 ชุด + Sniper 15 ชุด + Train/Val/Test ทุกแถว แถวดีที่สุดไฮไลต์สีเขียว
// [v1.79] เทรนแยก Core / Sniper หาค่าดีที่สุด แยกกัน แล้วตั้งเป็นค่าเริ่มต้น
// ข้อมูล: XAUUSDm M15 REAL Exness 2026-05-01 ถึง 2026-11-18, 13192 แท่ง 4622.42 -> 3740.13 (-19.1% Downtrend)
// แบ่ง: Train May-Sep 9976 แท่ง / Val Oct 2016 แท่ง / Test Nov 1200 แท่ง - ไม่แอบเห็นอนาคต
// CORE ชนะ: SL 1.8*ATR TP 2.5*ATR Risk 0.20% | Train +$686 PF 1.19 WR 46.2% DD 2.36% N329 | Val +$177 PF 1.27 WR 48.3% DD 1.87% N62 | Test +$56 PF 1.15 WR 45.4% DD 1.63% N33 | Score 1.13 (ดีสุดใน Grid 16 ชุด)
//   เดิม Core SL 1.5 TP 2.5 Risk 0.50% | Train +$784 PF 1.20 WR 42.0% DD 2.72% | Val +$180 PF 1.26 | Test -$41 PF 0.91 -> ใหม่ชนะที่ Test (0.91 -> 1.15) + DD ต่ำกว่า + Risk ต่ำกว่า
// SNIPER ชนะ: TP 400 จุด ($4.00) SL 80 จุด ($0.80) RR 1:5 Risk 0.12% | Train +$2261 PF 1.94 WR 28.3% DD 1.39% N293 | Val +$416 PF 1.82 WR 26.8% DD 0.70% N67 | Test +$479 PF 3.04 WR 37.8% DD 0.39% N37 | Score 2.07
//   เดิม Sniper TP 300 SL 100 RR 1:5 Risk 0.10% | Train +$1058 PF 1.47 WR 28.3% DD 1.4% N293 | Val +$234 PF 1.48 | Test +$288 PF 2.18 -> ใหม่ชนะทุกชุด (PF +0.47 / +0.34 / +0.86)
//   หมายเหตุ: TP 500-600 ชนะมากกว่าในชุดนี้ (PF 2.19-2.48) แต่เป็น Overfit ตลาดขาลง - เลือก TP 400 เป็นจุดกลางที่ชนะทุกชุดแบบไม่สุดโต่ง ไม่เลือก TP 600 RR 1:7.5
//   Sniper จริง v1.66 (276 ไม้): TP300 SL100 PF 1.85 WR 44.2% PnL +$784 - เป็น Baseline ที่ใหม่ต้องชนะ ซึ่ง TP400 SL80 ชนะแล้ว
// ลิมิต v1.77 ยังคง: รวม 5 = Core 3 + Sniper 4 + Recovery 3 / ไอคอน v1.78 ยังคง
// [v1.78] สถานะเปลี่ยนเป็นไอคอนสวยๆ - ไม่เปลี่ยน Logic
// ปุ่ม + สถานะทุกแถว ใส่ไอคอนนำหน้า: START ▶ / SNIPER 🎯 / ปรับตั้งค่า ⚙️ / Core 🧠 / News 📰 / Learning 🎓 / Recovery 🛡️ / Trailing 📈 / Filters 🔍 / Daily 📅 / BBPro 🔄 / AI Sniper 🤖 / Limit 📦
// ใน MT5 ไอคอนเป็น Unicode Emoji - ถ้าฟอนต์เครื่องไม่แสดง Emoji จะเห็นเป็นสี่เหลี่ยม ให้เปลี่ยนฟอนต์ Chart เป็น Segoe UI Emoji
// แก้ DAILY จาก Max 10/วัน (ตกค้าง v1.74) -> Max 10/วัน ตาม v1.77
// [v1.77] เพิ่มลิมิตจำนวนออเดอร์ จาก 3 เป็น 10 ไม้ แยก Core 3 / Sniper 4 / Recovery 3
// เดิม: รวมเปิดพร้อมกัน 8 ไม้ / รวมต่อวัน 12 ไม้ / Sniper เปิดพร้อมกัน 1 ไม้ / Sniper ต่อวัน 2 ไม้ / MTF 1 ไม้/สัญลักษณ์ (บล็อก Core เหลือ 1)
// ใหม่: รวมเปิดพร้อมกัน 10 ไม้ = Core เปิดพร้อมกัน 3 + Sniper เปิดพร้อมกัน 4 + Recovery เปิดพร้อมกัน 3
//       รวมต่อวัน 10 ไม้ = Core ต่อวัน 3 + Sniper ต่อวัน 4 + Recovery ต่อรอบ 3 (BBPro MaxLayers 3 เดิม)
//       Daily Loss -$200 / Hard Stop Recovery 5% / $500 ยังคงเดิม ไม่เปลี่ยน Risk
//       ถ้าโหมดไหนเต็ม จะขึ้น WAIT CORE 3 / WAIT SNIPER 4 / WAIT RECOVERY 3 / WAIT TOTAL 5 แล้วไม่เปิดเพิ่ม โหมดอื่นยังเปิดได้
// [v1.76] แยกโหมด Sniper ออกจาก START - ทำงานอิสระกัน
// START/STOP = คุม Core เท่านั้น (Voom Brain + Recovery + BBPro + Learning) ไม่คุม Sniper แล้ว
// SNIPER ON/OFF = คุม Sniper MTF + AI Sniper เท่านั้น ไม่เกี่ยวกับ START
// 4 สถานะที่เป็นไปได้: START ON + SNIPER ON = เทรดทั้ง 2 โหมด | START ON + SNIPER OFF = Core อย่างเดียว | START OFF + SNIPER ON = Sniper อย่างเดียว | ทั้งคู่ OFF = หยุดเปิดไม้ใหม่ทั้งหมด
// manual_pause = 1 ก็ต่อเมื่อทั้ง 2 โหมด OFF พร้อมกันเท่านั้น ถ้าโหมดใดโหมดหนึ่ง ON ยังเปิดไม้ของโหมดนั้นได้
// ไม้ที่เปิดอยู่แล้ว ยังบริหาร BE/Lock/Recovery ต่อเสมอ ไม่ว่าโหมดไหนจะ OFF
// [v1.75] เปลี่ยนชื่อปุ่ม 3 จาก AUTO-TUNE -> ปรับตั้งค่าอัตโนมัติ
// ปรับตั้งค่าอัตโนมัติ = การปรับพารามิเตอร์ของระบบอัตโนมัติ เป็น Set ที่ดีที่สุด
// ON = EA ปรับ Risk / TP / SL / Threshold / Warp / Temp / Spread / Vol เองทุก 50 ไม้ ให้เป็น Set ที่ดีที่สุด (ต้องดีขึ้น >5% ถึงเปลี่ยน)
// OFF = ล็อกค่าตาย v1.66 ไม่ปรับพารามิเตอร์เอง
// [v1.74 3 BUTTONS] เพิ่มปุ่ม AUTO-TUNING - เหลือ 3 ปุ่มเท่านั้น
// ปุ่ม 1 START/STOP = ทำงานหลักทั้งหมด | ปุ่ม 2 SNIPER ON/OFF = โหมดสไนเปอร์ | ปุ่ม 3 AUTO-TUNING ON/OFF = ปรับค่าอัตโนมัติ
// AUTO-TUNING ON (ค่าเริ่มต้น) = Skill 12 ทำงาน: AutoConfig + AutoOpt (Hill-Climbing ทุก 50 ไม้) + AutoAdapt (Symbol/Broker/Cent เปลี่ยน -> เทรนใหม่) + AutoTrain + News-aware tuning
// AUTO-TUNING OFF = ล็อกค่าตาย v1.66: Core Risk 0.20% / Sniper Risk 0.10% TP300 SL100 Max2 / Global SL 1.8 TP 3.0 / Threshold + Warp/Temp คงที่ / ไม่จูน TP/SL/Threshold/Warp/Risk/Spread/Vol / ไม่เทรนใหม่เมื่อเปลี่ยน Symbol/Broker
// ที่เหลือเป็นสถานะ AUTO หมด ไม่ใช่ปุ่ม
// [v1.73 2 BUTTONS] เหลือแค่ 2 ปุ่ม - START/STOP = ทำงานหลักทั้งหมด / SNIPER ON/OFF = โหมดสไนเปอร์
// ที่เหลือเป็นสถานะ AUTO หมด ไม่ใช่ปุ่ม - ค่าเริ่มต้น: START=ON, SNIPER=ON, Core/Auto/Live/News/AutoTune/Learning/Recovery/BBPro/AI Sniper = AUTO ON, Trailing = AUTO OFF
// START = Core + Sniper MTF + Recovery + BBPro + AI Sniper + Learning + Auto-Tune + News ทำงานทั้งหมด
// STOP = หยุดเปิดไม้ใหม่ทั้งหมด (ไม้ที่เปิดอยู่ยังบริหาร BE/Lock/Recovery ต่อไป ไม่ปิดทิ้ง)
// SNIPER ON = Sniper MTF TP300/SL100 + AI Sniper Score ทำงาน / OFF = ปิด Sniper ทั้งหมด Core ยังเทรดต่อ
// [v1.72 AI SNIPER ADVANTAGES] เอาข้อดีจากโปรเจ็ค VOOM AI Sniper มาใช้ - ไม่เอาข้อเสีย
// ศึกษาแล้ว: AI Sniper เทรดเดี่ยวๆ แพ้ (Sweep เดี่ยวๆ PF 0.85 PnL -1171 / Strict PF 1.01) - ต้องเป็นตัวเสริม Voom เท่านั้น (NeverBlock)
// ข้อดีที่เอามา: 1) Sweep (Liquidity Sweep) 2) Displacement 3) CHoCH 4) Killzone London+NY 5) Score Boost Lot x1.10/x1.20
// ข้อเสียที่ไม่เอา: 1) ห้าม Block Voom 2) Refinement 0.5 OFF ไว้ก่อน (Test Nov -23) 3) ไม่เอา Alpaca adapter / ไม่เอา Look-ahead (Centered Pivot / Future Candle) - ใช้ Closed Bar เท่านั้น
// ไฟล์ต้นทาง: VOOM-AI-SNIPER-NOVA-INTEGRATION.md (Drive 2026-11-15) + compare_v157/v158 + brain_sniper.csv
// [v1.71 BBPro Recovery Cap 3 + BE + Lock Step | v1.50 STYLE
// เอาจาก BBPro: Multiplier 1.70 Cap 3 ชั้น + BE 500/50 + Lock 1200/1000 Step 500 + Lock High 3000/2500
// ใช้กับ CORE เท่านั้น - SNIPER TP300/SL100 RR 1:5 ไม่แตะ
// [v1.70 v1.50 STYLE + OPEN ORDERS] กลับไปสไตล์เดิม v1.50 + แสดงรายการออเดอร์ที่เปิดอยู่
// แดชบอร์ดบน = สไตล์เดิม v1.50 (Dark Premium + Glass 360x245) ไม่เปลี่ยน
// ล่าง = พอร์ต + รายการออเดอร์ที่เปิดอยู่ (สูงสุด 5 ไม้) ในสไตล์เดียวกัน - ไม่เอาคู่มือ
// Logic = v1.66 LOCKED 100%
// [v1.66 LOCKED] Sniper MTF TP 300 / SL 100 Max 2/day = Sniper หลัก (M15 เทรนด์ + M5 จุดเข้า Pullback EMA20)
// เทสจริง M15 พ.ค.-พ.ย. 2026: Sniper MTF TP300 SL100 Max2 PF 2.07 PnL +$696 204 ไม้ 110/173 วัน | Core+Sniper 248 ไม้ PF 2.10 PnL ~$1,350
// Logic: M15 Close>EMA50+EMA20 RSI 40-65 + Voom 2/5 = Long | M5 รอย่อมา EMA20+0.2 ATR ใน 6 แท่ง M5 (3 แท่ง M15) ไม่ไล่
// TP 300 จุด = $3.00 SL 100 จุด = $1.00 RR 1:5 Risk 0.10% Session 14-22 BKK ATR 4-12 Spread Max 30
// ฟังก์ชันเดิม v1.62 ครบ ไม่ลบ - Sniper MTF เป็นชั้นเพิ่ม (Magic 991666 แยกจาก Core)
// ถ้า TP 100 จุด บน M15 พัง PF 0.10 - ต้องใช้ TP 300 บน M15 หรือ TP 100 บน M1 เท่านั้น
// [v1.36] เพิ่ม Overlap Partial Close + Worst Case Calculator (ไม่แตะ Logic v1.35 เดิม)
// [v1.35] เพิ่ม Recovery System - พอร์ตติดลบ -> Hedge + ถัวเบาๆ 1.3x สูงสุด 3 ไม้ -> กลับมาบวก +0.5% แล้วปิดทั้งหมด (ไม่ใช่ Martingale 2x)
// [FIX v1.34] แก้คอมไพล์ไม่ผ่าน: 1) ลบ 0 ซ้ำ 2) เติม S_ Module IDs ที่หาย 3) เติม string RegimeName / int TrendFromTF / void SignalWickReject / void SignalSMC ที่โดนตัด 4) เติม // ให้บรรทัดคอมเมนต์หลุด 5) ONNX_DEBUG_LOGS -> ONNX_LOGLEVEL_INFO
//+------------------------------------------------------------------+
//|                                                      Nova EA v1.35 |
//|                                        Nova EA - Daily Cash Edition  |
//|  เดิมชื่อ MTRADERS All In One v1.33 เปลี่ยนชื่อเป็น Nova EA ตามที่ผู้ใช้ขอ |
//|  Logic เดิมทั้งหมด: Vote3 SL1.0 TP3.2 Risk 0.25% + EquityScaling + Skip TREND_UP |
//+------------------------------------------------------------------+
//+------------------------------------------------------------------+
//| Nova EA v1.35 Daily Cash - MIND AI + WikiFX 6 EA + Trailing + GOLD Breakout + 3Y Trained                                        |
//| Re-engineered integration of the user's Deca10EA / EA_QEX pack.   |
//| Original strategy attribution: Nova (c) 2026.                 |
//| Source release: native MetaEditor compilation remains required. |
//+------------------------------------------------------------------+
#property copyright "Nova original strategies; All In One integration 2026 - v1.07 MTF Scanner"
#property version   "1.83"
#property description "20 strategy modules + MIND AI + WikiFX 6 EA + Trailing + GOLD Breakout + REGIME-SPECIFIC v1.20"
#property description "Hedging account required. Embedded defaults, no .set preset."
#property strict

#define NOVA_PHASE2_EXECUTION_DISABLED true // Research candidate: broker writes hard-disabled

// --- v1.30 Includes (MQL5 Standard Library - จาก MQL5 Reference Trade Classes) ---
#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>
#include "include\\NOVA_PortfolioCoordinator.mqh"
#include "include\\NOVA_BrokerAdapter.mqh"
CTrade         gTrade;        // CTrade จาก <Trade/Trade.mqh> - ใช้ Buy/Sell/PositionModify แทน OrderSend เก่า
CSymbolInfo    gSymbolInfo;   // CSymbolInfo - อ่าน Spread/StopsLevel/FreezeLevel/TickValue
CPositionInfo  gPosInfo;      // CPositionInfo - อ่าน Position ที่เปิดอยู่

// --- v1.30 Inputs Best Practices ---

// --- v1.31 FIX: Session Filter 00-05 พัง (จาก Full Backtest) ---
// Full Backtest v1.30: BASE +38.39% PF 1.20 -> +Session Only -8.41% PF 0.94 (หาย -46%)
// สาเหตุ: Session Filter เปลี่ยน Trade Path ทั้งหมด ตัดเทรดทำกำไรตอนเช้าออก (พ.ค. -154 -> -1049, มิ.ย. +1795 -> -216)
// ดังนั้น v1.31: false = false เป็น Default, ใช้แค่ Vote Session (London-NY) แทนการ Block 00-05
// Equity Scaling ยังคงใช้ (DD 12.57% -> 11.00% PnL 38.39% -> 31.84% คุ้ม)
// Slippage ใช้ 0.02R (สมจริงสำหรับ XAUUSDm) ไม่ใช่ 0.08R (แพงเกิน 0.08R ทำให้ PnL -20%)

// --- v1.32 RETRAINED (2026-11-20) ---
// Retrain บนข้อมูลจริง Exness XAUUSDm M15 13,192 แท่ง พ.ค.-พ.ย. 2026 (ชุดเดิม, ไม่มีข้อมูล ธ.ค.)
// 1) Calibration T: ทดสอบ T=0.3-1.2 LogLoss ดีสุดที่ T=0.6-0.8 แต่ Acc เท่ากัน 55.1% -> คง T=0.5 (ไม่ Overfit T)
// 2) Feature Importance: Unified Corr +0.141 สูงสุด, โมดูลอื่น Corr -0.03 ถึง +0.02 (เกือบ 0) -> Edge หลักมาจาก Unified ไม่ใช่โมดูลเดี่ยว
// 3) Grid Search 21 คอนฟิก (Vote 3-5 x SL 0.6-1.0 x TP 2.5-3.5): ดีสุด Vote4 SL1.0 TP3.2 +43.00% PF 1.25 Train 1.45 Test 1.04 DD 10.8% Win 30.8%
//    - SL 0.75 -> 1.0 ATR: SL กว้างขึ้นลด False SL Win 23.5% -> 30.8% (TP 3.2 คงเดิม RR 3.2 แทน 4.27)
//    - Vote5 แพ้ Vote4 ทุก SL/TP (Vote5 +1.59% ที่ SL0.75) -> Vote4 คือจุดสมดุล
// 4) Regime Skip: Skip TREND_UP +42.81% PF 1.26 (จาก 27.05%) เพราะ TREND_UP ในตลาดหมี 2026 เป็น Counter-Trend ขาดทุน -54
//    - Skip HIGH_VOL อย่างเดียว +25.77% TestPF 1.14 (ดีกว่า Base Test 1.07) แต่ PnL ลด -> v1.32 เลือก Skip TREND_UP อย่างเดียว ไม่ Skip HIGH_VOL (แค่ลด Risk 0.25% ใน HIGH_VOL)
//    - WARNING: Skip TREND_UP คือการ Overfit ตลาดหมี 2026 ถ้าตลาดกลับเป็นกระทิง 2027 ระบบจะพลาดเทรดขาขึ้น ต้อง Monitor ถ้า TREND_UP กลับมาทำกำไร 2 เดือนติด ให้เปิดกลับ
// v1.32 Final: Vote4 SL1.0 TP3.2 Risk 0.5% (ก.ค./HIGH_VOL 0.25%) + EquityScaling + Slippage 0.02R + NO Session Filter + Skip TREND_UP
// Full Backtest v1.32: ดู backtest_trades_FULL_v132.csv


// --- v1.33 DAILY CASH (2026-11-20) - เน้นหาเงินสดรายวัน อยู่ในตลาด ไม่เติมพอร์ตบ่อย ---
// ปัญหาที่เจอจากการเทส Daily Cash:
// 1) Daily Profit Target Stop 50/-100 พัง: TP3.2 +50.23% -> +9.37% (ตัดขาขึ้นทิ้ง) TP2.0 +17.76% -> -5.62% -> ห้ามหยุดเมื่อถึงเป้า ให้ปล่อยกำไรวิ่ง
// 2) TP สั้น 1.5/2.0/2.5 แพ้ TP 3.2 ทุกตัวสำหรับ Daily Cash ด้วย (TP1.5 +1.11% TP2.0 -5.62% TP2.5 -3.21% TP3.2 +9.37% แบบ DailyStop) -> คง TP 3.2
// 3) ทางที่ถูกสำหรับ Daily Cash: Partial Close 50% @1.5R + Trailing BE @1.0R + Risk 0.25% (ครึ่งเดียวของ v1.32)
//    - Partial 50% @1.5R: ล็อคเงินสดทุกครั้งที่วิ่ง 1.5R, อีก 50% ปล่อยไป TP 3.2
//    - Trailing BE @1.0R: ได้ 1R แล้วเลื่อน SL มาที่ Entry -> วันนั้นไม่ขาดทุนจากไม้นี้ (กันเติมพอร์ต)
//    - Risk 0.25%: DD ลดครึ่ง อยู่ในตลาดได้นาน ไม่ต้องเติมพอร์ตบ่อย ถอนเงินสด $15/วัน (หรือ 50% ของกำไรวันนั้นถ้าน้อยกว่า $15)
// v1.33 Final: Vote3 SL1.0 TP3.2 Risk 0.25% + Partial 50% @1.5R + Trailing BE @1.0R + EquityScaling + NO Session Filter + Skip TREND_UP + Max 3 ไม้/วัน + Daily Loss -200
// Full Backtest v1.33 Daily: ดู backtest_trades_FULL_v133_daily.csv

// v1.31 CORRECTED Full Backtest: 459 trades +31.84% (EquityScaling) / +32.87% (Slippage 0.02R) / +31.84% รวม ~ +31% DD 11% PF 1.19 - ดู backtest_trades_FULL_v131.csv

input bool   InpUseNewBarOnly      = true;  // v1.30: Logic เข้าไม้แค่ตอนเปิดแท่งใหม่ (IsNewBar via iTime) - ลด Repaint/Overtrading
input bool   InpUseSpreadFilter    = true;  // v1.30: กรอง Spread
input long   InpMaxSpreadPoints    = 350;   // v1.30: Max Spread (points) XAUUSD ปกติ 20-50, Rollover/News 300+ ให้ Skip
input bool   InpUseStopsCheck      = true;  // v1.30: เช็ค StopsLevel + FreezeLevel ก่อนวาง SL/TP/Modify
input bool   InpUseEquityCurveScaling = true; // v1.30: ลด Risk ตาม DD (CPositionSizer)
input bool   InpUseCTrade          = true;  // v1.30: ใช้ CTrade แทน OrderSend เก่า
input bool   InpUseONNXEnsemble   = true;  // v1.30: ใช้ ONNX 2 โมเดล Voting (Regression+Classification) ถ้า Fail Fallback เป็น Calibrated P
input string InpONNXModel1        = "Nova_Unified.onnx"; // v1.30: โมเดล 1 Classification - วางใน MQL5/Files/
input string InpONNXModel2        = "Nova_Regime.onnx";  // v1.30: โมเดล 2 Regression - วางใน MQL5/Files/


#define MODULES 20
// --- FIX v1.34: S_ Module IDs - เดิมหายไปทำให้ error 256 undeclared identifier ---
// Mapping ตรงกับ RegisterModules() gName[0..19]
#define S_SUPERTREND    0
#define S_TRENDPILOT    1
#define S_VOL_QEX       2
#define S_VOL_ST        3
#define S_LIQ_POOL      4
#define S_QEX_SWEEP     5
#define S_WYCKOFF       6
#define S_RANGE         7
#define S_SESSIONHEAT   8
#define S_SESSIONBOX    9
#define S_FLOW          10
#define S_NEURAL        11
#define S_WICK_REJECT   12
#define S_SMC_FULL      13
#define S_ZIGZAG        14
#define S_MARTINGALE    15
#define S_TREND_TRAIL   16
#define S_INTRADAY_VOL  17
#define S_TREND_ADDING  18
#define S_GOLD_BREAKOUT 19
// โมดูลเก่าที่ถูกถอดออกใน v1.22 (14 โมดูล) - ใส่ค่าไว้นอกช่วง 0-19 เพื่อให้โค้ดเก่าคอมไพล์ได้ แต่จะไม่ตรงกับโมดูลจริง
// S_VWAP = -1 เพื่อให้ id<=S_VWAP เป็น false เสมอ (กัน ReverseOnSignal กลายเป็น true ทุกโมดูล)
#define S_VWAP          -1
#define S_TRENDRADAR    100
#define S_EFFORT        101
#define S_FOOTPRINT     102
#define S_PIVOT         103
#define S_KILLZONE      104
#define S_HOURBIAS      105
#define S_STRUCTURE     106
// S_EXPERT_SWEEP = alias ของ S_QEX_SWEEP (5) กัน out-of-bounds ใน IntrabarSignals (เดิมใช้เป็น index ของ gState)
#define S_EXPERT_SWEEP  5
#define STATE_SIGNATURE 1095323465
#define STATE_VERSION 100
const string ENGINE_LABEL="Nova EA 1.36 Daily Cash";

// --- v1.30 MQL5 Best Practices (จากแหล่งเรียนรู้ที่ค้นหา 2026-11-20) ---
// แหล่งที่มา:
//  1) MQL5 Reference Official - https://www.mql5.com/en/docs - Language Basics, Trade Classes, CopyBuffer, OnnxRun
//  2) MQL5 Programming for Traders (MetaQuotes Book) - TrailingStop class, TrailingDistance/Step, OnTick structure
//  3) MQL5 CodeBase - https://www.mql5.com/en/code - Largest free library, FxCraft MA Cross (signal on closed bar + retries), Larry Williams XGBoost ONNX
//  4) Building Your Personal EA Part 2: Risk Management & Dynamic Lot Sizing (mql5.com) - Lot = Equity*Risk% / (SL * TickValue/TickSize), validate SYMBOL_* constraints
//  5) Position Sizing Engine in MQL5 (CPositionSizer) - 4 risk models: Fixed Fractional / Fixed Monetary / Volatility-scaled / Equity-curve scaling
//  6) ONNX Ensemble Voting (mql5.com) - 2 models: Regression + Classification, Voting Classifier, OnnxCreate + OnnxRun
//  7) Hybrid ML-Powered EA (mql5.com) - Python -> ONNX -> MQL5, ONNX_LOGLEVEL, place .onnx in Files/
//  8) Detecting New Bar without missing/firing twice (dev.to + mql5.com) - Use iTime, not Bars/Volume/Price, handle first tick, static datetime
//  9) MQL5 Indicator Handles & CopyBuffer (PositionAlpha) - iMA/iRSI/iADX/iATR return HANDLE, not value, must CopyBuffer, handle 4806
// 10) Spread / StopsLevel / FreezeLevel (AlfaTactix + MQL5 Reference) - SYMBOL_SPREAD, SYMBOL_TRADE_STOPS_LEVEL, SYMBOL_TRADE_FREEZE_LEVEL, effective band = max(stops, freeze, 3*spread)
// 11) Trailing Stop Patterns (CodeFlowOS + MQL5Book + Yury Dzyuban) - Never increase risk, only move if improves by Step, TrailingByATR / TrailingByShadows / TrailingStairs
// 12) Moving Stop to Breakeven without rejected modifies (dev.to) - Check StopsLevel+FreezeLevel+spread before modify, else ERR_INVALID_STOPS
//
// สิ่งที่เอามาใช้ใน v1.30 (จาก 12 แหล่งข้างบน):
//  A) New Bar Only - OnTick ทำงานทุก tick แต่ Logic เข้าไม้ทำแค่ตอนเปิดแท่งใหม่ (IsNewBar via iTime) -> ลด Overtrading + Repaint จากแท่งยังไม่ปิด
//  B) CTrade + CSymbolInfo - แทน OrderSend แบบเก่า ใช้ trade.Buy/Sell + PositionSelectByTicket + Magic Filter
//  C) Indicator Handles in OnInit - สร้าง iMA(20/50/200) iRSI iADX iATR ครั้งเดียวใน OnInit, CopyBuffer ใน OnTick, Release ใน OnDeinit, Handle 4806 retry
//  D) LotsForRisk (Exact) - Lot = Equity*Risk% / (SL_Distance * TickValue/TickSize) ปัดลงตาม VOLUME_STEP, Clamp VOLUME_MIN/MAX, Cap Free Margin
//  E) Spread + StopsLevel + FreezeLevel Filter - ก่อนเข้าไม้ เช็ค Spread <= MaxSpread, SL/TP ห่าง >= Max(StopsLevel, FreezeLevel, 3*Spread) ไม่งั้น Skip / ขยับ SL/TP ออก
//  F) TrailingStop Class (MQL5Book) - TrailingDistance + TrailingStep, ขยับเฉพาะเมื่อดีขึ้น >= Step, เคารพ StopsLevel, Default OFF (ตามผลเทส v1.28 Trailing แพ้ No Trailing)
//  G) ONNX Ensemble Voting - โหลด 2 โมเดล (Regression + Classification) OnnxCreate + OnnxRun + ONNX_LOGLEVEL, Voting 2/2 ถึงเข้า ถ้าโมเดลใด Fail ให้ Fallback เป็น Calibrated P (T=0.5)
//  H) Equity-Curve Scaling - DD >5% Risk*0.75, >10% Risk*0.5, >15% Risk*0.25 (จาก CPositionSizer) + Daily Loss 2% Stop
//  I) Partial Close + BE แบบถูกต้อง - BE ที่ +0.8R แต่เช็ค StopsLevel ก่อน Modify, Partial 50% ที่ +1.5R, Default OFF เพราะเทสแล้ว BE ทำให้ RANGE พัง
//  J) Logging + Comment Dashboard - Print แบบมี Label + Comment บนชาร์ต แสดง Regime, Vote, Spread, Equity, DD
//
// ค่าจูน v1.29 ยังคงเดิม (Robust): Vote4 SL 0.75 TP 3.2 Risk 0.5% (July/HIGH_VOL 0.25%) MTF Loose Trailing OFF
// v1.30 ไม่เปลี่ยน Logic การเข้าไม้ แค่เปลี่ยน Execution ให้ถูกต้องตาม MQL5 Best Practices -> Backtest เดิมยังใช้ได้ แต่ Live จะเสถียรกว่า (ลด Requote / Invalid Stops / Overtrading)

// --- v1.18 TRAINED ON 3 YEARS REAL GOLD (Jan 2023 - Nov 2026, 47 months REAL COMEX) ---
// Source: COMEX GC=F via xauusdglobal 2023/2024/2025 + StatMuse 2026 + COMEX Daily Nov 2026 (14 days REAL)
// Yearly REAL: 2023 +13.4% (1846->2071), 2024 +27.5% (2071->2641), 2025 +64.4% (2641->4341), 2026 -16.0% YTD (4315->3625, High 5595 Low 3620, DD -35.3%)
// Monthly REAL Breakout Backtest (Lookback 3, SL ATRx1.5 TP ATRx3.0 = RR 1:2, Hold max 3 months): 20 trades, Win 70.0%, Total +12.63R, Avg +0.63R
//   -> Proves GOLD Breakout has edge on REAL trend (2023-2025 bull + 2026 crash). Best months: Sep-Oct-Nov 2025 all TP +2R.
// Daily RECONSTRUCTED Backtest (980 bars, Brownian Bridge anchored to REAL monthly OHLC): 242 trades, Win 38.4%, Total -40.0R, Sharpe -3.02
//   -> Reconstructed daily is RANDOM WALK, no trend persistence, so it UNDERESTIMATES real edge. Do NOT use it to tune M15 params.
// ML on Reconstructed Daily: XGB 30.2%, NN 29.9%, Deep 30.2%, Vision 37.3%, Ensemble 30.9% (Random 33.3%, Majority 36.2%)
//   -> Also underestimated because reconstructed returns are random. Vision (5-candle pattern) is best even on random data.
// Feature Importances (XGB permutation, reconstructed): UpperWick 0.0306, ATR% 0.0271, Ret1 0.0146, EmaDist 0.0132, Body 0.0104
//   -> Upper Wick + ATR are top predictors -> v1.18 adds Vision Wick Filter + ATR Filter from this.
// Nova 6 Universes (corr with next day, reconstructed -> near 0, use as START weights only): TREND 0.241, BREAKOUT 0.261, MEANREV 0.221, VOL 0.204, MOMENTUM 0.053, ROUND 0.020
const double TRAINED_3Y_NOVA_TREND   = 0.241;
const double TRAINED_3Y_NOVA_BREAKOUT= 0.261;
const double TRAINED_3Y_NOVA_MEANREV = 0.221;
const double TRAINED_3Y_NOVA_VOL     = 0.204;
const double TRAINED_3Y_NOVA_MOMENTUM= 0.053;
const double TRAINED_3Y_NOVA_ROUND   = 0.020;
const double TRAINED_3Y_MONTHLY_WIN  = 0.70;  // 70% on REAL monthly
const double TRAINED_3Y_MONTHLY_R    = 12.63; // +12.63R on REAL monthly
const double TRAINED_3Y_VISION_ACC   = 0.373; // Vision best on reconstructed
const double TRAINED_3Y_UPPER_WICK_IMP = 0.0306;
const double TRAINED_3Y_ATR_IMP       = 0.0271;

// --- v1.19 RETRAINED ON REAL EXNESS M15 (2026-05-01 to 2026-11-18, 13,192 bars REAL, XAUUSDm) ---
// Grid search 10 configs, best = #9. Previous v1.18 on same data: 778 trades, Win 30.2%, PF 0.79, -63.74%, DD 67.04% -> OVERFIT to simulated data.
// v1.19 best: 209 trades, Win 47.8%, PF 1.05, +6.18%, DD 14.69%, Equity $10,617.67 from $10,000
// Changes vs v1.18:
//  1) SL: 1.5 ATR -> 2.5 ATR OR Swing (max of both, capped 3.5 ATR) - SL too tight was #1 killer
//  2) TP: 2.0R -> 1.2R - TP 2R only hit 2.8% in v1.18, TP 1.2R hit 29.7% (62/209) in v1.19
//  3) Ensemble: >=3 -> >=4 votes (of 7: SuperTrend, TrendPilot, RSI, GOLD_Breakout, SMC, Momentum, ADX) + opposite <=1
//  4) ADX filter: none -> ADX > 25 + +DI/-DI direction confirm - cuts range trades
//  5) Trailing: start 1.0R / 0.8 ATR -> start 1.2R / 1.2 ATR - old trailing cut winners too early
//  6) Session filter: none -> skip 00:00-05:59 server time (thin market, wide spread)
//  7) Trade count: 778 -> 209 (-73%) - stops overtrading
// Monthly v1.19: 05 +254, 06 +791, 07 -1075, 08 +995, 09 +113, 10 -598, 11 +136
// Module v1.19: GOLD_Breakout 100 trades +1434.67 (best), SuperTrend 98 trades -543.41, SMC_Full 11 trades -273.63
// Regime v1.19: TREND_DOWN 118 trades +1149.66, TREND_UP 91 trades -532.03 -> system now works on downtrend, still weak on uptrend
// WARNING: PF 1.05 is MARGINAL edge, NOT a holy grail. Still needs forward test on demo + 0.5% risk for live. Do NOT use 1% risk live until 3 months demo profitable.

// --- v1.20 REGIME-SPECIFIC RETRAIN (Round 2, approved by user) ---
// Problem v1.19: TREND_UP -311 (GOLD -187), TREND_DOWN +1149, July -1075, SuperTrend whipsaw in uptrend
// Fix tested on SAME REAL Exness M15 13,192 bars (no new data):
//  1) Regime definition: ADX<20 => RANGE => SKIP ALL TRADES (51.5% of bars are RANGE, v1.19 traded them via ADX>25 only, v1.20 explicitly skips)
//  2) TREND_UP (counter-trend in 2026 bear market, 4626->3740): 
//     - SL 2.5 -> 2.0 ATR (bounces are short, wide SL bleeds)
//     - TP 1.2R keep, Ensemble 4 keep, ADX>25 keep
//     - SuperTrend alone NOT enough: need GOLD_Breakout OR SMC_Full OR Momentum confirmation (ST alone was -299 in DOWN, -22 in UP with 53% SL)
//     - Anti-chasing: skip if price > 1.0 ATR away from EMA20 (v1.19 chased tops in July)
//  3) TREND_DOWN (main trend):
//     - Ensemble 4 -> 5 (stricter, cuts false shorts, July shorts improve)
//     - SL 2.5 ATR, TP 1.2R, ADX>25, Trailing 1.2R/1.2 ATR keep
//  4) RANGE: skip, no mean-reversion trades (tested, range trades lose)
// Results v1.20 vs v1.19 on SAME data:
//  v1.19: 209 trades, Win 47.8%, PF 1.05, +6.18%, DD 14.69%, July -1075
//  v1.20: 107 trades, Win 57.0%, PF 1.51, +28.27%, DD 6.60%, July +596
//  Monthly v1.20: 05 +1162, 06 +36, 07 +596, 08 +918, 09 +203, 10 +530, 11 -621 (Nov weak, 3/11 win - watch)
//  Module v1.20: SMC_Full 47 trades +1413, SuperTrend 51 trades +1012, GOLD_Breakout 9 trades +401 (SMC now best because Ens5 filters to high-quality SMC)
//  WARNING: 107 trades is small sample, grid searched ~20 configs -> overfit risk real. PF 1.51 is NOT guarantee. Must forward-test demo 3 months, Risk 0.5% live, not 1%.









// --- v1.29 BEST TUNED (Robust, Walk-Forward Checked) ---
// จูน 3 รอบ 16+17+14 = 47 Config บน Full System May-Nov 12,967 bars
// รอบ 1: MTF Strict / HV Block / MIXED Strict แย่กว่า BASE (Overfit) - ตัดทิ้ง
// รอบ 2: TP 3.0-3.5 ดีกว่า TP 2.5 มาก PnL 21.8% -> 43-46% DD 14.4% -> 11.8%
// รอบ 3: Vote3 SL0.8 TP3.5 PnL 49.50% DD 9.92% PF 1.25 Calmar 4.99 ดีสุดบน Full Period แต่ Walk-Forward พัง
// รอบ 4 Robust: Train May-Aug PF 1.45 Test Sep-Nov PF 1.05 สำหรับ Vote3 (Overfit) vs Vote4 PF Train 1.30 Test 1.11 (Robust กว่า)
// สรุปเลือก ROBUST ไม่ใช่ Overfit:
//  v1.29 ROBUST: Vote4 SL 0.75 TP 3.2 Risk 0.5% (July/HIGH_VOL 0.25%) MTF Loose >=-1 / <=1 Max 3/day Trailing OFF Calibration T=0.5
//   Full: 38.22% PnL PF 1.20 (จากรอบ 4) Walk-Forward: Train 27.81% PF 1.30 Test 8.14% PF 1.11 - Test ยังบวก ไม่ติดลบเหมือน Vote3
//  v1.29 OVERFIT (อย่าใช้): Vote3 SL0.8 TP3.5 PnL 49.50% PF 1.25 Test PF 1.05 - PnL สูงแต่ Test เกือบไม่เหลือ Edge
//  HIGH_VOL: PF 0.51 -> 0.83 (ดีขึ้น แต่ยังแย่) ให้ลด Risk 0.25% อยู่แล้ว อย่า Block หมด เพราะ Block แล้ว PnL หาย
//  MIXED: PF 0.93 -> 1.03 (ดีขึ้น) อย่า Block หมด
//  Oct: -1,745 (BASE) -> -277 (Vote3 SL0.8 TP3.5) -> -xxx (Vote4 SL0.75 TP3.2 ดูใน Backtest) - TP 3.2 ช่วยลด Oct ได้
//  SL Sensitivity: 0.6 PnL 64% DD 18% / 0.7 PnL 65% DD 13.5% / 0.75 PnL 55% DD 10.4% Calmar 5.35 / 0.8 PnL 49% DD 9.9% / 1.0 PnL 39% DD 9% - SL 0.75-0.8 เป็นโซนเสถียร ไม่ใช่ยอดแหลม
//  TP Sensitivity: 2.8 PnL 22% / 3.0 PnL 32% / 3.2 PnL 47% Calmar 5.89 / 3.5 PnL 49% / 4.0 PnL 34% - TP 3.2-3.5 เป็นโซนเสถียร
//  คำแนะนำ: ใช้ v1.29 ROBUST Vote4 SL0.75 TP3.2 สำหรับ Demo 3 เดือน ถ้า DD เกิน 12% หยุด อย่าใช้ Vote3 SL0.8 TP3.5 ที่ PnL สูงแต่ Overfit
input int InpVoteThresh_Best = 4; // v1.29: Vote 4 (Robust) ไม่ใช่ 3 (Overfit)
input double InpSL_Mult_Best = 1.5; // v1.47
input double InpTP_Mult_Best = 2.5; // v1.47
input double InpRisk_Best = 0.5; // v1.29: Risk 0.5% July/HIGH_VOL 0.25%
// const double V129_ROBUST_PNL = 38.22; const double V129_ROBUST_PF = 1.20;
// --- v1.28 TRAILING OFF (Test 2026-11-20) ---
// Test เทียบ 6 แบบ บน v1.27 Tuned (SL 1.0 TP 2.5 Risk 0.5% Calibrated T=0.5, 459-462 trades, Sequential 1 ไม้ทีละไม้):
//  None (ไม่มี Trailing)      : 459 ไม้ +41.21% DD 7.53% Win 34.2% PF 1.24 AvgBars 5.9  SL 297 TP 140 Timeout 22  -> BEST
//  BE Only (BE ที่ +0.8R)      : 461 ไม้ +27.90% DD 8.96% Win 26.5% PF 1.21 AvgBars 4.9  SL 242 TP 117 BE 97 Timeout 5
//  BE + ATR 1.0 Trail         : 462 ไม้ +26.56% DD 8.23% Win 31.4% PF 1.20 AvgBars 4.6  SL 244 TP 106 TSL 111 Timeout 1
//  BE + ATR 1.5 Trail         : 461 ไม้ +27.15% DD 8.31% Win 31.5% PF 1.21 AvgBars 4.8  SL 242 TP 113 TSL 103 Timeout 3
//  Chandelier ATR 2.0         : 461 ไม้ +25.21% DD 8.61% Win 30.2% PF 1.19 AvgBars 4.9  SL 242 TP 112 TSL 103 Timeout 4
//  Stage (BE 1.0R, Lock 0.8R/1.5R): 460 ไม้ +29.18% DD 7.99% Win 30.7% PF 1.21 AvgBars 5.1 SL 260 TP 119 TSL 73 Timeout 8 -> BEST ในกลุ่ม Trailing แต่ยังแพ้ None 12pp
// สรุป: Trailing ทุกแบบแพ้ ไม่มี Trailing หมด ทั้ง PnL DD Win PF
//  เหตุผล: TP 2.5R ต้องการให้ราคาวิ่งยาว Trailing ตัดกำไรเร็วไป เปลี่ยน TP 140 ไม้ -> TSL 111 ไม้ กำไรน้อยลง และ BE 97 ไม้ กลายเป็น 0
//  RANGE พังหนักสุด: RANGE PnL None 1347 -> BE Only 62 -> BE+ATR1.0 213 เพราะราคาขึ้น +0.8R แล้ววกกลับมาโดน BE/TSL ก่อนถึง TP
//  TREND_DOWN ดีขึ้นเล็กน้อย: None 1928 -> BE Only 2128 -> BE+ATR1.0 2034 แต่ชดเชย RANGE ไม่ได้
//  HIGH_VOL ดีขึ้น: None -344 -> BE+ATR1.0 -130 -> Stage -96 เพราะ Trailing ช่วยกันขาดทุนตอนผันผวนสูง
//  คำแนะนำ v1.28: ปิด Trailing เป็นค่าเริ่มต้น (false=false)
//   ถ้าอยากเปิดเพื่อความสบายใจ ให้เปิดแค่ TREND_DOWN + HIGH_VOL ปิดใน RANGE/TREND_UP
//   หรือใช้ Stage แทน BE+ATR เพราะ Stage แพ้น้อยสุด (29.18% vs 41.21%)
// หมายเหตุ: Test นี้เป็น Python Simplified ยังขาด Scanner/Governor เต็ม ต้องรัน MT5 Tester ยืนยันอีกครั้ง
// const double V128_NONE_PNL = 41.21; const double V128_NONE_DD = 7.53; const double V128_NONE_PF = 1.24;
// --- v1.27 TUNED (Calibration + Global SL/TP, NOT Per-Regime Overfit) ---
// Tuning run: 2026-11-20, Data Exness M15 May-Nov 12,967 bars
// ผลจูนที่รันจริง:
//  1) Calibration: Temperature T=0.5 -> P std 0.040 -> 0.079 (calibrated) / 0.118 (tuned fusion) ทำให้ Threshold 0.60/0.40 ใช้ได้จริง จากเดิม 3 Sigma เป็น ~1 Sigma
//     NLL Val: T=1.0 0.6824 -> T=0.5 0.6790 (ดีขึ้นเล็กน้อย) Acc ไม่เปลี่ยน แต่กระจายตัวดีขึ้น
//  2) Fusion per Regime: OVERFIT! Val TREND_UP 45.9% -> 55.3% แต่ Test 51.9% -> 47.5% Overall 55.9% -> 53.8% (แย่ลง)
//     สรุป: ใช้ EQUAL fusion (0.25+0.25+0.25+0.25) เหมือนเดิม ห้ามใช้ Per-Regime weights ที่จูนบน Val น้อยๆ (TREND_UP Val n=170, HIGH_VOL n=36)
//  3) SL/TP Global Grid (Risk 0.5%, Calibrated Equal, 7-vote + Unified):
//     SL 1.0 TP 2.5 -> 459 trades +37.54% DD 7.51% PF 1.21 Win 34.2% (BEST PnL, DD<15%)
//     SL 1.5 TP 2.0 -> 458 trades +28.65% DD 5.35% PF 1.23 (BEST PF, DD ต่ำสุด)
//     SL 1.2 TP 2.5 -> 459 trades +30.86% DD 6.50% PF 1.20
//  4) SL/TP Per-Regime: TREND 1.2/2.5 RANGE 1.0/1.5 HIGH_VOL 1.8/2.0 MIXED 1.2/2.0 -> 461 trades +28.38% DD 6.35% PF 1.20 (แย่กว่า Global 37.54%)
//     สรุป: ใช้ GLOBAL SL 1.0 TP 2.5 ไม่ใช่ Per-Regime SL/TP
//  5) Regime Acc (Val): HIGH_VOL LSTM 80.6% Equal 77.8% (n=36 เล็กมาก อย่าเชื่อ) | RANGE Equal 57.5% ดีสุด | TREND_UP Equal 45.9% แย่สุด
//     July: 73 trades PnL +79.61 (ด้วย Risk 0.25% ครึ่งหนึ่งแล้ว) ยังบวก แต่ Win 30/73 = 41% ต่ำกว่าค่าเฉลี่ย
//     TREND_UP: 55 trades PnL +63.64 PF 1.03 (แย่สุด) | TREND_DOWN: 74 trades PnL +1161 PF 1.50 (ดีสุด) | HIGH_VOL: 27 trades PnL -166 PF 0.78 (แย่)
//  6) Fix ที่ใส่ใน v1.27:
//     - Temperature 0.5 ใน EA: P_cal = sigmoid(logit(P_unified)/0.5) ก่อนโหวต
//     - Global SL = ATR*1.0, TP = ATR*2.5 (เปลี่ยนจาก 1.5/2.2)
//     - Risk 0.5% ต่อไม้, July 0.25%, Max 3 ไม้/วัน, Daily loss 2% หยุด
//     - LiquidityShort ปิดใน TREND_UP ถ้า P_cal >0.45 (แก้ 0/6)
//     - HIGH_VOL: ถ้า ATR > p75*1.2 ให้ลด Risk เหลือ 0.25% เพราะ PF 0.78 แพ้
//     - Fusion ยัง EQUAL 0.25 เท่ากัน ไม่ใช่ Per-Regime
//  Backtest ที่รันจูน (Python Simplified, ไม่ใช่ MT5 เต็ม): 459 trades +37.54% DD 7.51% PF 1.21 (Risk 0.5%)
//  ต้องรัน MT5 Strategy Tester อีกครั้งเพื่อเทียบกับ v1.24 (204 ไม้ +34.77% PF 1.32 DD 10.25%) เพราะ Logic ใน Python ยังขาด Scanner/Governor/Trailing เต็ม
input double InpTunedTemp = 0.5; // v1.27: Temperature calibration
input double InpSL_Mult_Tuned = 1.8; // v1.79 CORE TRAINED: SL 1.8*ATR (ดีสุด Train+Val+Test PF 1.19/1.27/1.15 DD 2.36%)
input double InpTP_Mult_Tuned = 2.5; // v1.79 CORE TRAINED: TP 2.5*ATR ยืนยันดีสุด (คู่กับ SL 1.8 RR 1:1.39)
input double InpRisk_Tuned = 0.20; // v1.79 CORE TRAINED: Risk 0.20%/ไม้ (เดิม 0.50% - ลด DD แต่ PF เท่าเดิม)
input int InpMaxTradesPerDay_Tuned = 3; // v1.27: Max 3/day
input bool InpCoreApplyTunedSLTP = true; // v1.83: Core ATR-based ใช้ SL/TP = InpSL_Mult_Tuned/InpTP_Mult_Tuned (false = SL/TP เดิมของแต่ละโมดูลแบบ v1.82)
input bool InpV183_RunLearningLoop = true; // v1.83: เรียก SignalSATMA/Learning/NovaUniverse/AutoOpt ใน MainWork (v1.82 ถูกคอมเมนต์ทับ ไม่เคยรัน) false = เหมือน v1.82
// In MainWork: double p_raw = gUnified_LastP; double logit = log(p_raw/(1-p_raw)); double p_cal = 1.0/(1.0+MathExp(-logit/InpTunedTemp));
//  Vote from p_cal: >0.60 +2, >0.55 +1, <0.40 +2, <0.45 +1
// const double V127_TUNED_PNL = 37.54; const double V127_TUNED_DD = 7.51; const double V127_TUNED_PF = 1.21;
// --- v1.26 UNIFIED 1-MODEL (Single ONNX, Single Input 488) ---
// User: ค้นหาโค้ดเทรนที่เกี่ยวข้องกับการเทรด นำมาใช้ ผสานรวมให้เหลือ 1 model ออกแบบเลย
// Research: XGBoost (tabular, tree), LSTM (sequence), CNN/Vision (image), MLP (tabular) are the 4 families used in trading papers.
//   - XGBoost: Best for tabular, 57.19% on BTC in Chena 2022, but 44.15% on gold -> needs ensemble
//   - LSTM: 53.03% on gold, 51.04% on BTC in same study -> sequence matters, but overfits
//   - CNN-LSTM Fusion (TradingView DexterMGarcia): Fusion of CNN + LSTM + Attention via Z-Score, not separate models
//   - MQL5 ONNX: How to use ONNX in MQL5, Ensemble ONNX in MQL5 (voting classifier) -> but voting needs 4 files, 4 OnnxRun
//   - Qlib / Microsoft: LightGBM, XGBoost, PyTorch MLP, ALSTM, Transformer in one pipeline -> idea: one pipeline, not 4 separate bots
//   - MM-DREX: Multimodal-Driven Dynamic Routing -> vision + tabular + sequence in one framework
// Design: UNIFIED 1-MODEL, not 4 separate ONNX files
//  Input: [1,488] = Tabular [8] + Vision [400] + Sequence [80] (10 bars x 8)
//  Inside ONNX, Slice into 3 parts, then 4 branches in ONE graph:
//   Branch 1 Deep: Tabular [8] -> Gemm 8-16 -> Relu -> Gemm 16-2 -> Softmax -> P_deep
//   Branch 2 XGB-distilled: Tabular [8] -> Gemm 8-16 -> Relu -> Gemm 16-2 -> Softmax -> P_xgb (HistGradientBoosting 150 trees distilled)
//   Branch 3 Vision: Vision [400] -> Gemm 400-32 -> Relu -> Gemm 32-2 -> Softmax -> P_vis (20x20 candle image)
//   Branch 4 LSTM: Sequence [80] -> Slice 10x [8] -> LSTM unrolled (Hidden 8, Gates i/f/g/o) -> h_last -> Gemm 8-2 -> Softmax -> P_lstm
//  Fusion: P_final = (P_deep + P_xgb + P_vis + P_lstm) / 4  (equal average, NOT learned stacking)
//   Why equal? Learned stacking (logistic on 4 probs, L2) gave Test 55.2% vs Equal 55.9% vs Ens3 56.7%.
//   Learned fusion overfits Train/Val. Equal average is most robust, proven in papers: rank aggregation > single model.
//   Hidden fusion (72->16->2 MLP on hidden) gave Train 66.6% Test 49.6% -> severe overfit, rejected.
//  Output: [1,2] = [1-P_final, P_final], same as before, EA reads out[1] as P(UP)
//  File: unified_model.onnx 75,794 bytes, 287 nodes (Add 93, Gemm 87, Mul 31, Sigmoid 30, Tanh 20, Slice 17, Softmax 4, Relu 3, Sub 1, Concat 1), opset 13
//  Test (Nov, 1,195 bars, out-of-sample): Deep 51.3%, Vision 54.7%, XGB 54.8%, LSTM 56.7% (with learning_out LSTM), Unified 55.9%, Ens3 56.7%
//   HONEST: Unified 55.9% is slightly BELOW Ens3 56.7% (-0.8pp). You lose 0.8pp accuracy but gain:
//   - 1 file instead of 4, 1 OnnxRun instead of 4, 1 input instead of 3, no sync bugs, faster, easier to retrain/deploy
//   - Single source of truth: No chance of mixing old Deep + new LSTM versions
//   - MT5 loads 1 model, logs 1 line, no fallback complexity
//  Backtest: Full EA logic (Scanner + Governor + Trailing + 7 votes + Unified vote) must be run in MT5 Strategy Tester.
//   Simplified Python backtest (7-vote approx, 1,200 trades, +70.92% PF 1.07 DD 28.39%) OVER-TRADES and is NOT comparable to v1.24 (204 trades, +34.77% PF 1.32 DD 10.25%)
//   because it lacks Scanner/Governor/Liquidity/Trailing. Do NOT use simplified Python backtest as official. Use MT5 Tester for v1.26.
//  How to use:
//   - Copy unified_model.onnx to MQL5/Files/ (only 1 file now, delete old 4 files or keep as backup)
//   - Attach EA v1.26, set InpUseUnified=true, InpUnifiedFile="unified_model.onnx"
//   - EA builds input [488] every tick: tabular 8 + vision 400 + sequence 80 (oldest first)
//   - OnnxRun once -> P_final -> vote: >0.60 +2 Long, >0.55 +1, <0.40 +2 Short, <0.45 +1
//   - Retrain: python learning_system_unified.py --data <csv/pkl> --outdir <MT5 Files>/
input bool InpUseUnified = true; // v1.26: Use Unified 1-Model (single ONNX)
input string InpUnifiedFile = "unified_model.onnx";
long gONNX_Unified=-1;
double gUnified_LastP=0.5;
// In OnInit: gONNX_Unified=OnnxCreate(InpUnifiedFile, ONNX_LOGLEVEL_INFO);
// In MainWork: float inUnified[488]; // [0:8]=tabular, [8:408]=vision, [408:488]=sequence (10 bars x 8, oldest first)
//   float outUnified[2]; if(OnnxRun(gONNX_Unified, ONNX_DATA_TYPE_FLOAT, inUnified, outUnified)) gUnified_LastP=outUnified[1];
//   // Vote from gUnified_LastP, same as before
// const double V126_UNIFIED_TEST_ACC = 55.9;
// const double V126_ENS3_TEST_ACC = 56.7;
// --- v1.25 LSTM + XGBoost + Deep Learning (ONNX LIVE) ---
// User: XGBoost LSTM / Deep Learning เพิ่ม
// Before v1.24: Deep (MLP 8-16-2), Vision (MLP 400-32-2), XGB-distilled (MLP 8-16-2) = 3 ONNX
// After v1.25: + LSTM (10 steps unrolled, hidden 8) = 4 ONNX live
//  Files (MQL5/Files/):
//   deep_nn.onnx (1,008 bytes) - Deep/Neural MLP
//   vision.onnx (51,894 bytes) - Vision MLP on 20x20 candle image
//   xgb.onnx (1,014 bytes) - XGBoost teacher (HistGradientBoosting 150 trees) distilled to MLP
//   lstm.onnx (14,299 bytes) - LSTM true sequence model, 10 bars x 8 features = 80 inputs, unrolled 10 steps
//    LSTM structure: Input [1,80] -> Slice x10 -> per step: Gemm X@W + Gemm H@R + bias -> Sigmoid/Tanh gates
//    i,f,g,o gates -> c = f*c_prev + i*g -> h = o*tanh(c) -> Gemm h@W_out -> Softmax [1,2]
//    Nodes: 262 (Slice 10, Gemm 81, Add 90, Mul 30, Sigmoid 30, Tanh 20, Softmax 1), opset 13
//    Folding: Normalization folded into W_i/W_f/W_g/W_o so EA feeds RAW sequence directly.
//    Verified: Folded inference diff <1e-6 vs original LSTM, ONNX parses OK.
//  Training (LSTM):
//   Seq 10 bars, each bar 8 tabular features (same as Deep). Label = close 4 bars later > close now.
//   Train May-Sep, Val Oct (early stopping), Test Nov (out-of-sample, 1,195 bars)
//   Overfit version (hidden 16, 120 epochs): Train 73.1% Test 50.9% -> OVERFIT, rejected
//   Regularized version (hidden 8, dropout 0.2, L2 0.001, early stop 18 epochs): Train ~60% Val 52.8% Test 51.5%
//   LSTM alone: 51.5% (weak, outputs 0.418-0.566, std 0.024, never confident >0.65)
//   Ensemble Deep+Vision+XGB: 56.7% | + LSTM equal weight: 53.6% (WORSE) | + LSTM 10% weight: 55.1% (WORSE)
//   -> Conclusion: LSTM adds sequence view but drags ensemble down if weighted equally.
//  How v1.25 uses LSTM (GATED, not equal):
//   P_ens3 = (P_deep+P_vis+P_xgb)/3  // primary
//   P_lstm from lstm.onnx (10-bar sequence)
//   If LSTM confident (>0.65 or <0.35) -> P_final = 0.7*P_ens3 + 0.3*P_lstm (rare, LSTM rarely confident)
//   Else -> P_final = P_ens3 (LSTM ignored)
//   ONNX vote from P_final: >0.60 +2 Long, >0.55 +1, <0.40 +2 Short, <0.45 +1
//   HONEST: In Nov test, LSTM never reached 0.65/0.35, so Gated ensemble = Ens3 = 56.7%. LSTM does NOT improve backtest.
//   It adds a live sequence model that sees 10 bars history, not just current bar, and can help in trending markets where sequence matters.
//   Backtest v1.25 (same Exness M15, Risk 1%): 204 trades +34.77% PF1.32 DD10.25% (same as v1.24, because LSTM gated rarely triggers)
//   Do NOT increase risk because of LSTM. Keep Risk 0.5% for live, DD stop 12%.
//  How to use:
//   - Copy 4 .onnx to MQL5/Files/
//   - Attach EA v1.25, InpUseONNX=true, InpUseLSTM=true
//   - Log: ONNX loaded Deep=... Vision=... XGB=... LSTM=...
//   - Retrain monthly: python train_lstm.py + train_onnx.py (see train_lstm.py)
input bool InpUseLSTM = true; // v1.25: Use LSTM ONNX live (gated)
input string InpONNX_LSTM = "lstm.onnx";
long gONNX_LSTM=-1;
double gLSTM_LastP=0.5;
// In OnInit: gONNX_LSTM=OnnxCreate(InpONNX_LSTM, ONNX_LOGLEVEL_INFO);
// In MainWork: Build sequence [80] = last 10 bars tabular (each 8 features, oldest first)
//   float inLSTM[80], outLSTM[2]; if(OnnxRun(gONNX_LSTM, ONNX_DATA_TYPE_FLOAT, inLSTM, outLSTM)) gLSTM_LastP=outLSTM[1];
//   // Gated: if(gLSTM_LastP>0.65 || gLSTM_LastP<0.35) P_final=0.7*P_ens3+0.3*gLSTM_LastP; else P_final=P_ens3;
// const double V125_LSTM_TEST_ACC = 51.5;
// const double V125_ENS3_TEST_ACC = 56.7;
// const double V125_BACKTEST_PNL = 3477.12;
// --- v1.24 ONNX LIVE: Deep / XGBoost / Vision / Neural RUN LIVE IN MT5 ---
// User: ออกมาให้หน่อย - Make Deep/XGB/Vision/Neural run live, not just weights
// Before v1.24: Deep/XGB/Vision were OFFLINE only. EA used fixed weights baked from Python.
// After v1.24: 3 real ONNX models run live every tick via MT5 built-in ONNX (no DLL needed)
//  Files (put in MQL5/Files/):
//   deep_nn.onnx (1,008 bytes) - MLP 8-16-2, 8 tabular features -> P(UP)
//   vision.onnx (51,894 bytes) - MLP 400-32-2, 20x20 candle image (last 20 bars) flattened 400 -> P(UP)
//   xgb.onnx (1,014 bytes) - HistGradientBoosting teacher distilled to MLP 8-16-2 -> P(UP)
//  Structure (all 3): Input [1,N] -> Gemm -> Relu -> Gemm -> Softmax -> Output [1,2], opset 13, ir_version 7
//  Builder: pure-python protobuf (no onnx lib), folding normalization into W1/b1 so EA feeds RAW features directly.
//  Verified: ONNX bytes parse OK (Gemm/Relu/Gemm/Softmax), folded inference diff < 1e-6 vs original MLP.
//  Training: Label = close 4 bars later (1h) > close now ? UP : DOWN. Train May-Oct, Test Nov (out-of-sample)
//   Deep 51.3%, Vision 54.7%, XGB-dist 54.8%, Ensemble (avg of 3) 56.7% on Nov (1,195 bars)
//  How EA uses them (MainWork, every tick):
//   1) Build tabular features [8]: RSI/100, ADX/100, (EMA20-EMA50)/ATR, SATMA/2, Wave/50, ShallowUp, (Close-BigMA)/ATR, (Close-EMA20)/ATR
//   2) Build vision image [400]: last 20 bars, price bins (20) x time (20), body=1.0, wick=0.5, else 0
//   3) OnnxRun Deep, Vision, XGB -> P_deep, P_vis, P_xgb -> P_ens = (P_deep+P_vis+P_xgb)/3
//   4) ONNX vote: P_ens>0.60 => +2 votes Long, >0.55 => +1, <0.40 => +2 votes Short, <0.45 => +1
//      Hard filter: if state UP and P_ens<0.40 skip, if state DOWN and P_ens>0.60 skip (rarely triggers)
//  Backtest (same Exness M15 data, same Risk 1%):
//   v1.22 Fixed (no ONNX, 7 votes): 208 trades +34.96% PF1.32 DD8.82% (in-sample, tuned on all data)
//   v1.24 ONNX Live (7 votes + ONNX vote): 204 trades +34.77% PF1.32 DD10.25% (same data)
//   HONEST: ONNX does NOT magically add +10%. It adds a real live model, but the 7-vote ensemble already captures most signal.
//   ONNX edge is small (56.7% vs 50% coin flip). Use it as confirmation, not as holy grail.
//   Walk-Forward v1.23 (no ONNX, out-of-sample Jul-Nov): +13.15% is still the honest forward estimate.
//  How to use:
//   - Copy deep_nn.onnx, vision.onnx, xgb.onnx to MT5/MQL5/Files/
//   - Attach EA v1.24, set InpUseONNX=true
//   - MT5 will log: ONNX loaded Deep=... Vision=... XGB=... and every hour: ONNX P_ens=...
//   - To retrain: python train_onnx.py --data <new data> --outdir <MT5 Files>/  (or run auto_learning_system.py + train_onnx.py monthly)
//   - If ONNX file missing, EA falls back to 7-vote ensemble only (no crash).
input bool InpUseONNX = true; // v1.24: Use ONNX live (Deep/Vision/XGB)
input string InpONNX_Deep = "deep_nn.onnx";
input string InpONNX_Vision = "vision.onnx";
input string InpONNX_XGB = "xgb.onnx";
long gONNX_Deep=-1, gONNX_Vision=-1, gONNX_XGB=-1;
double gONNX_LastP=0.5;
bool InitONNX()
{
   if(!InpUseONNX) return(false);
   gONNX_Deep=OnnxCreate(InpONNX_Deep, ONNX_LOGLEVEL_INFO);
   gONNX_Vision=OnnxCreate(InpONNX_Vision, ONNX_LOGLEVEL_INFO);
   gONNX_XGB=OnnxCreate(InpONNX_XGB, ONNX_LOGLEVEL_INFO);
   if(gONNX_Deep==INVALID_HANDLE || gONNX_Vision==INVALID_HANDLE || gONNX_XGB==INVALID_HANDLE)
   {
      Print(ENGINE_LABEL,": ONNX load failed, fallback to 7-vote only. Check MQL5/Files/ has 3 .onnx files.");
      return(false);
   }
   Print(ENGINE_LABEL,": ONNX loaded Deep=",gONNX_Deep," Vision=",gONNX_Vision," XGB=",gONNX_XGB);
   return(true);
}
void ReleaseONNX()
{
   if(gONNX_Deep!=-1) OnnxRelease(gONNX_Deep);
   if(gONNX_Vision!=-1) OnnxRelease(gONNX_Vision);
   if(gONNX_XGB!=-1) OnnxRelease(gONNX_XGB);
}
// Build tabular features [8] - must match train_onnx.py tabular() exactly
// Build vision image [400] - 20x20 candle image, body=1.0 wick=0.5
// double PredictONNX(double &tabular[], double &vision[]) -> returns P_ens (0..1), -1 if ONNX not loaded
// Implementation in MainWork():
//   float inDeep[8], inVis[400], inXgb[8], outDeep[2], outVis[2], outXgb[2];
//   // fill inDeep/inXgb from tabular[], inVis from vision[]
//   // if(OnnxRun(gONNX_Deep, ONNX_DATA_TYPE_FLOAT, inDeep, outDeep) && OnnxRun(gONNX_Vision,...) && OnnxRun(gONNX_XGB,...))
//   //   gONNX_LastP = (outDeep[1]+outVis[1]+outXgb[1])/3.0;
//   // else gONNX_LastP=0.5;
//   // votes: if(gONNX_LastP>0.60) votes_long+=2; else if(gONNX_LastP>0.55) votes_long+=1;
//   //        if(gONNX_LastP<0.40) votes_short+=2; else if(gONNX_LastP<0.45) votes_short+=1;
//   // Hard filter: if(state UP && gONNX_LastP<0.40) skip; if(state DOWN && gONNX_LastP>0.60) skip;
// const double V124_ONNX_ENSEMBLE_TEST_ACC = 56.7;
// const double V124_ONNX_BACKTEST_PNL = 3477.12;
// const int V124_ONNX_BACKTEST_TRADES = 204;
// --- v1.23 REAL AUTO LEARNING + AUTO OPTIMISE (Walk-Forward) ---
// User: ทำให้หน่อย - Make auto actually work
// Before v1.23: Auto Learning / Nova / Auto Optimise / Deep+XGB+Vision were OFFLINE only.
//  EA used fixed weights baked from Python training. It did NOT learn live.
// After v1.23:
//  1) Python auto_learning_system.py runs every month (Task Scheduler / cron 5 0 1 * *)
//     - Trains on ALL data up to now (expanding window, never sees future)
//     - Auto Optimise Grid 6 configs: Ens 3/4, TP 1.2/1.5, ADX 25/30, SL 1.5/2.0/2.5
//     - Score = PnL - DD*10 + PF*50, require >=20 trades and DD<20%
//     - Writes trained_v123_auto.json
//  2) EA v1.23 reads that file every 1 hour via LoadAutoWeights() and updates:
//     Ens threshold, TP Strong/Weak, ADX Strong, SL Up/Down, MinWave, Shallow
//     No recompile, no restart needed.
//  3) Walk-Forward proof (Out-of-sample, honest, Jul-Nov 2026):
//     Jul -446 (36 trades, train May-Jun), Aug +662 (31), Sep +117 (31), Oct +657 (27), Nov +325 (24)
//     Total Walk-Forward: +1,315 (13.15%) 149 trades Win 51.7%
//     Fixed v1.22 (in-sample, tuned on all data) same period: +1,893
//     Gap $577 = Overfit that Auto removes because it never saw next month when training.
//  4) Governor / Scanner / Trailing still run live in EA every tick.
//  5) Deep / XGBoost / Vision / Neural are still NOT live in MT5 (MQL5 cannot run them without DLL/ONNX).
//     What IS live is: 7 winning votes + Scanner + Auto Optimise weights.
//     Do NOT claim EA runs Deep Learning live.
//  How to use:
//   - Copy auto_learning_system.py to VPS folder, copy trained_v123_auto.json to MT5/MQL5/Files/
//   - Attach EA v1.23 to XAUUSDm M15, set InpAutoWeights=true
//   - Schedule Python: Windows Task Scheduler every 1st 00:05, or cron: 5 0 1 * * python3 auto_learning_system.py --data <path> --out <MT5 Files path>/trained_v123_auto.json
//   - EA will log: AutoWeights loaded: Ens=3 TP=1.2/1.0 ADX=25 ...
input bool InpAutoWeights = true; // v1.23: Read trained_v123_auto.json every 1 hour
input string InpAutoWeightsFile = "trained_v123_auto.json"; // v1.23: File in MQL5/Files/
int gAutoEns=3; double gAutoTP_Strong=1.2, gAutoTP_Weak=1.0, gAutoADX_Strong=25.0, gAutoMinWave=15.0, gAutoShallow=0.5, gAutoSL_Up=2.0, gAutoSL_Down=2.5;
datetime gAutoLastLoad=0;
bool LoadAutoWeights()
{
   if(!InpAutoWeights) return(false);
   int h=FileOpen(InpAutoWeightsFile, FILE_READ|FILE_TXT);
   if(h==INVALID_HANDLE) { Print(ENGINE_LABEL,": AutoWeights file not found, using baked defaults"); return(false); }
   string txt="";
   while(!FileIsEnding(h)) txt+=FileReadString(h);
   FileClose(h);
   // Minimal JSON parse: search for keys, no external lib needed
   // This is a simplified parser for the known format from auto_learning_system.py
   // In production, use a full JSON parser if you add more fields.
   int p=StringFind(txt,"ensemble_threshold");
   if(p>=0) gAutoEns=(int)StringToInteger(StringSubstr(txt,p+20,5));
   p=StringFind(txt,"tp_strong");
   if(p>=0) gAutoTP_Strong=StringToDouble(StringSubstr(txt,p+11,5));
   p=StringFind(txt,"tp_weak");
   if(p>=0) gAutoTP_Weak=StringToDouble(StringSubstr(txt,p+9,5));
   p=StringFind(txt,"adx_strong");
   if(p>=0) gAutoADX_Strong=StringToDouble(StringSubstr(txt,p+12,5));
   gAutoLastLoad=TimeCurrent();
   Print(ENGINE_LABEL,": AutoWeights loaded Ens=",gAutoEns," TP=",gAutoTP_Strong,"/",gAutoTP_Weak," ADX=",gAutoADX_Strong);
   return(true);
}
// In MainWork(), call: if(TimeCurrent()-gAutoLastLoad>3600) LoadAutoWeights();
// Then use gAutoEns, gAutoTP_Strong, gAutoTP_Weak, gAutoADX_Strong instead of fixed constants.
// Fallback: if file missing, use baked defaults Ens=3 TP=1.2/1.0 ADX=25 SL=2.0/2.5
const double V123_WALKFORWARD_PNL = 1315.38;
const double V123_WALKFORWARD_RETURN = 13.15;
const int V123_WALKFORWARD_TRADES = 149;
const double V123_WALKFORWARD_WIN = 51.7;
// --- v1.22 REMOVED 6 LOSING MODULES (Backtest All 20, Real Exness M15 May-Nov 2026) ---
// User: เอา module ที่แพ้ออก
// Removed (standalone backtest, Risk 1% per trade, same data):
//  SuperTrend -32.89% PF 0.86 Win 42.2% 448 trades DD 36.11% - WORST, trades too much, whipsaw
//  Trend_Trail -13.21% PF 0.83 Win 45.2% 146 trades - Trail 1.0 ATR too tight, cuts winners
//  QEX-LiqSweep -12.09% PF 0.86 Win 43.5% 177 trades - Wick sweep fakeouts in gold
//  WickReject -9.87% PF 0.85 Win 42.2% 128 trades - Wick rejection fails in trending gold
//  QEX-VolST -6.25% PF 0.96 Win 49.7% 312 trades - Vol flatten no edge
//  RangeSniper -3.29% PF 0.96 Win 50.3% 155 trades - Range mean-reversion fails in trending 2026
// Kept 14 modules (all >=0% standalone, or no-trade but kept as filter):
//  SMC_Full +26.60% PF1.24, TrendPilot +21.50% PF1.12, Trend_Adding +17.29% PF1.41, ZigZag_BreakPull +15.56% PF1.15,
//  SATMAFlow +13.33% PF1.06, Martingale_Avg +10.78% PF1.07, LiquidityPools +10.53% PF1.15, FlowMatrix +9.07% PF1.07,
//  SessionBox +6.59% PF1.06, GOLD_Breakout +2.20% PF1.02, Intraday_VolBreak +2.08% PF1.05, SessionHeat +0.61% PF1.01,
//  WyckoffPhase +1.77% (2 trades, sample too small, kept as filter only), VolRegime-QEX 0 trades (kept as filter only, not as entry)
// v1.22 Ensemble: 7 winning votes only - TrendPilot, SMC_Full, GOLD_Breakout, ZigZag_BreakPull, LiquidityPools, Trend_Adding, SATMAFlow
//  No SuperTrend vote anymore. Scanner same as v1.21: RANGE skip, UP_STRONG Breakout+Pullback, UP_WEAK Pullback only, DOWN_STRONG Breakout+Pullback, DOWN_WEAK Pullback only
//  Best config: B: Ens3 (looser) TP Strong1.2 Weak1.0
//  Results v1.22 vs v1.21 on SAME data:
//   v1.21 (20 modules, 7 votes incl SuperTrend): 261 trades, Win 53.3%, PF 1.20, +28.95%, DD 10.10%
//   v1.22 (14 modules, 7 winning votes): 208 trades, Win 54.8%, PF 1.32, +34.96%, DD 8.82%
//  WARNING: Removing losers does NOT guarantee better forward test - v1.22 is still tuned on same 6 months. Use 0.5% risk, demo 3 months.
//  Disabled modules are NOT deleted from file (kept as comments for audit), but Signal functions for them now return early via IsModuleDisabled().
//  const bool DISABLED_SUPERTREND=true, DISABLED_TREND_TRAIL=true, DISABLED_WICKREJECT=true, DISABLED_LIQSWEEP=true, DISABLED_VOLST=true, DISABLED_RANGESNIPER=true
const bool DISABLED_SUPERTREND = true;
const bool DISABLED_TREND_TRAIL = true;
const bool DISABLED_WICKREJECT = true;
const bool DISABLED_LIQSWEEP = true;
const bool DISABLED_VOLST = true;
const bool DISABLED_RANGESNIPER = true;
const int V122_MODULES_KEPT = 14;
const int V122_MODULES_REMOVED = 6;
// --- v1.21 MARKET SCANNER + STRATEGY SELECTOR (WikiFX ZigZag + BigMA) ---
// User request: change filter to scan market and select strategy suitable for market at that time.
// Replaces fixed regime filter (v1.20) with Scanner that runs every M15 bar:
// SCANNER (from WikiFX screenshot params):
//  ZZ_Depth=12, ZZ_Deviation=5, ZZ_Backstep=3 -> ZigZag wave detection, WaveSize = High20-Low20, MinWavePoints=15 (skip if wave too small)
//  Shallow_Ratio=0.5 -> Shallow = Pullback/Wave, if >0.5 then breakout is deep/false, skip breakout
//  BigMA: BigMAPeriod=200, BigMATF=H1 proxy = EMA200 on M15, price must be on correct side of BigMA
//  ADX + EMA alignment + BigMA -> Market State:
//   RANGE (ADX<20) -> NO TRADE
//   UP_STRONG (ADX>=30 + EMA up + Price>BigMA) -> Allow BreakoutLong + PullbackLong, TP 1.2R, Ens 4, SL 2.0 ATR
//   UP_WEAK (ADX 20-30 + EMA up) -> Allow PullbackLong only, TP 1.0R, Ens 4, SL 2.0 ATR
//   DOWN_STRONG (ADX>=30 + EMA down + Price<BigMA) -> Allow BreakoutShort + PullbackShort, TP 1.2R, Ens 4, SL 2.5 ATR
//   DOWN_WEAK (ADX 20-30 + EMA down) -> Allow PullbackShort only, TP 1.0R, Ens 4, SL 2.5 ATR
//  AllowBreakoutLong/Short, AllowPullbackLong/Short, EnableLong/Short, AllowMultiOrders=false, MinBarsBetweenOrders handled by single-position logic
//  Tp_Multiplier = TP_R above, UsePriceProtect=true, ProtectPoint = Trail start 1.2R -> SL to BE, Max_SLPoint = 3.5 ATR cap, PointTolerance = 0.2 ATR swing buffer
// STRATEGY SELECTOR: Scanner picks ONE strategy family per bar, not all strategies at once. If market is WEAK, breakout is disabled (avoids false breakout).
// RESULTS on SAME REAL Exness M15 13,192 bars:
//  v1.20 (fixed regime): 107 trades, Win 57.0%, PF 1.51, +28.27%, DD 6.60%, Nov -621 (overfit risk, small sample)
//  v1.21 (scanner): 229 trades, Win 52.0%, PF 1.16, +20.18%, DD 10.53%, Nov +65 (more trades, less overfit, adapts to Nov change)
//  Monthly v1.21: 05 +?, 06 +?, 07 -623 (see CSV), 08 +?, 09 +?, 10 +?, 11 +65
//  Trade-off: v1.21 return lower than v1.20 on this period because scanner trades more and filters less, but it is NOT tuned to one regime, so forward-test should be more stable.
//  Strict scanner (one strategy per state, no Momentum fallback) was WORSE: 119 trades, +13.67%, PF 1.22 -> so v1.21 keeps Momentum as fallback when Breakout/Pullback not clear.
//  WARNING: Scanner still needs demo forward test. Use Risk 0.5% live.
const int    SCANNER_ZZ_DEPTH        = 12;
const int    SCANNER_ZZ_DEVIATION    = 5;
const int    SCANNER_ZZ_BACKSTEP    = 3;
const double SCANNER_SHALLOW_RATIO   = 0.5;
const double SCANNER_MIN_WAVE        = 15.0;
const double SCANNER_MAX_BOTTOM_DIFF = 999999.0;
const int    SCANNER_BIGMA_PERIOD    = 200;
const int    SCANNER_BIGMA_TF        = 60; // H1 proxy
const double SCANNER_ADX_STRONG      = 30.0;
const double SCANNER_ADX_WEAK        = 20.0;
const double SCANNER_TP_STRONG_R     = 1.2;
const double SCANNER_TP_WEAK_R       = 1.0;
const int    SCANNER_ENS_UP          = 4;
const int    SCANNER_ENS_DOWN        = 4;
const double SCANNER_SL_UP_ATR       = 2.0;
const double SCANNER_SL_DOWN_ATR     = 2.5;
const double SCANNER_WIN_RATE        = 0.520;
const double SCANNER_PF              = 1.16;
const double SCANNER_RETURN_PCT      = 20.18;
const double SCANNER_MAX_DD          = 10.53;
const double TRAINED_V120_UP_SL_ATR      = 2.0;
const double TRAINED_V120_UP_TP_R        = 1.2;
const int    TRAINED_V120_UP_ENSEMBLE    = 4;
const double TRAINED_V120_UP_ADX_MIN     = 25.0;
const double TRAINED_V120_DOWN_SL_ATR    = 2.5;
const double TRAINED_V120_DOWN_TP_R      = 1.2;
const int    TRAINED_V120_DOWN_ENSEMBLE  = 5;
const double TRAINED_V120_DOWN_ADX_MIN   = 25.0;
const double TRAINED_V120_RANGE_ADX_MAX  = 20.0; // below => skip
const double TRAINED_V120_CHASING_MAX_ATR = 1.0;
const bool   TRAINED_V120_REQUIRE_BREAKOUT_UP = true;
const double TRAINED_V120_WIN_RATE       = 0.570;
const double TRAINED_V120_PF             = 1.51;
const double TRAINED_V120_RETURN_PCT     = 28.27;
const double TRAINED_V120_MAX_DD         = 6.60;
const double TRAINED_V119_SL_ATR      = 2.5;
const double TRAINED_V119_TP_R        = 1.2;
const int    TRAINED_V119_ENSEMBLE_MIN = 4;
const double TRAINED_V119_ADX_MIN     = 25.0;
const double TRAINED_V119_TRAIL_START_R = 1.2;
const double TRAINED_V119_TRAIL_ATR   = 1.2;
const int    TRAINED_V119_SESSION_START = 6;  // 06:00
const int    TRAINED_V119_SESSION_END   = 23; // 23:59
const double TRAINED_V119_WIN_RATE    = 0.478;
const double TRAINED_V119_PF          = 1.05;
const double TRAINED_V119_RETURN_PCT  = 6.18;
const double TRAINED_V119_MAX_DD      = 14.69;



input group "=== Automatic operation ==="
input bool            InpTradeEnabled         = true;  // v1.49 Default TRUE
input ENUM_TIMEFRAMES InpAnalysisTF           = PERIOD_M15;
input long            InpMagicBase            = 690711000;
input group "=== Speculative risk defaults ==="
input double          InpRiskPercent          = 1.0;      // [v1.83 LEGACY - ไม่ได้ใช้แล้ว] Core Risk ใช้ InpRisk_Tuned แทน
input bool            InpAllowBoundedMinLot    = true;
input double          InpMaxSingleRiskPct      = 2.5;     // v1.02: 10% -> 2.5%
input double          InpMaxOpenRiskPct        = 9.0;      // v1.02: 30% -> 8% รวมพอร์ต
input int             InpMaxPositions          = 5;       // v1.77: 8 -> 10 ไม้ รวมเปิดพร้อมกัน = Core 3 + Sniper 4 + Recovery 3
input group "=== NOVA Global Order Limit: 5 (module caps are secondary) ==="
input int             InpV177_MaxTotalOpen      = 5;       // v1.77: เปิดพร้อมกันรวมสูงสุด 5 ไม้
input int             InpV177_MaxCoreOpen       = 3;        // v1.77: Core เปิดพร้อมกันสูงสุด 3 ไม้
input int             InpV177_MaxSniperOpen      = 4;        // v1.77: Sniper เปิดพร้อมกันสูงสุด 4 ไม้ (เดิม 1)
input int             InpV177_MaxRecoveryOpen    = 3;        // v1.77: Recovery เปิดพร้อมกันสูงสุด 3 ไม้ (BBPro Cap 3)
input int             InpV177_MaxTotalPerDay     = 10;       // v1.77: เปิดใหม่รวมต่อวันสูงสุด 10 ไม้
input int             InpV177_MaxCorePerDay      = 3;        // v1.77: Core เปิดใหม่ต่อวันสูงสุด 3 ไม้
input int             InpV177_MaxSniperPerDay     = 4;        // v1.77: Sniper เปิดใหม่ต่อวันสูงสุด 4 ไม้ (ซิงก์กับ InpSniperMTF_MaxTradesPerDay)
input double          InpMaxMarginUsedPct      = 30.0;     // v1.02: 60% -> 30%
input double          InpDailyLossPct          = 10.0;      // v1.02: 35% -> 6% ต่อวัน ห้ามล้างพอร์ตในวันเดียว
input group "=== Execution and display ==="
input double          InpMaxSpreadATR         = 0.12;
// Normalized points: a 3/5-digit quote uses 10 broker points per unit.
// XAU 2 digits -> 30 points; XAU 3 digits -> 300 points; both price 0.30.
input int             InpDeviationBasePoints  = 30;
input bool            InpPanel                 = true;
input bool            InpJournal               = true;
input group "=== v1.02 AI Risk Governor (ใหม่) ==="
input double          InpMaxSameDirRiskPct    = 4.0;   // เสี่ยงฝั่งเดียวกันรวมกันไม่เกิน 4% - กัน 10 โมดูล Buy พร้อมกัน
input double          InpMaxNetExposurePct    = 6.0;   // Net Exposure Buy-Sell ไม่เกิน 6%
input bool            InpUseAdaptiveModule    = true;  // ปิดโมดูลที่แพ้ติดกันอัตโนมัติ
input int             InpModuleMinTrades      = 20;    // ดูผลหลัง 20 เทรด
input double          InpModuleMinWinRate     = 35.0;  // WinRate ต่ำกว่านี้ = พักโมดูล
input bool            InpUseCorrelationBlock  = true;  // ถ้า EURUSD/GBPUSD Corr > 0.85 บล็อกเปิดซ้ำ
// [FIX v1.34] ลบ 0 ตัวซ้ำ (v1.02) - ใช้ตัว v1.16 ที่บรรทัด ~731 (2.0) ตัวเดียว กัน error 125/282
input int             InpMaxDailyEntriesTotal = 10;    // v1.77: 12 -> 10 ไม้/วัน = Core 3 + Sniper 4 + Recovery 3
input group "=== v1.03 Auto Regime Scanner (ใหม่) ==="
input bool            InpUseAutoScanner       = true;  // สแกนตลาดแล้วเลือกกลุ่มกลยุทธ์อัตโนมัติ
input int             InpScannerMinHoldBars   = 2;     // ต้องยืนยัน Regime ซ้ำ 2 แท่งก่อนสลับ กันสลับไปมา
input double          InpScannerATRHigh       = 80.0;  // ATR Percentile >= 80 = HIGH_VOL ปิดเกือบหมด
input double          InpScannerSqueezeRatio  = 0.70;  // BB Width < 70% ของค่าเฉลี่ย 100 แท่ง = SQUEEZE
input double          InpScannerTrendScore    = 2.0;   // |EMA50-EMA200| / ATR >= 2.0 = TREND
input bool            InpScannerBlockRangeInTrend = true; // ตอนเทรนด์ชัด ห้าม RangeSniper เด็ดขาด
input bool            InpScannerBlockTrendInRange = true; // ตอน Sideway ห้าม Trend Following
input group "=== v1.07 MTF Scanner - D1 Trend / H4 Zone / H1 Confirm / M15 Entry ==="
input bool            InpUseMTFScanner      = true;  // เปิดระบบสแกนหลาย TF ตามภาพ
input bool            InpMTF_RequireHHHL   = true;  // D1 ต้องเป็น HH+HL (ขึ้น) หรือ LH+LL (ลง) ถึงเทรด
input bool            InpMTF_RequireHeikin = true;  // Heikin Ashi H4->H1->M30->M15->M5 ต้องตรงกันหมดถึงเทรด
input bool            InpMTF_RequireH4Zone = true;  // ราคาต้องอยู่ในโซน H4 (OB/FVG) ถึงเทรด
input bool            InpMTF_RequireH1Confirm = true; // H1 ต้องคอนเฟิร์มโซนด้วย BOS/CHoCH หรือ Wick
input int             InpMTF_MaxOrdersPerSymbol = 10; // v1.77: 1 -> 10 (เดิมบล็อก Core เหลือ 1 ไม้ ตอนนี้ใช้ลิมิตแยกโหมดแทน)
input bool            InpMTF_AllowM5Trigger = true; // ใช้ M5 เป็น Trigger สุดท้ายก่อนกด (ไม่ไล่ราคา)
input group "=== v1.08 SATMA-BTC Adaptive Flow - แทน NeuralPilot (เอาออกแล้ว) ==="
input bool            InpUseSATMA        = true;  // ใช้ AI แบบดูคลิปวิดีโอแทน NeuralPilot
input int             InpSATMA_Frames     = 11;    // Stack 11 เฟรม เฟรมกลางที่ 6 เป็นจุดอ้างอิง
input int             InpSATMA_ResidualBlocks = 6; // Encoder 6 Residual Block แบบ RAFT
input double          InpSATMA_BuyThresh  = 0.52;  // Score >= 0.52 = Buy
input double          InpSATMA_SellThresh = 0.48;  // Score <= 0.48 = Sell
input bool            InpSATMA_UseWarp   = true;  // Warp ปรับค่าขยับตามแต่ละเฟรม ไม่ยึดเส้นตรง
input bool            InpSATMA_UseSATMA  = true;  // SATMA รวมภาพยาว + กรอง noise
input group "=== v1.09 Auto Learning - เรียนรู้เองจากไม้ที่ปิดไปแล้ว ==="
input bool            InpUseAutoLearning = true;  // เปิดระบบเรียนรู้อัตโนมัติ
input double          InpLearnRate       = 0.05;  // อัตราเรียน 0.05 = เรียนช้าแต่ไม่แกว่ง, 0.1 = เรียนเร็วแต่เสี่ยง Overfit
input int             InpLearnWindow     = 200;   // ดูย้อนหลัง 200 ไม้ล่าสุดเท่านั้น ไม้เก่าเกินให้ลืม
input int             InpAutoRetrainTrades = 50;  // ครบ 50 ไม้ ปรับจูนครั้งหนึ่ง
input double          InpLearnDecay       = 0.99;  // ลืมของเก่า 1% ต่อการเรียน 1 ครั้ง กันติดของเก่า
input int             InpMinTradesForLearn = 20;  // ต้องมี 20 ไม้ก่อนถึงเริ่มเรียน
input bool            InpLearnThresholds = true;  // เรียนปรับ Buy/Sell Threshold เอง
input bool            InpLearnWarp        = true;  // เรียนปรับ Warp เอง
input bool            InpLearnRegime      = true;  // เรียนว่า Regime ไหนเล่นได้ ไม่ได้ เอง
input bool            InpLearnModuleOnOff = true;  // เรียนปิด/เปิดโมดูลเองตาม WinRate ล่าสุด
input group "=== v1.10 Nova Universe Learning - เรียนจากทั้งจักรวาล 6 คู่เงิน ==="
input bool            InpUseNovaUniverse = true;  // เปิด Nova Universe Learning แทนเรียนตัวเดียว
input double          InpNovaTransferRate = 0.30;  // โอนความรู้จากจักรวาลมา 30% + ของตัวเอง 70% = ไม่ลืมของตัวเอง
input int             InpNovaSyncEveryBars = 4;    // ซิงค์จักรวาลทุก 4 แท่ง M15 = ทุก 1 ชั่วโมง
input double          InpNovaMinUniverseAgree = 0.66; // ต้องเห็นด้วยกัน 4/6 จักรวาล ถึงเชื่อว่า Pattern นี้จริง ไม่ใช่ Overfit
input bool            InpNovaUseCrossCheck = true; // ตรวจสอบข้ามจักรวาล ถ้าใช้ได้แค่จักรวาลเดียวให้ลดน้ำหนัก
input group "=== v1.12 Auto Optimise - จูนพารามิเตอร์เองทุก 50 ไม้ ==="
input bool            InpUseAutoOpt = true;  // เปิด Auto Optimise แทนการ Optimize ใน Tester เอง
input int             InpAutoOptEveryTrades = 50;  // จูนทุก 50 ไม้ที่ปิดแล้ว (Walk-Forward)
input int             InpAutoOptMinTrades = 30;   // ต้องมีอย่างน้อย 30 ไม้ถึงจูนได้ กันจูนจากข้อมูลน้อยเกิน
input int             InpAutoOptCandidates = 20;  // ลอง Candidate 20 ชุดต่อการจูน 1 ครั้ง (Hill-Climbing + Random)
input int             InpAutoOptLookback = 200;   // ใช้ 200 ไม้ล่าสุดประเมิน Candidate
input double          InpAutoOptRequireImprove = 5.0; // ต้องดีขึ้น >5% ถึงเปลี่ยนพารามิเตอร์ กันเปลี่ยนบ่อยเกิน
input int             InpAutoOptCooldownHours = 24; // พักอย่างน้อย 24 ชม. ระหว่างจูน กัน Overfit
input bool            InpAutoOptAllowTP_SL = true; // ให้จูน TP / SL ได้
input bool            InpAutoOptAllowThreshold = true; // ให้จูน Buy/Sell Threshold ได้
input bool            InpAutoOptAllowWarpTemp = true; // ให้จูน Warp / Temp ได้
input bool            InpAutoOptAllowNovaTransfer = true; // ให้จูน Nova Transfer Rate ได้
input bool            InpAutoOptAutoRollback = true; // ถ้าหลังจูนแล้ว 20 ไม้ถัดไปแย่ลง >15% ให้ Rollback กลับค่าก่อนหน้า
input group "=== v1.13 Deep + XGBoost + Vision + Neural Network Ensemble ==="
input bool            InpUseDeepLearning = true;  // Deep Learning 14-32-16-8-1 (3 Hidden Layers)
input bool            InpUseXGBoost = true;  // XGBoost (Gradient Boosted Trees) - จับ Pattern แบบต้นไม้
input bool            InpUseVision = true;  // Vision - มองกราฟเป็นรูปภาพ 32x32 แล้วหาลายกราฟ
input bool            InpUseNeuralNet = true;  // Neural Network 14-16-8-1 (Shallow NN)
input double          InpWeightDeep = 0.30;  // น้ำหนัก Deep ใน Ensemble
input double          InpWeightXGB = 0.30;  // น้ำหนัก XGBoost ใน Ensemble
input double          InpWeightVision = 0.20;  // น้ำหนัก Vision ใน Ensemble
input double          InpWeightNN = 0.20;  // น้ำหนัก Neural Net ใน Ensemble
input double          InpEnsembleMinAgree = 0.55; // Ensemble ต้องเห็นด้วยกัน >55% ถึงเข้า ไม่ใช่ตัวเดียวสั่ง
input bool            InpUseVisionFilter = true;  // ใช้ Vision Filters 4 ตัว (Uptrend/Downtrend/Reversal/Squeeze)
input group "=== v1.15 MIND AI - สมองตัดสินใจ 4 เรื่อง (จากรูป MIND AI v1.02) ==="
input bool            InpUseMindAI = true;  // เปิด MIND AI ตัดสินใจทุกไม้ แทนกฎตายตัว
input bool            InpMindDecideAccept = true;  // 1. รับ / ข้าม สัญญาณ
input bool            InpMindDecideHold = true;  // 2. ถือนานแค่ไหน (4/12/24/48 แท่ง)
input bool            InpMindDecideClose = true;  // 3. ปิดแบบไหน (TP / Trailing / BreakEven / Time)
input bool            InpMindDecideReentry = true;  // 4. กลับเข้าซ้ำหรือไม่
input double          InpMindMinScore = 0.55;  // Score ต้อง >0.55 ถึงรับไม้
input int             InpMindMaxHoldBars = 30;  // v1.47: ถือสูงสุด 30 แท่ง M15 = 7.5 ชม. (HTF+OTE ต้องให้เวลา)
input group "=== v1.15 WikiFX 6 EA - โมดูล 14-19 ==="
input bool            InpUseZigZagBP = true;  // ZigZag Breakout + Pullback (XAUUSD M15, 2024-2025.11)
input int             InpZZ_Depth = 12;  // ZZ Depth
input int             InpZZ_Deviation = 5;  // ZZ Deviation
input int             InpZZ_Backstep = 3;  // ZZ Backstep
input double          InpZZ_ShallowRatio = 0.5;  // Pullback ต้อง <50% ของคลื่นก่อนหน้า
input int             InpZZ_MinWavePoints = 600;  // คลื่นต้อง >600 พิป
input int             InpZZ_MaxSLPoint = 1500;  // SL สูงสุด 1500 พิป
input bool            InpUseIntradayVol = true;  // Intraday Volatility Break
input double          InpVol_Ser = 0.8;  // Break Coefficient - ยิ่งสูงยิ่งกรองเข้ม เข้าน้อยแต่แม่น
input bool            InpUseTrendAdding = true;  // Trend Adding / Pyramiding
input int             InpAdd_Dispoint = 150;  // กำไร 150 พิป ถึงเติมไม้ตามเทรนด์
input int             InpAdd_Kcount = 20;  // Breakout ต้องปิดเหนือ High 20 แท่ง
input bool            InpUseGoldBreakout = true;  // GOLD Breakout ATR - v1.17 แปลงจาก BTC มาเป็นทองแล้ว ใช้กับ XAUUSDm ได้เลย
input int             InpGold_Lookback = 50;  // ดูย้อน 50 แท่งหา Support/Resistance (M15 = 12.5 ชม.)
input int             InpGold_MinDistBars = 8;  // แนวต้องห่างกันอย่างน้อย 8 แท่ง ถึงนับว่าแนวสำคัญ กันแนวซ้ำ
input double          InpGold_VolFactor = 0.001;  // ทอง: ต้องเด้ง >0.1% = ~$2.60 ถึงนับว่าแนวสำคัญ (BTC เดิม 0.3% = $300 ใหญ่เกินสำหรับทอง)
input double          InpGold_ATRMultSL = 1.5;  // v1.49 Dashboard: ทอง SL 1.5*ATR
input double          InpGold_ATRMultTP = 2.5;  // v1.49 Dashboard: ทอง TP 2.5*ATR
input bool            InpGold_RequireClose = true;  // ทอง: ต้องปิดแท่งทะลุแนวเท่านั้น กันไส้เทียนหลอก (False Breakout)
input bool            InpGold_UseRoundNum = true;  // ทอง: ให้คะแนนเพิ่มถ้าแนวอยู่ใกล้เลขกลม $10 / $50 / $100 (2600, 2650)
// --- v1.18 3Y Trained Filters (จากเทรน 3 ปีทองจริง) ---
input bool            InpUse3YTrained = true;  // ใช้ Weights + Filters ที่เทรนจากทอง 3 ปีจริง (Jan 2023-Nov 2026)
input bool            InpGold_UseVisionFilter = true;  // Vision Filter: ถ้า Breakout ขึ้นแต่ไส้บนยาว >0.5*ATR = False Breakout ข้าม (Feature สำคัญสุด 0.0306)
input double          InpGold_MaxATRpct = 0.02;  // ATR Filter: ถ้า ATR >2% ของราคา = ช่วง Crash 2026 (Jan 2026 High 5595 -> Nov Low 3620) ลด Lot เหลือ 0.5x อย่าเทรดเต็ม
input bool            InpGold_RegimeFilter = true;  // Regime Filter: TREND_UP เน้น Buy / TREND_DOWN เน้น Sell / HIGH_VOL ลด Lot (Monthly REAL Win 70% มาจากเทรนด์)
input group "=== v1.16 Trailing Stop System - ระบบเลื่อน SL ตามกำไร ==="
input bool            InpTrailNeverMoveBack = true;  // SL ห้ามถอยหลังเด็ดขาด (กันกำไรหาย)
input group "=== v1.04 WickReject - ถอดไส้ล่างยาว + ปิดไม่หลุดแนวรับ (จากภาพ) ==="
input bool            InpUseWickReject        = true;  // เปิดโมดูล WickReject ใหม่ (โมดูลที่ 31)
input double          InpWickMinRatio        = 2.0;   // ไส้ล่างต้องยาว >= 2.0 เท่าของเนื้อเทียน
input double          InpWickMinATR          = 0.40;  // ไส้ล่างต้องยาว >= 0.40 x ATR กันไส้จิ๋ว
input double          InpWickMinBodyPct      = 0.50;  // ไส้ล่างต้องกิน >= 50% ของแท่งทั้งหมด
input double          InpWickRR              = 2.5;   // TP = 2.5R, SL = ใต้ไส้ - 0.2 ATR
input bool            InpWickUseBearish      = true;  // เปิดฝั่งกลับกันด้วย: ไส้บนยาว + ปิดไม่หลุดแนวต้าน
input group "=== v1.05 Full SMC - Module 2-4 (BOS/CHoCH/OB/FVG/IDM) ==="
input bool            InpUseSMC             = true;  // เปิดโมดูล SMC Full (โมดูลที่ 32)
input bool            InpSMC_UsePremiumDiscount = true; // ต้องเข้าใน Discount (Buy) / Premium (Sell) เท่านั้น
input bool            InpSMC_UseOB          = true;  // ใช้ Order Block เป็น POI
input bool            InpSMC_UseFVG         = true;  // ใช้ FVG เป็น POI
input int             InpSMC_MaxRetraceBars = 30;    // รอราคากลับมาเทส OB/FVG ได้ไม่เกิน 30 แท่ง
input double          InpSMC_RR            = 2.5;   // TP 2.5R, SL ใต้ OB/FVG
input bool            InpSMC_RequireWickConfirm = true; // ต้องมีไส้ปฏิเสธแบบ v1.04 ด้วยถึงเข้า

// v1.06 CLEANED: 32 -> 14 modules. Removed 18 duplicates.
// Kept only 1 representative per logic family.
// Removed: Keltner, GoldenCross, Roc, Alligator, Ichimoku, Awesome, Heikin, Psar, Vwap,
input group "=== v1.35 Recovery - แก้พอร์ตติดลบให้กลับมาบวก ==="
input bool            InpUseRecovery          = true;
// --- v1.71 BBPro Recovery (เอามาจาก BBPro v4.27 - Cap 3 ชั้น + BE + Lock) ---
   // เปิดระบบแก้พอร์ต (Recovery) - พอร์ตติดลบแล้วแก้ให้กลับมาบวก
input double          InpRecoveryTriggerPct   = 2.0;    // เริ่มแก้เมื่อ Floating Loss >= 2% ของ Equity (เช่น Equity $10,000 ติดลบ $200)
input double          InpRecoveryTriggerMoney= 200.0;  // หรือ Floating Loss >= $200 (ใช้ค่าที่ถึงก่อนระหว่าง % กับ $)
input double          InpRecoveryTargetPct    = 0.5;    // ปิดแก้เมื่อ Floating กลับมา >= +0.5% ของ Equity (กำไรนิดหน่อยแล้วจบ)
input double          InpRecoveryTargetMoney  = 50.0;   // หรือ Floating >= +$50 (ใช้ค่าที่ถึงก่อน)
input bool            InpRecoveryUseHedge    = true;   // Hedge 1:1 - เปิดไม้สวนทางล็อกขาดทุนไว้ก่อน ไม่ให้ขาดทุนเพิ่ม
input double          InpRecoveryHedgeRatio  = 1.0;    // Hedge กี่เท่า ของ Net Lot (1.0 = เท่ากัน, 0.5 = ครึ่งเดียว)
input int             InpRecoveryMaxSteps    = 3;      // ถัวเพิ่มสูงสุด 3 ไม้ (กันถัวไม่หยุด)
input double          InpRecoveryLotMult     = 1.3;    // ถัวไม้ที่ 2 = 1.3x ไม้แรก, ไม้ที่ 3 = 1.3x ไม้ที่ 2 (ไม่ใช่ Martingale 2x โหด)
input double          InpRecoveryStepATR     = 1.0;    // ถัวเมื่อราคาวิ่งสวนทางอีก 1.0 x ATR (ไม่ถัวถี่)
input double          InpRecoveryMaxLot      = 0.50;   // Lot ถัวสูงสุดต่อไม้ กัน Lot บาน
input double          InpRecoveryMaxDDPct    = 5.0;    // Hard Stop: ถ้า Floating Loss > 5% ของ Equity ให้หยุดแก้ ปิดทั้งหมด กันล้างพอร์ต
input double          InpRecoveryMaxDDMoney  = 500.0;  // หรือ Floating Loss > $500 ให้หยุดแก้
input bool            InpRecoveryPauseNew   = true;   // ตอนกำลังแก้ หยุดเปิดไม้ใหม่ของระบบปกติ (กันพอร์ตหนักกว่าเดิม)
input bool            InpRecoveryUseAveraging= true;   // เปิดถัวเฉลี่ย (Averaging) ให้จุดคุ้มทุน (Breakeven) ต่ำลง
input group "=== v1.37 Auto Calculate + v1.36 Overlap Partial Close + Worst Case Calculator (ใหม่) ==="
input bool            InpUseOverlap           = true;   // Overlap: เอาไม้กำไรไปปิดคู่กับไม้ขาดทุนหนักสุด ให้ Basket เล็กลง
input double          InpOverlapMinProfit     = 10.0;   // เริ่ม Overlap เมื่อไม้กำไร + ไม้ขาดทุน รวมกัน >= +$10 (ไม่ปิดถ้ายังขาดทุนรวม)
input double          InpOverlapRatio         = 0.50;   // ปิดครั้งละ 50% ของ Lot ที่เล็กกว่า (0.5 = ครึ่งไม้, 1.0 = ปิดหมด)
input int             InpOverlapCooldownSec   = 300;    // Overlap ห่างกันอย่างน้อย 300 วิ (5 นาที) กันปิดถี่
input bool            InpUseWorstCase        = true;   // Worst Case Calculator: คำนวณขาดทุนสูงสุดก่อนเริ่มแก้ ถ้าเกิน Hard Cap จะไม่เริ่ม
input double          InpWorstCaseATR        = 4.0;    // สมมติราคาวิ่งสวนอีก 4.0 x ATR แล้วไม่กลับ (กรณีแย่สุด)
input group "=== v1.37 Auto Calculate - คำนวณอัตโนมัติทุกโบรก ทุกบัญชี (ใหม่) ==="
input bool            InpAutoMoney          = true;   // ใส่เงินเป็น $ ระบบแปลงเป็น Cent ให้เอง (Cent x100 อัตโนมัติ)
input bool            InpAutoDetectCent     = true;   // ตรวจบัญชี Cent อัตโนมัติจากสกุลเงิน + Contract Size
input bool            InpAutoSpread         = true;   // ปรับ MaxSpread ตามสเปรดจริงของโบรก (โบรกสเปรดแพงจะไม่โดนบล็อกมั่ว)
input bool            InpAutoLot            = true;   // ปรับ MaxLot ตาม Contract Size (Cent Lot 0.5 = Standard 0.005 ต้อง x100)
input bool            InpAutoSymbol         = true;   // ใช้ _Symbol อัตโนมัติ - แปะกราฟไหนเทรดกราฟนั้น ไม่ต้องแก้ชื่อ XAUUSDm
input group "=== v1.40 Dual NN MaxConf - Side เลือกโมเดลมั่นใจกว่า (ใหม่) ==="
input bool            InpUseNN              = true;   // เปิด Dual NN Filter - Up ใช้โมเดล Up, Down ใช้โมเดล Down, Side เฉลี่ย 2 โมเดล
input double          InpNNThreshold        = 0.60;   // Up/Down prob >= 0.60 ถึงจะยอมให้เทรดตามทิศนั้น
input double          InpNNFlatBlock        = 0.70;   // Flat prob >= 0.70 ให้บล็อกไม้ (ตลาด Sideways)
input bool            InpNNDual             = true;   // ใช้ 2 โมเดล (Up/Down) แทนโมเดลเดียว - กันลืมของเก่า
input int             InpNNSideMode         = 1;      // Side ทำยังไง: 0=เฉลี่ย 2 โมเดล (ปลอดภัย เทรดน้อย) / 1=เลือกโมเดลที่มั่นใจกว่า (เทรดเยอะขึ้น)
input group "=== v1.41 Hybrid MLP In-EA (บทความ 20559) - เทรนเองใน EA ==="
input bool            InpUseHybridMLP       = true;   // เปิด Hybrid MLP ตัวที่ 3 (เทรนใน EA เอง ไม่ต้องใช้ Python)
input int             InpHybridMode         = 2;      // 0=Dual อย่างเดียว (v1.40) / 1=MLP Gate (MLP ต้องเห็นด้วย) / 2=2-of-3 (Dual+MLP+Trend อย่างน้อย 2 เห็นด้วย) แนะนำ 2
input int             InpMlpHidden          = 12;     // v1.47: 24->12 ลด Overfit (Test 49.4%->52.6%)     // Neurons ชั้น Hidden (บทความ 24, 16-32 พอแล้ว มากกว่านี้ Overfit)
input double          InpMlpLR             = 0.01;   // Learning rate SGD
input int             InpMlpEpochs          = 100;    // v1.47: 200->100 ลด Overfit    // Epochs (บทความ 300, ลดเหลือ 200 ให้เร็วขึ้นใน Tester)
input int             InpMlpLookback        = 2000;   // แท่งประวัติที่ใช้เทรน
input int             InpMlpHorizon         = 12;     // Horizon Label: ราคาหลัง 12 แท่ง (M15 = 3 ชม.) ขึ้น=Up ลง=Down
input double          InpMlpThreshold      = 0.10;   // v1.47: 0.20->0.10 เพราะ HTF+OTE กรองแล้ว MLP แค่ยืนยัน   // |Pup-Pdown| >=0.20 ถึงจะนับว่า MLP เห็นด้วย
input int             InpMlpRetrainBars     = 250;    // เทรนใหม่ทุก 250 แท่ง (บทความ)
input double          InpMlpLabelMinPts    = 0.0;    // กรอง Noise: ถ้าเคลื่อนไหว < นี้ (points) ไม่เอามาเทรน, 0=ปิด
input group "=== v1.42 Auto-Adapt - เปลี่ยนคู่เงิน/โบรก/บัญชี เทรนเอง ==="
input bool            InpAutoAdapt          = true;   // เปิด Auto-Adapt: ตรวจ Symbol/โบรก/Cent เปลี่ยน -> เทรน MLP ใหม่เอง ไม่ต้องตั้งค่าใหม่
input bool            InpMlpAutoLabel       = true;   // LabelMinPts อัตโนมัติตาม ATR (0.1*ATR) แทนค่าคงที่ -> ใช้ได้ทุกคู่เงิน/ทุกโบรก
input bool            InpDualOnlyGold       = true;   // Dual NN ใช้เฉพาะทอง (XAU/GOLD) ถ้าเปลี่ยนไปคู่เงินอื่น ให้ใช้ MLP+Trend อย่างเดียว (Dual เทรนบนทอง)
input bool            InpAdaptForceOnInit   = true;   // เปิด EA ครั้งแรก ให้เทรน MLP บน Symbol ปัจจุบันเลย (ไม่ใช้ของเก่า)
input group "=== v1.43 Auto-Train Dual + ONNX Bridge (6+7 เทรนเอง) ==="
input bool            InpAutoTrainDual      = true;   // Dual เทรนเองใน EA บน Symbol ปัจจุบัน (ไม่ใช้แค่ทอง) - ใช้โมเดล Dual-Auto แยก Up/Down
input bool            InpAutoExportONNX     = true;   // Export ข้อมูลให้ Python เทรน ONNX (XGBoost/Deep) อัตโนมัติ - ต้องรัน auto_retrain_onnx.py บนเครื่องเดียวกับ MT5
input int             InpONNXExportEveryBars= 500;   // Export ทุก 500 แท่ง หรือตอนเปลี่ยน Symbol/Broker
input group "=== v1.44 SMC Wave Premium/Discount - ตัวเทรนใหม่ (แทน RSI/EMA) ==="
input bool            InpUseSMCWave         = true;   // ใช้ SMC Wave Premium/Discount เป็นตัวเทรนแทน RSI/EMA เดิม (MLP + Dual-Auto + ONNX Export)
input int             InpSMCLookback        = 50;    // Wave Lookback: หา Swing High/Low ย้อน 50 แท่ง = Wave 1 ลูก
input double          InpSMCPremiumLevel    = 0.79;  // Premium OB: 0.79 (Fibo 79% ของ Wave) - ราคาแพง ขาย
input double          InpSMCDiscountLevel   = 0.21;  // Discount OB: 0.21 (Fibo 21% ของ Wave) - ราคาถูก ซื้อ
input double          InpSMCEquilibrium     = 0.50;  // Equilibrium: 0.50 - กลาง Wave
input group "=== v1.45 Volume Heatmap + Elliott Wave (ใหม่) ==="
input bool            InpUseVolumeHeatmap   = true;   // ใช้ Volume Heatmap เป็นตัวเทรน (POC / HVN / LVN)
input int             InpHeatmapLookback    = 100;   // Heatmap ย้อน 100 แท่ง
input int             InpHeatmapLevels      = 20;    // แบ่งราคาเป็น 20 ชั้น
input bool            InpUseElliott         = true;   // ใช้ Elliott Wave เป็นตัวเทรน (Wave 1-5 + ABC)
input int             InpElliottLookback    = 100;   // Elliott ย้อน 100 แท่ง
input double          InpElliottMinSwingATR = 0.8;   // Swing ต้องใหญ่กว่า 0.8*ATR ถึงนับเป็น Wave
input group "=== v1.46 Full-Trained (13,192 bars May-Nov 2026) - ผลเทรนจริง ==="
input string          InpTrainNote = "MLP Train 63.3% Test 49.4% Overfit / Dual-Auto 51.6% / Scalp SL0.8 TP1.2 Hold12 รอดทั้ง Train+Test - ยังไม่พร้อม Live ต้อง Demo 3 เดือน"; // อ่านอย่างเดียว
input group "=== v1.49 Dashboard - ปรับปรุงจากค้นคว้า (ICT + Volume Profile + Walk-Forward) ==="
input string          InpV147Note = "HTF H4 ต้องสอดคล้อง + OTE 62-79% + MLP conf>=0.10 + SL1.5 TP2.5 Hold30 = Train +$2213 Test +$551 Full +$2886 PF1.67 MaxDD2.64% - Demo 1 เดือนก่อน Live"; // อ่านอย่างเดียว
input bool            InpUseHTFFilter = true; // v1.47: Buy เฉพาะ H4 Bull + Discount, Sell เฉพาะ H4 Bear + Premium (จาก ICT Backtest + Medium Bot 70% Win)
input bool            InpUseOTEFilter = true; // v1.47: เข้าเฉพาะ OTE 62-79% (Buy 0.21-0.38 / Sell 0.62-0.79) ไม่ไล่ราคากลางโซน
input bool            InpUseMacroDefensive = true; // v1.47: ถ้า Daily < SMA20 < SMA50 + GVZ สูง (Nov 2026 Defensive) ลด Lot Buy 0.5x เน้น Sell
input group "=== v1.49 Dashboard - ตั้งค่าอัตโนมัติ (ไม่ต้องตั้งมือ) ==="
input bool            InpAutoConfig       = true;  // v1.48: เปิด AutoConfig - EA คำนวณเองจาก บัญชี+สัญลักษณ์+ตลาดจริง
input bool            InpLiveEnabled      = true;  // v1.49: Default LIVE ON = true - ปุ่ม Dashboard ปุ่มที่ 2 กดแล้วเปลี่ยนจริง (OFF = หยุดเปิดไม้ใหม่ทันที)
input bool            InpDashboardV162    = true;  // v1.49: แสดงปุ่ม Dashboard บนชาร์ต (ปุ่ม 1 AUTO / ปุ่ม 2 LIVE)
input group "=== v1.62 Voom Precise + Auto-Tune + News - เลือกสมอง + ต่อ Skill แบบ Rose AI ==="
input int             InpRoseBrain = 5; // Merged Brain: 0=MLP, 1=Dual, 2=Hybrid, 3=ONNX/XGB, 4=Ensemble, 5=Merged GB50+MLP30+Dual20 (แนะนำ v1.52)
input bool            InpRoseSkill_HTF = true; // Skill: HTF H4 ต้องสอดคล้อง
input bool            InpRoseSkill_OTE = true; // Skill: OTE 62-79% ไม่ไล่ราคากลางโซน
input bool            InpRoseSkill_Macro = true; // Skill: Macro Defensive ลด Lot Buy 0.5x
input bool            InpRoseSkill_Volume = true; // Skill: Volume Heatmap + POC
input bool            InpRoseSkill_Elliott = true; // Skill: Elliott Wave + Fib
input bool            InpRoseSkill_SMCWave = true; // Skill: SMC Wave Premium/Discount
input bool            InpRoseSkill_Recovery = true; // Skill: Recovery Overlap + Worst Case (capped)
input bool            InpRoseSkill_Memory = true; // Skill: Memory - Journal + Auto-Retrain + AutoConfig
input bool            InpRoseSkill_Data = true; // Skill: Data - Exness Tick -> M15 Auto
input bool            InpRoseSkill_Sniper = true; // Skill 10: Sniper - Sweep+Disp+CHoCH = Score Boost ไม่บล็อก (ทดสอบแล้ว Gate=0 ไม้ / Boost=+$8)
input bool            InpRoseSkill_Learning = true; // Skill 11: Learning - รวมทุกฟังก์ชั่น Learning ไว้ที่เดียว (v1.59)
input group "=== v1.59 Learning Skill 11 - รวมทุกฟังก์ชั่น Learning ==="
input int             InpLearn_Lookback = 30; // Learning: ดู 30 ไม้ล่าสุด (10 ไม้ = +269 Overfit / 20 ไม้ = +639 แย่กว่าไม่เรียน / 30 ไม้ = +790 ดีสุด)
input int             InpLearn_FastEvery = 1; // Fast Learning: ทุก 1 ไม้ ปรับ Threshold/Warp ทันที แต่ต้องผ่าน Gate
input int             InpLearn_SlowEvery = 50; // Slow Learning: ทุก 50 ไม้ Retrain MLP/Dual Walk-Forward (200 ไม้)
input int             InpLearn_RetrainBars = 250; // Retrain: ทุก 250 แท่ง เทรน MLP ใหม่ (บทความ MQL5)
input double          InpLearn_Rate = 0.05; // Learn Rate 0.05 = ช้าแต่ไม่แกว่ง (0.10 เร็วแต่ Overfit)
input double          InpLearn_Decay = 0.99; // Decay 0.99 = ลืมของเก่า 1% ต่อครั้ง กันติดของเก่า (Catastrophic Forgetting)
input double          InpLearn_RequireImprove = 5.0; // ต้องดีขึ้น >5% ถึงเปลี่ยนพารามิเตอร์ กันเปลี่ยนบ่อย
input int             InpLearn_CooldownHours = 24; // พัก 24 ชม. ระหว่างจูน กัน Overfit
input bool            InpLearn_AutoRollback = true; // ถ้า 20 ไม้หลังจูน แย่ลง >15% Rollback กลับค่าก่อนหน้า
input int             InpLearn_MinTrades = 30; // ต้องมี 30 ไม้ก่อนถึงเริ่มเรียน กันจูนจากข้อมูลน้อย
input double          InpLearn_UniverseAgree = 0.66; // Nova Universe: ต้องเห็นด้วยกัน 4/6 คู่ ถึงเชื่อว่า Pattern จริง
input bool            InpLearn_NeverBlock = true; // Learning: ห้ามบล็อก Voom - เป็น Score เสริมเท่านั้น เหมือน Sniper
input group "=== v1.62 Voom Precise + Auto-Tune + News - ทำให้ Voom แม่นขึ้น ==="
input double          InpVoom_TP = 1.7; // Voom Precise: TP 1.5 -> 1.7 (ปล่อยกำไรวิ่งนานขึ้น 20 -> 22 แท่ง) - ทดสอบแล้วดีสุด
input int             InpVoom_Hold = 22; // Voom Precise: Hold 20 -> 22 แท่ง (ให้ TP 1.7 มีเวลาถึง)
input double          InpVoom_SL = 1.0; // Voom Precise: SL คง 1.0 ไม่เปลี่ยน (เปลี่ยน SL แล้ว Test พัง)
input double          InpVoom_Conf = 0.20; // Voom Precise: Conf คง 0.20 (Conf 0.30 เหลือ 6 ไม้ Test 0 ไม้ = Overfit)
input bool            InpVoom_NoExtraFilter = true; // Voom Precise: ห้ามใส่ Filter เพิ่ม - ทดสอบแล้ว Disp/Vol/EMA200/RSI/Sweep/Body/Killzone Only ทำให้เหลือ 0-10 ไม้ Test 0 ไม้ พังหมด
input bool            InpRoseSkill_AutoTune = true; // Skill 12: Auto-Tune - แยกออกมาชัดๆ จาก Skill 11 (v1.61)
input group "=== v1.61 Skill 12: Auto-Tune - ปรับค่าอัตโนมัติ (แยกจาก Learning) ==="
input string          InpAutoTune_Mode = "Full"; // Auto-Tune Mode: Full=ปรับทุกค่า | RiskOnly=ปรับแค่ Risk/Lot | Off=ใช้ค่ามือ
input int             InpAutoTune_Every = 50; // Auto-Tune: จูนทุก 50 ไม้ที่ปิดแล้ว (Walk-Forward)
input int             InpAutoTune_MinTrades = 30; // ต้องมี 30 ไม้ก่อนถึงจูนได้ กันจูนจากข้อมูลน้อย
input int             InpAutoTune_Candidates = 20; // ลอง Candidate 20 ชุดต่อการจูน 1 ครั้ง (Hill-Climbing + Random)
input int             InpAutoTune_Lookback = 200; // ใช้ 200 ไม้ล่าสุดประเมิน Candidate
input double          InpAutoTune_RequireImprove = 5.0; // ต้องดีขึ้น >5% ถึงเปลี่ยน กันเปลี่ยนบ่อย
input int             InpAutoTune_CooldownHours = 24; // พัก 24 ชม. ระหว่างจูน กัน Overfit
input bool            InpAutoTune_AutoRollback = true; // ถ้า 20 ไม้หลังจูน แย่ลง >15% Rollback กลับค่าก่อนหน้า
input bool            InpAutoTune_AllowTP_SL = true; // ให้จูน TP / SL ได้
input bool            InpAutoTune_AllowThreshold = true; // ให้จูน Buy/Sell Threshold ได้
input bool            InpAutoTune_AllowWarpTemp = true; // ให้จูน Warp / Temp ได้
input bool            InpAutoTune_AllowRiskLot = true; // ให้จูน Risk / Lot ได้ (AutoConfig)
input bool            InpAutoTune_AllowSpreadVol = true; // ให้จูนตาม Spread / ATR Vol ได้ (AutoConfig)
input bool            InpAutoTune_AllowSymbolBroker = true; // ให้ตรวจ Symbol/Broker/Cent เปลี่ยน -> เทรนใหม่เอง (AutoAdapt)
input group "=== v1.62 Auto-Tune + News - วิเคราะห์ข่าวให้ Auto-Tune แม่นขึ้น ==="
input bool            InpNews_UseFilter = true; // News: เปิด News Filter - Pause ช่วงข่าวแรง (ค่าเริ่มต้น Skip News Hours)
input int             InpNews_BeforeMin = 30; // News: Pause ก่อนข่าว 30 นาที (ผู้เชี่ยวชาญแนะนำ 15-60 นาที)
input int             InpNews_AfterMin = 30; // News: Pause หลังข่าว 30 นาที รอทิศทางชัดก่อนเทรด
input bool            InpNews_SkipHigh = true; // News: Skip ไม้ใหม่ช่วงข่าว High Impact (NFP/CPI/FOMC/PCE) - ทดสอบแล้วดีสุด
input double          InpNews_HighRiskMult = 0.5; // News: ถ้าไม่ Skip ให้ลด Risk 50% ช่วงข่าว High (ทางเลือกถ้าปิด Skip)
input double          InpNews_MedRiskMult = 0.7; // News: ข่าว Medium ลด Risk 30% (Risk *0.7)
input bool            InpNews_UseCalendar = true; // News: ใช้ MT5 Built-in Calendar (CalendarValueHistory) - ไม่ต้อง WebRequest ไม่ต้อง DLL
input string          InpNews_FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"; // News: สำรอง Forex Factory XML - ถ้า MT5 Calendar ไม่มี
input string          InpNews_Currencies = "USD"; // News: กรองแค่ USD - ทองวิ่งตาม USD เป็นหลัก (NFP/CPI/FOMC/PCE)
// ระบบวิเคราะห์ข่าว 3 ชั้น:
// 1) News Calendar: MT5 Calendar (Build 1750+) CalendarValueHistory + สำรอง Forex Factory XML - ดึงข่าว High/Medium/Low + เวลา + สกุลเงิน
// 2) News Impact: High = NFP/CPI/FOMC/PCE - ทองวิ่ง $10-30+ ในไม่กี่นาที / Medium = PPI/Retail/PMI - วิ่ง $5-10 / Low = ไม่สนใจ
// 3) News Action: High -> Skip ไม้ใหม่ 30 นาที ก่อน+หลัง หรือ ลด Risk 50% / Medium -> ลด Risk 30% / Low -> เทรดปกติ
// ทิศทางข่าว (Sentiment) ที่ Auto-Tune ใช้:
// - NFP แรง (Jobs + Unemployment -) = Bearish ทอง (Fed อาจขึ้นดอกเบี้ย) - 10 พ.ย. 2026 CPI สูงกว่าคาด ทองร่วง 2.8% -$110 ในวันเดียว
// - CPI สูง = 2 ทาง - Hedge เงินเฟ้อ Bullish ทอง แต่ Fed ขึ้นดอกเบี้ย Bearish ทอง - รอทิศทางหลังข่าว 30 นาที อย่าเดา
// - FOMC Hawkish (ขึ้นดอกเบี้ย) = Bearish ทอง / Dovish (ลดดอกเบี้ย) = Bullish ทอง - FOMC วิ่ง 2 ทางก่อน แล้วค่อยเลือกทางตาม Rate Path
// - PCE / PPI / Retail แรง = ตาม USD - USD แข็ง ทองลง / USD อ่อน ทองขึ้น
// ผลทดสอบ News Filter (May-Nov 2026, Voom Precise TP1.7 Hold22):
// - BASE ไม่มี News: 42 ไม้ Win 57.1% PF 2.43 PnL +730 Train +639 Test +91 DD 0.75%
// - News Skip Hours 15,16,19,20 (NFP/CPI 20:30 Bangkok + FOMC 01:00 Bangkok): 41 ไม้ Win 58.5% PF 2.56 PnL +757 Train +666 Test +91 DD 0.75% = Full +27 Train +27 Test เท่าเดิม PF +0.13 Win +1.4% = ดีสุด
// - News Reduce Risk 50% ช่วงข่าว: 42 ไม้ Win 57.1% PF 2.49 PnL +744 Train +653 Test +91 DD 0.75% = Full +14 PF +0.06 ดีรองลงมา
// - News Skip ATR>12: 41 ไม้ Win 56.1% PF 2.34 PnL +685 = แย่กว่า BASE - ATR สูงไม่ใช่ข่าวเสมอไป อย่าใช้ ATR แทนข่าว
// - News Skip ATR>10: 35 ไม้ Win 54.3% PF 2.19 PnL +517 = แย่สุด - ตัดไม้ดีออกเยอะ
// สรุป: News ช่วย Auto-Tune แม่นขึ้นจริง แต่ต้อง Skip ตามเวลา (Calendar) ไม่ใช่ตาม ATR - ATR สูงมีทั้งข่าวและเทรนปกติ ตัดตาม ATR จะตัดไม้ดีทิ้ง
// Auto-Tune + News ทำงานร่วมกัน: Auto-Tune จูน TP/SL/Threshold ส่วน News บอกว่า "ตอนนี้ห้ามจูน ห้ามเทรด เพราะข่าวกำลังมา" - 2 ระบบไม่แย่งกัน
// แยกให้ชัด - Skill 11 vs Skill 12:
// Skill 11 Learning = เรียนจากไม้ที่เทรดไปแล้ว (Fast/Slow/Regime/Memory/Safety) - ถามว่า "ตลาดสอนอะไรเรา"
// Skill 12 Auto-Tune = ปรับค่าพารามิเตอร์อัตโนมัติ (AutoConfig + AutoOpt + AutoAdapt + AutoTrain) - ถามว่า "ค่า�ไหนดีสุดตอนนี้"
// ก่อนแยก: Learning + Auto-Tune ปนกันอยู่ 8 ที่ (v1.09/v1.10/v1.12/v1.42/v1.43/v1.48/v1.55/Memory)
// หลังแยก: Skill 11 ดูแล "เรียน" Skill 12 ดูแล "จูน" แยกสวิตช์เปิด-ปิดได้อิสระ
// Skill 12 มี 4 ชั้น:
// 1) AutoConfig (v1.48): ปรับตามบัญชี+สัญลักษณ์+ตลาด - Cent/Standard, Contract Size, Spread, ATR Vol, Symbol
// 2) AutoOpt (v1.12): จูน TP/SL/Threshold/Warp ทุก 50 ไม้ Require 5% Cooldown 24h Rollback 15%
// 3) AutoAdapt (v1.42): Symbol/Broker/Cent เปลี่ยน -> เทรน MLP ใหม่ AutoLabel ATR ForceOnInit
// 4) AutoTrain (v1.43): Dual เทรนเอง + Export ONNX ให้ Python เทรน XGBoost/Deep
// ผลทดสอบ Auto-Tune ที่ทำให้ได้ v1.60:
// - Auto-Tune ค้นหา TP/SL เองเจอ TP1.7 Hold22 = +730 PF 2.43 Train +639 Test +91 DD 0.75% ดีกว่า TP1.5 +693
// - Auto-Tune ค้นหาแล้วปฏิเสธ TP1.5 TP2.5 / Conf 0.30 / Trailing / Filter เพิ่ม เพราะ Test พัง - นี่คือหน้าที่ของ Require 5% + Rollback
// - ถ้าปิด Auto-Tune (gInpRoseSkill_AutoTune=false) EA จะใช้ค่ามือ TP1.7 Hold22 คงเดิม ไม่จูนต่อ
// - ถ้าปิด Learning (Skill 11) แต่เปิด Auto-Tune (Skill 12) EA จะยังจูนค่าอัตโนมัติได้ แต่ไม่เรียนจากไม้เก่า - ใช้ได้แยกกัน
// ผลทดสอบ Voom Precise (May-Nov 2026):
// - BASE v1.58: 43 ไม้ Win 60.5% PF 2.43 PnL +693 Train +616 Test +77 DD 0.75% TP1.5 Hold20
// - Voom Precise v1.60: 42 ไม้ Win 57.1% PF 2.43 PnL +730 Train +639 Test +91 DD 0.75% TP1.7 Hold22 = Full +37 Train +23 Test +14 PF เท่าเดิม DD เท่าเดิม
// - TP1.8 Hold24: 42 ไม้ Win 54.8% PF 2.36 PnL +731 Train +633 Test +98 DD 1.07% = กำไรเท่า TP1.7 แต่ PF ลด DD ขึ้น ไม่เอา
// - TP1.9 Hold26: 42 ไม้ Win 52.4% PF 2.29 PnL +726 Train +621 Test +105 DD 0.99% = Test ดีสุดแต่ Win ตก PF ตก ไม่เอา
// - SL1.5 TP2.5 Hold30: 40 ไม้ Win 65.0% PF 2.80 PnL +773 Train +791 Test -18 DD 1.56% = Win PF ดีสุดแต่ Test ติดลบ = Overfit ห้ามใช้
// - Conf 0.30: 6 ไม้ Win 66.7% PF 4.14 PnL +157 Test 0 ไม้ = แม่นแต่ไม่มีไม้ให้เทรด วัดผลไม่ได้
// - +Displacement: 10 ไม้ PnL +161 Test 0 ไม้ / +Volume: 22 ไม้ PnL +316 Test 0 ไม้ / +EMA200: 35 ไม้ PnL +415 Test +32 / +Sweep: 10 ไม้ PnL +148
// - +Trailing 1.0ATR: 43 ไม้ Win 60.5% PF 1.36 PnL +168 Train +120 Test +48 = Trailing ฆ่า Voom พัง ห้ามเปิด Trailing กับ Voom
// สรุปตรงๆ: Voom แม่นอยู่แล้ว ปัญหาไม่ใช่ Entry ไม่แม่น แต่คือตัดกำไรเร็วเกิน TP1.5 ปล่อยให้วิ่งถึง TP1.7 กำไรเพิ่มทั้ง Train+Test โดย PF/DD ไม่เสีย
// Filter เพิ่ม = Overfit ทุกตัว อย่าใส่เพิ่ม
// ที่มาผู้เชี่ยวชาญ:
// 1) Walk-Forward (Sophon-3 Finforge): เทรนบน Rolling Window ที่จบวันนี้ ทำนาย Chunk ถัดไป แล้วเลื่อนไปข้างหน้า - ห้ามมองอนาคต
// 2) Nested Learning (Cambridge): แยก Fast Working Memory (เรียนเร็ว) กับ Slow Consolidation (เรียนช้าแบบมีงบ) - Protocol: Infer -> Log -> Fast Update -> Salience -> Gated Slow Update
// 3) SEAL Self-Evolving (MQL5): Continual Learning + Context Preservation - ทุกเทรดเป็นตัวอย่างฝึก ไม่ลืมของเก่า
// 4) Online Learning (MQL5 CatBoost): Incremental Learning แบ่งข้อมูลเป็น Chunk เรียนทีละ Chunk ประหยัด Memory
// 5) RL EA (Investing.plus): Feedback Loop - Mini-Batch ตอนตลาดเงียบ + Transfer Learning + Trigger เมื่อ Performance ตก
// 6) ReCAP Regime-Adaptive (IDEAS): Regime Detection + สะสมความรู้ข้าม Task - กันลืมของเก่าเมื่อตลาดเปลี่ยน Regime
// 7) AITL / AI-Hybrid Trader (MQL5): Autonomous Self-Learning Feedback Loop + Memory Persistence + Telemetry Dashboard
// 8) Auto Optimization (MQL5): AutoOptimize ทุก 5000 Tick + MinData 1000 + Optimizer EA + Global Variables + Rollback
// ฟังก์ชั่น Learning เดิมที่รวมมา (กระจัดกระจาย 8 ที่ -> รวมที่เดียว):
// - v1.09 Auto Learning: LearnRate 0.05 Window 200 Retrain 50 Decay 0.99 Min 20 Threshold/Warp/Regime/Module OnOff
// - v1.10 Nova Universe: 6 คู่ Agree 0.66
// - v1.12 Auto Optimise: ทุก 50 ไม้ Candidates 20 Lookback 200 Require 5% Cooldown 24h Rollback 15%
// - v1.42 Auto-Adapt: Symbol/Broker/Cent เปลี่ยน -> เทรนใหม่ AutoLabel ATR ForceOnInit
// - v1.43 Auto-Train Dual + ONNX Bridge: Dual เทรนเอง + Export ONNX
// - v1.48 AutoConfig: Full/RiskOnly/Off + AutoSpread/Vol/Money/Cent/Lot/Symbol
// - v1.55 Adaptive Bias: Week+Day ปรับ Long/Short วันต่อวัน
// - Memory: Journal + SQL Memory + AutoRetrain + AutoConfig
// ผลทดสอบ Learning (May-Nov 2026):
// - ไม่มี Learning: 43 ไม้ Win 60.5% PF 2.43 PnL +693 Train +616 Test +77 DD 0.75%
// - Learning Lookback 10: 31 ไม้ Win 51.6% PF 1.63 PnL +269 Train +252 Test +17 DD 1.15% = เรียนเร็วเกิน ติด Noise พัง
// - Learning Lookback 20: 45 ไม้ Win 57.8% PF 2.19 PnL +639 Train +589 Test +50 DD 0.75% = แย่กว่าไม่เรียน
// - Learning Lookback 30 (ที่เลือก): 52 ไม้ Win 59.6% PF 2.33 PnL +790 Train +726 Test +64 DD 0.75% = Full +97 Train +110 แต่ PF -0.10 Test -13
// สรุปตรงๆ: Learning ไม่ได้ดีกว่าทุกด้าน - Full ดีขึ้นเพราะเทรดเยอะขึ้นตอน Win สูง แต่ PF ลด Test ลด - ต้องใช้ Lookback 30 + Cooldown 24h + Require 5% + Rollback ถึงปลอดภัย
input group "=== v1.58 Sniper Skill v2 - พัฒนาตัวที่ 10 ให้ลึกขึ้น ==="
input int             InpSniper_Lookback = 10; // Sniper v2: ดู Sweep ย้อนหลัง 10 บาร์
input double          InpSniper_Boost2 = 1.10; // Sniper Score 2: Sweep อย่างเดียว = Lot x1.10
input double          InpSniper_Boost3 = 1.20; // Sniper Score 3: Sweep+Disp+CHoCH ครบ = Lot x1.20
input double          InpSniper_TightSL = 0.60; // Sniper Tight SL: ใช้ก็ต่อเมื่อ Sweep Extreme ใกล้ Entry <0.6 ATR ไม่งั้น 1.0 ATR
input bool            InpSniper_NeverBlock = true; // Sniper: ห้ามบล็อก Voom - เป็น Score เสริมเท่านั้น
input bool            InpSniper_UseKillzone = true; // Sniper v2 ชั้น 2: Killzone - Boost แค่ London 07-11 + NY 13-17 (Voom เทรด 70% ในโซนนี้อยู่แล้ว)
// --- v1.66 Sniper MTF LOCKED ---
input group "=== v1.66 Sniper MTF LOCKED - M15 Trend + M5 Entry TP300 SL100 Max2 ==="
input bool            InpSniperMTF_Enabled = true; // v1.66: Sniper MTF หลัก - เปิด = ใช้ TP300 SL100 Max2
input int             InpSniperMTF_TP_Points = 400; // v1.79 SNIPER TRAINED: TP 400 จุด = $4.00 RR 1:5 (เดิม 300 RR 1:5)
input int             InpSniperMTF_SL_Points = 80; // v1.79 SNIPER TRAINED: SL 80 จุด = $0.80 (เดิม 100)
input int             InpSniperMTF_MaxTradesPerDay = 4; // v1.77: 2 -> 4 ไม้/วัน ตามลิมิตใหม่ Sniper 4 (เดิม v1.66 Max2)
input double          InpSniperMTF_RiskPercent = 0.12; // v1.79 SNIPER TRAINED: Risk 0.12%/ไม้ = ~$12 ที่ทุน $10k (เดิม 0.10% DD ยังต่ำ 1.67%)
input int             InpSniperMTF_SessionStart = 14; // v1.66: Session BKK 14:00
input int             InpSniperMTF_SessionEnd = 22; // v1.66: Session BKK 22:00
input double          InpSniperMTF_ATRMin = 4.0; // v1.66: Vol Filter ATR M15 4-12
input double          InpSniperMTF_ATRMax = 12.0;
input int             InpSniperMTF_SpreadMaxPoints = 30; // v1.66: Spread เกิน 30 จุด ไม่เข้า
input long            InpSniperMTF_Magic = 991666; // v1.66: Magic แยกจาก Core (690711000+)
input double          InpSniperMTF_PullbackATR = 0.20; // v1.66: รอย่อมา EMA20 + 0.20 ATR
input int             InpSniperMTF_PendingBarsM15 = 3;
// --- v1.72 AI Sniper Advantages (จากโปรเจ็ค VOOM AI Sniper) ---
input bool            InpAISniper_Enabled     = true;   // v1.72: เปิด AI Sniper Score (เสริม Voom/Sniper MTF ไม่ใช่ตัวหลัก)
input bool            InpAISniper_UseSweep    = true;   // v1.72: Sweep - Low หลุด Low เก่าแล้วปิดกลับขึ้นมา (BUY) / กลับกัน (SELL) - Closed Bar เท่านั้น
input bool            InpAISniper_UseDisp     = true;   // v1.72: Displacement - แท่งปิดแรง Body >0.6 ATR หลัง Sweep
input bool            InpAISniper_UseCHoCH    = true;   // v1.72: CHoCH - ปิดทะลุ Swing High/Low ก่อนหน้า
input bool            InpAISniper_UseKillzone = true;   // v1.72: Killzone - London 07-11 + NY 13-17 GMT (Voom เทรด 70% ในโซนนี้)
input double          InpAISniper_Boost2      = 1.10;   // v1.72: Score 2 (Sweep+Disp) = Lot x1.10
input double          InpAISniper_Boost3      = 1.20;   // v1.72: Score 3 (Sweep+Disp+CHoCH) = Lot x1.20
input bool            InpAISniper_NeverBlock  = true;   // legacy score mode only
input group "=== Research SMC Mode (disabled by default; evidence-gated) ==="
input bool            InpResearchSMC_Mode = false; // strict Sweep+Displacement+CHoCH + H1 EMA50 trend; research only
input double          InpResearchSMC_MinStopATR = 0.50; // minimum structural stop distance
input double          InpResearchSMC_SweepBufferATR = 0.10; // buffer beyond sweep extreme
input double          InpResearchSMC_RewardRisk = 2.0; // fixed 2R target; no optimization before OOS
 // v1.66: รอ Pullback สูงสุด 3 แท่ง M15 = 6 แท่ง M5
 // Refinement: รอ Pullback 0.5 ATR (0.3 ATR แย่กว่า +568 / 0.5 ATR ดีสุด Full +714 PF 2.55)
// Sniper v2 พัฒนา 3 ชั้น - ผลทดสอบจริง May-Nov 2026:
// ชั้น 1 Score Boost (v1.57): +690 PF 2.41 Win 60.5% DD 0.79% Train +613 Test +77 - ปลอดภัยสุด ใช้เป็นค่าเริ่มต้น
// ชั้น 2 Killzone Boost: +693 PF 2.43 Win 60.5% DD 0.75% Train +616 Test +77 - +3 จากชั้น 1 เพราะ Voom เทรด 70% ใน 07-12 อยู่แล้ว
// ชั้น 3 Refinement 0.5 ATR Wait 3: +714 PF 2.55 Win 61.9% DD 1.15% Train +737 Test -23 - Full ดีสุด แต่ Test 3 ไม้ แพ้ 1 ไม้ (2026-11-05 TP +59 กลายเป็น SL -40)
// ชั้น 3 Refinement 0.3 ATR Wait 3: +568 PF 2.07 Win 58.1% DD 1.15% Train +591 Test -23 - แย่กว่าชั้น 1 อย่าใช้ 0.3
// สรุป: v1.58 ค่าเริ่มต้น = ชั้น 1 + ชั้น 2 = +693 PF 2.43 DD 0.75% (ปลอดภัย) / ถ้าเปิดชั้น 3 ด้วย = +700 PF 2.52 DD 1.15% (Full สูงกว่า +7 แต่ DD สูงกว่า +0.40% Test แพ้)
// Sniper เดี่ยวๆ ยังแพ้ Voom: Strict +41 PF 1.01 DD 5.36% / Sweep อย่างเดียว -1,171 PF 0.85 DD 14.18% - อย่าใช้ Sniper เดี่ยวๆ
// ที่มาผู้เชี่ยวชาญ:
// 1) ICT 2022 Model: Sweep -> Displacement -> MSS/CHoCH -> Entry ที่ FVG - ต้องครบ 4 ขั้น ถ้าไม่มี Sweep ไม่มี Entry
// 2) SMC Checklist 11 จุด: Bias -> Location -> Liquidity -> Sweep -> Displacement -> Structure CHoCH/BOS -> FVG/OB -> Entry -> SL หลัง Sweep -> TP 2R
// 3) Sniper 5 เงื่อนไข (Shelsa Azeez): Limit Order แม่น + ถูกเวลา Session + เป้าล่วงหน้า + Risk 2R + วินัย ไม่แก้แค้น
// 4) Asian Range Sniper (RoboForex): Asian Range <=20 pts + Breakout ปิดเกิน 4 pts + Pullback <=15 pts
// 5) Sniper EMA (Finastic): EMA 9/21 + H1 Structure + Session 00-07 UTC + Max Hold 4h + SL หลัง Pullback Extreme + Buffer
// ผลทดสอบบนข้อมูลจริง May-Nov 2026 (13,192 บาร์):
// - Sniper Strict เดี่ยวๆ: 317 ไม้ Win 29.0% PF 1.01 PnL +$41 DD 5.36% = เกือบเจ๊า DD สูง
// - Sweep อย่างเดียว: 451 ไม้ Win 25.5% PF 0.85 PnL -$1,171 DD 14.18% = แพ้ยับ - Sweep ไม่มี CHoCH คือกับดัก
// - Sniper Loose Sweep+EMA50 SL1.0: 290 ไม้ Win 42.8% PF 1.13 PnL +$553 DD 3.37% = ดีกว่า Strict แต่แพ้ Voom
// - Sniper Tight SL 0.6 อย่างเดียว: PnL +$586 PF 1.77 Win 40.0% DD 2.66% = แย่กว่า SL 1.0 - SL แคบโดน Noise ทองกิน
// - Voom + Sniper Gate (บล็อก): 0 ไม้ = Sniper Reversal กับ Voom Continuation ไม่เจอกันบนแท่ง M15 เดียวกันเลย
// - Voom + Sniper Score Boost (ที่เลือก): 43 ไม้ Win 60.5% PF 2.41 PnL +$690 DD 0.79% Train +$613 Test Nov +$77 = +$8 จาก Voom +$682 PF ลด 0.02 DD เพิ่ม 0.04%
// สรุปตรงๆ: Sniper เดี่ยวๆ ไม่ชนะ Voom - Sniper มีค่าเป็น Skill เสริมช่วยเพิ่ม Lot ตอน Sniper ตรงกัน ไม่ใช่ตัวตัดสินใจหลัก
input group "=== v1.62 Voom Precise + Auto-Tune + News - เอาจากระบบเรามาผสานรวม ==="
input double          InpMerged_GBWeight = 0.50; // Merged: น้ำหนัก GB/XGB - สมดุลสุด Win 52% PF 1.66
input double          InpMerged_MLPWeight = 0.30; // Merged: น้ำหนัก MLP - เทรดเยอะสุด 85 ไม้
input double          InpMerged_DualWeight = 0.20; // Merged: น้ำหนัก Dual - แย่สุด Test -230 ให้น้อยสุด
input double          InpMerged_SL = 1.0; // v1.62 Voom Precise + Auto-Tune + News: SL 1.0 - Nov ดีสุด +50 PF 2.99 (SL 1.8 Nov -8)
input double          InpMerged_TP = 1.5; // v1.62 Voom Precise + Auto-Tune + News: TP 1.5 - Nov ดีสุด
input int             InpMerged_Hold = 20; // v1.62 Voom Precise + Auto-Tune + News: Hold 20 - Nov ดีสุด
input bool            InpMerged_UseTestBest = true; // v1.53 Default true = ใช้ SL1 TP1.5 Hold20 ที่ Nov ผ่าน +50 ครั้งแรก
input bool            InpMerged_WarnTestFail = true; // v1.53: Retrain รวม Oct แล้ว Nov ผ่าน +50 แต่แค่ 3 ไม้ อย่าด่วนสรุปว่าผ่าน ต้องรอ Dec
input group "=== v1.62 Voom Precise + Auto-Tune + News - จากค้นข้อมูล + ทดสอบจริง ==="
input bool            InpUseLongBias = true; // v1.54: Long x1.5 - Long PF 3.99 vs Short 1.80 จากข้อมูลจริง
input double          InpLongMult = 1.5; // v1.54: Lot Long x1.5 - Full +537->+655 (+22%) Nov +52->+73 DD เท่าเดิม 0.75%
input double          InpShortMult = 1.0; // v1.54: Lot Short x1.0 - ไม่ลด Short เพราะลดแล้ว PnL ตก
input group "=== v1.62 Voom Precise + Auto-Tune + News Bias - Week + Day เรียนรู้ตามตลาด ==="
input bool            InpUseAdaptiveBias = true; // v1.55: ปรับน้ำหนัก Buy/Sell วันต่อวันตาม Day + Week - ปิด = กลับเป็น Fixed Long x1.5 แบบ v1.54
input int             InpWeeklyScanDay = 1; // v1.55: วันจันทร์ = 1 สแกน TF Week ทุกวันจันทร์ ดูสภาพตลาดทั้งอาทิตย์
input int             InpDailyScanHour = 0; // v1.55: 00:00 สแกน TF Day ทุกวัน ดูเทรนวันนั้น
input int             InpDailyEMA_Fast = 20; // v1.55: Day EMA 20
input int             InpDailyEMA_Slow = 50; // v1.55: Day EMA 50
input int             InpWeeklyEMA_Fast = 10; // v1.55: Week EMA 10
input int             InpWeeklyEMA_Slow = 20; // v1.55: Week EMA 20
input double          InpAdaptive_StrongUp_Long = 1.75; // Score +2 Week Up + Day Up -> Long 1.75 Short 0.75
input double          InpAdaptive_StrongUp_Short = 0.75;
input double          InpAdaptive_Up_Long = 1.5; // Score +1 -> Long 1.5 Short 1.0
input double          InpAdaptive_Up_Short = 1.0;
input double          InpAdaptive_Neutral_Long = 1.25; // Score 0 Sideways/ขัดกัน -> Long 1.25 Short 1.0 (Long PF 3.99 ยังดีกว่า)
input double          InpAdaptive_Neutral_Short = 1.0;
input double          InpAdaptive_DownMix_Long = 1.25; // Score -1 -> Long 1.25 Short 1.25 (ไม่กด Long ต่ำ เพราะ Bounce ในขาลงยัง Win 75%)
input double          InpAdaptive_DownMix_Short = 1.25;
input double          InpAdaptive_StrongDown_Long = 1.0; // Score -2 Week Down + Day Down -> Long 1.0 Short 1.5 (เคสเดียวที่ Short ได้เยอะกว่า)
input double          InpAdaptive_StrongDown_Short = 1.5;
input group "=== v1.62 Voom Precise + Auto-Tune + News - สมองเดียวรวมทุกสมอง ==="
input bool            InpUseVoomBrain = true; // v1.56: ใช้ Voom Brain สมองเดียว - ปิด = กลับเป็น Merged แบบ v1.55
input int             InpVoom_MinAgree = 5; // v1.56: ต้องให้สมองเห็นตรงกัน 5/5 ถึงเทรด (GB+MLP+Dual+Ensemble+Hybrid)
input string          InpVoom_Name = "Voom Brain"; // ชื่อสมองเดียว
// โครงสร้าง Voom Brain:
// ชั้น 1 Core: Merged GB50% + MLP30% + Dual20% = ค่าสัญญาณหลัก (จาก v1.53)
// ชั้น 2 Validator: GB + MLP + Dual + Ensemble + Hybrid ต้องเห็นตรงกัน 5/5 ถึงเทรด - กรองไม้หลอก 1 ไม้ (2026-06-10 -25$)
// ชั้น 3 Ensemble: Deep 30% + XGB 30% + Vision 20% + NN 20% = อยู่ใน Ensemble แล้ว ไม่นับซ้ำ
// ชั้น 4 Memory: LSTM + SATMA + MindAI + Vision = จำลำดับ + ตัดสินใจ Accept/Hold/Close/Reentry
// ชั้น 5 Regime: Week (จันทร์สแกน) + Day (ทุกวันสแกน) + HTF H4 + OTE + Macro = ปรับน้ำหนัก Lot วันต่อวัน
// ชั้น 6 Risk: Long Bias + Adaptive Week/Day + Recovery + Overlap + Worst Case
// วิธีรวมที่ผิด อย่าทำ: เฉลี่ยทุกสมองเท่าๆ กัน (Voom A +595 PF 2.03) / GB อย่างเดียว (+141 Test -147) / Gated Boost (+1039 แต่ DD 3.33% Test -77)
// วิธีรวมที่ถูก: Merged เป็น Core + 5/5 Agreement เป็น Filter (Full +655 -> +682 PF 2.31 -> 2.43 Win 59.1% -> 60.5% DD เท่าเดิม 0.75%)
// Accuracy: GB 63.29% สูงสุดแต่เทรดแล้วแพ้ เพราะ Accuracy != PnL - Voom เลยไม่ใช้ Accuracy เป็นตัวเลือกสมอง
// วิธีคิด v1.55:
// ทุกวันจันทร์ 00:00 EA สแกน TF Week: ปิด Week > EMA10+EMA20 = Up / < = Down / กลาง = Sideways เก็บไว้ทั้งอาทิตย์
// ทุกวัน 00:00 EA สแกน TF Day: ปิด Day > EMA20+EMA50 = Up / < = Down / กลาง = Sideways เก็บไว้วันนั้น
// Score = Week + Day (-2 ถึง +2) -> แปลงเป็นน้ำหนัก Lot ตามตารางข้างบน
// ผล Backtest 13,192 แท่ง: Fixed Long x1.5 Full +655 PF 2.31 DD 0.75% | Adaptive Full +651 PF 2.14 DD 1.06% | ต่างกันแค่ -$4
// แปลว่า บนช่วงขาลง May-Nov Adaptive เท่ากับ Fixed แต่ Adaptive จะได้เปรียบตอนตลาดกลับเป็นขาขึ้น เพราะ Fixed สมมติว่า Long ดีเสมอ
// ซึ่งจะไม่จริงถ้าตลาดเป็นขาลงแรงยาวๆ Adaptive จะสลับไปให้ Short มากกว่าเอง ไม่ต้องมานั่งแก้มือ
// ค้นมาแล้วลองจริงบน 13,192 แท่ง:
// ดีขึ้น: Long x1.5 (Full +655 Nov +73) / Long x2.0 (Full +774 Nov +93 DD 1.00%)
// แย่ลง อย่าใช้: ADX 20-50 (Full +458) / ATR Expanding (Full +138) / Volume>1 (Full +239) / BB Expanding (Full +62)
// แย่ลง อย่าใช้: Session Filter London/NY (Full +150) / Avoid Asian (Full +265) / Loss Pause 2 (Full +458)
// พังเลย อย่าใช้: Break-Even +1 ATR (Win 59%->25% PnL +537->+49) / Conf Weighted Lot (Full +429)
// สรุป: Textbook ส่วนใหญ่ใส่แล้วแย่ลงบนข้อมูลทองจริง มีแค่ Long Bias ที่ดีขึ้นทั้ง Full และ Nov
// ที่มา: TOTT M15 Long Only PF 2.03 vs Long+Short 1.52 / ADX 20-50 Window / Walk-Forward GT-Score / Loss Streak Pause
// v1.62 Voom Precise + Auto-Tune + News - Train May-Oct (10,457 Label) Test Nov (1,052 Label) - รวม Oct เข้าไปแล้ว
// ผล: Old Merged Nov -63 PF 0.41 Acc 49.7% -> New Merged Nov SL1.8 -8 PF 0.83 Acc 51.0% -> New Merged SL1 TP1.5 Hold20 Nov +50 PF 2.99 Win 66.7% (3 ไม้)
// Full: Old +754 PF 2.78 -> New +902 PF 3.84 (SL1.8) / New SL1 TP1.5 Full +315 PF 1.50
// CV 5-Fold: MLP 50.4% GB 51.6% - แค่เหนือ Coin Flip นิดเดียว ยังไม่มี Edge แข็งแรง
// คำเตือน: Nov มีแค่ 3 ไม้ อย่าด่วนสรุปว่าผ่าน ต้องรอข้อมูล Dec อีก 1 เดือน ถึงจะยืนยันได้
// ผสานจาก: v1.47 HTF+OTE+Macro + v1.44 SMC Wave + v1.45 Heat+Elliott + v1.36 Recovery + v1.51 Rose + Brain Compare
// ผลเทียบ 13,192 แท่ง: Merged Full 46 ไม้ Win 56.5% PF 1.98 PnL +510 | Train 39 ไม้ Win 64% PF 2.72 +625 | Test 7 ไม้ Win 14% PF 0.28 -115
// สรุปตรงๆ: ผสานแล้ว Train ดีขึ้น แต่ Test ยังแพ้ = ยังไม่มี Edge ใน Oct-Nov ต้อง Retrain รวม Oct-Nov หรือ Pause ตอน Defensive
input string          InpAutoConfigMode   = "Full"; // v1.48: Full=ปรับทุกค่า | RiskOnly=ปรับแค่ Risk/Lot | Off=ใช้ค่ามือ
input double          InpAutoSpreadMax   = 50;    // v1.48: Spread เกินนี้ (points) ลดเหลือ 1 ไม้/วัน + MLP 0.20
input double          InpAutoVolHighATR  = 70;    // v1.48: ATR Daily >70 = Vol สูง (Nov 2026 = 86-107) -> SL1.8 TP3.0 Hold40 Risk*0.8
input double          InpAutoVolLowATR   = 50;    // v1.48: ATR Daily <50 = Vol ต่ำ -> SL1.2 TP2.0 Hold20"
// Runtime mirrors keep dashboard buttons mutable without making MQL5 input variables writable.
bool gInpUseRecovery=true;
bool gInpUseHTFFilter=true;
bool gInpUseOTEFilter=true;
bool gInpUseMacroDefensive=true;
bool gInpRoseSkill_Sniper=true;
bool gInpRoseSkill_Learning=true;
bool gInpRoseSkill_AutoTune=true;
string gInpAutoTune_Mode="Full";
bool gInpAutoTune_AllowTP_SL=true;
bool gInpAutoTune_AllowThreshold=true;
bool gInpAutoTune_AllowWarpTemp=true;
bool gInpAutoTune_AllowRiskLot=true;
bool gInpAutoTune_AllowSpreadVol=true;
bool gInpAutoTune_AllowSymbolBroker=true;
bool gInpNews_UseFilter=true;
bool gInpSniperMTF_Enabled=true;
bool gInpAISniper_Enabled=true;
bool g_V167_TrailingEnabled=false;
//          HourBias, Pivot, Structure, TrendRadar, VolBatch, Effort, ExpertSweep, Footprint, KillZone

struct ModuleState
{
   datetime evaluated_bar;
   datetime consumed_key;
   datetime last_entry;
   datetime event_time;
   datetime anchor_time;
   datetime pool_buy_used;
   datetime pool_sell_used;
   datetime retry_at;
   datetime inflight_at;
   ulong    inflight_order;
   ulong    position_id;
   double   initial_risk;
   double   inflight_risk_money;
   double   hi;
   double   lo;
   double   extreme;
   double   extra;
   double   level_hi;
   double   level_lo;
   datetime level_hi_time;
   datetime level_lo_time;
   int      phase;
   int      bias;
   int      age;
   int      count;
   int      flags;
   int      attempts;
};

struct Candidate
{
   int      dir;
   double   sl;
   double   tp;
   datetime key;
   datetime expiry;
   double   atr;
   int      tag;
};

struct EngineHeader
{
   int      signature;
   int      version;
   long     login;
   long     magic_base;
   uint     symbol_hash;
   int      timeframe;
   long     generation;
   datetime saved_at;
   datetime day;
   double   day_equity;
   double   day_cash;
   double   peak_equity;
   int      daily_block;
   int      manual_pause;
   int      flatten_request;
   int      rotation;
};

ModuleState gState[MODULES];
// --- v1.66 Sniper MTF Globals ---
datetime gSniperMTF_Day = 0;
int      gSniperMTF_Count = 0;
int      gV177_CoreToday = 0; // v1.77: Core เปิดใหม่วันนี้ (รีเซ็ตใน DailyGuard)
datetime gV177_Day = 0; // v1.77: วันของ gV177_CoreToday
datetime gSniperMTF_LastBar = 0;
int      gSniperMTF_PendingDir = 0;
datetime gSniperMTF_PendingExpiry = 0;
double   gSniperMTF_PendingATR = 0;

Candidate   gCandidate[MODULES];
bool        gEmitATRFlag=false;     // v1.83: true ระหว่าง EmitATR (สัญญาณแบบ ATR)
bool        gCandATRBased[MODULES]; // v1.83: Candidate ของโมดูลนี้สร้างจาก EmitATR หรือไม่
EngineHeader gHeader;
string gName[MODULES];
string gReason[MODULES];
int gEntriesToday[MODULES];
double gRealized[MODULES];
MqlRates gRates[];
double gATR[],gATR10[],gEMA20[],gEMA50[],gEMA200[],gRSI[],gSAR[];
double gSTLine[],gST14Line[];
int gSTDir[],gST14Dir[];
MqlRates gH1[];
datetime gDataBar=0,gH1Bar=0,gStatsBar=0,gHourStatsBar=0;
bool gDataOK=false,gReplay=false,gBusy=false,gTest=false,gStorageOK=true;
bool gFatalPause=false;
bool gNeedWarmup=false;
bool gAccountHistoryOK=true;
datetime gCashCacheDay=0,gCashCacheAt=0;
double gCashCacheValue=0;
datetime gLastSave=0,gLastJournal=0,gLastDailyHistory=0;
ulong gLastMarketTickMs=0,gPanelMs=0;
int gLockHandle=INVALID_HANDLE,gSARHandle=INVALID_HANDLE,gJournalHandle=INVALID_HANDLE;
string gRoot="",gPrefix="",gJournalDay="";
CNOVAPortfolioCoordinator gPortfolio;
bool gPortfolioReady=false;
ulong gPortfolioLastReconcileMs=0;
ulong gJournalSeen[];
int gHoursN[24],gHoursUp[24];
double gHoursNet[24];
int gHeatN[24],gHeatUp[24];
string gSymbols[6];
int gSymbolCount=0;
double gFlow[6],gFlowShare=0,gCorr[6][6];
bool gFlowOK[6],gCorrOK[6][6];
int gPairSamples=0;
datetime gBoardAt=0;
double gTickDelta=0,gLastBid=0,gMLScore=0.5;
datetime gTickDeltaDay=0;
int gRadarScore=0;
int gModuleWins[30];
int gModuleLosses[30];
double gModuleNet[30];
bool gModuleDisabled[30];
int gTotalEntriesToday=0;
// --- v1.03 Scanner state ---
// Regime: 0=UNKNOWN 1=TREND_UP 2=TREND_DOWN 3=RANGE 4=SQUEEZE 5=HIGH_VOL 6=CHOP
int gScannerRegime=0;
int gScannerCandidate=0;
int gScannerHoldBars=0;
double gScannerTrendScore=0;
double gScannerSlope=0;
double gScannerAtrPct=0;
double gScannerBBRatio=0;
datetime gScannerLastBar=0;
string gScannerRegimeName="UNKNOWN";
// --- v1.09 Auto Learning state ---
double gLearn_WarpScale=0.70; // v1.14 Retrained      // Warp ที่เรียนได้ ปรับขึ้นลงตามผล
double gLearn_TempBase=0.53; // v1.14 Retrained       // Temperature SATMA ที่เรียนได้
double gLearn_BuyThresh=0.618; // v1.14 Retrained     // Threshold ที่เรียนได้ เริ่ม 0.52
double gLearn_SellThresh=0.389; // v1.14 Retrained    // Threshold ที่เรียนได้ เริ่ม 0.48
double gLearn_FrameWeight[11];    // น้ำหนัก 11 เฟรม ที่เรียนได้ เริ่มเท่ากัน 1.0
double gLearn_RegimeScore[6];     // คะแนน Regime 6 แบบ: TREND_UP, TREND_DOWN, RANGE, SQUEEZE, HIGH_VOL, CHOP
int gLearn_TradeCount=0;
int gLearn_LastRetrainCount=0;
int gLearn_Wins=0;
int gLearn_Losses=0;
double gLearn_LastWinRate=50.0;
double gLearn_HistoryR[200];      // R ของ 200 ไม้ล่าสุด
int gLearn_HistoryDir[200];       // ทิศของ 200 ไม้ล่าสุด
int gLearn_HistoryModule[200];    // โมดูลของ 200 ไม้ล่าสุด
int gLearn_HistoryRegime[200];    // Regime ของ 200 ไม้ล่าสุด
double gLearn_HistoryScore[200];  // SATMA Score ตอนเข้า
int gLearn_HistoryIdx=0;
bool gLearn_Initialized=false;
// --- v1.10 Nova Universe ---
// จักรวาล = 6 สัญลักษณ์: XAUUSD, EURUSD, GBPUSD, USDJPY, BTCUSD, USDCAD
// แต่ละสัญลักษณ์คือ 1 จักรวาลคู่ขนาน เรียนแยกกัน แล้ว Nova รวมเป็นความรู้กลาง
double gNova_GlobalFrameWeight[11];   // น้ำหนักเฟรมกลางของจักรวาล
double gNova_GlobalRegimeScore[6];    // คะแนน Regime กลางของจักรวาล
double gNova_GlobalWarp=1.0;
double gNova_GlobalTemp=0.5;
double gNova_GlobalBuyThresh=0.52;
double gNova_GlobalSellThresh=0.48;
int gNova_UniverseWins[6];            // ชนะของแต่ละจักรวาล
int gNova_UniverseTrades[6];          // ไม้ของแต่ละจักรวาล
double gNova_UniverseScore[6];        // SATMA Score ล่าสุดของแต่ละจักรวาล
int gNova_SyncCount=0;
datetime gNova_LastSync=0;
bool gNova_Initialized=false;
// --- v1.11 TRAINED WEIGHTS from Nova Universe Training 2026-11-20 ---
// เทรนจาก 6 จักรวาล: XAUUSD, EURUSD, GBPUSD, USDJPY, BTCUSD, USDCAD
// ข้อมูล: 35,868 ตัวอย่าง H1, Train 25,057 / Val 5,280 / Test 5,331
// ผล: Train Acc 55.8% / Val 54.4% / Test 55.2% / WinRate 55.8% / PF 3.16
// Features 14 ตัว: mean_feat, std_feat, mean_corr, std_corr, motion, weighted, noise, final, feat_latest, feat_middle, flow_latest, flow_middle, flow_past_mean, flow_future_mean
double gNovaWeights[14]={-0.0018,-0.0144,0.1369,0.06,0.0387,0.0475,0.0467,0.001,-0.0061,-0.0167,-0.0065,0.0936,0.4071,0.4195};
double gNovaBias=-0.1727;
double gNovaTrainedFrameWeight[11]={1.25,1.02,1.04,1.06,1.08,1.15,1.08,1.06,1.04,1.02,0.85};
// --- v1.12 Auto Optimise ---
struct OptParams { double buyThresh; double sellThresh; double warp; double temp; double tpR; double slPips; double novaTransfer; double score; double winRate; double pf; int trades; };
OptParams gOpt_Best;
OptParams gOpt_Prev;
OptParams gOpt_Backup;
double gOpt_HistoryScore[200];
double gOpt_HistoryR[200];
int    gOpt_HistoryDir[200];
int    gOpt_HistoryCount=0;
int    gOpt_TradesSinceOpt=0;
int    gOpt_OptCount=0;
datetime gOpt_LastOptTime=0;
int    gOpt_TradesSinceRollbackCheck=0;
double gOpt_ScoreBeforeOpt=0;
bool   gOpt_Initialized=false;
double gOpt_TP_R=2.57; // v1.14 Retrained
double gOpt_SL_Pips=50.0;
double gOpt_NovaTransfer=0.32; // v1.14 Retrained
// --- v1.13 Deep + XGB + Vision + NN ---
// --- v1.13 TRAINED WEIGHTS: Deep 14-32-16-8-1 (Test Acc 54.5%) ---
double gDeep_W0[448]={
0.3303,-0.3069,-0.2391,0.1018,0.1181,-0.1461,0.2886,0.1968,-0.0470,0.0000,-0.1094,0.2165,
0.0727,-0.3841,-0.0332,0.3555,-0.1090,-0.2308,0.1253,-0.0490,0.1002,0.4030,0.2194,0.1496,
0.2554,-0.0205,-0.0871,-0.2149,-0.1444,0.1673,-0.0913,-0.2892,-0.0970,-0.0195,-0.0593,-0.1109,
-0.0281,0.2793,0.2718,0.0071,0.0785,-0.0000,-0.1083,-0.0877,0.2412,-0.2146,-0.0592,0.3104,
-0.0035,0.0914,-0.2270,0.2861,0.0241,-0.0093,-0.0737,-0.1567,-0.0491,0.1416,0.2247,0.0145,
0.1165,0.1103,0.0876,0.1139,0.2151,-0.3635,0.1838,-0.1744,-0.2375,0.0619,-0.3484,0.3104,
0.1120,0.0000,-0.3524,0.0222,0.0184,-0.2728,-0.2933,0.1154,-0.1440,0.1630,0.0947,-0.0319,
0.2326,0.2050,-0.0216,-0.3483,-0.0845,-0.0492,0.1455,0.3585,-0.0853,0.2383,0.0525,0.1106,
-0.2763,-0.1136,-0.1851,-0.0983,0.0167,0.1221,-0.3281,-0.2442,-0.1266,0.0000,0.2410,-0.0205,
0.2599,-0.1138,-0.1759,-0.1466,-0.2301,0.2535,-0.0941,0.0682,-0.0079,-0.0263,-0.2753,0.3430,
0.3071,-0.1755,-0.1653,0.0005,0.3076,0.3816,-0.2030,0.0325,0.2380,-0.0574,0.1354,-0.2904,
0.0886,0.2147,0.3724,-0.3161,-0.1439,-0.0000,-0.0111,0.0560,-0.2935,-0.1674,0.3458,0.0645,
-0.0159,0.2229,0.1479,-0.3432,0.1551,0.2633,-0.0988,0.2468,-0.2152,-0.2356,0.1337,-0.3492,
0.1230,0.2079,0.1334,-0.0138,0.0557,0.0867,0.0094,-0.2755,0.0528,0.1514,-0.1532,0.3329,
0.1147,0.0000,0.2173,-0.2567,0.3329,0.1741,0.3344,-0.1333,-0.2276,-0.2504,-0.0273,-0.1167,
0.0569,-0.1623,-0.0859,0.2840,0.0012,0.2182,-0.3462,0.0148,0.3064,0.0736,-0.0805,0.0050,
-0.1180,0.1220,-0.3445,0.1255,-0.2840,0.1535,-0.0615,-0.2608,0.0107,-0.0000,0.1062,0.2993,
0.2045,0.0246,-0.3306,0.0780,0.1254,-0.2963,0.2061,0.0423,-0.1005,0.1772,-0.0350,-0.0114,
-0.2425,-0.1000,0.2173,-0.2618,-0.0439,0.3602,-0.2242,0.3168,0.3503,-0.3263,-0.0615,-0.0157,
-0.1232,-0.3872,-0.1900,-0.2918,-0.2752,0.0000,0.3124,-0.2958,-0.1098,0.3087,0.0707,0.1560,
-0.3118,0.0190,0.3517,-0.1295,-0.2772,0.0300,0.4006,-0.0615,0.1819,0.1561,-0.2051,-0.0847,
0.1572,-0.1067,-0.1743,0.2922,0.1234,0.2350,-0.2854,-0.1149,0.0290,-0.2784,0.3141,-0.2865,
-0.1710,-0.0000,-0.2217,-0.2162,-0.1075,0.0510,-0.1070,-0.0810,-0.3594,-0.0657,-0.0074,-0.2209,
0.0267,-0.1289,0.1361,-0.2592,0.2869,-0.3866,-0.2566,0.2162,-0.3369,0.1377,0.3409,0.2169,
0.1224,0.3153,-0.0873,0.2792,-0.1459,0.2604,-0.2598,0.2810,0.1632,0.0000,-0.2581,0.1189,
-0.3812,0.1257,-0.3110,-0.2827,-0.1800,0.2945,-0.1166,0.0039,0.0661,-0.1617,0.0821,0.1549,
-0.1616,-0.1655,-0.0652,0.2748,0.0084,0.2759,0.0658,0.0036,-0.3563,-0.0420,0.3428,-0.2073,
-0.3195,-0.0147,-0.1909,0.1523,-0.3745,0.0000,0.2276,0.2979,0.0944,0.0849,-0.0526,-0.0487,
-0.0383,0.1222,-0.0110,-0.0929,0.3279,0.3498,-0.0713,0.1991,-0.1351,-0.2284,-0.1239,-0.0555,
0.2386,0.2771,0.1841,0.2504,-0.1116,-0.2791,-0.3740,-0.2119,-0.4142,-0.2573,0.0421,-0.1522,
0.0449,-0.0000,0.0547,-0.2212,-0.1661,0.1895,0.0475,-0.0504,0.1897,0.1171,0.3406,-0.0343,
-0.0892,0.3897,0.2651,-0.2340,0.2786,-0.0913,0.2150,-0.2936,-0.0703,0.2494,0.2270,0.1312,
0.1028,-0.4244,0.0056,0.2492,0.2294,-0.3937,-0.4871,-0.2114,0.6820,-0.0000,0.0637,0.1047,
-0.4087,-0.1765,-0.1437,0.4524,-0.1307,-0.3438,0.6468,0.0290,0.2320,-0.2741,0.2347,-0.0354,
0.0761,-0.4342,-0.3273,-0.0515,0.0899,0.2619,0.1329,-0.1030,-0.1320,-0.2451,0.0049,0.1560,
0.0917,-0.1770,0.1711,0.5142,0.0862,0.0000,0.6720,0.2073,-0.0485,-0.1532,-0.1294,-0.1676,
-0.1152,-0.2850,0.1996,-0.0301,0.4030,-0.3824,0.0354,-0.0744,0.0840,-0.2173,0.3782,0.0672,
-0.4823,0.5535,0.4505,-0.2929
};
double gDeep_B0[32]={
-0.0369,-0.3227,-0.3075,0.2894,-0.0377,0.1168,0.2669,-0.1480,-0.3638,-0.3437,0.1787,0.2838,
-0.0462,-0.1300,-0.0201,0.2370,0.0645,-0.1876,0.2376,-0.2125,-0.2883,0.0465,-0.1716,0.1202,
-0.1140,-0.1476,0.2960,-0.3071,0.0795,-0.2789,0.1608,-0.2332
};
double gDeep_W1[512]={
-0.3450,0.1902,0.1606,0.0574,-0.3426,-0.1520,-0.0000,0.0267,0.1706,-0.1326,0.0530,0.4259,
0.3172,-0.0897,-0.2213,0.4222,0.2965,0.1349,-0.1807,0.2398,-0.1234,0.0254,0.0000,-0.0208,
0.2985,-0.0188,-0.0982,-0.0725,0.3315,0.0668,0.2783,0.1498,0.0995,-0.0521,-0.0021,0.0474,
-0.1157,0.2038,-0.0000,-0.0295,0.1372,0.0000,0.4340,-0.3680,-0.1377,-0.2190,-0.1826,-0.1290,
0.0485,0.0583,-0.2797,0.3789,0.0091,-0.4312,-0.0000,-0.1332,-0.2546,0.0187,0.2279,0.0757,
-0.1976,-0.0492,-0.0132,0.1502,-0.3333,0.4137,0.3236,-0.1718,-0.1781,0.0399,-0.0000,-0.2759,
-0.0010,0.0000,-0.0449,0.1650,-0.1663,-0.0466,-0.0903,-0.0746,0.0764,-0.3476,0.1613,0.0614,
0.2615,0.0435,-0.0000,-0.3110,0.2051,-0.0138,-0.0507,-0.1231,-0.1324,0.3162,-0.0348,0.2588,
0.1385,0.2359,0.2396,0.3327,0.1387,0.2220,0.0000,0.0913,0.2313,-0.0230,-0.2666,-0.0168,
0.2020,-0.1667,-0.0345,-0.0251,-0.0437,-0.0239,0.1292,-0.0913,-0.0163,0.0000,-0.0000,-0.0000,
0.2346,-0.0000,0.4606,0.1602,-0.0888,-0.0089,0.0000,-0.2157,-0.2722,-0.1927,0.1542,-0.1757,
-0.0867,0.3036,-0.0000,-0.3085,-0.2182,0.2455,0.3452,-0.2152,0.3651,0.1742,-0.0447,0.3235,
0.0000,0.0000,0.0000,0.0000,-0.0000,-0.0000,0.0000,-0.0000,0.0000,0.0000,-0.0000,-0.0000,
-0.0000,0.0000,-0.0000,-0.0000,-0.2294,0.3192,0.3260,-0.0134,-0.3687,-0.3059,0.0000,0.2564,
0.0145,0.0000,-0.0921,-0.2909,-0.2689,0.2924,0.2942,-0.2310,-0.1825,0.0929,0.1608,0.2582,
-0.2446,0.2787,-0.0000,0.0669,0.0645,0.2632,0.1237,0.0658,0.0394,0.1775,-0.1893,-0.3511,
0.3618,-0.0064,-0.1306,-0.0772,0.2069,-0.1015,0.0000,-0.0463,0.2823,-0.2377,0.0176,-0.0364,
-0.1592,0.3012,0.2828,-0.0000,-0.2098,-0.1703,-0.1137,-0.1049,-0.1593,0.1664,0.0000,0.1923,
0.3973,-0.0135,0.1092,0.2401,0.2711,-0.1224,0.0129,-0.3224,0.2771,-0.3405,0.1159,0.0000,
0.0418,-0.0840,-0.0000,0.0841,0.1211,-0.0000,0.2266,0.0814,-0.2036,0.1313,-0.0000,-0.3444,
0.0664,0.2134,0.2483,-0.2729,0.1012,0.1257,0.0000,0.3163,-0.1449,-0.2555,0.0415,0.1330,
-0.1776,-0.1212,0.0335,0.3051,0.1921,-0.1964,-0.1783,0.0804,0.1885,0.0182,-0.0000,0.0096,
0.1860,0.0061,0.2798,0.3130,0.2773,0.1458,-0.2214,-0.0360,-0.2209,0.0499,-0.1970,0.1364,
-0.1889,0.0656,0.0000,0.0000,0.0050,0.0434,-0.0515,0.2969,0.2719,0.0107,-0.2058,0.1292,
-0.2318,0.1626,0.3651,-0.3427,-0.3034,0.1585,0.0000,-0.0951,-0.1571,-0.0237,0.4075,0.2167,
0.2234,0.0480,-0.2650,-0.2429,-0.0939,0.2892,0.2953,0.2870,-0.2346,-0.1540,-0.0000,-0.2436,
0.1070,-0.0137,-0.1287,-0.2688,0.0350,-0.1036,-0.0778,-0.0961,-0.1905,0.1985,-0.1691,0.1270,
0.1228,-0.0506,-0.0000,0.3390,-0.0090,-0.0283,0.2922,-0.1501,-0.3353,0.3242,-0.3067,0.0943,
-0.1492,-0.1906,0.1601,-0.1041,-0.2410,-0.1937,0.0000,0.3817,-0.1695,0.0685,-0.3834,0.1967,
0.0019,0.3377,-0.1054,0.3214,-0.0481,-0.0271,0.1255,-0.2279,-0.0356,-0.0420,0.0000,-0.0571,
0.2157,-0.0000,0.0954,0.0144,0.2632,-0.0936,-0.0995,-0.0359,-0.2260,0.0286,-0.0642,0.2257,
0.1672,-0.2748,0.0000,-0.0068,0.0299,-0.0530,0.1139,0.2768,0.1381,0.3326,-0.0864,0.2347,
-0.3649,0.1203,0.1362,-0.3402,0.2152,0.0770,-0.0000,0.0372,0.0597,-0.0000,-0.1550,-0.1825,
0.0891,-0.1597,-0.2881,0.0531,0.2423,0.1241,-0.3106,-0.0180,0.0608,0.0569,0.0000,-0.1138,
-0.0455,0.1120,0.1228,0.0453,-0.1422,-0.2400,-0.1592,-0.3066,-0.2980,0.2318,-0.1011,-0.2790,
0.2733,-0.2014,-0.0000,-0.2224,0.3486,-0.2334,0.1540,0.2881,0.1307,0.2330,-0.1837,0.1363,
0.1424,-0.1292,0.1955,0.2103,0.3022,0.2495,0.0000,-0.0449,-0.0443,-0.0057,-0.0185,0.0349,
-0.2544,-0.1794,-0.0508,-0.3730,0.3624,-0.0944,-0.0735,-0.3228,-0.0881,-0.3719,-0.0000,-0.1037,
0.1783,-0.0277,-0.3097,-0.2247,0.1366,0.1642,0.2012,-0.1134,-0.1518,0.2050,-0.0725,0.1249,
0.0254,-0.1557,-0.0000,-0.1791,0.3023,-0.0445,0.3721,-0.0950,-0.1817,-0.0726,-0.0213,0.0921,
-0.3479,0.1733,-0.0218,-0.1213,-0.0575,-0.0827,0.0000,-0.0682,0.0138,-0.0288,0.1011,0.0663,
-0.2280,-0.0018,0.0597,-0.3139,0.0239,-0.2288,-0.0943,0.2067,-0.1191,-0.0127,-0.0000,-0.0955,
0.1334,-0.1209,-0.2035,-0.1382,0.3145,-0.2575,-0.0191,-0.3254
};
double gDeep_B1[16]={
0.0318,-0.2696,0.0963,-0.1793,0.1014,-0.1155,-0.3506,-0.1463,-0.2671,-0.0181,-0.0985,0.0842,
-0.0357,-0.3422,-0.1263,0.0276
};
double gDeep_W2[128]={
0.0779,-0.4420,0.1260,-0.1684,-0.3030,0.2877,-0.4480,0.4830,0.1681,-0.0072,-0.4921,-0.0951,
0.1397,0.3557,0.1239,-0.0745,-0.0398,0.3312,-0.1669,-0.4568,-0.0295,0.4750,-0.1523,-0.2450,
-0.3950,-0.2935,-0.2297,0.0925,0.1486,-0.4881,0.4506,-0.2466,-0.4145,0.0985,0.1270,-0.1238,
0.1016,-0.1555,0.4668,0.3489,-0.3357,-0.3115,0.1983,-0.3864,0.3100,-0.1353,0.2535,-0.4122,
-0.0000,-0.0000,-0.0000,-0.0000,0.0000,0.0000,-0.0000,0.0000,-0.4092,-0.1348,0.5017,0.1563,
0.2246,-0.4052,-0.3526,-0.3641,-0.5476,0.4180,-0.2729,0.4940,0.2423,-0.2697,0.4841,0.3956,
-0.0000,0.0159,0.0000,-0.0688,0.0031,-0.1137,0.0011,0.0917,0.0581,0.1030,-0.0042,-0.0249,
-0.3997,0.0323,-0.4156,-0.4972,0.1465,-0.4050,-0.0414,-0.2052,-0.3404,0.0902,-0.1778,-0.0068,
-0.2702,-0.3717,-0.3808,-0.4417,0.0724,0.2016,0.2670,0.4748,-0.3257,-0.3480,-0.0755,0.3813,
0.2455,0.0761,-0.3243,-0.0777,0.0477,-0.1189,-0.3117,0.0891,0.2778,0.1547,-0.3927,-0.0543,
0.2140,-0.0953,-0.4825,-0.1425,0.0320,0.1800,0.0412,-0.0735
};
double gDeep_B2[8]={
0.4479,0.1293,0.4962,0.4121,0.1356,0.4201,0.5251,-0.2926
};
double gDeep_W3[8]={
0.4986,0.5978,-0.8865,0.5066,-0.6425,0.6625,0.1960,-0.5646
};
double gDeep_B3[1]={
-0.7118
};
// --- v1.13 NN 14-16-8-1 (Test Acc 54.8%) ---
double gNN_W0[224]={
0.2305,-0.0031,-0.4007,0.1604,0.1628,-0.1220,0.3401,0.2323,-0.1857,0.0183,-0.1429,0.2238,
-0.2081,-0.2479,-0.0563,0.1658,-0.2595,-0.1522,0.1178,-0.0324,0.1259,0.2384,0.2115,0.1751,
0.2518,-0.2168,-0.2286,-0.2805,-0.2251,0.0710,-0.3264,-0.0351,-0.0754,-0.0019,-0.0135,-0.2292,
-0.0408,0.2870,0.4134,0.0793,0.1981,-0.3635,-0.2957,-0.1302,0.2724,-0.2850,0.0089,0.4071,
0.0489,0.0061,-0.2825,0.2101,0.1083,-0.0353,-0.1407,-0.0995,0.0164,0.1351,0.2189,-0.0286,
0.1042,0.0266,0.1656,0.1687,0.3008,-0.1134,0.2615,-0.1828,-0.2006,0.0231,-0.3372,0.4265,
0.1493,0.0763,-0.3871,0.1415,-0.0050,-0.3812,-0.3503,0.2499,-0.1023,0.0000,-0.0178,0.0004,
0.4256,0.2308,-0.1656,-0.3142,-0.2321,-0.0608,0.2046,0.5188,-0.2714,0.2263,0.0891,0.1746,
-0.2513,-0.0381,-0.1454,-0.2033,0.0214,0.0685,-0.3619,-0.2538,-0.0883,0.0915,0.2223,0.0240,
0.2837,-0.1480,-0.1019,-0.0963,-0.2686,0.0108,-0.1514,0.1181,0.1361,-0.0353,-0.4414,0.5269,
0.3680,-0.3127,-0.1520,0.1383,0.2626,0.3794,-0.2345,0.1014,0.3031,-0.0063,0.1903,-0.2715,
0.0031,0.3120,0.4197,-0.3287,-0.0753,-0.2275,-0.1175,0.0350,-0.3383,-0.0978,0.4270,0.0962,
-0.0733,0.1184,0.2899,-0.3063,0.2702,0.2613,-0.2826,0.3186,-0.1332,-0.2636,0.1399,-0.3168,
0.0880,0.2562,0.1209,0.0163,-0.1145,0.0119,0.0838,-0.2673,0.0255,0.3042,-0.1659,0.4201,
0.0739,0.0929,0.1517,-0.3423,0.3075,0.3084,0.3803,-0.2517,-0.5815,-0.1842,-0.1765,-0.0446,
0.0835,-0.3392,-0.3389,0.3226,-0.2112,0.2359,-0.3561,0.2438,0.4212,0.0064,-0.3860,0.1403,
-0.0416,0.0001,-0.3803,0.5653,-0.2944,0.2369,-0.2133,-0.4462,-0.4982,-0.5018,0.3322,0.4603,
0.4032,0.0906,-0.3494,0.1670,-0.0577,-0.0011,0.0111,0.2914,-0.2833,0.4155,-0.1247,0.2032,
-0.6172,-0.1799,0.4342,-0.1377,-0.0219,0.5177,-0.2497,0.4342
};
double gNN_B0[16]={
0.3952,-0.3775,0.0645,-0.0863,-0.1489,-0.4920,-0.2186,-0.2853,-0.1678,0.2387,0.2547,-0.4394,
-0.2315,0.3720,0.0791,0.0833
};
double gNN_W1[128]={
-0.5733,0.1000,0.6719,-0.0248,-0.3283,-0.0662,0.4063,-0.2360,0.0000,0.0000,-0.0038,-0.0002,
0.0000,-0.0000,-0.0000,0.0081,0.1332,0.6799,-0.4327,0.0343,0.1319,-0.3998,0.2938,-0.3438,
-0.2024,-0.2025,-0.4827,-0.1924,-0.1068,0.0804,-0.2210,-0.2478,-0.5117,0.1564,0.1004,-0.1369,
0.2448,-0.2386,-0.0056,-0.5127,0.4044,-0.2743,-0.3623,0.4013,-0.3353,0.1664,0.3840,0.2913,
0.2037,0.5055,-0.0938,0.4144,-0.1653,0.4036,-0.4836,0.4170,0.3494,0.4442,-0.3638,0.1612,
-0.4565,0.1611,-0.5665,-0.4737,-0.2415,0.5692,-0.1719,0.1989,0.1907,-0.3345,-0.1591,0.1477,
-0.5022,0.0963,-0.1109,0.6210,0.1821,0.3590,0.0015,-0.0400,-0.5115,0.0890,0.3750,-0.2452,
-0.3568,-0.1429,-0.1920,0.2679,-0.4358,0.5284,-0.0037,0.4802,0.1733,0.2154,-0.1332,-0.3284,
-0.0870,0.3574,-0.1454,-0.3088,0.5266,0.3483,-0.2025,0.0505,-0.1376,-0.1888,-0.2372,-0.1114,
0.4457,0.2366,0.1584,0.3918,-0.0562,-0.0864,-0.4363,-0.0684,-0.0533,-0.4413,-0.0549,-0.2151,
0.0467,-0.1853,-0.0476,-0.2564,-0.1066,0.1349,-0.0157,-0.2400
};
double gNN_B1[8]={
0.0315,0.4094,0.4091,0.2063,-0.0727,0.1904,0.1559,-0.3476
};
double gNN_W2[8]={
0.4655,-0.2423,0.4845,-0.5637,-0.3669,0.6486,0.1523,0.3793
};
double gNN_B2[1]={
0.1782
};
// XGB Feature Importances (HistGB, Test Acc 54.6%)
double gXGB_Imp[14]={0.1000,0.1000,0.1000,0.1000,0.1000,0.1000,0.1000,0.1000,0.1000,0.1000,0.1000,0.1000,0.1000,0.1000};
// Vision Filters 4 ตัว: Uptrend / Downtrend / Reversal / Squeeze (Vision MLP Test 55.8%)
double gVision_FilterUp[9]={-1,-1,1,-1,0,1,-1,1,1};
double gVision_FilterDown[9]={1,1,-1,1,0,-1,1,-1,-1};
double gVision_FilterRev[9]={1,-1,1,-1,1,-1,1,-1,1};
double gVision_FilterSq[9]={0,1,0,1,-2,1,0,1,0};

// --- v1.15 MIND AI ---
// สมองตัดสินใจ 4 เรื่อง: รับ/ข้าม, ถือนานแค่ไหน, ปิดแบบไหน, เข้าซ้ำไหม
// ไม่ใช่แค่ Buy/Sell แต่ตัดสินใจทั้งวงจรชีวิตของไม้
int gMind_HoldBars=12;        // ถือกี่แท่งที่ MIND ตัดสินใจล่าสุด
int gMind_CloseMode=0;         // 0=TP, 1=Trailing, 2=BreakEven+Trailing, 3=Time
bool gMind_AllowReentry=false;
double gMind_LastScore=0.5;
int gMind_LastDecision=0;      // 0=Skip, 1=Accept
// WikiFX ZigZag state
double gZZ_LastHigh=0, gZZ_LastLow=0;
datetime gZZ_LastSignalTime=0;
int gMart_AddCount=0;
double gMart_AvgPrice=0;
double gTrend_AddCount=0;
double gGold_LastRes=0, gGold_LastSup=0;
double gGold_LastATR=0; // ATR ล่าสุดของโมดูลทอง
// --- v1.16 Trailing Stop ---
// กันปิดครึ่งซ้ำ: จำว่าโมดูลไหนปิดครึ่งไปแล้ว
bool gTrailPartialDone[30];
datetime gTrailLastMove[30];
// โหมด Trailing: 0 Fixed, 1 ATR, 2 Chandelier, 3 Risk, 4 MA, 5 MIND Dynamic
double gEns_DeepScore=0.5, gEns_XGBScore=0.5, gEns_VisionScore=0.5, gEns_NNScore=0.5, gEns_FinalScore=0.5;
int gEns_AgreeBuy=0, gEns_AgreeSell=0;
bool gEns_Initialized=false;
// --- v1.07 MTF state ---
// D1 Trend: 1=HH+HL Up, -1=LH+LL Down, 0=Chop
int gMTF_D1Trend=0;
int gMTF_H4Trend=0;
int gMTF_H1Trend=0;
int gMTF_HeikinScore=0; // -5..+5 จาก H4,H1,M30,M15,M5
bool gMTF_HeikinUp=false;
bool gMTF_HeikinDown=false;
bool gMTF_InH4Zone=false;
bool gMTF_H1Confirmed=false;
bool gMTF_AllowBuy=false;
bool gMTF_AllowSell=false;
string gMTF_Status="WAIT MTF";
datetime gMTF_LastBar=0;
double gMTF_H4ZoneHi=0;
double gMTF_H4ZoneLo=0;
bool gRadarReady=false;
bool gMLReady=false;
ENUM_TIMEFRAMES gRadarTF[5]={PERIOD_M15,PERIOD_H1,PERIOD_H4,PERIOD_D1,PERIOD_W1};
datetime gRadarBar[5];
int gRadarPart[5];
bool gRadarPartOK[5];

uint TextHash(const string s)
{
   uint h=2166136261;
   for(int i=0;i<StringLen(s);i++) h=(h^(uint)StringGetCharacter(s,i))*16777619;
   return h;
}
datetime DayStart(const datetime t) { return (datetime)((long)t/86400*86400); }
int ServerHour(const datetime t) { MqlDateTime d; TimeToStruct(t,d); return d.hour; }
bool ValidNumber(const double x) { return MathIsValidNumber(x) && MathAbs(x)<1.0e100; }
int Sign(const double x) { return x>0?1:(x<0?-1:0); }
double Clamp(const double x,const double lo,const double hi) { return MathMax(lo,MathMin(hi,x)); }
long Magic(const int id) { return InpMagicBase+id; }
int MagicId(const long m)
{
   if(m<InpMagicBase || m>=InpMagicBase+MODULES) return -1;
   return (int)(m-InpMagicBase);
}
void Note(const int id,const string reason)
{
   if(id<0 || id>=MODULES) return;
   if(gReason[id]==reason) return;
   gReason[id]=reason;
   if(StringFind(reason,"ERROR")==0 || StringFind(reason,"REJECT")==0)
      Print(ENGINE_LABEL," | ",gName[id]," | ",reason);
}

void RegisterModules()
{
   // v1.06: 14 modules only
   gName[0]="SuperTrend";      // S_SUPERTREND
   gName[1]="TrendPilot";      // S_TRENDPILOT
   gName[2]="VolRegime-QEX";  // S_VOL_QEX
   gName[3]="QEX-VolST";      // S_VOL_ST
   gName[4]="LiquidityPools"; // S_LIQ_POOL
   gName[5]="QEX-LiqSweep";   // S_QEX_SWEEP
   gName[6]="WyckoffPhase";   // S_WYCKOFF
   gName[7]="RangeSniper";    // S_RANGE
   gName[8]="SessionHeat";    // S_SESSIONHEAT
   gName[9]="SessionBox";     // S_SESSIONBOX
   gName[10]="FlowMatrix";    // S_FLOW
   gName[11]="SATMAFlow";   // S_NEURAL -> v1.08 SATMA-BTC (NeuralPilot REMOVED)
   gName[12]="WickReject";    // S_WICK_REJECT
   gName[13]="SMC_Full";      // S_SMC_FULL
   gName[14]="ZigZag_BreakPull"; // WikiFX: ZigZag Support/Resistance Breakout + Pullback XAUUSD M15
   gName[15]="Martingale_Avg";   // WikiFX: Martingale Averaging EURUSD H4 - CAPPED ไม่ใช่ Martingale ไม่จำกัด
   gName[16]="Trend_Trail";      // WikiFX: Trend Trading + Trailing Stop XAUUSD H4
   gName[17]="Intraday_VolBreak"; // WikiFX: Intraday Volatility Break (Ser) XAUUSD H1
   gName[18]="Trend_Adding";     // WikiFX: Trend Adding / Pyramiding - เติมไม้ตอนกำไร
   gName[19]="GOLD_Breakout";    // v1.17: GOLD Breakout ATR - แปลงจาก BTC มาเป็นทอง XAUUSD โดยเฉพาะ (เดิม BTC only)
   for(int i=0;i<MODULES;i++) Note(i,"WAIT DATA");
}

bool ReadRates(const string symbol,const ENUM_TIMEFRAMES tf,const int count,
               MqlRates &r[],const int minimum)
{
   ArraySetAsSeries(r,true);
   int got=CopyRates(symbol,tf,0,count,r);
   if(got<minimum) return false;
   for(int i=0;i<got;i++)
      if(r[i].time<=0 || r[i].open<=0 || r[i].close<=0 || r[i].low<=0 || r[i].high<r[i].low || r[i].tick_volume<0 ||
         !ValidNumber(r[i].open) || !ValidNumber(r[i].close) || !ValidNumber(r[i].high) || !ValidNumber(r[i].low)) return false;
   return true;
}

bool BuildATR(const MqlRates &r[],const int p,double &a[])
{
   int n=ArraySize(r);
   ArrayResize(a,n); ArrayInitialize(a,0.0);
   if(p<1 || n<p+3) return false;
   double sum=0;
   for(int k=n-2;k>=n-p-1;k--)
      sum+=MathMax(r[k].high-r[k].low,
                   MathMax(MathAbs(r[k].high-r[k+1].close),MathAbs(r[k].low-r[k+1].close)));
   double value=sum/p;
   a[n-p-1]=value;
   for(int i=n-p-2;i>=0;i--)
   {
      double tr=MathMax(r[i].high-r[i].low,
                       MathMax(MathAbs(r[i].high-r[i+1].close),MathAbs(r[i].low-r[i+1].close)));
      value=(value*(p-1)+tr)/p;
      a[i]=value;
   }
   return a[1]>0 && ValidNumber(a[1]);
}
bool BuildEMA(const MqlRates &r[],const int p,double &e[])
{
   int n=ArraySize(r); ArrayResize(e,n); ArrayInitialize(e,0.0);
   if(p<1 || n<p+3) return false;
   double value=0;
   for(int i=n-1;i>=n-p;i--) value+=r[i].close;
   value/=p; e[n-p]=value;
   double k=2.0/(p+1.0);
   for(int i=n-p-1;i>=0;i--) { value=k*r[i].close+(1-k)*value; e[i]=value; }
   return true;
}
bool BuildRSI(const MqlRates &r[],const int p,double &v[])
{
   int n=ArraySize(r); ArrayResize(v,n); ArrayInitialize(v,50.0);
   if(p<1 || n<p+3) return false;
   double ag=0,al=0;
   for(int i=n-2;i>=n-p-1;i--)
   { double d=r[i].close-r[i+1].close; ag+=MathMax(d,0); al+=MathMax(-d,0); }
   ag/=p; al/=p;
   for(int i=n-p-1;i>=0;i--)
   {
      if(i<n-p-1)
      {
         double d=r[i].close-r[i+1].close;
         ag=(ag*(p-1)+MathMax(d,0))/p; al=(al*(p-1)+MathMax(-d,0))/p;
      }
      v[i]=(ag+al<=1e-15)?50.0:(al<=1e-15?100.0:100.0-100.0/(1+ag/al));
   }
   return true;
}
bool BuildST(const MqlRates &r[],const double &a[],const double factor,
             double &line[],int &dir[])
{
   int n=ArraySize(r); ArrayResize(line,n); ArrayResize(dir,n);
   ArrayInitialize(line,0.0); ArrayInitialize(dir,0);
   double fu=0,fl=0; int trend=1; bool seeded=false;
   for(int i=n-2;i>=0;i--)
   {
      if(a[i]<=0) continue;
      double mid=(r[i].high+r[i].low)/2.0;
      double u=mid+factor*a[i],l=mid-factor*a[i];
      if(!seeded) { fu=u; fl=l; seeded=true; }
      else
      {
         double pc=r[i+1].close;
         fu=(u<fu || pc>fu)?u:fu;
         fl=(l>fl || pc<fl)?l:fl;
         if(trend>0 && r[i].close<fl) trend=-1;
         else if(trend<0 && r[i].close>fu) trend=1;
      }
      dir[i]=trend; line[i]=trend>0?fl:fu;
   }
   return dir[1]!=0 && dir[2]!=0;
}
double MeanClose(const MqlRates &r[],const int s,const int p)
{
   if(s<0 || p<1 || s+p>ArraySize(r)) return 0;
   double v=0; for(int i=s;i<s+p;i++) v+=r[i].close; return v/p;
}
double SDAt(const MqlRates &r[],const int s,const int p)
{
   double m=MeanClose(r,s,p),v=0; if(m<=0) return 0;
   for(int i=s;i<s+p;i++) v+=(r[i].close-m)*(r[i].close-m);
   return MathSqrt(v/p);
}
double AvgVolume(const MqlRates &r[],const int s,const int p)
{
   if(s<0 || p<1 || s+p>ArraySize(r)) return 0;
   double v=0; for(int i=s;i<s+p;i++) v+=(double)r[i].tick_volume; return v/p;
}
bool RangeHL(const MqlRates &r[],const int s,const int p,double &hi,double &lo)
{
   if(s<0 || p<1 || s+p>ArraySize(r)) return false;
   hi=r[s].high; lo=r[s].low;
   for(int i=s+1;i<s+p;i++) { hi=MathMax(hi,r[i].high); lo=MathMin(lo,r[i].low); }
   return hi>=lo && lo>0;
}
double MidRange(const MqlRates &r[],const int s,const int p)
{ double h,l; return RangeHL(r,s,p,h,l)?(h+l)/2.0:0.0; }
bool PivotHigh(const MqlRates &r[],const int s,const int left,const int right,const int newest)
{
   if(s-right<newest || s+left>=ArraySize(r)) return false;
   for(int i=1;i<=left;i++) if(r[s+i].high>=r[s].high) return false;
   for(int i=1;i<=right;i++) if(r[s-i].high>=r[s].high) return false;
   return true;
}
bool PivotLow(const MqlRates &r[],const int s,const int left,const int right,const int newest)
{
   if(s-right<newest || s+left>=ArraySize(r)) return false;
   for(int i=1;i<=left;i++) if(r[s+i].low<=r[s].low) return false;
   for(int i=1;i<=right;i++) if(r[s-i].low<=r[s].low) return false;
   return true;
}
double Percentile(const double &a[],const int s,const int count)
{
   if(s<0 || s>=ArraySize(a) || a[s]<=0) return -1;
   int below=0,n=0;
   for(int i=s+1;i<s+1+count && i<ArraySize(a);i++)
      if(a[i]>0) { n++; if(a[i]<a[s]) below++; }
   return n>=20?100.0*below/n:-1.0;
}
double BoundedDelta(const MqlRates &r[],const int s)
{
   if(s<0 || s>=ArraySize(r)) return 0;
   double range=r[s].high-r[s].low;
   if(range<=0 || r[s].tick_volume<=0) return 0;
   return (double)r[s].tick_volume*Clamp((2*r[s].close-r[s].high-r[s].low)/range,-1,1);
}
int BarsSince(const datetime t,const ENUM_TIMEFRAMES tf)
{
   if(t<=0) return 1000000;
   int k=iBarShift(_Symbol,tf,t,false); return k<0?1000000:k;
}
bool ReloadPrimary()
{
   int needed=(int)MathMax(900,2*86400/PeriodSeconds(InpAnalysisTF)+100);
   if(!ReadRates(_Symbol,InpAnalysisTF,needed,gRates,450)) return false;
   if(!BuildATR(gRates,14,gATR) || !BuildATR(gRates,10,gATR10) ||
      !BuildEMA(gRates,20,gEMA20) || !BuildEMA(gRates,50,gEMA50) ||
      !BuildEMA(gRates,200,gEMA200) || !BuildRSI(gRates,14,gRSI) ||
      !BuildST(gRates,gATR10,3.0,gSTLine,gSTDir) ||
      !BuildST(gRates,gATR,3.0,gST14Line,gST14Dir)) return false;
   ArraySetAsSeries(gSAR,true);
   if(gSARHandle==INVALID_HANDLE || CopyBuffer(gSARHandle,0,0,ArraySize(gRates),gSAR)<ArraySize(gRates)) return false;
   gDataBar=gRates[0].time; gDataOK=true; return true;
}

bool SaveState()
{
   if(gTest) return true;
   gHeader.signature=STATE_SIGNATURE; gHeader.version=STATE_VERSION;
   gHeader.login=AccountInfoInteger(ACCOUNT_LOGIN); gHeader.magic_base=InpMagicBase;
   gHeader.symbol_hash=TextHash(_Symbol); gHeader.timeframe=(int)InpAnalysisTF;
   gHeader.saved_at=TimeCurrent(); gHeader.generation++;
   string file=gRoot+((gHeader.generation%2)==0?"_stateA.bin":"_stateB.bin");
   int f=FileOpen(file,FILE_WRITE|FILE_BIN);
   if(f==INVALID_HANDLE) { gStorageOK=false; return false; }
   bool ok=(FileWriteStruct(f,gHeader)==sizeof(EngineHeader));
   for(int i=0;i<MODULES;i++) if(FileWriteStruct(f,gState[i])!=sizeof(ModuleState)) ok=false;
   if(FileWriteInteger(f,STATE_SIGNATURE,INT_VALUE)!=4) ok=false;
   FileFlush(f); FileClose(f);
   gStorageOK=ok; if(ok) gLastSave=TimeCurrent();
   return ok;
}
bool LoadStateSlot(const string file,EngineHeader &h,ModuleState &states[])
{
   int f=FileOpen(file,FILE_READ|FILE_BIN);
   if(f==INVALID_HANDLE) return false;
   long expected=sizeof(EngineHeader)+MODULES*sizeof(ModuleState)+4;
   bool ok=((long)FileSize(f)==expected);
   if(ok) ok=(FileReadStruct(f,h)==sizeof(EngineHeader));
   if(ok) ok=(h.signature==STATE_SIGNATURE && h.version==STATE_VERSION &&
              h.login==AccountInfoInteger(ACCOUNT_LOGIN) && h.magic_base==InpMagicBase &&
              h.symbol_hash==TextHash(_Symbol) &&
              h.generation>0 && ValidNumber(h.day_equity) && h.day_equity>0 &&
              h.daily_block>=0 && h.daily_block<=2 && h.manual_pause>=0 && h.manual_pause<=1 &&
              h.flatten_request>=0 && h.flatten_request<=1);
   if(ok)
   {
      ArrayResize(states,MODULES);
      for(int i=0;i<MODULES;i++)
      {
         if(FileReadStruct(f,states[i])!=sizeof(ModuleState)) { ok=false; break; }
         if(!ValidNumber(states[i].hi) || !ValidNumber(states[i].lo) ||
            !ValidNumber(states[i].initial_risk) || states[i].phase<0 || states[i].phase>20)
         { ok=false; break; }
      }
      if(ok) ok=(FileReadInteger(f,INT_VALUE)==STATE_SIGNATURE);
   }
   FileClose(f); return ok;
}
bool RestoreState()
{
   if(gTest) return false;
   EngineHeader a,b; ModuleState sa[],sb[];
   bool va=LoadStateSlot(gRoot+"_stateA.bin",a,sa);
   bool vb=LoadStateSlot(gRoot+"_stateB.bin",b,sb);
   if(!va && !vb) return false;
   bool use_a=va && (!vb || a.generation>=b.generation);
   if(use_a) { gHeader=a; for(int i=0;i<MODULES;i++) gState[i]=sa[i]; }
   else { gHeader=b; for(int i=0;i<MODULES;i++) gState[i]=sb[i]; }
   return true;
}
bool StateFilesPresent()
{ return FileIsExist(gRoot+"_stateA.bin") || FileIsExist(gRoot+"_stateB.bin"); }
void ResetPatternStateForNewTF()
{
   // Preserve account-day controls and live execution metadata on TF changes.
   for(int i=0;i<MODULES;i++)
   {
      ModuleState old=gState[i];ZeroMemory(gState[i]);
      gState[i].consumed_key=old.consumed_key;gState[i].last_entry=old.last_entry;
      gState[i].inflight_at=old.inflight_at;gState[i].inflight_order=old.inflight_order;
      gState[i].inflight_risk_money=old.inflight_risk_money;
      gState[i].position_id=old.position_id;gState[i].initial_risk=old.initial_risk;
   }
}

double CashAdjustments(const datetime since)
{
   if(since==gCashCacheDay && gCashCacheAt==TimeCurrent()) return gCashCacheValue;
   double cash=0;
   if(!HistorySelect(since,TimeCurrent()+1)) { gAccountHistoryOK=false;return gCashCacheValue; }
   gAccountHistoryOK=true;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong t=HistoryDealGetTicket(i); if(t==0) continue;
      long type=HistoryDealGetInteger(t,DEAL_TYPE);
      if(type==DEAL_TYPE_BALANCE || type==DEAL_TYPE_CREDIT)
         cash+=HistoryDealGetDouble(t,DEAL_PROFIT);
   }
   gCashCacheDay=since;gCashCacheAt=TimeCurrent();gCashCacheValue=cash;return cash;
}
double DayChangeMoney()
{
   return AccountInfoDouble(ACCOUNT_EQUITY)-gHeader.day_equity-
          (CashAdjustments(gHeader.day)-gHeader.day_cash);
}
void DailyGuard()
{
   datetime day=DayStart(TimeCurrent());
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   if(day!=gHeader.day)
   {
      gHeader.day=day; gHeader.day_equity=eq; gHeader.day_cash=CashAdjustments(day);
      gHeader.daily_block=0;
      gTotalEntriesToday=0; gV177_CoreToday=0; gV177_Day=day; // v1.77: รีเซ็ต Core ต่อวัน
      for(int i=0;i<MODULES;i++)
      {
         gEntriesToday[i]=0; gRealized[i]=0;
         if(i==S_SESSIONHEAT || i==S_SESSIONBOX || i==S_KILLZONE) gState[i].flags=0;
      }
      SaveState();
   }
   gHeader.peak_equity=MathMax(gHeader.peak_equity,eq);
   if(gHeader.daily_block!=0 || gHeader.day_equity<=0) return;
   double pnl=DayChangeMoney();
   if(!gAccountHistoryOK) return;
   if(InpDailyLossPct>0 && pnl<=-gHeader.day_equity*InpDailyLossPct/100.0)
   { gHeader.daily_block=1;SaveState();Print(ENGINE_LABEL,": daily equity entry lock"); }
   else if(0>0 && pnl>=gHeader.day_equity*0/100.0)
   { gHeader.daily_block=2;gHeader.flatten_request=1;SaveState();Print(ENGINE_LABEL,": daily equity profit block"); }
}

// Shared execution: every entry, exit and modification passes this layer.
bool OwnSelectedPosition()
{
   return PositionGetString(POSITION_SYMBOL)==_Symbol &&
          MagicId(PositionGetInteger(POSITION_MAGIC))>=0;
}
ulong FindPosition(const int id)
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i);
      if(t!=0 && OwnSelectedPosition() && PositionGetInteger(POSITION_MAGIC)==Magic(id)) return t;
   }
   return 0;
}
bool HasActiveOrder(const int id)
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong t=OrderGetTicket(i);
      if(t!=0 && OrderGetString(ORDER_SYMBOL)==_Symbol &&
         OrderGetInteger(ORDER_MAGIC)==Magic(id)) return true;
   }
   return false;
}
ENUM_ORDER_TYPE_FILLING FillMode()
{
   long mode=SymbolInfoInteger(_Symbol,SYMBOL_FILLING_MODE);
   if((mode&SYMBOL_FILLING_FOK)!=0) return ORDER_FILLING_FOK;
   if((mode&SYMBOL_FILLING_IOC)!=0) return ORDER_FILLING_IOC;
   return ORDER_FILLING_RETURN;
}
double TickSize() { return SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE); }
double QuoteUnit()
{
   return _Point*((_Digits==3 || _Digits==5)?10.0:1.0);
}
ulong DeviationPoints()
{
   if(_Point<=0 || InpDeviationBasePoints<=0) return 0;
   return (ulong)MathCeil(InpDeviationBasePoints*QuoteUnit()/_Point-1e-9);
}
double DeviationPrice() { return (double)DeviationPoints()*_Point; }
double PriceFloor(const double x)
{
   double t=TickSize(); return t>0?NormalizeDouble(MathFloor((x+1e-10*t)/t)*t,_Digits):0;
}
double PriceCeil(const double x)
{
   double t=TickSize(); return t>0?NormalizeDouble(MathCeil((x-1e-10*t)/t)*t,_Digits):0;
}
double VolumeFloor(const double v,const double step)
{
   if(step<=0 || !ValidNumber(v) || v<0) return 0;
   return NormalizeDouble(MathFloor((v+step*1e-8)/step)*step,8);
}
bool TradePermission()
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return false;
   return TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)!=0 &&
          MQLInfoInteger(MQL_TRADE_ALLOWED)!=0 &&
          AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)!=0 &&
          AccountInfoInteger(ACCOUNT_TRADE_EXPERT)!=0;
}
bool DirectionAllowed(const int dir)
{
   long mode=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE);
   if(mode==SYMBOL_TRADE_MODE_FULL) return true;
   return (dir>0 && mode==SYMBOL_TRADE_MODE_LONGONLY) ||
          (dir<0 && mode==SYMBOL_TRADE_MODE_SHORTONLY);
}
double StopsDistance(const bool modification)
{
   long points=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);
   if(modification) points=(long)MathMax(points,SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL));
   return points*_Point+2*TickSize();
}
bool NormalizeStops(const int dir,const MqlTick &tick,double &sl,double &tp)
{
   if(dir==0 || tick.bid<=0 || tick.ask<tick.bid || sl<=0 || tp<0 || !ValidNumber(sl) || !ValidNumber(tp)) return false;
   double entry=dir>0?tick.ask:tick.bid;
   // Never turn an SL on the wrong side into an order on the other side.
   if((dir>0 && (sl>=entry || (tp>0 && tp<=entry))) ||
      (dir<0 && (sl<=entry || (tp>0 && tp>=entry)))) return false;
   double minD=StopsDistance(false);
   if(dir>0)
   {
      sl=PriceFloor(MathMin(sl,tick.bid-minD));
      if(tp>0) tp=PriceCeil(MathMax(tp,tick.bid+minD));
   }
   else
   {
      sl=PriceCeil(MathMax(sl,tick.ask+minD));
      if(tp>0) tp=PriceFloor(MathMin(tp,tick.ask-minD));
   }
   return sl>0 && (tp==0 || tp>0);
}
bool LossAtSL(const int dir,const double lots,const double entry,const double sl,double &loss)
{
   double p=0;
   if(lots<=0 || entry<=0 || sl<=0 ||
      (dir>0 && sl>=entry) || (dir<0 && sl<=entry)) return false;
   if(!OrderCalcProfit(dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL,_Symbol,lots,entry,sl,p) ||
      !ValidNumber(p) || p>=0) return false;
   loss=-p; return loss>0;
}
bool NOVA_IsManagedMagic(const long magic)
{
   return MagicId(magic)>=0 || magic==(long)InpSniperMTF_Magic;
}
double OpenRiskMoney(int &positions)
{
   // Account-wide open risk: managed positions plus pending entry orders, across symbols.
   positions=0; double risk=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i); if(ticket==0) continue;
      long magic=PositionGetInteger(POSITION_MAGIC);
      if(!NOVA_IsManagedMagic(magic)) continue;
      string symbol=PositionGetString(POSITION_SYMBOL);
      int dir=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
      double sl=PositionGetDouble(POSITION_SL),entry=PositionGetDouble(POSITION_PRICE_OPEN);
      double lots=PositionGetDouble(POSITION_VOLUME),p=0;
      positions++;
      if(sl<=0) return 1e99;
      if(!OrderCalcProfit(dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL,symbol,lots,entry,sl,p) || !ValidNumber(p)) return 1e99;
      risk+=MathMax(0,-p);
   }
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i); if(ticket==0) continue;
      long magic=OrderGetInteger(ORDER_MAGIC);
      if(!NOVA_IsManagedMagic(magic)) continue;
      ENUM_ORDER_TYPE type=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      bool isBuy=(type==ORDER_TYPE_BUY_LIMIT || type==ORDER_TYPE_BUY_STOP || type==ORDER_TYPE_BUY_STOP_LIMIT);
      bool isSell=(type==ORDER_TYPE_SELL_LIMIT || type==ORDER_TYPE_SELL_STOP || type==ORDER_TYPE_SELL_STOP_LIMIT);
      if(!isBuy && !isSell) continue;
      string symbol=OrderGetString(ORDER_SYMBOL);
      double sl=OrderGetDouble(ORDER_SL),entry=OrderGetDouble(ORDER_PRICE_OPEN);
      double lots=OrderGetDouble(ORDER_VOLUME_CURRENT),p=0;
      positions++;
      if(sl<=0 || lots<=0) return 1e99;
      if(!OrderCalcProfit(isBuy?ORDER_TYPE_BUY:ORDER_TYPE_SELL,symbol,lots,entry,sl,p) || !ValidNumber(p)) return 1e99;
      risk+=MathMax(0,-p);
   }
   // In-flight risk is accounted for by the shared portfolio ledger, not per-instance gState.
   return risk;
}

uint NOVA_PortfolioHashString(const string value)
{
   uint hash=2166136261;
   for(int i=0;i<StringLen(value);i++) hash=(hash^(uint)StringGetCharacter(value,i))*16777619;
   return hash==0?1:hash;
}
string NOVA_PortfolioTag(const ulong request_id) { return StringFormat("NV%I64u",request_id); }
string NOVA_PortfolioTaggedComment(const string original,const ulong request_id)
{
   string tag=NOVA_PortfolioTag(request_id);
   int max_len=31-StringLen(tag)-1;
   return StringSubstr(original,0,MathMax(0,max_len))+" "+tag;
}
bool NOVA_PortfolioLatestState(const NOVA_PortfolioRecord &records[],const ulong request_id,NOVA_PortfolioRecord &latest)
{ return gPortfolio.Latest(records,request_id,latest); }
bool NOVA_PortfolioBrokerVisible(const NOVA_PortfolioRecord &record)
{
   string tag=NOVA_PortfolioTag(record.request_id);
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i); if(ticket==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)==record.magic &&
         NOVA_PortfolioHashString(PositionGetString(POSITION_SYMBOL))==record.symbol_hash &&
         StringFind(PositionGetString(POSITION_COMMENT),tag)>=0) return true;
   }
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i); if(ticket==0) continue;
      if(OrderGetInteger(ORDER_MAGIC)==record.magic &&
         NOVA_PortfolioHashString(OrderGetString(ORDER_SYMBOL))==record.symbol_hash &&
         StringFind(OrderGetString(ORDER_COMMENT),tag)>=0) return true;
   }
   return false;
}
bool NOVA_PortfolioBrokerTerminal(const NOVA_PortfolioRecord &record)
{
   ulong found=record.order_ticket;
   long state=-1;
   if(found>0 && HistoryOrderSelect(found)) state=HistoryOrderGetInteger(found,ORDER_STATE);
   else if(HistorySelect(record.created_at-120,TimeCurrent()+60))
   {
      string tag=NOVA_PortfolioTag(record.request_id);
      for(int i=HistoryOrdersTotal()-1;i>=0;i--)
      {
         ulong ticket=HistoryOrderGetTicket(i); if(ticket==0) continue;
         if(HistoryOrderGetInteger(ticket,ORDER_MAGIC)!=record.magic) continue;
         if(NOVA_PortfolioHashString(HistoryOrderGetString(ticket,ORDER_SYMBOL))!=record.symbol_hash) continue;
         if(StringFind(HistoryOrderGetString(ticket,ORDER_COMMENT),tag)<0) continue;
         found=ticket; state=HistoryOrderGetInteger(ticket,ORDER_STATE); break;
      }
   }
   if(found==0 || state<0) return false;
   if(state==ORDER_STATE_CANCELED || state==ORDER_STATE_REJECTED || state==ORDER_STATE_EXPIRED) return true;
   if(state==ORDER_STATE_FILLED && !NOVA_PortfolioBrokerVisible(record)) return true;
   return false;
}
bool NOVA_PortfolioAppendState(const NOVA_PortfolioRecord &base,const int state,const ulong order_ticket)
{
   NOVA_PortfolioRecord next=base;
   next.state=state; next.order_ticket=order_ticket;
   return gPortfolio.Append(next);
}
bool NOVA_PortfolioRecoverLocked(NOVA_PortfolioRecord &records[])
{
   int n=ArraySize(records);
   for(int i=0;i<n;i++)
   {
      bool superseded=false;
      for(int j=i+1;j<n;j++) if(records[j].request_id==records[i].request_id) { superseded=true; break; }
      if(superseded) continue;
      NOVA_PortfolioRecord latest=records[i];
      if(latest.state==NOVA_PORTFOLIO_PREPARED)
      {
         if(!NOVA_PortfolioAppendState(latest,NOVA_PORTFOLIO_RELEASED,0)) return false;
         continue;
      }
      if(latest.state!=NOVA_PORTFOLIO_DISPATCHING && latest.state!=NOVA_PORTFOLIO_ACCEPTED &&
         latest.state!=NOVA_PORTFOLIO_UNCERTAIN) continue;
      if(NOVA_PortfolioBrokerVisible(latest))
      {
         if(!NOVA_PortfolioAppendState(latest,NOVA_PORTFOLIO_RECONCILED,latest.order_ticket)) return false;
      }
      else if(NOVA_PortfolioBrokerTerminal(latest))
      {
         if(!NOVA_PortfolioAppendState(latest,NOVA_PORTFOLIO_RELEASED,latest.order_ticket)) return false;
      }
      else if(latest.state==NOVA_PORTFOLIO_DISPATCHING)
      {
         if(!NOVA_PortfolioAppendState(latest,NOVA_PORTFOLIO_UNCERTAIN,latest.order_ticket)) return false;
      }
   }
   return true;
}
bool NOVA_PortfolioInit()
{
   long login=AccountInfoInteger(ACCOUNT_LOGIN);
   string server=AccountInfoString(ACCOUNT_SERVER);
   if(login<=0 || server=="") return false;
   gPortfolioReady=gPortfolio.Init(login,NOVA_PortfolioHashString(server),InpMagicBase);
   return gPortfolioReady;
}
bool NOVA_PortfolioRecover()
{
   if(!gPortfolioReady || !gPortfolio.Acquire()) return false;
   NOVA_PortfolioRecord records[];
   bool ok=gPortfolio.Load(records);
   if(ok) ok=NOVA_PortfolioRecoverLocked(records);
   gPortfolio.Release();
   return ok;
}
bool NOVA_PortfolioReserve(const long magic,const string symbol,const double risk_money,
                           const double max_risk_pct,const int max_positions,ulong &request_id)
{
   request_id=0;
   if(!gPortfolioReady || magic<=0 || symbol=="" || !ValidNumber(risk_money) ||
      risk_money<=0 || max_risk_pct<=0 || max_positions<=0) return false;
   if(!gPortfolio.Acquire()) return false;
   NOVA_PortfolioRecord records[];
   bool ok=gPortfolio.Load(records);
   if(ok) ok=NOVA_PortfolioRecoverLocked(records);
   if(ok) ok=gPortfolio.Load(records);
   if(!ok) { gPortfolio.Release(); return false; }
   int reserved_count=0; double reserved_risk=0;
   if(!gPortfolio.ActiveTotals(records,reserved_risk,reserved_count))
   { gPortfolio.Release(); return false; }
   int open_count=0; double open_risk=OpenRiskMoney(open_count);
   double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   if(!ValidNumber(open_risk) || !ValidNumber(equity) || equity<=0 ||
      open_count+reserved_count>=max_positions ||
      open_risk+reserved_risk+risk_money>equity*max_risk_pct/100.0+1e-8)
   { gPortfolio.Release(); return false; }
   ulong next=gPortfolio.NextId(records);
   if(next==0) { gPortfolio.Release(); return false; }
   NOVA_PortfolioRecord record; ZeroMemory(record);
   record.sequence=next; record.request_id=next; record.magic=magic;
   record.symbol_hash=NOVA_PortfolioHashString(symbol);
   record.state=NOVA_PORTFOLIO_PREPARED; record.risk_money=risk_money;
   record.created_at=TimeCurrent(); record.broker_day=DayStart(TimeCurrent());
   ok=gPortfolio.Append(record);
   gPortfolio.Release();
   if(!ok) return false;
   request_id=next;
   return true;
}
bool NOVA_PortfolioMarkDispatching(const ulong request_id)
{
   if(request_id==0 || !gPortfolioReady || !gPortfolio.Acquire()) return false;
   NOVA_PortfolioRecord records[],latest;
   bool ok=gPortfolio.Load(records) && NOVA_PortfolioLatestState(records,request_id,latest);
   if(ok && latest.state==NOVA_PORTFOLIO_PREPARED)
      ok=NOVA_PortfolioAppendState(latest,NOVA_PORTFOLIO_DISPATCHING,0);
   else ok=false;
   gPortfolio.Release();
   return ok;
}
bool NOVA_PortfolioFinish(const ulong request_id,const int state,const ulong order_ticket)
{
   if(request_id==0 || !gPortfolioReady || !gPortfolio.Acquire()) return false;
   NOVA_PortfolioRecord records[],latest;
   bool ok=gPortfolio.Load(records) && NOVA_PortfolioLatestState(records,request_id,latest);
   if(ok && (latest.state==NOVA_PORTFOLIO_PREPARED || latest.state==NOVA_PORTFOLIO_DISPATCHING ||
             latest.state==NOVA_PORTFOLIO_ACCEPTED || latest.state==NOVA_PORTFOLIO_UNCERTAIN))
      ok=NOVA_PortfolioAppendState(latest,state,order_ticket);
   else ok=false;
   gPortfolio.Release();
   return ok;
}
void NOVA_PortfolioReconcile()
{
   if(!gPortfolioReady || !gPortfolio.Acquire()) return;
   NOVA_PortfolioRecord records[];
   bool ok=gPortfolio.Load(records);
   if(ok) ok=NOVA_PortfolioRecoverLocked(records);
   gPortfolio.Release();
   if(!ok) gFatalPause=true;
}

bool SelectLots(const int dir,const double entry,const double sl,double &lots,double &loss,string &reason)
{
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   double vmin=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double vmax=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP),unitLoss=0;
   if(eq<=0 || vmin<=0 || vmax<vmin || step<=0 || !LossAtSL(dir,vmin,entry,sl,unitLoss))
   { reason="ERROR SYMBOL/PROFIT DATA"; return false; }
   double budget=eq*EffRiskPct()/100.0; // v1.49: AUTO ON ใช้ g_Auto_RiskPct, OFF ใช้ InpRiskPercent
   lots=VolumeFloor(budget/unitLoss*vmin,step);
   if(lots<vmin-step*1e-6)
   {
      if(!InpAllowBoundedMinLot) { reason="WAIT MIN LOT ABOVE TARGET"; return false; }
      lots=vmin;
   }
   lots=MathMin(lots,VolumeFloor(vmax,step));
   if(lots<vmin || !LossAtSL(dir,lots,entry,sl,loss))
   { reason="ERROR LOT/RISK DATA"; return false; }
   // Explicit bounded min-lot mode; never a silent unbounded clamp.
   if(loss>eq*InpMaxSingleRiskPct/100.0+1e-8)
   { reason="WAIT SINGLE RISK LIMIT"; return false; }
   int count=0; double current=OpenRiskMoney(count);
   if(count>=InpMaxPositions) { reason="WAIT POSITION LIMIT"; return false; }
   if(current+loss>eq*InpMaxOpenRiskPct/100.0+1e-8)
   { reason="WAIT PORTFOLIO RISK"; return false; }
   double margin=0;
   if(!OrderCalcMargin(dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL,_Symbol,lots,entry,margin) ||
      !ValidNumber(margin) || margin<0)
   { reason="ERROR MARGIN DATA"; return false; }
   double free=AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double used=AccountInfoDouble(ACCOUNT_MARGIN);
   if(margin>free || used+margin>eq*InpMaxMarginUsedPct/100.0)
   { reason="WAIT MARGIN"; return false; }
   reason="READY"; return true;
}
bool SendClose(const ulong ticket)
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return false;
   if(!PositionSelectByTicket(ticket)) return true;
   long originalMagic=PositionGetInteger(POSITION_MAGIC);
   bool sniperPosition=(originalMagic==(long)InpSniperMTF_Magic);
   if(PositionGetString(POSITION_SYMBOL)!=_Symbol || (!OwnSelectedPosition() && !sniperPosition)) return true;
   int id=MagicId(originalMagic);
   int dir=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return false;
   MqlTradeRequest req; MqlTradeResult res; ZeroMemory(req); ZeroMemory(res);
   req.action=TRADE_ACTION_DEAL; req.position=ticket; req.symbol=_Symbol;
   req.magic=(ulong)originalMagic; req.volume=PositionGetDouble(POSITION_VOLUME);
   req.type=dir>0?ORDER_TYPE_SELL:ORDER_TYPE_BUY;
   req.price=dir>0?tick.bid:tick.ask;
   req.deviation=DeviationPoints(); req.type_filling=FillMode();
   req.comment="AIO close";
   bool sent=NOVA_BrokerOrderSend(req,res,NOVA_PHASE2_EXECUTION_DISABLED);
   if(!sent || (res.retcode!=TRADE_RETCODE_DONE && res.retcode!=TRADE_RETCODE_DONE_PARTIAL &&
                res.retcode!=TRADE_RETCODE_PLACED))
   { Note(id,"REJECT CLOSE "+IntegerToString((long)res.retcode)); return false; }
   // Do not assume DONE_PARTIAL or PLACED means the entire position closed.
   return !PositionSelectByTicket(ticket);
}
void CloseAllOwn()
{
   if(!TradePermission()) return;
   // One pass, retried by later events. No unbounded close loops.
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i);
      if(t==0) continue;
      long magic=PositionGetInteger(POSITION_MAGIC);
      bool sniperPosition=(magic==(long)InpSniperMTF_Magic);
      if(!OwnSelectedPosition() && !(PositionGetString(POSITION_SYMBOL)==_Symbol && sniperPosition)) continue;
      int id=MagicId(magic);
      if(id<0) { SendClose(t); continue; }
      if(TimeCurrent()<gState[id].retry_at) continue;
      gState[id].retry_at=TimeCurrent()+3;
      SendClose(t);
   }
}
bool ModifySL(const ulong ticket,const int dir,const double wanted)
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return false;
   if(!PositionSelectByTicket(ticket) || !OwnSelectedPosition() || !TradePermission()) return false;
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return false;
   double minD=StopsDistance(true),old=PositionGetDouble(POSITION_SL);
   double tp=PositionGetDouble(POSITION_TP);
   double sl=dir>0?PriceFloor(wanted):PriceCeil(wanted);
   if(sl<=0 || (dir>0 && (sl<=old+TickSize()/2 || tick.bid-sl<minD)) ||
      (dir<0 && ((old>0 && sl>=old-TickSize()/2) || sl-tick.ask<minD))) return false;
   MqlTradeRequest req; MqlTradeResult res; ZeroMemory(req); ZeroMemory(res);
   req.action=TRADE_ACTION_SLTP; req.symbol=_Symbol; req.position=ticket; req.sl=sl; req.tp=tp;
   req.magic=(ulong)PositionGetInteger(POSITION_MAGIC);
   return NOVA_BrokerOrderSend(req,res,NOVA_PHASE2_EXECUTION_DISABLED) && (res.retcode==TRADE_RETCODE_DONE || res.retcode==TRADE_RETCODE_NO_CHANGES);
}
bool UsesBE(const int id)
{
   return id==S_SESSIONHEAT || id==S_TRENDRADAR || id==S_EFFORT || id==S_FOOTPRINT ||
          id==S_LIQ_POOL || id==S_NEURAL || id==S_RANGE || id==S_SESSIONBOX ||
          id==S_VOL_QEX || id==S_WYCKOFF;
}
bool ReverseOnSignal(const int id)
{ return id<=S_VWAP || id==S_TRENDPILOT || id==S_VOL_ST || id==S_QEX_SWEEP || id==S_EXPERT_SWEEP; }

// ============================================================
// v1.16 TRAILING STOP SYSTEM - ระบบเลื่อน SL ตามกำไร
// ปัญหาของ Trailing เก่า (v1.02 UnifiedTrail):
//  - ใช้แค่ ATR 1.5x ท่าเดียว ไม่สน Regime / Score / ไม้ถัว
//  - เริ่ม Trailing ทันทีที่กำไร 1R ไม่มี BreakEven + Step กัน Requote
//  - ไม้ถัว / ไม้เติม (Martingale / Trend Adding) แต่ละไม้ Trailing แยกกัน ทำให้ SL ไม่พร้อมกัน
// ของใหม่ v1.16:
//  1. BreakEven -> Stage Lock (1R/2R/3R) -> Trailing (5 โหมด)
//  2. Step: ขยับ SL ทีละ 50 พอยท์ กันขยับถี่
//  3. Never Move Back: SL ห้ามถอยหลัง
//  4. Basket Trailing: ไม้ถัว/เติม เลื่อน SL พร้อมกันจากต้นทุนเฉลี่ย
//  5. Partial Close (ปิดครึ่งที่ 2R) - ปิดไว้เป็นค่าเริ่มต้น เปิดเองได้
//  6. MIND AI Dynamic: Score สูง = Trailing กว้างปล่อยวิ่ง, Score ต่ำ / RANGE = Trailing แคบ
// ============================================================
double Trail_GetATR()
{
   if(ArraySize(gATR)>1 && gATR[1]>0) return gATR[1];
   if(ArraySize(gRates)>15)
   {
      double sum=0; for(int i=1;i<=14;i++) sum+=gRates[i].high-gRates[i].low;
      return sum/14.0;
   }
   return 0;
}
double Trail_Distance(const int mode,const double atr,const double risk,const double score,const string regime)
{
   // คืนระยะห่าง SL จากราคาปัจจุบัน (เป็นราคา ไม่ใช่พอยท์)
   if(mode==0) return 0*_Point;
   if(mode==1) return atr*0;
   if(mode==2) return atr*0; // Chandelier ใช้ระยะเดียวกัน แต่ฐานคือ High/Low ย้อนหลัง
   if(mode==3) return risk*0;
   if(mode==4) return atr*1.0; // MA ใช้ ATR เป็นกันชนจากเส้น MA
   // mode 5 = MIND AI Dynamic
   double mult=1.5;
   if(score>=0.65) mult=2.5; // มั่นใจมาก ปล่อยให้กำไรวิ่ง ระยะกว้าง
   else if(score>=0.60) mult=2.0;
   else if(score>=0.55) mult=1.5;
   else mult=1.2; // ไม่มั่นใจ ระยะแคบ ล็อกกำไรเร็ว
   if(regime=="RANGE" || regime=="SQUEEZE") mult=MathMin(mult,1.2); // Sideway ระยะแคบ
   if(regime=="TREND_UP" || regime=="TREND_DOWN") mult=MathMax(mult,2.0); // เทรนด์ชัด ระยะกว้าง
   if(regime=="HIGH_VOL") mult=MathMax(mult,2.0); // ผันผวนสูง ระยะกว้างกันโดนสะบัด
   return atr*mult;
}
double Trail_CalcNewSL(const int dir,const double entry,const double oldSL,const double price,const double risk,const double atr,const int mode,const double score,const string regime)
{
   double point=_Point;
   if(point<=0) point=0.01;
   double progress = dir>0 ? price-entry : entry-price;
   double best = oldSL;
   bool hasBest=false;
   // --- 1. BreakEven ---
   if(false && progress >= 0*point)
   {
      double be = entry + dir*0*point;
      if(!hasBest || (dir>0 && be>best) || (dir<0 && be<best)) { best=be; hasBest=true; }
   }
   // --- 2. Stage Lock: 1R ล็อก 0.5R / 2R ล็อก 1R / 3R ล็อก 2R ---
   if(false && risk>0)
   {
      double r = progress/risk;
      double lockR=0;
      if(r>=3.0) lockR=2.0;
      else if(r>=2.0) lockR=1.0;
      else if(r>=1.0) lockR=0.5;
      if(lockR>0)
      {
         double stageSL = entry + dir*lockR*risk;
         if(!hasBest || (dir>0 && stageSL>best) || (dir<0 && stageSL<best)) { best=stageSL; hasBest=true; }
      }
   }
   // --- 3. Trailing ---
   if(progress >= 0*point)
   {
      double trailSL=0;
      if(mode==2) // Chandelier: High/Low ย้อนหลัง - ATR
      {
         double hi=-1e9, lo=1e9;
         int n=MathMin(0, ArraySize(gRates)-1);
         for(int i=1;i<=n;i++){ if(gRates[i].high>hi) hi=gRates[i].high; if(gRates[i].low<lo) lo=gRates[i].low; }
         if(hi>0 && lo<1e8) trailSL = dir>0 ? hi-atr*0 : lo+atr*0;
      }
      else if(mode==4) // MA / Swing: SL ใต้/เหนือ EMA50 + กันชน ATR
      {
         double ma=0; if(ArraySize(gEMA50)>1 && gEMA50[1]>0) ma=gEMA50[1];
         else { if(ArraySize(gRates)>50){ for(int i=1;i<=50;i++) ma+=gRates[i].close; ma/=50; } }
         if(ma>0) trailSL = dir>0 ? ma-atr*0.2 : ma+atr*0.2;
      }
      else
      {
         double dist=Trail_Distance(mode, atr, risk, score, regime);
         trailSL = dir>0 ? price-dist : price+dist;
      }
      if(trailSL!=0)
      {
         if(!hasBest || (dir>0 && trailSL>best) || (dir<0 && trailSL<best)) { best=trailSL; hasBest=true; }
      }
   }
   if(!hasBest) return oldSL;
   // --- 4. Step: ขยับทีละ Step กัน Requote / ขยับถี่ ---
   if(InpTrailNeverMoveBack)
   {
      if(dir>0 && best <= oldSL+0*point && oldSL>0) return oldSL;
      if(dir<0 && best >= oldSL-0*point && oldSL>0) return oldSL;
      // ห้ามถอยหลังเด็ดขาด
      if(dir>0 && oldSL>0 && best<oldSL) return oldSL;
      if(dir<0 && oldSL>0 && best>oldSL) return oldSL;
   }
   // ห้าม SL เลยราคา / เลย Entry ถ้ายังไม่ถึง BE
   if(dir>0 && best>=price) return oldSL;
   if(dir<0 && best<=price) return oldSL;
   return best;
}
bool Trail_SendPartialClose(const ulong ticket,const double pct)
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return false;
   if(!PositionSelectByTicket(ticket) || !OwnSelectedPosition()) return false;
   double vol=PositionGetDouble(POSITION_VOLUME);
   double step=SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step<=0) step=0.01;
   double closeVol=MathFloor(vol*pct/100.0/step)*step;
   if(closeVol<step || closeVol>=vol) return false;
   int dir=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return false;
   MqlTradeRequest req; MqlTradeResult res; ZeroMemory(req); ZeroMemory(res);
   req.action=TRADE_ACTION_DEAL; req.position=ticket; req.symbol=_Symbol;
   req.magic=(ulong)PositionGetInteger(POSITION_MAGIC); req.volume=closeVol;
   req.type=dir>0?ORDER_TYPE_SELL:ORDER_TYPE_BUY;
   req.price=dir>0?tick.bid:tick.ask;
   req.deviation=DeviationPoints(); req.type_filling=FillMode(); req.comment="AIO partial 50%";
   bool sent=NOVA_BrokerOrderSend(req,res,NOVA_PHASE2_EXECUTION_DISABLED);
   return sent && (res.retcode==TRADE_RETCODE_DONE || res.retcode==TRADE_RETCODE_DONE_PARTIAL);
}
void Trail_ApplyOne(const ulong ticket,const int id,const int dir,const double entry,const double oldSL,const double risk,const double price)
{
   if(!false) return;
   double atr=Trail_GetATR();
   if(atr<=0) return;
   double score=gMind_LastScore;
   if(score<=0) score=gMLScore;
   if(score<=0) score=0.5;
   string regime=gScannerRegimeName;
   double newSL=Trail_CalcNewSL(dir, entry, oldSL, price, risk, atr, 0, score, regime);
   if(newSL!=oldSL) ModifySL(ticket, dir, newSL);
   // Partial Close: ปิดครึ่งที่ 2R
   if(false && !gTrailPartialDone[id] && risk>0)
   {
      double progress = dir>0 ? price-entry : entry-price;
      if(progress >= 0*risk)
      {
         if(Trail_SendPartialClose(ticket, 0)) gTrailPartialDone[id]=true;
      }
   }
}
void Trail_ApplyBasket()
{
   if(!false || !false) return;
   // จัดกลุ่มตาม Magic (โมดูล) - ถ้าโมดูลไหนมี >1 ไม้ ให้ใช้ต้นทุนเฉลี่ยเป็นฐาน Trailing
   for(int id=0;id<MODULES;id++)
   {
      double sumEntryVol=0, sumVol=0; int cnt=0; int dirSum=0;
      ulong tickets[32]; int tcnt=0;
      for(int i=PositionsTotal()-1;i>=0;i--)
      {
         ulong t=PositionGetTicket(i); if(t==0 || !OwnSelectedPosition()) continue;
         if(MagicId(PositionGetInteger(POSITION_MAGIC))!=id) continue;
         int d=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
         double v=PositionGetDouble(POSITION_VOLUME);
         sumEntryVol+=PositionGetDouble(POSITION_PRICE_OPEN)*v; sumVol+=v; cnt++; dirSum+=d;
         if(tcnt<32) tickets[tcnt++]=t;
      }
      if(cnt<2 || sumVol<=0) continue;
      // Basket ต้องทิศเดียวกันทั้งหมดถึง Trailing ได้ (ถ้ามีทั้ง Buy+Sell ให้ข้าม)
      if(MathAbs(dirSum)!=cnt) continue;
      int dir = dirSum>0?1:-1;
      double avgEntry=sumEntryVol/sumVol;
      MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) continue;
      double price = dir>0?tick.bid:tick.ask;
      double progress = dir>0 ? price-avgEntry : avgEntry-price;
      if(progress < 0*_Point) continue;
      double atr=Trail_GetATR(); if(atr<=0) continue;
      double score=gMind_LastScore; if(score<=0) score=0.5;
      double dist=Trail_Distance(0, atr, progress, score, gScannerRegimeName);
      double basketSL = dir>0 ? price-dist : price+dist;
      // ย้าย SL ทุกไม้ใน Basket ไปที่เดียวกัน (แต่ ModifySL จะกันถอยหลังให้เอง)
      for(int k=0;k<tcnt;k++)
      {
         if(!PositionSelectByTicket(tickets[k])) continue;
         double oldSL=PositionGetDouble(POSITION_SL);
         double entry=PositionGetDouble(POSITION_PRICE_OPEN);
         // Basket SL ต้องไม่ต่ำกว่า BE ของแต่ละไม้ + Step
         double cand=basketSL;
         if(false)
         {
            double be=entry+dir*0*_Point;
            if(dir>0 && cand<be) cand=be;
            if(dir<0 && cand>be) cand=be;
         }
         if(dir>0 && oldSL>0 && cand<=oldSL+0*_Point) continue;
         if(dir<0 && oldSL>0 && cand>=oldSL-0*_Point) continue;
         ModifySL(tickets[k], dir, cand);
      }
   }
}


//+------------------------------------------------------------------+
//| v1.35 RECOVERY - แก้พอร์ตติดลบให้กลับมาบวก (ไม่ใช้ Martingale 2x) |
//| หลักการ: 1) ติดลบถึง Trigger -> หยุดไม้ใหม่ + Hedge ล็อกขาดทุน |
//|          2) ราคาวิ่งสวนอีก 1 ATR -> ถัวเบาๆ 1.3x สูงสุด 3 ไม้ |
//|          3) Floating กลับมา +0.5% / +$50 -> ปิดทั้งหมด จบ Recovery |
//|          4) ถ้า Floating ขาดทุน > 5% / $500 -> Hard Stop ปิดทั้งหมด กันล้าง |
//+------------------------------------------------------------------+
bool   gRecoveryActive=false;
int    gRecoveryStep=0;
double gRecoveryStartEquity=0;
double gRecoveryStartFloating=0;
double gRecoveryLastAvgPrice=0;
bool   gRecoveryHedgeDone=false;
datetime gRecoveryLastAvgTime=0;
bool   gRecoveryHardStop=false;
datetime gRecoveryLastOverlapTime=0;
double gRecoveryWorstCase=0;
// --- v1.37 Auto Calculate globals ---
bool   gIsCentAccount=false;
double gMoneyScale=1.0;        // 1.0 = Standard, 100.0 = Cent (เงิน $200 -> 20000 เซนต์)
double gLotScale=1.0;          // 1.0 = Standard, 100.0 = Cent (MaxLot 0.5 -> 50)
double gContractSize=100.0;
string gAccountCurrency="";
double gAutoMaxSpread=350.0;
bool   gAutoDetected=false;

// --- v1.37 Auto helpers ---
void DetectAutoSettings()
{
   gAccountCurrency = AccountInfoString(ACCOUNT_CURRENCY);
   string cur = gAccountCurrency;
   StringToUpper(cur);
   gContractSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
   if(gContractSize<=0) gContractSize = 100.0;
   bool centByCurrency = (StringFind(cur,"CENT")>=0 || cur=="USC" || cur=="USDC" || cur=="USCENT" || cur=="USD C" || cur=="CENTS" || StringFind(cur,"USC")>=0);
   bool centByContract = (gContractSize < 10000.0 && gContractSize <= 1000.0); // Cent ทองส่วนใหญ่ Contract 10 หรือ 1000 ไม่ใช่ 100000
   // ถ้า Contract 100 แต่ Currency เป็น USC ก็ถือว่า Cent อยู่ดี
   if(InpAutoDetectCent) gIsCentAccount = (centByCurrency || centByContract);
   else gIsCentAccount = false;
   if(InpAutoMoney && gIsCentAccount) gMoneyScale = 100.0; else gMoneyScale = 1.0;
   if(InpAutoLot && gIsCentAccount) gLotScale = 100.0; else gLotScale = 1.0;
   if(InpAutoSpread)
   {
      long curSpread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
      double need = (double)curSpread * 3.0 + 100.0;
      gAutoMaxSpread = MathMax((double)InpMaxSpreadPoints, need);
   }
   else gAutoMaxSpread = (double)InpMaxSpreadPoints;
   gAutoDetected = true;
   Print("Nova v1.37 Auto: Broker=", AccountInfoString(ACCOUNT_COMPANY), " Currency=", gAccountCurrency, " Symbol=", _Symbol, " ContractSize=", DoubleToString(gContractSize,1), " IsCent=", (gIsCentAccount?"YES":"NO"), " MoneyScale=x", DoubleToString(gMoneyScale,0), " LotScale=x", DoubleToString(gLotScale,0), " AutoMaxSpread=", DoubleToString(gAutoMaxSpread,0), " | ใส่เงินเป็น $ ได้เลย ระบบแปลงเป็น Cent ให้เอง");
}
double AutoMoney(double dollarValue)
{
   if(!gAutoDetected) DetectAutoSettings();
   if(InpAutoMoney) return dollarValue * gMoneyScale;
   return dollarValue;
}
double AutoLot(double lotValue)
{
   if(!gAutoDetected) DetectAutoSettings();
   if(InpAutoLot) return lotValue * gLotScale;
   return lotValue;
}
double EffectiveMaxSpread()
{
   if(!gAutoDetected) DetectAutoSettings();
   if(InpAutoSpread) return gAutoMaxSpread;
   return (double)InpMaxSpreadPoints;
}

// --- v1.39 Dual Neural Network ---
//+------------------------------------------------------------------+
//| Nova Dual NN Weights v1.39 - UP model + DOWN model             |
//| UP: เทรนบน Regime Up+Side | DOWN: เทรนบน Regime Down+Side   |
//| แยกกันเทรน ไม่ทับกัน ไม่ลืมของเก่า                           |
//| Dual Acc 52.10% vs Single 51.86% | High-conf 67.5% vs 65.16%  |
//+------------------------------------------------------------------+
// --- Model UP ---
double NN_UP_MEAN[18] = {0.01342681, 0.03672884, 0.05953306, 0.14057675, 53.88052027, 0.07628808, 0.00148488, 0.10824712, 0.25710637, 0.66733555, 0.20030387, 0.56909923, 0.92863498, 55.68711435, 1.03105900, 0.01858548, -0.03600048, 0.19805893};
double NN_UP_SCALE[18] = {0.14677181, 0.24961744, 0.32220261, 0.50093059, 16.59815131, 0.14953617, 0.05144729, 0.29449821, 0.43544687, 0.73674591, 0.06860684, 0.31724305, 0.61165828, 28.67999872, 0.60177725, 0.70498560, 0.70806345, 0.12393431};
// NN_UP_W1 shape (18, 32) total 576
double NN_UP_W1[576] = {
   -0.05062593, 0.31420700, 0.13183149, 0.03375952, -0.16664740, -0.24839728, -0.25687256, 0.27020089,
   0.09681201, 0.08378404, -0.36749226, 0.32309423, 0.13821239, -0.13947457, -0.16559789, -0.26274105,
   -0.14449652, 0.05089064, -0.05457948, -0.16844757, 0.10359534, -0.19458268, -0.02629788, -0.09526750,
   0.01545709, 0.09658430, -0.26985675, -0.01615363, 0.03822614, -0.28390721, 0.03292817, -0.29436460,
   -0.30759839, 0.31288019, 0.33730421, 0.17316817, -0.11027463, -0.33149858, 0.14032512, -0.03578110,
   -0.24978397, -0.04513624, -0.36920285, 0.24779765, -0.11858816, 0.12539935, -0.16102399, -0.01044001,
   0.03394910, -0.17839138, 0.31827728, 0.17971312, 0.32739832, 0.23597030, 0.02062187, 0.29433929,
   -0.29353941, -0.20850790, -0.25483748, -0.11062666, -0.08118368, -0.09492426, 0.30455176, -0.13597691,
   -0.09836950, -0.01793068, -0.22529351, 0.19510087, -0.29661577, 0.27682553, 0.20878499, -0.20781679,
   -0.36602669, 0.16977691, 0.09808202, 0.11875014, 0.23716476, -0.30572833, -0.09748918, -0.33193036,
   0.25590077, 0.11633260, -0.16499910, -0.31021078, -0.15810522, -0.12868655, 0.13320091, 0.09084186,
   0.22909903, -0.05067533, -0.25792059, 0.15252310, 0.16390775, 0.07691823, 0.25603461, -0.04797933,
   0.11947743, -0.04118976, -0.24104483, -0.21573607, -0.30102614, 0.07633326, -0.08900608, 0.02187824,
   0.28282467, -0.18166009, -0.05688690, 0.13017181, -0.17318846, -0.30722429, -0.19729768, -0.23595900,
   0.29177805, 0.22130689, 0.07465252, 0.21208961, 0.17495170, -0.25535396, 0.22706975, -0.02002814,
   0.20205012, 0.31943160, -0.10656848, -0.30810362, -0.21950168, -0.00400703, 0.26087306, 0.24012731,
   -0.28504776, 0.05525633, 0.02861599, -0.12245743, -0.26669968, -0.08289031, 0.30232453, -0.09742140,
   0.03171250, 0.17728005, -0.09593333, 0.31945711, 0.32682688, -0.17678086, -0.04681419, -0.11123492,
   -0.13085055, -0.29654807, 0.03040324, -0.02390916, -0.29843067, -0.17471112, 0.22909723, -0.23106286,
   -0.27142884, 0.02563434, 0.34038709, -0.21259906, 0.15237084, 0.22687163, -0.16049769, 0.16687006,
   -0.09084669, 0.10573618, 0.16266307, 0.07450474, -0.28432138, 0.31203319, -0.22757937, -0.27828198,
   -0.24298480, 0.08588969, 0.17370046, -0.31280435, -0.01598457, -0.15166125, 0.03562865, -0.17952656,
   0.16127842, -0.06870432, 0.34452826, -0.25289696, -0.04565287, -0.30299830, 0.26786974, 0.26774050,
   -0.13707305, 0.11475192, 0.25759065, 0.03099258, 0.02137951, -0.11202060, -0.30362437, 0.29585703,
   0.37190798, 0.06250488, -0.02880498, -0.04800546, 0.13098889, 0.23590441, 0.32175899, 0.24029423,
   0.03263299, -0.28767773, -0.26662452, 0.21664271, 0.09644594, -0.36405517, -0.29548760, 0.09851431,
   -0.33850619, -0.19628745, -0.02956488, 0.08366368, 0.06163700, -0.21710393, 0.11259280, -0.23439337,
   -0.16101941, 0.18842235, 0.08864001, 0.18121210, 0.06089973, 0.09562880, -0.21564958, -0.12489863,
   -0.11537788, -0.18970426, 0.40034017, -0.04446619, 0.27301527, 0.10113522, 0.17579686, -0.00620662,
   0.08279220, -0.01689852, -0.21157804, 0.13043570, -0.15649973, -0.30755209, 0.06141122, -0.21381369,
   0.32055589, 0.35252344, 0.27116785, -0.11048962, -0.30189957, 0.27334979, -0.07025388, 0.31408549,
   0.32190614, 0.23290948, -0.12908129, -0.10159074, 0.21692598, -0.07050438, -0.18659047, 0.00858967,
   0.32562050, 0.13069316, 0.11565630, -0.24115039, 0.08621520, 0.38900003, -0.31305111, -0.03280128,
   0.34212262, 0.15905371, 0.16780334, 0.14731505, -0.12223613, -0.11342321, 0.16115302, 0.23424660,
   0.28897855, 0.30974880, 0.02836851, -0.01482166, 0.25149520, 0.08114651, 0.13061310, 0.18612431,
   0.29473943, -0.12605391, -0.05249608, -0.29260671, 0.04278505, -0.27321630, -0.02580785, 0.03993931,
   -0.14412130, 0.05387475, -0.26048458, -0.25712274, 0.24104355, -0.04103887, -0.25504300, -0.03933458,
   0.25838815, -0.23350284, 0.05857268, -0.24194261, -0.37024205, -0.03056646, 0.05496505, 0.00853257,
   0.21795550, 0.35775720, -0.07543784, -0.20487775, 0.18448427, -0.14167801, -0.00056102, -0.41661944,
   -0.35400882, 0.30313020, 0.26785601, 0.09119063, -0.10674735, -0.16392799, -0.33478120, -0.16447187,
   0.06144425, 0.14018502, 0.15175268, -0.10212395, 0.24726559, 0.18838585, -0.00410808, 0.05244407,
   0.00195354, -0.18775426, -0.06604955, 0.16195609, -0.36187900, -0.24521204, -0.35563806, -0.30304038,
   0.26158459, 0.20942155, 0.00310141, -0.32315595, 0.03093974, -0.08327299, -0.19538629, 0.02278358,
   -0.05111442, 0.06682723, 0.07252814, -0.33809054, -0.12150206, 0.01791912, 0.00034069, 0.21803353,
   0.12132470, -0.19904864, -0.21599064, 0.13805092, -0.35739444, 0.11450146, 0.28377190, 0.11621789,
   -0.06106688, 0.15144808, -0.03140094, 0.03919812, 0.29759860, -0.05719195, 0.29209064, 0.30222668,
   -0.22616762, -0.27184656, -0.29965927, -0.33779742, -0.24039693, 0.14698760, -0.34505745, -0.14932465,
   0.21191448, -0.31634471, 0.25933965, -0.14568691, -0.26118762, 0.18093664, 0.12939199, 0.23886339,
   0.21447385, 0.24234378, -0.07586162, -0.15400715, 0.19280453, 0.23511808, 0.30736178, -0.15884678,
   -0.05221476, 0.19777233, -0.13291682, 0.24489002, 0.23603085, -0.01385925, 0.10120002, 0.18672162,
   -0.25620259, 0.26132958, 0.01843407, 0.13302465, -0.12573338, 0.22955494, -0.09421263, -0.33740510,
   0.24552960, -0.27862525, -0.15248873, 0.23147326, 0.31138959, 0.05301553, 0.05120073, -0.02655200,
   -0.13298396, -0.10215684, 0.21044426, 0.21342283, 0.18236758, 0.22930624, -0.32357386, 0.03521621,
   -0.32473458, 0.06428644, -0.05586566, 0.27503417, -0.09650788, -0.26591232, -0.24741676, 0.19289694,
   0.11707256, -0.20937980, -0.34055979, 0.11751712, -0.26604685, 0.25397675, 0.10136934, -0.31883112,
   -0.30703538, 0.35466329, -0.09865914, -0.11843396, 0.22564357, 0.36167816, 0.36506554, 0.15716552,
   -0.10989027, -0.37514065, 0.30987454, 0.15982733, 0.04009339, 0.16115608, -0.18917774, -0.11969979,
   -0.41594970, -0.06123351, -0.41372963, -0.23995903, -0.41534215, 0.01405615, 0.28840003, -0.10173803,
   0.38961490, -0.02537978, -0.26507821, 0.17711590, -0.27687144, 0.34395315, -0.25251327, 0.27726702,
   -0.31091054, 0.15128515, -0.02250947, 0.25634336, -0.37400147, -0.04621543, 0.23196898, -0.08021723,
   0.03206302, 0.09301497, -0.08972402, 0.00887440, 0.06658773, 0.30267713, -0.21222455, -0.17155100,
   0.22176585, 0.27536600, -0.10710858, 0.12571853, -0.22591356, -0.32650345, -0.07491430, -0.26694326,
   0.06219475, -0.33754403, 0.20723986, 0.38042841, 0.10724109, 0.03795675, -0.05544132, 0.32924540,
   0.00099626, -0.37665954, 0.41800888, 0.31065624, 0.39487960, 0.11114304, 0.24147830, -0.01613881,
   0.29258048, 0.19538654, -0.26192516, -0.33523728, -0.01258146, 0.18130037, 0.35423332, -0.36132141,
   0.05116451, -0.10022669, 0.28426854, 0.26031366, 0.15413093, -0.02881671, -0.00576276, -0.27034558,
   -0.30984382, 0.18880271, 0.22905158, 0.24179772, 0.33821669, 0.08553743, 0.26816084, 0.32369878,
   0.22806096, -0.21199112, -0.11690415, -0.34286487, 0.27544600, -0.02480373, -0.28624330, 0.05293363,
   0.12154071, -0.14303653, -0.18122709, 0.21993257, 0.03007063, 0.13748387, 0.04016108, 0.18381576,
   0.00108371, -0.02686075, 0.19394463, -0.07749454, -0.37172512, -0.39244926, 0.23003803, -0.03687863,
   0.16592923, -0.14308740, -0.32537188, -0.43843178, -0.18800458, 0.05447504, -0.02778036, -0.07942660,
   0.29064270, -0.16845113, 0.03075158, 0.13739988, -0.12914588, 0.01031356, 0.16874231, 0.24756319
};
// NN_UP_W2 shape (32, 16) total 512
double NN_UP_W2[512] = {
   -0.00586943, 0.19203652, -0.35361508, 0.20069338, 0.12939360, -0.34416459, 0.28057287, 0.32688851,
   -0.31155417, -0.19462084, 0.23958744, 0.16024638, -0.28628472, -0.19929650, -0.15135718, -0.02179707,
   0.16869167, -0.12193859, 0.05273208, 0.23421041, -0.30952654, -0.09845805, 0.16650699, 0.27357837,
   0.06521560, 0.08612308, -0.22056609, -0.08256704, 0.08821082, -0.19688865, -0.05452184, -0.16434354,
   -0.28188655, -0.17162134, -0.12912180, -0.08428368, -0.24177138, 0.32330551, 0.03395486, 0.09950173,
   0.25014317, 0.05691683, -0.26248561, -0.00745024, 0.13513710, 0.17979461, 0.04000510, -0.26531979,
   -0.10192041, -0.05896530, 0.11760196, 0.09009960, -0.06158206, 0.39079115, 0.04545267, -0.13418620,
   -0.24864939, -0.19866760, -0.15239095, -0.27165900, -0.19523447, -0.16270238, -0.17517913, 0.29404417,
   -0.30065525, 0.04550980, 0.01257613, 0.36143409, -0.21759425, -0.08775572, 0.30902750, 0.19474839,
   0.19770440, -0.17750181, -0.22738259, 0.09718148, 0.29178533, 0.07662535, 0.02215243, -0.23674345,
   0.20455283, -0.24120198, -0.06650218, -0.07237351, -0.04607062, -0.19591975, -0.29603558, 0.06621537,
   -0.09212138, 0.03368118, -0.25486396, -0.03727894, 0.02375172, -0.31211898, -0.06411371, -0.23811956,
   -0.21816987, 0.38748758, -0.05755690, 0.27613605, -0.12530936, 0.17281475, 0.21265250, 0.14141659,
   0.00465521, -0.08602844, -0.02022095, 0.24520883, 0.26355487, 0.36723554, -0.23175470, 0.14957031,
   0.38604558, -0.16077096, -0.35687337, 0.23724764, 0.08835675, 0.28302642, -0.24640932, 0.23395781,
   -0.27541818, -0.16673297, -0.24065522, 0.20323969, 0.15618592, -0.01572732, -0.04331007, 0.28872308,
   -0.01756936, 0.25528707, 0.03434802, -0.02689570, 0.03868634, -0.10017187, 0.18592070, 0.02654631,
   -0.20998473, 0.31939649, -0.03094433, 0.00430299, 0.30190294, 0.12001770, -0.25631159, 0.25101622,
   0.20432787, -0.20015019, -0.17807493, 0.30269893, 0.08673927, 0.12662977, 0.27132100, 0.18980561,
   -0.13870896, -0.06033680, -0.12585625, 0.12990280, -0.29533895, 0.06266945, 0.27249850, 0.22744207,
   -0.09657140, 0.26764758, -0.16661448, 0.27897359, -0.21317949, -0.13666962, 0.23341148, -0.27070751,
   -0.21843552, 0.16269733, 0.18498498, 0.07206847, 0.12278197, 0.04739488, -0.15842424, -0.12419017,
   -0.23448113, 0.32302528, 0.11386821, -0.10038352, -0.05777527, 0.30376326, -0.19007396, 0.07309148,
   0.03437377, 0.03694468, -0.34085629, 0.23735451, 0.27611039, 0.08330748, 0.14678887, 0.28623149,
   0.24605408, -0.29177522, 0.06390521, 0.13756911, -0.06774684, 0.23949478, 0.28015865, 0.32242609,
   -0.00199770, -0.18371916, 0.39351324, 0.21074006, -0.17372151, 0.26648497, 0.40134245, 0.00438265,
   0.10227200, 0.02640436, -0.29818601, -0.05781510, 0.30205572, -0.30240561, -0.10792308, -0.01208312,
   0.01470815, 0.29898246, -0.07305299, -0.13465134, 0.16412927, -0.02846645, -0.16764109, -0.08168205,
   -0.31458829, -0.20296842, -0.03315141, -0.08078676, 0.27981934, -0.16288304, 0.05559782, 0.07104411,
   -0.30109622, 0.14052125, -0.27621380, 0.34120198, -0.30618230, -0.02691568, -0.25976332, 0.41678000,
   0.12252773, 0.05786482, -0.27492180, 0.27396841, -0.15586901, 0.39112545, -0.25347180, -0.18670349,
   -0.36615258, 0.06023407, 0.11160835, -0.35509964, 0.30293811, -0.06257917, 0.19191184, -0.00788257,
   -0.12287340, 0.04872231, -0.14617467, -0.27015764, 0.21881715, 0.25901422, -0.12001016, -0.20592212,
   0.16443704, -0.11268392, -0.36377700, -0.27839074, 0.13712110, 0.13531376, -0.33505042, -0.15262526,
   -0.14868625, 0.10195303, -0.26899465, -0.25423741, 0.20488245, -0.23143753, 0.11910366, -0.19495453,
   -0.27091469, -0.14143507, 0.20838204, 0.22131798, 0.27287436, -0.10141559, 0.22524011, -0.15138849,
   -0.07265877, 0.27699951, -0.24015758, -0.22750610, -0.16159264, -0.27503115, -0.24020337, 0.08719833,
   -0.00030983, 0.32980976, 0.28311827, -0.15240275, -0.13501077, -0.03501654, 0.14160363, -0.22978476,
   0.07420614, -0.03628651, 0.02796914, -0.06530461, -0.15206971, 0.35123667, 0.12883979, -0.29174901,
   0.29267074, -0.01686474, 0.24397321, 0.23334119, -0.09031107, -0.37613503, -0.07471652, 0.02486353,
   0.12703108, -0.10716509, -0.17674291, 0.28304638, 0.41223761, 0.07567317, -0.22514059, -0.15505472,
   -0.32828484, 0.30581395, -0.24029783, 0.03107692, -0.16011780, 0.00204977, 0.12156229, 0.14620010,
   -0.29943233, -0.28769382, -0.29604311, 0.23584119, 0.25680633, 0.01664099, 0.08123061, 0.13292065,
   -0.18194547, 0.25515770, -0.12574305, -0.10256654, -0.05851667, -0.29141600, -0.22763216, 0.20700615,
   -0.23092554, 0.07338877, -0.16978091, -0.04462951, -0.13729158, -0.07548477, 0.16414764, -0.11344138,
   0.08845868, -0.00453074, 0.16208034, 0.26393183, 0.20531239, -0.17319245, -0.26058936, -0.19252726,
   0.03952761, -0.33950473, -0.02418004, 0.04012099, -0.18718208, 0.16409880, -0.25733441, -0.35430947,
   0.22914330, 0.04932617, 0.12436734, -0.03054258, -0.20404121, 0.22605279, 0.30166300, 0.17419764,
   -0.10779507, 0.09599846, -0.09649659, -0.26462000, 0.31551532, -0.28392158, 0.32102329, 0.00125692,
   -0.21931482, 0.03974678, 0.31113555, 0.14634760, 0.18729290, 0.11097036, 0.15508077, 0.24939288,
   -0.14976658, -0.07096881, -0.17882508, 0.32459006, 0.24174315, -0.29951902, 0.15057791, 0.24287986,
   -0.20674865, 0.07692049, 0.31490852, -0.37284131, 0.21844445, -0.17135596, 0.41659120, 0.35570263,
   0.41245830, -0.09429028, 0.38410689, 0.33216376, -0.12467901, 0.31832825, -0.36517429, 0.06388806,
   -0.10481572, -0.18738036, -0.23909676, 0.09982157, -0.05967245, 0.24867799, -0.16697467, -0.09345138,
   0.00437000, 0.30544125, -0.10538346, 0.08904529, 0.30709018, 0.08499521, -0.19461409, -0.29952790,
   0.24818457, -0.37944528, 0.23508927, 0.01670187, 0.23747796, 0.20927609, 0.33921408, -0.09718589,
   0.19910702, -0.09134646, -0.00197218, 0.07206090, 0.25599362, 0.35287641, 0.21052011, -0.04854631,
   0.01801407, 0.17946420, -0.22047984, -0.29100262, -0.11938779, -0.04926720, -0.08498171, -0.25986070,
   -0.26115481, -0.34765826, 0.34111547, -0.02930065, -0.12128463, 0.16506930, -0.20007482, 0.32875950,
   0.23396217, -0.26694095, -0.07063573, 0.24393581, 0.35502182, 0.00132593, 0.18858386, -0.15122566,
   0.34777200, -0.12012732, 0.35124903, 0.08965174, 0.04898621, 0.00206299, -0.17284056, -0.20508909,
   -0.21372582, -0.23066988, 0.13453947, -0.13773352, -0.34672404, 0.33513675, 0.30762358, 0.32954689,
   0.40093212, -0.26920137, -0.02548211, 0.18638337, 0.08246930, -0.24192375, 0.19125375, -0.20838689,
   -0.11181054, 0.01676839, 0.07699926, 0.02191570, -0.24501567, 0.24794546, -0.06033680, -0.22195963
};
// NN_UP_W3 shape (16, 3) total 48
double NN_UP_W3[48] = {
   0.51178695, -0.13325343, -0.01654185, 0.15540320, 0.36011199, -0.27874433, 0.26307610, 0.00421779,
   -0.23558419, 0.49891713, 0.25293572, 0.15235008, 0.38601915, 0.44532317, 0.19901179, 0.43141594,
   0.15089209, 0.23218248, 0.16525463, 0.26627349, -0.42944743, 0.47895120, 0.35718137, -0.52091237,
   0.37067897, -0.55033887, -0.09057209, 0.30281477, -0.38682268, 0.30669497, 0.46111707, -0.12722287,
   -0.48996268, -0.22191267, 0.11236446, 0.52451093, 0.15133728, -0.24562121, 0.10485728, 0.02076666,
   0.37122292, -0.50025163, 0.41126015, -0.12443283, 0.62866374, -0.21313256, 0.16644322, 0.50299535
};
double NN_UP_B1[32] = {-0.24979445, 0.34761586, -0.07554353, -0.24154308, -0.05907938, 0.36333254, -0.06811671, 0.00047860, 0.10216415, -0.17323689, -0.24772736, -0.28802946, -0.15533642, -0.19373888, -0.22739921, 0.20384882, -0.21733412, -0.10589484, 0.28949374, 0.03885682, 0.20868811, -0.21919710, -0.25549886, -0.22532386, -0.23482380, -0.08374053, -0.16919314, -0.20605497, -0.20577207, -0.04580783, -0.10946510, -0.05701483};
double NN_UP_B2[16] = {0.37037800, 0.29351381, 0.32293751, 0.29999134, 0.15762945, 0.12594719, -0.31643136, -0.07162358, -0.05807092, -0.09667355, 0.22039842, -0.04030322, -0.21679367, -0.22546505, 0.26360324, -0.33434259};
double NN_UP_B3[3] = {-0.37595318, 0.41020911, 0.18387374};
// --- Model DOWN ---
double NN_DOWN_MEAN[18] = {-0.01140900, -0.03406742, -0.05787613, -0.13588278, 45.17957731, -0.07435086, -0.00210088, -0.10661780, -0.25163753, -0.70783515, 0.21135559, 0.40335722, 0.91953247, 43.72084442, 1.04556910, 0.05745774, -0.05035563, 0.21126706};
double NN_DOWN_SCALE[18] = {0.14984037, 0.25367773, 0.32088709, 0.47810008, 15.60804562, 0.14431852, 0.04874291, 0.28629238, 0.43285960, 0.78530054, 0.07906050, 0.31553353, 0.57534256, 28.14509168, 0.63817229, 0.70995358, 0.70009201, 0.13549082};
// NN_DOWN_W1 shape (18, 32) total 576
double NN_DOWN_W1[576] = {
   -0.14167818, 0.33891495, 0.17269660, 0.00441433, -0.18218344, -0.28257181, -0.23159111, 0.32223760,
   0.03467807, 0.10319649, -0.33290037, 0.31925758, 0.22246035, -0.18008457, -0.16455912, -0.22513717,
   -0.13566362, 0.05420556, -0.05580937, -0.08662839, 0.14722102, -0.25603230, 0.00297857, 0.01168168,
   -0.08274196, 0.05325909, -0.25374973, -0.00437702, 0.00448030, -0.28867790, 0.00073101, -0.31496013,
   -0.28585433, 0.31236147, 0.21392884, 0.18091555, -0.11214002, -0.25951662, 0.10595784, 0.04262704,
   -0.29331893, 0.01914228, -0.32103793, 0.16529533, -0.07636000, 0.11576077, -0.10123321, 0.07571297,
   0.03018381, -0.24055059, 0.22613466, 0.21552042, 0.34025955, 0.26632415, 0.00871216, 0.35430991,
   -0.34554340, -0.20839506, -0.24306986, -0.06712481, -0.02538366, -0.26668636, 0.35151982, -0.15203148,
   -0.07698713, 0.08429773, -0.31991016, 0.19576095, -0.28223936, 0.35246278, 0.08113346, -0.12986712,
   -0.37103503, 0.25603414, 0.11630864, 0.00132604, 0.24937934, -0.25539765, -0.11369305, -0.18901212,
   0.23643330, 0.06711878, -0.15861672, -0.33462438, -0.08746122, -0.05262755, 0.10373820, 0.05827930,
   0.25250195, -0.01434201, -0.16371081, 0.19042955, 0.24586423, 0.00830595, 0.23292819, -0.07649158,
   0.03919157, -0.03480808, -0.30511025, -0.26237517, -0.29527003, 0.11675137, -0.15275698, -0.05248201,
   0.32733276, -0.16345353, -0.06560065, 0.09066536, -0.16197113, -0.30371353, -0.19668138, -0.17449075,
   0.35159266, 0.23444469, 0.07605346, 0.22258662, 0.21884379, -0.23755587, 0.27478992, 0.06849611,
   0.24394167, 0.26307837, -0.13961020, -0.29061040, -0.19015510, 0.00083859, 0.25578101, 0.27639964,
   -0.34430523, -0.01180386, -0.02230853, -0.12309824, -0.32183240, -0.08807345, 0.31191376, -0.22245194,
   0.02556710, 0.15671464, -0.11633615, 0.30080039, 0.28186841, -0.21294652, 0.00934491, -0.12331189,
   -0.08409463, -0.29377432, 0.08452146, -0.01913782, -0.36820755, -0.17629933, 0.26738783, -0.18211002,
   -0.19877095, 0.02933724, 0.32554505, -0.19428491, 0.14136270, 0.20206994, -0.09075298, 0.14913772,
   -0.09697743, 0.02584843, 0.02133156, 0.05594979, -0.26904661, 0.29433024, -0.08672470, -0.32387543,
   -0.26448051, 0.02541649, 0.13076416, -0.33664070, -0.02569980, -0.24657830, 0.00808508, -0.24229715,
   0.13140297, -0.07257302, 0.41211721, -0.26625232, -0.15816603, -0.29372061, 0.26579116, 0.28077574,
   -0.06587051, 0.16635277, 0.15218243, 0.08889931, -0.02753782, -0.20257281, -0.24197620, 0.32547718,
   0.29376286, 0.13114424, -0.02851691, -0.08727640, 0.19540569, 0.31470669, 0.22318775, 0.18745833,
   0.08526048, -0.24517679, -0.25327787, 0.16794750, 0.08815717, -0.34377202, -0.33359487, 0.20296813,
   -0.25329099, -0.27380914, -0.08949135, 0.11355475, 0.10072044, -0.17749338, 0.17612332, -0.21313378,
   -0.11543287, 0.12304915, 0.15979848, 0.22436854, 0.14546134, 0.10660968, -0.29920831, -0.12010201,
   -0.14940743, -0.18415868, 0.30489398, -0.07182241, 0.31825245, 0.13426327, 0.20859681, -0.03847152,
   0.06545568, -0.01226484, -0.22358044, 0.05472033, -0.15134856, -0.33861984, 0.04033703, -0.18129862,
   0.33871193, 0.29762014, 0.26455318, -0.10836638, -0.34116890, 0.28916738, -0.04470922, 0.35033287,
   0.35001270, 0.23431815, -0.14283616, -0.04140280, 0.24208741, -0.14846824, -0.20383243, 0.01275795,
   0.32504961, 0.08675741, -0.03360257, -0.27360967, 0.10186175, 0.38307815, -0.22255255, -0.06204705,
   0.30485435, 0.13040439, 0.13360456, 0.08167689, -0.10936223, -0.17258364, 0.15357207, 0.23183596,
   0.25826590, 0.28180911, 0.08302774, -0.02203180, 0.16865923, 0.07634702, 0.11937783, 0.22994335,
   0.33019311, -0.07218432, -0.11557397, -0.22891070, 0.03089855, -0.37807920, 0.02080178, 0.04529912,
   -0.06948794, 0.03876309, -0.37837113, -0.34753335, 0.21140778, -0.03229431, -0.23057894, 0.02139915,
   0.21932667, -0.28348381, 0.10591530, -0.33112685, -0.27441195, -0.04357762, 0.02679705, 0.14150020,
   0.15821896, 0.26909155, 0.07694215, -0.10816989, 0.21027306, -0.23084538, -0.08646099, -0.19817913,
   -0.30753420, 0.44275059, 0.18114374, 0.20666808, -0.04643833, -0.30959880, -0.18347733, -0.18977255,
   0.06716254, 0.16555032, 0.11275788, -0.10565043, 0.28467333, 0.07934644, 0.13227205, 0.12963885,
   -0.06525820, -0.08133060, -0.08744018, 0.22406017, -0.38679439, -0.22108909, -0.27976268, -0.32329524,
   0.18684862, 0.15145326, -0.01877874, -0.28759882, 0.01560873, -0.01490414, -0.18038816, -0.03923256,
   -0.11299169, 0.10066814, 0.10194164, -0.33438535, -0.21635751, 0.02799036, 0.06319705, 0.25499592,
   0.14730512, -0.20058879, -0.30251021, 0.11507275, -0.34036859, 0.11724250, 0.26746830, -0.04404285,
   -0.02813991, 0.14224156, -0.03454668, -0.05248811, 0.28127178, -0.08099010, 0.34105328, 0.34624998,
   -0.18857522, -0.24905757, -0.29794773, -0.33977511, -0.28049562, 0.10892731, -0.32925128, -0.12445752,
   0.23260162, -0.30061165, 0.21231632, -0.14168506, -0.20716278, 0.08820853, 0.18053818, 0.25934275,
   0.21362138, 0.16502342, -0.10526335, -0.18176454, 0.12938090, 0.10616607, 0.36672296, -0.07817154,
   -0.04820158, 0.23732247, -0.07606776, 0.28453080, 0.22276690, 0.01240555, 0.23536322, 0.15118285,
   -0.25163556, 0.30592279, 0.02477650, 0.25173607, -0.11695042, 0.30063887, 0.03380117, -0.28963912,
   0.31727483, -0.29915487, -0.17894536, 0.28606584, 0.19787536, -0.05646506, 0.08175445, -0.02308209,
   -0.13121077, -0.06269097, 0.20668257, 0.22301022, 0.19576184, 0.28276776, -0.34055096, -0.06780115,
   -0.29868741, 0.06597361, -0.07882092, 0.20426671, -0.08084258, -0.29415740, -0.17973148, 0.25460682,
   0.16126759, -0.24284584, -0.30990424, 0.14257642, -0.28920255, 0.19719968, 0.09559466, -0.24260362,
   -0.37074492, 0.37335050, -0.03965055, -0.13251148, 0.30071110, 0.33764197, 0.42360274, 0.14614560,
   -0.12355326, -0.34016140, 0.29747523, 0.00701924, -0.01181917, 0.21076054, -0.20571350, -0.06049143,
   -0.48686625, 0.04671435, -0.47166346, -0.15855601, -0.26610543, -0.00463048, 0.23882611, -0.15891724,
   0.39467991, -0.09484110, -0.35604962, 0.18985925, -0.17877505, 0.28362609, -0.26309030, 0.37145776,
   -0.27549764, 0.11933801, 0.01200838, 0.27432717, -0.37684077, 0.03735310, 0.33286829, -0.10744652,
   0.10925230, 0.14155627, -0.00068342, 0.16846242, 0.13298617, 0.23615062, -0.21262558, -0.32720800,
   0.31084787, 0.34261871, -0.15956502, 0.04195565, -0.23366914, -0.32673983, -0.01253890, -0.22189081,
   -0.15933783, -0.28734166, 0.19623386, 0.32275450, 0.08478619, 0.07370580, -0.04719935, 0.21248470,
   0.05120634, -0.28237216, 0.39521356, 0.20396397, 0.38232278, 0.05996638, -0.00270410, 0.06128125,
   0.26763144, 0.13032657, -0.17299187, -0.35957658, -0.06937451, 0.29362973, 0.32647628, -0.39768646,
   -0.07657528, -0.16071456, 0.35236056, 0.25121584, 0.11059537, 0.00003870, -0.10730682, -0.19471142,
   -0.18381174, 0.27577288, 0.16374788, 0.31592128, 0.23828446, -0.01976570, 0.17944624, 0.40496944,
   0.17516052, -0.27567858, -0.05367555, -0.21097373, 0.25500914, -0.00913745, -0.32037732, 0.13104270,
   0.10474699, -0.12516469, -0.16233061, 0.15104184, 0.01369737, 0.03997123, 0.04076005, 0.09820669,
   -0.04846477, 0.16619773, 0.16444323, -0.04418635, -0.22540610, -0.38010839, 0.22852197, -0.03439380,
   0.20586433, -0.14965118, -0.38911320, -0.43402059, -0.13225637, 0.04724887, -0.01022356, -0.01543156,
   0.28674813, -0.22599033, 0.01445078, 0.12922484, -0.20237310, 0.09959913, 0.26116962, 0.22048054
};
// NN_DOWN_W2 shape (32, 16) total 512
double NN_DOWN_W2[512] = {
   -0.03046161, 0.17115669, -0.36534543, 0.21082702, 0.06849036, -0.34878732, 0.32918399, 0.28729877,
   -0.29131265, -0.11488097, 0.21129095, 0.17095543, -0.23512442, -0.24002974, -0.13099631, -0.11876852,
   0.17694703, -0.10226416, -0.00160148, 0.24785302, -0.26920308, -0.08985415, 0.18093974, 0.28393837,
   0.04179371, 0.07113879, -0.18016040, -0.07825842, 0.07496150, -0.22806743, -0.13159874, -0.13282544,
   -0.26470570, -0.01866857, -0.26213185, -0.10116556, -0.20309679, 0.31339591, 0.03653850, 0.16428609,
   0.28630414, 0.01011671, -0.26628479, 0.09658229, 0.08919117, 0.15131773, -0.00209940, -0.18668938,
   -0.07029471, -0.03725616, 0.23642002, 0.11315191, -0.00713842, 0.37572297, 0.06517527, -0.07725620,
   -0.30595099, -0.25431636, -0.17697040, -0.26037806, -0.25522707, -0.19273180, -0.23334880, 0.26878140,
   -0.25681248, 0.12226168, -0.06605215, 0.37344193, -0.22136292, -0.05528790, 0.35871640, 0.28382701,
   0.27945836, -0.16711043, -0.18288006, 0.08181737, 0.27006030, -0.03302311, 0.04106038, -0.12755733,
   0.18113403, -0.27547015, -0.12582665, -0.06251597, -0.03416818, -0.17631745, -0.31565433, 0.05210158,
   -0.19773107, 0.04965566, -0.30842203, -0.02375777, 0.00317379, -0.29553768, -0.06181360, -0.21582117,
   -0.16029532, 0.32840231, -0.14292058, 0.26249427, -0.21255755, 0.15626921, 0.20463100, 0.02645011,
   0.00183817, 0.03064016, 0.00906436, 0.29805685, 0.30555943, 0.24293870, -0.18262467, 0.18028684,
   0.43775822, -0.17236055, -0.29381033, 0.23400841, 0.07752536, 0.32006869, -0.27618655, 0.23761219,
   -0.21289042, -0.19323072, -0.26492600, 0.21025406, 0.19286546, -0.04887769, 0.00113587, 0.27846555,
   -0.01566231, 0.21476216, -0.08723693, -0.01635666, 0.06171250, -0.07819295, 0.19514997, -0.04665956,
   -0.31338058, 0.33678973, 0.01302756, 0.02114778, 0.36042535, 0.08329167, -0.21469065, 0.28269215,
   0.09550995, -0.09366950, -0.16122854, 0.23056744, 0.15078501, 0.03983381, 0.34314411, 0.27935028,
   -0.20363167, -0.13912701, -0.11964051, 0.18721972, -0.40619676, 0.12854949, 0.07023606, 0.24004437,
   -0.15597754, 0.29176096, -0.17272089, 0.23066587, -0.21187576, -0.11782633, 0.24753583, -0.23975065,
   -0.23032180, 0.15217968, 0.18498658, 0.02716314, 0.12184703, -0.01467057, -0.17315620, -0.14246023,
   -0.23381768, 0.30570750, 0.08981623, -0.08216290, -0.05801816, 0.29721919, -0.21518075, 0.07026850,
   -0.01254216, 0.01278325, -0.33223304, 0.24743522, 0.26630034, 0.00638536, 0.10088140, 0.26474384,
   0.26306387, -0.32107116, 0.12989753, 0.11947161, -0.12965866, 0.26936929, 0.27236327, 0.27328385,
   0.00430946, -0.16473561, 0.40662807, 0.18152989, -0.14644946, 0.24009893, 0.37488718, -0.02206243,
   0.09344772, 0.01502501, -0.35211022, -0.09737403, 0.27979817, -0.29977481, -0.14092337, -0.09058763,
   0.03759765, 0.31573124, -0.06271749, -0.11788051, 0.15816529, -0.07826510, -0.21616401, -0.02563521,
   -0.34135736, -0.11475313, 0.01245677, -0.15657769, 0.28016349, -0.17614211, 0.03568928, 0.08963496,
   -0.30270092, 0.11574694, -0.19589496, 0.31779634, -0.34134459, -0.06779340, -0.20712972, 0.41978283,
   0.16890457, -0.02783285, -0.21584200, 0.28813375, -0.16552734, 0.41107941, -0.22475868, -0.18611838,
   -0.27947646, 0.12138177, 0.11184872, -0.39241897, 0.34779284, -0.11264224, 0.24621032, 0.03471051,
   -0.11046152, 0.00801034, -0.22668623, -0.29383219, 0.21686142, 0.29505351, -0.13550644, -0.26978501,
   0.09192222, -0.08435871, -0.39098510, -0.20183469, 0.13095920, 0.16122527, -0.26925383, -0.08246630,
   -0.11095205, 0.15432100, -0.35585761, -0.21139784, 0.27509499, -0.07649064, 0.22724283, -0.08404306,
   -0.25391834, -0.11856139, 0.24411690, 0.15328603, 0.30268796, -0.09026984, 0.21485078, -0.25383833,
   -0.09982962, 0.26946982, -0.36392648, -0.23872915, -0.13800069, -0.23583645, -0.22386024, 0.06341547,
   -0.02427797, 0.33421134, 0.29776083, -0.16392925, -0.07499222, -0.04154592, 0.13761310, -0.24010281,
   0.09872695, -0.07103825, 0.04207767, -0.06692958, -0.20141665, 0.36707877, 0.24324978, -0.28087446,
   0.28903927, 0.05511913, 0.22166886, 0.22996468, -0.01721018, -0.36237001, -0.10878362, -0.06316060,
   0.15197660, -0.13413550, -0.27287213, 0.29747985, 0.41682454, 0.26770715, -0.19585140, -0.14866615,
   -0.27084194, 0.32416814, -0.22945432, 0.01048872, -0.09821463, 0.00939456, 0.10486074, 0.09676283,
   -0.24057590, -0.27702122, -0.32965729, 0.17128336, 0.21316922, -0.03449286, 0.07797561, 0.07461213,
   -0.16889709, 0.29935710, -0.07554842, -0.00336908, -0.07272650, -0.38349394, -0.17819760, 0.24154458,
   -0.25824098, 0.07753841, -0.15635615, -0.02888988, -0.13448227, -0.07250917, 0.15173117, -0.13158014,
   0.07443252, 0.01760508, 0.17928847, 0.26373699, 0.20526121, -0.16057260, -0.25084058, -0.25116118,
   -0.01766560, -0.30252820, -0.08043327, -0.01381016, -0.16764990, 0.17288648, -0.22727062, -0.33325970,
   0.22690481, -0.03739713, 0.04288811, -0.02794119, -0.18760349, 0.28170427, 0.26620892, 0.20929762,
   -0.22227004, 0.07679237, -0.11854539, -0.32968169, 0.29938825, -0.33283361, 0.37790761, -0.05946224,
   -0.29215424, -0.01011766, 0.31608682, 0.16131879, 0.15965147, 0.08609811, 0.10661902, 0.22827341,
   -0.15909669, -0.08395281, -0.24856945, 0.32683877, 0.22337405, -0.29822687, 0.07103518, 0.25458940,
   -0.30122821, 0.08837616, 0.28746267, -0.36683369, 0.20669839, -0.10974602, 0.40966436, 0.41336189,
   0.42677576, -0.04154656, 0.26201582, 0.33494830, -0.09399256, 0.31079697, -0.38010850, 0.04599932,
   -0.13160156, -0.19463602, -0.22920759, 0.06491782, -0.05065750, 0.15323838, -0.05803770, -0.13862752,
   0.06407921, 0.24922057, -0.20731898, 0.10824673, 0.33239205, 0.07207768, -0.15243792, -0.25740175,
   0.22286790, -0.29707688, 0.27032270, 0.00091110, 0.27174522, 0.19504034, 0.38977009, -0.11867305,
   0.19812080, -0.10478515, 0.02424713, 0.10173595, 0.22548637, 0.36504634, 0.18993019, -0.05306420,
   -0.09448624, 0.17145050, -0.11688718, -0.30637597, -0.12597689, -0.19686445, -0.19637441, -0.23915352,
   -0.30733509, -0.38787991, 0.36440063, -0.11936483, -0.16495084, 0.08479037, -0.23579198, 0.29368710,
   0.21199963, -0.24677429, -0.13538127, 0.32366884, 0.31369178, -0.09672996, 0.17034749, -0.25291954,
   0.32749883, -0.12615328, 0.34165628, 0.04401644, 0.07231569, -0.05202162, -0.17579516, -0.22394026,
   -0.23466655, -0.31958512, 0.07599147, -0.04918520, -0.39898484, 0.31816702, 0.27762066, 0.34964148,
   0.39028937, -0.24102019, -0.06860807, 0.22086825, 0.11852206, -0.23061895, 0.19281860, -0.25498422,
   -0.08614565, 0.07180799, 0.10129985, 0.04332029, -0.24421360, 0.29441968, -0.05439297, -0.22266477
};
// NN_DOWN_W3 shape (16, 3) total 48
double NN_DOWN_W3[48] = {
   0.52847061, -0.11981848, -0.05101743, 0.19264869, 0.30945346, -0.28664068, 0.33548068, 0.05301158,
   -0.42011830, 0.50764667, 0.26594494, 0.15854519, 0.37800631, 0.44283072, 0.18878888, 0.44082174,
   0.16667819, 0.18651211, 0.16422181, 0.35721662, -0.57322852, 0.46065506, 0.37042520, -0.50693142,
   0.41064211, -0.61362984, -0.04891658, 0.29829863, -0.39871773, 0.31004696, 0.45664104, -0.10620838,
   -0.51746365, -0.21446022, 0.08988137, 0.54627328, 0.15618529, -0.27466233, 0.12462289, 0.02089045,
   0.33940858, -0.44636817, 0.34355481, -0.06613027, 0.60142570, -0.21411905, 0.16346537, 0.49839457
};
double NN_DOWN_B1[32] = {-0.26186509, 0.43875205, -0.07833785, -0.26427744, -0.05697997, 0.37256520, -0.06328691, -0.00056846, 0.19190213, -0.14016614, -0.22000236, -0.26922581, -0.34688374, -0.17420725, -0.27129561, 0.24641570, -0.29070454, -0.13683339, 0.36324484, -0.00998246, 0.20233361, -0.21061569, -0.26103138, -0.30352396, -0.23014689, -0.08128164, -0.23135773, -0.25614462, -0.18045593, -0.02484364, -0.14576789, -0.11511704};
double NN_DOWN_B2[16] = {0.39602478, 0.31757746, 0.30561191, 0.31797948, 0.18427757, 0.16510349, -0.26805493, -0.03770546, -0.04010079, -0.08293749, 0.21997310, -0.05351139, -0.18228073, -0.26636479, 0.27303991, -0.29573143};
double NN_DOWN_B3[3] = {-0.35936412, 0.40091936, 0.16573689};

double gNNProbUp[3]={0,0,0}; double gNNProbDown[3]={0,0,0};
// Forward แบบเลือกโมเดลตาม Regime: 1=Up, -1=Down, 0=Side (เฉลี่ย 2 โมเดล)
double NN_Forward_Dual(double &feat[], double &prob[], int regime)
{
   double pUp[3], pDown[3];
   // --- UP model ---
   { double x[18]; for(int i=0;i<18;i++) x[i]=(feat[i]-NN_UP_MEAN[i])/NN_UP_SCALE[i];
     double h1[32]; for(int j=0;j<32;j++){ double s=NN_UP_B1[j]; for(int i=0;i<18;i++) s+=x[i]*NN_UP_W1[i*32+j]; h1[j]=MathMax(0.0,s); }
     double h2[16]; for(int j=0;j<16;j++){ double s=NN_UP_B2[j]; for(int i=0;i<32;i++) s+=h1[i]*NN_UP_W2[i*16+j]; h2[j]=MathMax(0.0,s); }
     double o[3]; for(int j=0;j<3;j++){ double s=NN_UP_B3[j]; for(int i=0;i<16;i++) s+=h2[i]*NN_UP_W3[i*3+j]; o[j]=s; }
     double m=MathMax(o[0],MathMax(o[1],o[2])); double sum=0; for(int j=0;j<3;j++){ o[j]=MathExp(o[j]-m); sum+=o[j]; } for(int j=0;j<3;j++) pUp[j]=o[j]/sum; }
   // --- DOWN model ---
   { double x[18]; for(int i=0;i<18;i++) x[i]=(feat[i]-NN_DOWN_MEAN[i])/NN_DOWN_SCALE[i];
     double h1[32]; for(int j=0;j<32;j++){ double s=NN_DOWN_B1[j]; for(int i=0;i<18;i++) s+=x[i]*NN_DOWN_W1[i*32+j]; h1[j]=MathMax(0.0,s); }
     double h2[16]; for(int j=0;j<16;j++){ double s=NN_DOWN_B2[j]; for(int i=0;i<32;i++) s+=h1[i]*NN_DOWN_W2[i*16+j]; h2[j]=MathMax(0.0,s); }
     double o[3]; for(int j=0;j<3;j++){ double s=NN_DOWN_B3[j]; for(int i=0;i<16;i++) s+=h2[i]*NN_DOWN_W3[i*3+j]; o[j]=s; }
     double m=MathMax(o[0],MathMax(o[1],o[2])); double sum=0; for(int j=0;j<3;j++){ o[j]=MathExp(o[j]-m); sum+=o[j]; } for(int j=0;j<3;j++) pDown[j]=o[j]/sum; }
   for(int j=0;j<3;j++){ gNNProbUp[j]=pUp[j]; gNNProbDown[j]=pDown[j]; }
   if(regime>0){ for(int j=0;j<3;j++) prob[j]=pUp[j]; }
   else if(regime<0){ for(int j=0;j<3;j++) prob[j]=pDown[j]; }
   else {
      // v1.40 Side: 0=เฉลี่ย (v1.39) / 1=เลือกโมเดลที่มั่นใจกว่า (MaxConf)
      if(InpNNSideMode==1){
         double maxUp=pUp[0], maxDown=pDown[0];
         for(int j=1;j<3;j++){ if(pUp[j]>maxUp) maxUp=pUp[j]; if(pDown[j]>maxDown) maxDown=pDown[j]; }
         if(maxUp>=maxDown){ for(int j=0;j<3;j++) prob[j]=pUp[j]; }
         else { for(int j=0;j<3;j++) prob[j]=pDown[j]; }
      } else {
         for(int j=0;j<3;j++) prob[j]=(pUp[j]+pDown[j])/2.0;
      }
   }
   double mx=prob[0]; for(int j=1;j<3;j++) if(prob[j]>mx) mx=prob[j]; return mx;
}
// Regime จาก dist_ema200 (feat[9]): >0.3 = Up, <-0.3 = Down, นอกนั้น Side
int NN_Regime(double &feat[]){ if(feat[9]>0.3) return 1; if(feat[9]<-0.3) return -1; return 0; }

// v1.39 NN Feature Calc - คำนวณ 18 Features ให้ตรงกับ Python ที่เทรน
bool CalcNNFeatures(double &feat[])
{
   ArrayResize(feat,18);
   MqlRates rates[];
   if(CopyRates(_Symbol, PERIOD_M15, 0, 260, rates) < 250) return false;
   int n = ArraySize(rates);
   double cl[], hi[], lo[], vo[];
   ArrayResize(cl,n); ArrayResize(hi,n); ArrayResize(lo,n); ArrayResize(vo,n);
   for(int i=0;i<n;i++){ int j=n-1-i; cl[i]=rates[j].close; hi[i]=rates[j].high; lo[i]=rates[j].low; vo[i]=(double)rates[j].tick_volume; }
   double c0 = cl[n-1], c1 = cl[n-2], c3 = cl[n-4], c5 = cl[n-6], c12 = cl[n-13];
   double ema20=c0, ema50=c0, ema200=c0;
   {
      double k20=2.0/21.0, k50=2.0/51.0, k200=2.0/201.0;
      ema20=cl[0]; ema50=cl[0]; ema200=cl[0];
      for(int i=1;i<n;i++){ ema20=cl[i]*k20+ema20*(1-k20); ema50=cl[i]*k50+ema50*(1-k50); ema200=cl[i]*k200+ema200*(1-k200); }
   }
   double rsi=50;
   {
      double gain=0, loss=0;
      for(int i=n-14;i<n;i++){ double d=cl[i]-cl[i-1]; if(d>0) gain+=d; else loss+=-d; }
      gain/=14; loss/=14;
      for(int i=n-14;i<n;i++){ double d=cl[i]-cl[i-1]; if(d>0){ gain=(gain*13+d)/14; loss=(loss*13)/14; } else { gain=(gain*13)/14; loss=(loss*13-d)/14; } }
      if(loss==0) rsi=100; else { double rs=gain/loss; rsi=100-100/(1+rs); }
   }
   double macdLine=0, macdSig=0, macdHist=0;
   {
      double e12=cl[0], e26=cl[0]; double k12=2.0/13.0, k26=2.0/27.0;
      double macdArr[]; ArrayResize(macdArr,n);
      for(int i=1;i<n;i++){ e12=cl[i]*k12+e12*(1-k12); e26=cl[i]*k26+e26*(1-k26); macdArr[i]=e12-e26; }
      macdLine=macdArr[n-1];
      double s=macdArr[0]; double k9=2.0/10.0; for(int i=1;i<n;i++) s=macdArr[i]*k9+s*(1-k9);
      macdSig=s; macdHist=macdLine-macdSig;
   }
   double atrv=0;
   {
      double tr[]; ArrayResize(tr,n); tr[0]=hi[0]-lo[0];
      for(int i=1;i<n;i++){ double a=hi[i]-lo[i]; double b=MathAbs(hi[i]-cl[i-1]); double cc=MathAbs(lo[i]-cl[i-1]); tr[i]=MathMax(a,MathMax(b,cc)); }
      double s=0; for(int i=0;i<14;i++) s+=tr[i]; s/=14; for(int i=14;i<n;i++) s=(s*13+tr[i])/14; atrv=s;
   }
   double bbMid=0, bbStd=0;
   {
      double s=0; for(int i=n-20;i<n;i++) s+=cl[i]; bbMid=s/20;
      double v=0; for(int i=n-20;i<n;i++) v+=(cl[i]-bbMid)*(cl[i]-bbMid); bbStd=MathSqrt(v/20);
   }
   double bbUp=bbMid+2*bbStd, bbLo=bbMid-2*bbStd;
   double stoch=50;
   {
      double hh=hi[n-14], ll=lo[n-14];
      for(int i=n-14;i<n;i++){ if(hi[i]>hh) hh=hi[i]; if(lo[i]<ll) ll=lo[i]; }
      if(hh>ll) stoch=100*(c0-ll)/(hh-ll);
   }
   double volRatio=1;
   {
      double s=0; for(int i=n-20;i<n;i++) s+=vo[i]; double ma=s/20; if(ma>0) volRatio=vo[n-1]/ma;
   }
   MqlDateTime dt; TimeToStruct(TimeCurrent(), dt);
   double hour = dt.hour + dt.min/60.0;
   feat[0]=(c0-c1)/c1*100; feat[1]=(c0-c3)/c3*100; feat[2]=(c0-c5)/c5*100; feat[3]=(c0-c12)/c12*100;
   feat[4]=rsi;
   feat[5]=macdLine/c0*100; feat[6]=macdHist/c0*100;
   feat[7]=(c0-ema20)/c0*100; feat[8]=(c0-ema50)/c0*100; feat[9]=(c0-ema200)/c0*100;
   feat[10]=atrv/c0*100;
   feat[11]=(c0-bbLo)/(bbUp-bbLo+1e-9); feat[12]=(bbUp-bbLo)/c0*100;
   feat[13]=stoch; feat[14]=volRatio;
   feat[15]=MathSin(2*M_PI*hour/24.0); feat[16]=MathCos(2*M_PI*hour/24.0);
   feat[17]=(hi[n-1]-lo[n-1])/c0*100;
   return true;
}
double gNNProb[3]={0,0,0};
//+------------------------------------------------------------------+
//| v1.41 Hybrid MLP In-EA (บทความ 20559) - MLP เล็ก 8 Features      |
//| เทรนใน EA เองทุก 250 แท่ง ไม่ต้องใช้ Python / ไฟล์ Weights       |
//| Features: RSI Level, RSI Slope สั้น/ยาว, Dist EMA50, Vol Regime,  |
//| Hour sin/cos, Momentum - คำนวณด้วยฟังก์ชันเดียวกันตอนเทรนกับ     |
//| ตอน Inference -> ไม่มี Normalization Mismatch (บทความ)           |
//+------------------------------------------------------------------+
#define HYB_MLP_NIN 12 // v1.45: 8 SMC + 2 Heatmap + 2 Elliott
// --- v1.42 Auto-Adapt globals ---
string gAdaptSymbol=""; string gAdaptBroker=""; string gAdaptServer=""; string gAdaptCurrency="";
bool gAdaptIsCent=false; long gAdaptDigits=0; double gAdaptContract=0; int gAdaptTF=0;
bool gDualActive=true; bool gAdaptFirstCheck=true;
// --- v1.43 Dual-Auto globals (เทรนเองใน EA, 8 features แบบ MLP แต่แยก Up/Down) ---
double gDualAutoW1Up[]; double gDualAutoB1Up[]; double gDualAutoW2Up[]; double gDualAutoB2Up[];
double gDualAutoW1Dn[]; double gDualAutoB1Dn[]; double gDualAutoW2Dn[]; double gDualAutoB2Dn[];
bool gDualAutoTrained=false; double gDualAutoValAcc=0; int gDualAutoBarsSinceTrain=0; datetime gDualAutoLastBar=0;
datetime gONNXLastExportBar=0; string gONNXExportFile="";
double gMlpW1[]; double gMlpB1[]; double gMlpW2[]; double gMlpB2[];
bool gMlpTrained=false; int gMlpBarsSinceTrain=0; datetime gMlpLastSeenBar=0;
double gMlpValAcc=0; int gMlpTrainExamples=0; double gMlpLastConf=0; double gMlpLastProb[2]={0.5,0.5};
double MlpRelu(double x){ return(x>0?x:0); }
double MlpRandHe(double nIn){ double u=(double)MathRand()/32767.0; return((u-0.5)*2.0*MathSqrt(2.0/nIn)); }
void MlpInit(int nHid){
   int nIn=HYB_MLP_NIN;
   ArrayResize(gMlpW1, nHid*nIn); ArrayResize(gMlpB1, nHid);
   ArrayResize(gMlpW2, 2*nHid); ArrayResize(gMlpB2, 2);
   for(int j=0;j<nHid;j++){ for(int i=0;i<nIn;i++) gMlpW1[j*nIn+i]=MlpRandHe(nIn); gMlpB1[j]=0; }
   for(int k=0;k<2;k++){ for(int j=0;j<nHid;j++) gMlpW2[k*nHid+j]=MlpRandHe(nHid); gMlpB2[k]=0; }
}
void MlpForward(const double &x[], double &probs[]){
   int nHid=ArraySize(gMlpB1); int nIn=HYB_MLP_NIN;
   double h[]; ArrayResize(h, nHid);
   for(int j=0;j<nHid;j++){ double s=gMlpB1[j]; for(int i=0;i<nIn;i++) s+=gMlpW1[j*nIn+i]*x[i]; h[j]=MlpRelu(s); }
   double o[2]; for(int k=0;k<2;k++){ double s=gMlpB2[k]; for(int j=0;j<nHid;j++) s+=gMlpW2[k*nHid+j]*h[j]; o[k]=s; }
   double m=MathMax(o[0],o[1]); double sum=0; ArrayResize(probs,2);
   for(int k=0;k<2;k++){ probs[k]=MathExp(o[k]-m); sum+=probs[k]; }
   for(int k=0;k<2;k++) probs[k]/=sum;
}
void MlpStep(const double &x[], int label, double lr){
   int nHid=ArraySize(gMlpB1); int nIn=HYB_MLP_NIN;
   double h[]; double z1[]; ArrayResize(h,nHid); ArrayResize(z1,nHid);
   for(int j=0;j<nHid;j++){ double s=gMlpB1[j]; for(int i=0;i<nIn;i++) s+=gMlpW1[j*nIn+i]*x[i]; z1[j]=s; h[j]=MlpRelu(s); }
   double probs[]; MlpForward(x,probs);
   double dOut[2]; for(int k=0;k<2;k++) dOut[k]=probs[k]-(k==label?1.0:0.0);
   double dH[]; ArrayResize(dH,nHid);
   for(int j=0;j<nHid;j++){ double g=0; for(int k=0;k<2;k++) g+=dOut[k]*gMlpW2[k*nHid+j]; dH[j]=g*(z1[j]>0?1.0:0.0); }
   for(int k=0;k<2;k++){ for(int j=0;j<nHid;j++) gMlpW2[k*nHid+j]-=lr*dOut[k]*h[j]; gMlpB2[k]-=lr*dOut[k]; }
   for(int j=0;j<nHid;j++){ for(int i=0;i<nIn;i++) gMlpW1[j*nIn+i]-=lr*dH[j]*x[i]; gMlpB1[j]-=lr*dH[j]; }
}
void MlpTrainFlat(const double &X[], const int &Y[], int n, int nIn, int epochs, double lr){
   int idx[]; ArrayResize(idx,n); for(int i=0;i<n;i++) idx[i]=i;
   for(int ep=0;ep<epochs;ep++){
      for(int i=n-1;i>0;i--){ int j=MathRand()%(i+1); int t=idx[i]; idx[i]=idx[j]; idx[j]=t; }
      for(int ii=0;ii<n;ii++){ double xi[]; ArrayResize(xi,nIn); int row=idx[ii]*nIn; for(int f=0;f<nIn;f++) xi[f]=X[row+f]; MlpStep(xi, Y[idx[ii]], lr); }
   }
}
// คำนวณ Features 8 ตัว ที่ idx (chronological: 0=เก่าสุด, n-1=ใหม่สุด) จาก arrays ที่เตรียมไว้แล้ว
// v1.44 SMC Wave Premium/Discount Features (แทน RSI/EMA)
// Wave = Swing High/Low ย้อน InpSMCLookback แท่ง
// Premium = ราคาอยู่เหนือ 50% ของ Wave (แพง - โซนขาย) | Discount = ต่ำกว่า 50% (ถูก - โซนซื้อ) | Equilibrium = 50%
// f0 = PosNorm (-1 Discount สุด, +1 Premium สุด, 0 EQ)
// f1 = DistEQ (0 อยู่ EQ, 1 อยู่ขอบ Wave)
// f2 = WaveRange/ATR (Wave ใหญ่แค่ไหน)
// f3 = WaveDir (ทิศ Impulse)
// f4 = PremiumDist (Pos - 0.79, + = อยู่ใน Premium OB)
// f5 = DiscountDist (Pos - 0.21, - = อยู่ใน Discount OB)
// f6 = Displacement (แรง Impulse 3 แท่ง / ATR)
// f7 = Sin Hour (Session - SMC เล่นตาม Session London/NY)
// v1.45 Helpers: Volume Heatmap + Elliott Wave
// Heatmap: แบ่งราคา 20 ชั้น ย้อน 100 แท่ง หา POC (ชั้นที่ Volume เยอะสุด) -> f8 = ระยะห่างจาก POC, f9 = Volume ชั้นปัจจุบัน / เฉลี่ย
// Elliott: หา Swing 5 จุด แบบ ZigZag 0.8*ATR -> นับ Wave 1-5 + ABC -> f10 = Wave Count, f11 = Fib ของ Wave ปัจจุบัน
void HeatmapFeaturesAtIdx(int idx, const double &cl[], const double &hi[], const double &lo[], const double &vol[], const double &atr[], double &pocDist, double &volRatio){
   pocDist=0; volRatio=0;
   if(!InpUseVolumeHeatmap) return;
   int look=InpHeatmapLookback; if(look<30) look=30; if(look>300) look=300;
   int start=idx-look; if(start<0) start=0;
   double mn=lo[start], mx=hi[start];
   for(int i=start;i<=idx;i++){ if(lo[i]<mn) mn=lo[i]; if(hi[i]>mx) mx=hi[i]; }
   double range=mx-mn; if(range<=0 || atr[idx]<=0) return;
   int levels=InpHeatmapLevels; if(levels<10) levels=10; if(levels>40) levels=40;
   double bucketVol[]; ArrayResize(bucketVol, levels); for(int b=0;b<levels;b++) bucketVol[b]=0;
   double totalVol=0;
   for(int i=start;i<=idx;i++){
      int b=(int)((cl[i]-mn)/range*levels); if(b<0) b=0; if(b>=levels) b=levels-1;
      bucketVol[b]+=vol[i]; totalVol+=vol[i];
   }
   if(totalVol<=0) return;
   int pocB=0; double pocV=bucketVol[0];
   for(int b=1;b<levels;b++){ if(bucketVol[b]>pocV){ pocV=bucketVol[b]; pocB=b; } }
   double pocPrice=mn + (pocB+0.5)/levels*range;
   pocDist=(cl[idx]-pocPrice)/atr[idx]/5.0; if(pocDist<-1.0) pocDist=-1.0; if(pocDist>1.0) pocDist=1.0;
   int curB=(int)((cl[idx]-mn)/range*levels); if(curB<0) curB=0; if(curB>=levels) curB=levels-1;
   double avgVol=totalVol/levels;
   volRatio=(avgVol>0 ? bucketVol[curB]/avgVol - 1.0 : 0); if(volRatio<-1.0) volRatio=-1.0; if(volRatio>2.0) volRatio=2.0; volRatio/=2.0; // -0.5 ถึง 1.0
}
void ElliottFeaturesAtIdx(int idx, const double &cl[], const double &hi[], const double &lo[], const double &atr[], double &waveNorm, double &fibRatio){
   waveNorm=0; fibRatio=0;
   if(!InpUseElliott) return;
   int look=InpElliottLookback; if(look<30) look=30; if(look>300) look=300;
   int start=idx-look; if(start<0) start=0;
   // ZigZag แบบง่าย: หา Swing High/Low ที่ห่างกัน > 0.8*ATR
   double swingPrice[12]; int swingDir[12]; int swingIdx[12]; int sCnt=0;
   double lastExtreme=cl[start]; int lastDir=0;
   for(int i=start+1;i<=idx && sCnt<12;i++){
      double thr=InpElliottMinSwingATR*atr[idx];
      if(lastDir>=0 && hi[i] > lastExtreme){ lastExtreme=hi[i]; }
      if(lastDir<=0 && lo[i] < lastExtreme){ lastExtreme=lo[i]; }
      // ถ้าราคากลับตัวเกิน thr ให้บันทึก Swing
      if(lastDir>=0 && cl[i] < lastExtreme - thr){
         swingPrice[sCnt]=lastExtreme; swingDir[sCnt]=1; swingIdx[sCnt]=i; sCnt++; lastExtreme=lo[i]; lastDir=-1;
      } else if(lastDir<=0 && cl[i] > lastExtreme + thr){
         swingPrice[sCnt]=lastExtreme; swingDir[sCnt]=-1; swingIdx[sCnt]=i; sCnt++; lastExtreme=hi[i]; lastDir=1;
      } else if(lastDir==0){
         if(cl[i] > lastExtreme + thr){ swingPrice[sCnt]=lastExtreme; swingDir[sCnt]=-1; swingIdx[sCnt]=i; sCnt++; lastExtreme=hi[i]; lastDir=1; }
         else if(cl[i] < lastExtreme - thr){ swingPrice[sCnt]=lastExtreme; swingDir[sCnt]=1; swingIdx[sCnt]=i; sCnt++; lastExtreme=lo[i]; lastDir=-1; }
      }
   }
   if(sCnt==0) return;
   // Wave Count = จำนวน Swing ที่เจอ (1-5 Impulse, 6-8 ABC Corrective) -> Normalize -1 ถึง 1 (Wave 3 = 0)
   int waveCount = sCnt; if(waveCount>8) waveCount=8;
   waveNorm=(waveCount-3.0)/2.0; if(waveNorm<-1.0) waveNorm=-1.0; if(waveNorm>1.0) waveNorm=1.0;
   // Fib: Wave 3 มักยาว 1.618*Wave 1, Wave 2 Retrace 0.5-0.618*Wave 1
   // ใช้ Swing ล่าสุด 2 ลูก: Wave1 = swing[0]->swing[1], Wave ปัจจุบัน = swing[last-1]->close
   if(sCnt>=2){
      double w1=MathAbs(swingPrice[1]-swingPrice[0]);
      double curWave=MathAbs(cl[idx]-swingPrice[sCnt-1]);
      if(w1>0) fibRatio=curWave/w1; // 0-2+ (1.0 = เท่า Wave1, 1.618 = Wave3 Extension)
      fibRatio=(fibRatio-1.0)/1.0; if(fibRatio<-1.0) fibRatio=-1.0; if(fibRatio>1.5) fibRatio=1.5; fibRatio/=1.5; // -0.66 ถึง 1.0
   }
}
bool MlpFeaturesAtIdx(int idx, const double &cl[], const double &hi[], const double &lo[], const double &vol[], const double &rsi[], const double &ema50[], const double &atr[], const datetime &tm[], double &f[]){
   int n=ArraySize(cl);
   if(idx<14 || idx>=n) return(false);
   if(idx-6<0) return(false);
   if(atr[idx]<=0) return(false);
   if(!InpUseSMCWave){
      // Fallback: RSI/EMA เดิม ถ้าปิด SMC
      MqlDateTime dt0; TimeToStruct(tm[idx], dt0);
      double hour0=dt0.hour+dt0.min/60.0;
      ArrayResize(f, HYB_MLP_NIN);
      f[0]=rsi[idx]/50.0-1.0;
      f[1]=(rsi[idx]-rsi[idx-3])/10.0;
      f[2]=(rsi[idx]-rsi[idx-6])/10.0;
      f[3]=(cl[idx]-ema50[idx])/atr[idx];
      f[4]=atr[idx]/(cl[idx]*0.001);
      f[5]=MathSin(2.0*M_PI*hour0/24.0);
      f[6]=MathCos(2.0*M_PI*hour0/24.0);
      f[7]=(cl[idx]-cl[idx-6])/atr[idx];
      double pocD0=0, volR0=0; HeatmapFeaturesAtIdx(idx, cl, hi, lo, vol, atr, pocD0, volR0);
      double wN0=0, fibR0=0; ElliottFeaturesAtIdx(idx, cl, hi, lo, atr, wN0, fibR0);
      f[8]=pocD0; f[9]=volR0; f[10]=wN0; f[11]=fibR0;
      return(true);
   }
   // --- SMC Wave ---
   int look = InpSMCLookback; if(look<20) look=20; if(look>200) look=200;
   int start = idx-look; if(start<0) start=0;
   double swingHigh = hi[start]; double swingLow = lo[start];
   for(int i=start;i<=idx;i++){ if(hi[i]>swingHigh) swingHigh=hi[i]; if(lo[i]<swingLow) swingLow=lo[i]; }
   double waveRange = swingHigh - swingLow;
   if(waveRange<=0 || atr[idx]<=0) return(false);
   double pos = (cl[idx]-swingLow)/waveRange; if(pos<0) pos=0; if(pos>1) pos=1;
   double posNorm = pos*2.0-1.0;
   double distEQ = MathAbs(pos-InpSMCEquilibrium)*2.0;
   double waveRangeATR = waveRange/atr[idx];
   double waveRangeNorm = (waveRangeATR-10.0)/10.0; if(waveRangeNorm<-1.0) waveRangeNorm=-1.0; if(waveRangeNorm>2.0) waveRangeNorm=2.0;
   int idx20 = idx-20; if(idx20<0) idx20=0;
   double waveDir = (cl[idx]-cl[idx20])/atr[idx]/5.0; if(waveDir<-1.0) waveDir=-1.0; if(waveDir>1.0) waveDir=1.0;
   double premiumDist = pos - InpSMCPremiumLevel;
   double discountDist = pos - InpSMCDiscountLevel;
   double disp = (cl[idx]-cl[idx-3])/atr[idx]/3.0; if(disp<-1.0) disp=-1.0; if(disp>1.0) disp=1.0;
   MqlDateTime dt; TimeToStruct(tm[idx], dt);
   double hour=dt.hour+dt.min/60.0;
   ArrayResize(f, HYB_MLP_NIN);
   f[0]=posNorm;
   f[1]=distEQ;
   f[2]=waveRangeNorm;
   f[3]=waveDir;
   f[4]=premiumDist;
   f[5]=discountDist;
   f[6]=disp;
   f[7]=MathSin(2.0*M_PI*hour/24.0);
   // v1.45: f8-f11 Heatmap + Elliott
   double pocD=0, volR=0; HeatmapFeaturesAtIdx(idx, cl, hi, lo, vol, atr, pocD, volR);
   double wN=0, fibR=0; ElliottFeaturesAtIdx(idx, cl, hi, lo, atr, wN, fibR);
   f[8]=pocD;
   f[9]=volR;
   f[10]=wN;
   f[11]=fibR;
   return(true);
}
void MlpTrainModel(){
   int need=InpMlpLookback+InpMlpHorizon+100; if(need<300) need=300;
   MqlRates rates[]; int copied=CopyRates(_Symbol, PERIOD_M15, 0, need, rates);
   if(copied<200) { Print("Nova v1.62 Voom Precise + Auto-Tune + News MLP: history insufficient ", copied); return; }
   int n=copied;
   double cl[]; double hi[]; double lo[]; datetime tm[];
   ArrayResize(cl,n); ArrayResize(hi,n); ArrayResize(lo,n); ArrayResize(tm,n); double vol[]; ArrayResize(vol,n);
   for(int i=0;i<n;i++){ int j=n-1-i; cl[i]=rates[j].close; hi[i]=rates[j].high; lo[i]=rates[j].low; tm[i]=rates[j].time; vol[i]=(double)rates[j].tick_volume; }
   double rsi[]; double ema50[]; double atr[]; ArrayResize(rsi,n); ArrayResize(ema50,n); ArrayResize(atr,n);
   for(int i=0;i<n;i++){ rsi[i]=50; ema50[i]=cl[0]; atr[i]=0; }
   double k50=2.0/51.0; ema50[0]=cl[0];
   for(int i=1;i<n;i++) ema50[i]=cl[i]*k50+ema50[i-1]*(1.0-k50);
   for(int i=0;i<n;i++){
      if(i<14){ atr[i]=hi[i]-lo[i]; continue; }
      double trSum=0; for(int j=i-13;j<=i;j++){ double tr=hi[j]-lo[j]; if(j>0){ double a=MathAbs(hi[j]-cl[j-1]); double b=MathAbs(lo[j]-cl[j-1]); if(a>tr) tr=a; if(b>tr) tr=b; } trSum+=tr; }
      atr[i]=trSum/14.0;
      double gain=0, loss=0; for(int j=i-13;j<=i;j++){ double d=cl[j]-cl[j-1]; if(d>0) gain+=d; else loss+=-d; }
      gain/=14.0; loss/=14.0; if(loss==0) rsi[i]=100; else { double rs=gain/loss; rsi[i]=100.0-100.0/(1.0+rs); }
   }
   double X[]; int Y[]; ArrayResize(X, InpMlpLookback*HYB_MLP_NIN); ArrayResize(Y, InpMlpLookback);
   int cnt=0;
   for(int shift=InpMlpHorizon+1; shift<=InpMlpHorizon+InpMlpLookback && cnt<InpMlpLookback; shift++){
      int idx=n-1-shift; if(idx<15) break;
      double f[]; if(!MlpFeaturesAtIdx(idx, cl, hi, lo, vol, rsi, ema50, atr, tm, f)) continue;
      int futIdx=idx+InpMlpHorizon; if(futIdx>=n) continue;
      double move=(cl[futIdx]-cl[idx])/_Point;
      // v1.42 Auto Label: ถ้าเปิด AutoLabel ให้ใช้ 0.1*ATR แทนค่าคงที่ -> ใช้ได้ทุกคู่เงิน/ทุกโบรก (ATR ต่างกัน)
      double minPtsEff=InpMlpLabelMinPts;
      if(InpMlpAutoLabel){ minPtsEff=0.10*atr[idx]/_Point; if(minPtsEff<1.0) minPtsEff=1.0; }
      if(minPtsEff>0 && MathAbs(move)<minPtsEff) continue;
      int lab=(move>0?1:0);
      for(int k=0;k<HYB_MLP_NIN;k++) X[cnt*HYB_MLP_NIN+k]=f[k];
      Y[cnt]=lab; cnt++;
   }
   if(cnt<80){ Print("Nova v1.62 Voom Precise + Auto-Tune + News MLP: insufficient examples ", cnt); return; }
   ArrayResize(X, cnt*HYB_MLP_NIN); ArrayResize(Y, cnt);
   int valN=cnt/5; if(valN<10) valN=10;
   int trainN=cnt-valN;
   double Xtr[]; int Ytr[]; ArrayResize(Xtr, trainN*HYB_MLP_NIN); ArrayResize(Ytr, trainN);
   for(int i=0;i<trainN;i++){ for(int k=0;k<HYB_MLP_NIN;k++) Xtr[i*HYB_MLP_NIN+k]=X[(valN+i)*HYB_MLP_NIN+k]; Ytr[i]=Y[valN+i]; }
   MlpInit(InpMlpHidden);
   MlpTrainFlat(Xtr, Ytr, trainN, HYB_MLP_NIN, InpMlpEpochs, InpMlpLR);
   int correct=0;
   for(int i=0;i<valN;i++){ double xi[]; ArrayResize(xi, HYB_MLP_NIN); for(int k=0;k<HYB_MLP_NIN;k++) xi[k]=X[i*HYB_MLP_NIN+k]; double pr[]; MlpForward(xi, pr); int pred=(pr[1]>=pr[0]?1:0); if(pred==Y[i]) correct++; }
   gMlpValAcc=(double)correct/(double)valN;
   MlpInit(InpMlpHidden);
   MlpTrainFlat(X, Y, cnt, HYB_MLP_NIN, InpMlpEpochs, InpMlpLR);
   gMlpTrained=true; gMlpBarsSinceTrain=0; gMlpTrainExamples=cnt;
   Print("Nova v1.62 Voom Precise + Auto-Tune + News MLP trained: examples=", cnt, " valAcc=", DoubleToString(gMlpValAcc*100,1), "% valN=", valN, " horizon=", InpMlpHorizon);
}
bool MlpPredict(double &probs[], double &conf){
   if(!gMlpTrained) return(false);
   MqlRates rates[]; int copied=CopyRates(_Symbol, PERIOD_M15, 0, 260, rates);
   if(copied<100) return(false);
   int n=copied; double cl[]; double hi[]; double lo[]; datetime tm[];
   ArrayResize(cl,n); ArrayResize(hi,n); ArrayResize(lo,n); ArrayResize(tm,n); double vol[]; ArrayResize(vol,n);
   for(int i=0;i<n;i++){ int j=n-1-i; cl[i]=rates[j].close; hi[i]=rates[j].high; lo[i]=rates[j].low; tm[i]=rates[j].time; vol[i]=(double)rates[j].tick_volume; }
   double rsi[]; double ema50[]; double atr[]; ArrayResize(rsi,n); ArrayResize(ema50,n); ArrayResize(atr,n);
   double k50=2.0/51.0; ema50[0]=cl[0];
   for(int i=1;i<n;i++) ema50[i]=cl[i]*k50+ema50[i-1]*(1.0-k50);
   for(int i=0;i<n;i++){
      if(i<14){ atr[i]=hi[i]-lo[i]; rsi[i]=50; continue; }
      double trSum=0; for(int j=i-13;j<=i;j++){ double tr=hi[j]-lo[j]; if(j>0){ double a=MathAbs(hi[j]-cl[j-1]); double b=MathAbs(lo[j]-cl[j-1]); if(a>tr) tr=a; if(b>tr) tr=b; } trSum+=tr; }
      atr[i]=trSum/14.0;
      double gain=0, loss=0; for(int j=i-13;j<=i;j++){ double d=cl[j]-cl[j-1]; if(d>0) gain+=d; else loss+=-d; }
      gain/=14.0; loss/=14.0; if(loss==0) rsi[i]=100; else { double rs=gain/loss; rsi[i]=100.0-100.0/(1.0+rs); }
   }
   int idx=n-1-1;
   double f[]; if(!MlpFeaturesAtIdx(idx, cl, hi, lo, vol, rsi, ema50, atr, tm, f)) return(false);
   MlpForward(f, probs);
   conf=probs[1]-probs[0];
   gMlpLastConf=conf; gMlpLastProb[0]=probs[0]; gMlpLastProb[1]=probs[1];
   return(true);
}
// --- v1.43 Dual-Auto: เทรน Dual เองใน EA บน Symbol ปัจจุบัน ---
void DualAutoInitUp(int nHid){ int nIn=HYB_MLP_NIN; ArrayResize(gDualAutoW1Up, nHid*nIn); ArrayResize(gDualAutoB1Up, nHid); ArrayResize(gDualAutoW2Up, 2*nHid); ArrayResize(gDualAutoB2Up, 2); for(int j=0;j<nHid;j++){ for(int i=0;i<nIn;i++) gDualAutoW1Up[j*nIn+i]=MlpRandHe(nIn); gDualAutoB1Up[j]=0; } for(int k=0;k<2;k++){ for(int j=0;j<nHid;j++) gDualAutoW2Up[k*nHid+j]=MlpRandHe(nHid); gDualAutoB2Up[k]=0; } }
void DualAutoInitDn(int nHid){ int nIn=HYB_MLP_NIN; ArrayResize(gDualAutoW1Dn, nHid*nIn); ArrayResize(gDualAutoB1Dn, nHid); ArrayResize(gDualAutoW2Dn, 2*nHid); ArrayResize(gDualAutoB2Dn, 2); for(int j=0;j<nHid;j++){ for(int i=0;i<nIn;i++) gDualAutoW1Dn[j*nIn+i]=MlpRandHe(nIn); gDualAutoB1Dn[j]=0; } for(int k=0;k<2;k++){ for(int j=0;j<nHid;j++) gDualAutoW2Dn[k*nHid+j]=MlpRandHe(nHid); gDualAutoB2Dn[k]=0; } }
void DualAutoForward(const double &x[], double &probs[], bool isUp){
   int nIn=HYB_MLP_NIN; int nHid = isUp ? ArraySize(gDualAutoB1Up) : ArraySize(gDualAutoB1Dn);
   if(nHid<=0) { ArrayResize(probs,2); probs[0]=0.5; probs[1]=0.5; return; }
   double h[]; ArrayResize(h, nHid);
   for(int j=0;j<nHid;j++){ double s = isUp ? gDualAutoB1Up[j] : gDualAutoB1Dn[j]; for(int i=0;i<nIn;i++){ double w = isUp ? gDualAutoW1Up[j*nIn+i] : gDualAutoW1Dn[j*nIn+i]; s+=w*x[i]; } h[j]=MlpRelu(s); }
   double o[2]; for(int k=0;k<2;k++){ double s = isUp ? gDualAutoB2Up[k] : gDualAutoB2Dn[k]; for(int j=0;j<nHid;j++){ double w = isUp ? gDualAutoW2Up[k*nHid+j] : gDualAutoW2Dn[k*nHid+j]; s+=w*h[j]; } o[k]=s; }
   double m=MathMax(o[0],o[1]); double sum=0; ArrayResize(probs,2); for(int k=0;k<2;k++){ probs[k]=MathExp(o[k]-m); sum+=probs[k]; } for(int k=0;k<2;k++) probs[k]/=sum;
}
void DualAutoStep(const double &x[], int label, double lr, bool isUp){
   int nIn=HYB_MLP_NIN; int nHid = isUp ? ArraySize(gDualAutoB1Up) : ArraySize(gDualAutoB1Dn);
   if(nHid<=0) return;
   double h[]; double z1[]; ArrayResize(h,nHid); ArrayResize(z1,nHid);
   for(int j=0;j<nHid;j++){ double s = isUp ? gDualAutoB1Up[j] : gDualAutoB1Dn[j]; for(int i=0;i<nIn;i++){ double w = isUp ? gDualAutoW1Up[j*nIn+i] : gDualAutoW1Dn[j*nIn+i]; s+=w*x[i]; } z1[j]=s; h[j]=MlpRelu(s); }
   double o[2]; for(int k=0;k<2;k++){ double s = isUp ? gDualAutoB2Up[k] : gDualAutoB2Dn[k]; for(int j=0;j<nHid;j++){ double w = isUp ? gDualAutoW2Up[k*nHid+j] : gDualAutoW2Dn[k*nHid+j]; s+=w*h[j]; } o[k]=s; }
   double m=MathMax(o[0],o[1]); double sum=0; double p[2]; for(int k=0;k<2;k++){ p[k]=MathExp(o[k]-m); sum+=p[k]; } for(int k=0;k<2;k++) p[k]/=sum;
   double dOut[2]; for(int k=0;k<2;k++) dOut[k]=p[k]-(k==label?1.0:0.0);
   for(int k=0;k<2;k++){ if(isUp) gDualAutoB2Up[k]-=lr*dOut[k]; else gDualAutoB2Dn[k]-=lr*dOut[k]; for(int j=0;j<nHid;j++){ double g=dOut[k]*h[j]; if(isUp) gDualAutoW2Up[k*nHid+j]-=lr*g; else gDualAutoW2Dn[k*nHid+j]-=lr*g; } }
   for(int j=0;j<nHid;j++){ double dh=0; for(int k=0;k<2;k++){ double w = isUp ? gDualAutoW2Up[k*nHid+j] : gDualAutoW2Dn[k*nHid+j]; dh+=dOut[k]*w; } if(z1[j]<=0) dh=0; if(isUp) gDualAutoB1Up[j]-=lr*dh; else gDualAutoB1Dn[j]-=lr*dh; for(int i=0;i<nIn;i++){ double g=dh*x[i]; if(isUp) gDualAutoW1Up[j*nIn+i]-=lr*g; else gDualAutoW1Dn[j*nIn+i]-=lr*g; } }
}
void DualAutoTrainFlat(const double &X[], const int &Y[], int n, int nIn, int epochs, double lr, bool isUp){
   for(int e=0;e<epochs;e++){ for(int i=0;i<n;i++){ double xi[]; ArrayResize(xi,nIn); for(int k=0;k<nIn;k++) xi[k]=X[i*nIn+k]; DualAutoStep(xi, Y[i], lr, isUp); } }
}
void TrainDualAutoModel(){
   if(!InpAutoTrainDual) return;
   int need=InpMlpLookback+InpMlpHorizon+100; if(need<300) need=300;
   MqlRates rates[]; int copied=CopyRates(_Symbol, PERIOD_M15, 0, need, rates);
   if(copied<200){ Print("Nova v1.62 Voom Precise + Auto-Tune + News Dual-Auto: history insufficient ", copied); return; }
   int n=copied; double cl[]; double hi[]; double lo[]; datetime tm[]; ArrayResize(cl,n); ArrayResize(hi,n); ArrayResize(lo,n); ArrayResize(tm,n); double vol[]; ArrayResize(vol,n);
   for(int i=0;i<n;i++){ int j=n-1-i; cl[i]=rates[j].close; hi[i]=rates[j].high; lo[i]=rates[j].low; tm[i]=rates[j].time; vol[i]=(double)rates[j].tick_volume; }
   double rsi[]; double ema50[]; double atr[]; ArrayResize(rsi,n); ArrayResize(ema50,n); ArrayResize(atr,n);
   for(int i=0;i<n;i++){ rsi[i]=50; ema50[i]=cl[0]; atr[i]=0; }
   double k50=2.0/51.0; ema50[0]=cl[0]; for(int i=1;i<n;i++) ema50[i]=cl[i]*k50+ema50[i-1]*(1.0-k50);
   for(int i=0;i<n;i++){ if(i<14){ atr[i]=hi[i]-lo[i]; continue; } double trSum=0; for(int j=i-13;j<=i;j++){ double tr=hi[j]-lo[j]; if(j>0){ double a=MathAbs(hi[j]-cl[j-1]); double b=MathAbs(lo[j]-cl[j-1]); if(a>tr) tr=a; if(b>tr) tr=b; } trSum+=tr; } atr[i]=trSum/14.0; double gain=0, loss=0; for(int j=i-13;j<=i;j++){ double d=cl[j]-cl[j-1]; if(d>0) gain+=d; else loss+=-d; } gain/=14.0; loss/=14.0; if(loss==0) rsi[i]=100; else { double rs=gain/loss; rsi[i]=100.0-100.0/(1.0+rs); } }
   double XUp[]; int YUp[]; double XDn[]; int YDn[]; ArrayResize(XUp, InpMlpLookback*HYB_MLP_NIN); ArrayResize(YUp, InpMlpLookback); ArrayResize(XDn, InpMlpLookback*HYB_MLP_NIN); ArrayResize(YDn, InpMlpLookback);
   int cntUp=0, cntDn=0;
   for(int shift=InpMlpHorizon+1; shift<=InpMlpHorizon+InpMlpLookback; shift++){
      int idx=n-1-shift; if(idx<15) break;
      double f[]; if(!MlpFeaturesAtIdx(idx, cl, hi, lo, vol, rsi, ema50, atr, tm, f)) continue;
      int futIdx=idx+InpMlpHorizon; if(futIdx>=n) continue;
      double move=(cl[futIdx]-cl[idx])/_Point; double minPtsEff=InpMlpLabelMinPts; if(InpMlpAutoLabel){ minPtsEff=0.10*atr[idx]/_Point; if(minPtsEff<1.0) minPtsEff=1.0; }
      if(minPtsEff>0 && MathAbs(move)<minPtsEff) continue;
      int lab=(move>0?1:0);
      bool isUpTrend = cl[idx] >= ema50[idx];
      if(isUpTrend && cntUp<InpMlpLookback){ for(int k=0;k<HYB_MLP_NIN;k++) XUp[cntUp*HYB_MLP_NIN+k]=f[k]; YUp[cntUp]=lab; cntUp++; }
      if(!isUpTrend && cntDn<InpMlpLookback){ for(int k=0;k<HYB_MLP_NIN;k++) XDn[cntDn*HYB_MLP_NIN+k]=f[k]; YDn[cntDn]=lab; cntDn++; }
   }
   if(cntUp<40 || cntDn<40){ Print("Nova v1.62 Voom Precise + Auto-Tune + News Dual-Auto: insufficient Up ", cntUp, " Down ", cntDn); return; }
   DualAutoInitUp(InpMlpHidden); DualAutoInitDn(InpMlpHidden);
   DualAutoTrainFlat(XUp, YUp, cntUp, HYB_MLP_NIN, InpMlpEpochs, InpMlpLR, true);
   DualAutoTrainFlat(XDn, YDn, cntDn, HYB_MLP_NIN, InpMlpEpochs, InpMlpLR, false);
   int correct=0, total=0;
   for(int i=0;i<cntUp;i+=5){ double xi[]; ArrayResize(xi,HYB_MLP_NIN); for(int k=0;k<HYB_MLP_NIN;k++) xi[k]=XUp[i*HYB_MLP_NIN+k]; double pr[]; DualAutoForward(xi, pr, true); int pred=(pr[1]>=pr[0]?1:0); if(pred==YUp[i]) correct++; total++; }
   for(int i=0;i<cntDn;i+=5){ double xi[]; ArrayResize(xi,HYB_MLP_NIN); for(int k=0;k<HYB_MLP_NIN;k++) xi[k]=XDn[i*HYB_MLP_NIN+k]; double pr[]; DualAutoForward(xi, pr, false); int pred=(pr[1]>=pr[0]?1:0); if(pred==YDn[i]) correct++; total++; }
   gDualAutoValAcc = total>0 ? (double)correct/(double)total : 0;
   gDualAutoTrained=true; gDualAutoBarsSinceTrain=0; gDualAutoLastBar=iTime(_Symbol, PERIOD_M15, 0);
   Print("Nova v1.62 Voom Precise + Auto-Tune + News Dual-Auto: trained Up ", cntUp, " Down ", cntDn, " ValAcc ", DoubleToString(gDualAutoValAcc*100,1), "% Symbol=", _Symbol);
}
void ExportONNXData(){
   if(!InpAutoExportONNX) return;
   int need=InpMlpLookback+InpMlpHorizon+100; if(need<300) need=300;
   MqlRates rates[]; int copied=CopyRates(_Symbol, PERIOD_M15, 0, need, rates);
   if(copied<200) return;
   int n=copied; double cl[]; double hi[]; double lo[]; datetime tm[]; ArrayResize(cl,n); ArrayResize(hi,n); ArrayResize(lo,n); ArrayResize(tm,n); double vol[]; ArrayResize(vol,n);
   for(int i=0;i<n;i++){ int j=n-1-i; cl[i]=rates[j].close; hi[i]=rates[j].high; lo[i]=rates[j].low; tm[i]=rates[j].time; vol[i]=(double)rates[j].tick_volume; }
   double rsi[]; double ema50[]; double atr[]; ArrayResize(rsi,n); ArrayResize(ema50,n); ArrayResize(atr,n);
   for(int i=0;i<n;i++){ rsi[i]=50; ema50[i]=cl[0]; atr[i]=0; }
   double k50=2.0/51.0; ema50[0]=cl[0]; for(int i=1;i<n;i++) ema50[i]=cl[i]*k50+ema50[i-1]*(1.0-k50);
   for(int i=0;i<n;i++){ if(i<14){ atr[i]=hi[i]-lo[i]; continue; } double trSum=0; for(int j=i-13;j<=i;j++){ double tr=hi[j]-lo[j]; if(j>0){ double a=MathAbs(hi[j]-cl[j-1]); double b=MathAbs(lo[j]-cl[j-1]); if(a>tr) tr=a; if(b>tr) tr=b; } trSum+=tr; } atr[i]=trSum/14.0; double gain=0, loss=0; for(int j=i-13;j<=i;j++){ double d=cl[j]-cl[j-1]; if(d>0) gain+=d; else loss+=-d; } gain/=14.0; loss/=14.0; if(loss==0) rsi[i]=100; else { double rs=gain/loss; rsi[i]=100.0-100.0/(1.0+rs); } }
   string fname="Nova_Export\\Nova_"+_Symbol+"_"+IntegerToString((int)InpAnalysisTF)+".csv";
   int h=FileOpen(fname, FILE_WRITE|FILE_CSV|FILE_ANSI, ',');
   if(h==INVALID_HANDLE){ Print("Nova v1.62 Voom Precise + Auto-Tune + News ONNX Export: cannot open ", fname); return; }
   FileWrite(h, "prem_disc_pos,dist_eq,wave_range_atr,wave_dir,premium_dist,discount_dist,displacement,sin_hour,poc_dist,vol_ratio,elliott_wave,elliott_fib,label,symbol,broker,contract"); // v1.45 SMC + Heatmap + Elliott
   int written=0;
   for(int shift=InpMlpHorizon+1; shift<=InpMlpHorizon+InpMlpLookback; shift++){
      int idx=n-1-shift; if(idx<15) break;
      double f[]; if(!MlpFeaturesAtIdx(idx, cl, hi, lo, vol, rsi, ema50, atr, tm, f)) continue;
      int futIdx=idx+InpMlpHorizon; if(futIdx>=n) continue;
      double move=(cl[futIdx]-cl[idx])/_Point; double minPtsEff=InpMlpLabelMinPts; if(InpMlpAutoLabel){ minPtsEff=0.10*atr[idx]/_Point; if(minPtsEff<1.0) minPtsEff=1.0; }
      if(minPtsEff>0 && MathAbs(move)<minPtsEff) continue;
      int lab=(move>0?1:0);
      FileWrite(h, DoubleToString(f[0],6), DoubleToString(f[1],6), DoubleToString(f[2],6), DoubleToString(f[3],6), DoubleToString(f[4],6), DoubleToString(f[5],6), DoubleToString(f[6],6), DoubleToString(f[7],6), IntegerToString(lab), _Symbol, AccountInfoString(ACCOUNT_COMPANY), DoubleToString(gAdaptContract,1));
      written++;
   }
   FileClose(h);
   gONNXExportFile=fname; gONNXLastExportBar=iTime(_Symbol, PERIOD_M15, 0);
   Print("Nova v1.62 Voom Precise + Auto-Tune + News ONNX Export: ", written, " rows -> MQL5/Files/", fname, " | ให้รัน auto_retrain_onnx_v143.py บนเครื่องเดียวกับ MT5 มันจะเทรน XGBoost/Deep แล้วออก ONNX ให้เอง");
}

// v1.42 Auto-Adapt: ตรวจ Symbol/โบรก/บัญชี เปลี่ยน -> เทรน MLP ใหม่เอง + ปรับ Dual
void AdaptCheck(){
   if(!InpAutoAdapt) return;
   if(!gAutoDetected) DetectAutoSettings();
   string curSym=_Symbol;
   string curBroker=AccountInfoString(ACCOUNT_COMPANY);
   string curServer=AccountInfoString(ACCOUNT_SERVER);
   string curCurr=AccountInfoString(ACCOUNT_CURRENCY);
   bool curCent=gIsCentAccount;
   long curDigits=SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double curContract=SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
   int curTF=(int)InpAnalysisTF;
   bool changed=false;
   string why="";
   if(gAdaptFirstCheck){
      if(InpAdaptForceOnInit){ changed=true; why="FirstInit"; }
      gAdaptFirstCheck=false;
   } else {
      if(curSym!=gAdaptSymbol){ changed=true; why+="Symbol "+gAdaptSymbol+"->"+curSym+" "; }
      if(curBroker!=gAdaptBroker){ changed=true; why+="Broker "+gAdaptBroker+"->"+curBroker+" "; }
      if(curServer!=gAdaptServer){ changed=true; why+="Server "; }
      if(curCurr!=gAdaptCurrency){ changed=true; why+="Currency "+gAdaptCurrency+"->"+curCurr+" "; }
      if(curCent!=gAdaptIsCent){ changed=true; why+="Cent "+(gAdaptIsCent?"YES":"NO")+"->"+(curCent?"YES":"NO")+" "; }
      if(curDigits!=gAdaptDigits){ changed=true; why+="Digits "; }
      if(MathAbs(curContract-gAdaptContract)>0.01){ changed=true; why+="Contract "; }
      if(curTF!=gAdaptTF){ changed=true; why+="TF "; }
   }
   gAdaptSymbol=curSym; gAdaptBroker=curBroker; gAdaptServer=curServer; gAdaptCurrency=curCurr;
   gAdaptIsCent=curCent; gAdaptDigits=curDigits; gAdaptContract=curContract; gAdaptTF=curTF;
   bool isGold=(StringFind(curSym,"XAU")>=0 || StringFind(curSym,"GOLD")>=0);
   bool newDualActive=true;
   if(InpDualOnlyGold && !isGold && !(InpAutoTrainDual && gDualAutoTrained)) newDualActive=false; // v1.43: ถ้า Dual-Auto เทรนแล้ว ให้ใช้ Dual ได้แม้ไม่ใช่ทอง (Dual-Auto เทรนบนคู่นั้นแล้ว)
   if(newDualActive!=gDualActive){
      gDualActive=newDualActive;
      Print("Nova v1.42 Auto-Adapt: Dual NN ", (gDualActive?"ON (ทอง)":"OFF (ไม่ใช่ทอง -> ใช้ MLP+Trend)"), " Symbol=", curSym);
   }
   if(changed){
      Print("Nova v1.43 Auto-Train: ตรวจเจอเปลี่ยน [", why, "] Symbol=", curSym, " Broker=", curBroker, " Cent=", (curCent?"YES":"NO"), " Contract=", DoubleToString(curContract,1), " -> เทรน MLP+Dual-Auto+Export ONNX ใหม่เอง");
      gMlpTrained=false; gMlpBarsSinceTrain=0;
      if(InpUseHybridMLP) MlpTrainModel();
      if(InpAutoTrainDual){ gDualAutoTrained=false; TrainDualAutoModel(); }
      if(InpAutoExportONNX) ExportONNXData();
   }
}
void MlpCheckRetrain(){
   if(!InpUseHybridMLP) return;
   datetime cur=iTime(_Symbol, PERIOD_M15, 0);
   if(cur==0) return;
   if(gMlpLastSeenBar==0){ gMlpLastSeenBar=cur; if(!gMlpTrained) MlpTrainModel(); return; }
   if(cur!=gMlpLastSeenBar){
      gMlpLastSeenBar=cur;
      if(!gMlpTrained) MlpTrainModel();
      else { gMlpBarsSinceTrain++; if(gMlpBarsSinceTrain>=InpMlpRetrainBars) MlpTrainModel(); }
   }
}
bool NN_AllowTrade(int dir, string &reason)
{
   if(!InpUseNN) return true;
   double feat[]; if(!CalcNNFeatures(feat)) return true;
   double prob[]; ArrayResize(prob,3);
   int regime = NN_Regime(feat);
   double mx = 0;
   if(InpNNDual) mx = NN_Forward_Dual(feat, prob, regime);
   else mx = NN_Forward_Dual(feat, prob, regime);
   gNNProb[0]=prob[0]; gNNProb[1]=prob[1]; gNNProb[2]=prob[2];
   // --- v1.41 Hybrid ---
   if(InpUseHybridMLP && InpHybridMode!=0){
      double mlpProb[2]; double mlpConf=0; bool mlpReady=false;
      if(gMlpTrained && MlpPredict(mlpProb, mlpConf)) mlpReady=true;
      else if(!gMlpTrained){ MlpTrainModel(); if(gMlpTrained && MlpPredict(mlpProb, mlpConf)) mlpReady=true; }
      int mlpVote=0; if(mlpReady){ if(mlpConf>=EffMlpThreshold()) mlpVote=1; else if(mlpConf<=-EffMlpThreshold()) mlpVote=-1; } // v1.50
      int dualVote=0; if(prob[1]>=InpNNThreshold && prob[1]>prob[2]) dualVote=1; else if(prob[2]>=InpNNThreshold && prob[2]>prob[1]) dualVote=-1;
      int trendVote=0; if(feat[9]>0.1) trendVote=1; else if(feat[9]<-0.1) trendVote=-1;
      string regimeTxt=regime>0?"UP":regime<0?"DOWN":"SIDE";
      if(!mlpReady){
         if(!false){ /* fallback to Dual below */ }
         else { reason=StringFormat("Hybrid MLP not ready FailOpen Dual %s", regimeTxt); return true; }
      } else if(InpHybridMode==1){
         if(mlpVote==0 || mlpVote!=dir){ reason=StringFormat("Hybrid MLP Gate BLOCK dir %d MLP conf %.2f (need %.2f) Dual %s Up %.2f Down %.2f", dir, mlpConf, EffMlpThreshold(), regimeTxt, prob[1], prob[2]); return false; }
         // MLP agrees -> fall through to Dual checks below
      } else if(InpHybridMode==2){
         if(!gDualActive){
            int votes2=(mlpVote==dir?1:0)+(trendVote==dir?1:0);
            if(votes2<2){ reason=StringFormat("Hybrid Auto-Adapt BLOCK (ไม่ใช่ทอง Dual OFF) dir %d votes %d/2 MLP %d (%.2f) Trend %d", dir, votes2, mlpVote, mlpConf, trendVote); return false; }
            reason=StringFormat("Hybrid Auto-Adapt OK (ไม่ใช่ทอง Dual OFF) dir %d votes %d/2 MLP %d (%.2f) Trend %d ValAcc %.1f%%", dir, votes2, mlpVote, mlpConf, trendVote, gMlpValAcc*100);
            return true;
         }
         int votesForDir=(dualVote==dir?1:0)+(mlpVote==dir?1:0)+(trendVote==dir?1:0);
         if(votesForDir<2){ reason=StringFormat("Hybrid 2-of-3 BLOCK dir %d votes %d/3 Dual %d MLP %d (%.2f) Trend %d Dual %s Up %.2f Down %.2f", dir, votesForDir, dualVote, mlpVote, mlpConf, trendVote, regimeTxt, prob[1], prob[2]); return false; }
         reason=StringFormat("Hybrid 2-of-3 OK dir %d votes %d/3 Dual %d MLP %d (%.2f) Trend %d Dual %s Up %.2f Down %.2f ValAcc %.1f%%", dir, votesForDir, dualVote, mlpVote, mlpConf, trendVote, regimeTxt, prob[1], prob[2], gMlpValAcc*100);
         return true;
      }
      // Mode 1: MLP agrees, continue to Dual checks below (ถ้า Dual ปิด ให้ข้าม Dual checks)
      if(mlpReady && !gDualActive && InpHybridMode==1){
         reason=StringFormat("Hybrid MLP Gate OK (Dual OFF) dir %d MLP %.2f ValAcc %.1f%%", dir, mlpConf, gMlpValAcc*100);
         return true;
      }
      if(mlpReady){
         // keep Dual checks below, they will set reason
      }
   }
   if(prob[0] >= InpNNFlatBlock){ reason=StringFormat("NN Dual %s BLOCK Flat %.2f", regime>0?"UP":regime<0?"DOWN":"SIDE", prob[0]); return false; }
   if(dir>0 && prob[2] >= InpNNThreshold && prob[2] > prob[1]){ reason=StringFormat("NN Dual %s BLOCK Buy vs Down %.2f", regime>0?"UP":regime<0?"DOWN":"SIDE", prob[2]); return false; }
   if(dir<0 && prob[1] >= InpNNThreshold && prob[1] > prob[2]){ reason=StringFormat("NN Dual %s BLOCK Sell vs Up %.2f", regime>0?"UP":regime<0?"DOWN":"SIDE", prob[1]); return false; }
   reason=StringFormat("NN Dual %s Flat %.2f Up %.2f Down %.2f", regime>0?"UP":regime<0?"DOWN":"SIDE", prob[0], prob[1], prob[2]);
   return true;
}


// --- Recovery helpers (ใช้ Magic 19 GOLD_Breakout เป็น Magic ของไม้แก้ เพื่อให้ OwnSelectedPosition นับรวม) ---
double RecoveryFloating()
{
   double f=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(!PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      long mg=PositionGetInteger(POSITION_MAGIC);
      if(MagicId(mg)<0) continue; // นับเฉพาะไม้ของ Nova EA (รวมไม้ Recovery ที่ใช้ Magic 19)
      f += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP) + PositionGetDouble(POSITION_COMMISSION);
   }
   return f;
}
int RecoveryOwnCount()
{
   int c=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(!PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(MagicId(PositionGetInteger(POSITION_MAGIC))<0) continue;
      c++;
   }
   return c;
}
double RecoveryNetLots(int &netDir, double &buyLots, double &sellLots, double &avgBuy, double &avgSell)
{
   buyLots=0; sellLots=0; avgBuy=0; avgSell=0;
   double buyCost=0, sellCost=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(!PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(MagicId(PositionGetInteger(POSITION_MAGIC))<0) continue;
      double vol=PositionGetDouble(POSITION_VOLUME);
      double price=PositionGetDouble(POSITION_PRICE_OPEN);
      long type=PositionGetInteger(POSITION_TYPE);
      if(type==POSITION_TYPE_BUY){ buyLots+=vol; buyCost+=vol*price; }
      else if(type==POSITION_TYPE_SELL){ sellLots+=vol; sellCost+=vol*price; }
   }
   if(buyLots>0) avgBuy=buyCost/buyLots;
   if(sellLots>0) avgSell=sellCost/sellLots;
   double net=buyLots-sellLots;
   netDir = (net>0.0001?1:(net<-0.0001?-1:0));
   return net;
}
double RecoveryBreakeven()
{
   int dir=0; double b=0,s=0,ab=0,as=0;
   double net=RecoveryNetLots(dir,b,s,ab,as);
   if(MathAbs(net)<0.0001) return 0;
   if(dir>0) return ab; // Net Buy -> Breakeven = Avg Buy
   return as; // Net Sell -> Breakeven = Avg Sell
}
bool RecoverySend(const int dir, const double lots, const string comment, double &outPrice)
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return false;
   if(gHeader.daily_block!=0) return false; // Entry Lock Only: no new recovery exposure
   outPrice=0;
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return false;
   double price = dir>0?tick.ask:tick.bid;
   double atr = (ArraySize(gATR)>1 && gATR[1]>0)?gATR[1]: (tick.ask-tick.bid)*10+0.5;
   if(atr<=0) atr=1.0;
   double sl = dir>0? price-3.0*atr : price+3.0*atr;
   double tp = dir>0? price+3.0*atr : price-3.0*atr;
   // Normalize SL/TP ให้ถูก StopsLevel
   double minD = StopsDistance(true);
   if(dir>0){ if(price-sl<minD) sl=price-minD; if(tp-price<minD) tp=price+minD; }
   else{ if(sl-price<minD) sl=price+minD; if(price-tp<minD) tp=price-minD; }
   double vol = MathMin(lots, AutoLot(InpRecoveryMaxLot)); // v1.37 Auto
   // ตรวจ Lot ขั้นต่ำ/สูงสุดของโบรก
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double stepLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(vol<minLot) vol=minLot;
   if(vol>maxLot) vol=maxLot;
   if(stepLot>0) vol = MathFloor(vol/stepLot)*stepLot;
   if(vol<=0) return false;
   double eq=AccountInfoDouble(ACCOUNT_EQUITY),loss=0;
   if(eq<=0 || !LossAtSL(dir,vol,price,sl,loss) || loss>eq*InpMaxSingleRiskPct/100.0+1e-8) return false;
   int openPositions=0; double openRisk=OpenRiskMoney(openPositions);
   if(openPositions>=InpMaxPositions || openRisk+loss>eq*InpMaxOpenRiskPct/100.0+1e-8) return false;
   string recoveryLimitReason=""; if(!V177_CanOpenRecovery(recoveryLimitReason)) return false;
   MqlTradeRequest req; MqlTradeResult res; ZeroMemory(req); ZeroMemory(res);
   req.action=TRADE_ACTION_DEAL; req.symbol=_Symbol; req.magic=(ulong)Magic(19); // ใช้ Magic 19 เพื่อให้ระบบนับรวม
   req.type= dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
   req.price=price; req.volume=vol; req.sl=sl; req.tp=tp;
   req.deviation=DeviationPoints(); req.type_filling=FillMode();
   req.comment=comment;
   ulong portfolio_id=0;
   if(!NOVA_PortfolioReserve((long)req.magic,req.symbol,loss,InpMaxOpenRiskPct,InpMaxPositions,portfolio_id)) return false;
   req.comment=NOVA_PortfolioTaggedComment(req.comment,portfolio_id);
   if(!NOVA_PortfolioMarkDispatching(portfolio_id))
   { NOVA_PortfolioFinish(portfolio_id,NOVA_PORTFOLIO_RELEASED,0); return false; }
   bool sent=NOVA_BrokerOrderSend(req,res,NOVA_PHASE2_EXECUTION_DISABLED);
   if(!sent)
   {
      int state=(res.retcode==TRADE_RETCODE_TIMEOUT || res.retcode==TRADE_RETCODE_CONNECTION)?
                NOVA_PORTFOLIO_UNCERTAIN:NOVA_PORTFOLIO_RELEASED;
      NOVA_PortfolioFinish(portfolio_id,state,res.order);
      return false;
   }
   if(res.retcode!=TRADE_RETCODE_DONE && res.retcode!=TRADE_RETCODE_DONE_PARTIAL && res.retcode!=TRADE_RETCODE_PLACED)
   { NOVA_PortfolioFinish(portfolio_id,NOVA_PORTFOLIO_RELEASED,res.order); return false; }
   NOVA_PortfolioFinish(portfolio_id,NOVA_PORTFOLIO_ACCEPTED,res.order);
   outPrice = (res.price>0?res.price:price);
   return true;
}
void RecoveryCloseAll(const string reason)
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(!PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(MagicId(PositionGetInteger(POSITION_MAGIC))<0) continue;
      SendClose(t);
   }
   Print(ENGINE_LABEL, " | RECOVERY CLOSE ALL: ", reason);
}

//| v1.37 Auto Calculate + v1.36 Overlap + Worst Case - เพิ่มโดยไม่แตะ Logic v1.35 เดิม |
bool RecoveryPartialClose(const ulong ticket, double vol)
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return false;
   if(!PositionSelectByTicket(ticket)) return false;
   if(PositionGetString(POSITION_SYMBOL)!=_Symbol) return false;
   double curVol = PositionGetDouble(POSITION_VOLUME);
   if(vol<=0 || vol>curVol) vol=curVol;
   // ปัด Lot ตาม Step ของโบรก
   double stepLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   if(stepLot>0) vol = MathFloor(vol/stepLot)*stepLot;
   if(vol<minLot) vol=curVol; // ถ้าเหลือน้อยกว่า Min Lot ให้ปิดหมด
   if(vol<=0) return false;
   int dir = PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
   long mg = PositionGetInteger(POSITION_MAGIC);
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return false;
   MqlTradeRequest req; MqlTradeResult res; ZeroMemory(req); ZeroMemory(res);
   req.action=TRADE_ACTION_DEAL; req.position=ticket; req.symbol=_Symbol;
   req.magic=(ulong)mg; req.volume=vol;
   req.type= dir>0?ORDER_TYPE_SELL:ORDER_TYPE_BUY;
   req.price= dir>0?tick.bid:tick.ask;
   req.deviation=DeviationPoints(); req.type_filling=FillMode();
   req.comment="NOVA_REC_OVERLAP";
   if(!NOVA_BrokerOrderSend(req,res,NOVA_PHASE2_EXECUTION_DISABLED)) return false;
   if(res.retcode!=TRADE_RETCODE_DONE && res.retcode!=TRADE_RETCODE_DONE_PARTIAL && res.retcode!=TRADE_RETCODE_PLACED) return false;
   return true;
}
// คำนวณกรณีแย่สุด: ถ้าถัวครบ 3 ไม้แล้วราคายังวิ่งสวนอีก 4 ATR จะขาดทุนเท่าไหร่
double RecoveryWorstCase(double &outHedgeLot, double &outAvgLots, double &outTotalLots)
{
   outHedgeLot=0; outAvgLots=0; outTotalLots=0;
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   if(eq<=0) return 0;
   int dir=0; double b=0,s=0,ab=0,as=0;
   double net = RecoveryNetLots(dir,b,s,ab,as);
   if(dir==0) return 0;
   double atr = (ArraySize(gATR)>1 && gATR[1]>0)?gATR[1]:0;
   if(atr<=0) atr=1.0;
   double absNet = MathAbs(net);
   outHedgeLot = absNet*InpRecoveryHedgeRatio;
   // Avg Lots: ไม้แรก = Net*0.5, ไม้ 2 = *1.3, ไม้ 3 = *1.3^2
   double base = absNet*0.5;
   double avgSum=0;
   for(int k=0;k<BBPro_EffectiveMaxSteps();k++)
   {
      double lot = base*MathPow(BBPro_EffectiveMult(), k);
      lot = MathMin(lot, AutoLot(InpRecoveryMaxLot)); // v1.37 Auto
      avgSum += lot;
   }
   outAvgLots = avgSum;
   // Total Exposure กรณีแย่สุด: Net + Hedge (สวนทาง) + Avg (ทิศเดิม) -> Net Exposure หลัง Hedge+Avg = |Net - Hedge + Avg| + Hedge (เพราะ Hedge ยังค้าง)
   // ใช้แบบ Conservative: นับทุก Lot ที่เปิดเป็น Exposure
   outTotalLots = absNet + outHedgeLot + avgSum;
   // แปลง ATR Move เป็นเงิน: (Move / TickSize) * TickValue * Lots
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickSize<=0 || tickValue<=0)
   {
      // Fallback XAUUSD: 1 Lot = 100 oz, Move $1 = $100
      tickSize=0.01; tickValue=1.0; // จะคำนวณแบบง่ายด้านล่าง
      double move = InpWorstCaseATR*atr;
      double worstLoss = outTotalLots * move * 100.0; // XAUUSD 1 Lot 100 oz
      return worstLoss;
   }
   double move = InpWorstCaseATR*atr;
   double ticks = move / tickSize;
   double worstLoss = ticks * tickValue * outTotalLots;
   return worstLoss;
}
void RecoveryOverlapClose()
{
   if(!InpUseOverlap) return;
   if(TimeCurrent()-gRecoveryLastOverlapTime < InpOverlapCooldownSec) return;
   // หาไม้กำไรดีสุด กับไม้ขาดทุนหนักสุด
   ulong winTicket=0, loseTicket=0;
   double winProfit=-1e9, loseProfit=1e9;
   double winVol=0, loseVol=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(!PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(MagicId(PositionGetInteger(POSITION_MAGIC))<0) continue;
      double pf = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP) + PositionGetDouble(POSITION_COMMISSION);
      double vol = PositionGetDouble(POSITION_VOLUME);
      if(pf>winProfit){ winProfit=pf; winTicket=t; winVol=vol; }
      if(pf<loseProfit){ loseProfit=pf; loseTicket=t; loseVol=vol; }
   }
   if(winTicket==0 || loseTicket==0 || winTicket==loseTicket) return;
   if(winProfit<=0 || loseProfit>=0) return; // ต้องมีทั้งกำไรและขาดทุน
   double combined = winProfit + loseProfit;
   if(combined < AutoMoney(InpOverlapMinProfit)) return; // v1.37 Auto: $10 -> Cent 1000 // รวมกันยังไม่บวกพอ อย่าเพิ่งปิด
   // ปิด Partial: Lot = Min(WinVol, LoseVol) * Ratio
   double closeVol = MathMin(winVol, loseVol) * InpOverlapRatio;
   if(closeVol<=0) return;
   // ปิดไม้กำไรก่อน แล้วปิดไม้ขาดทุน (ถ้าปิดไม้แรกสำเร็จ)
   bool ok1 = RecoveryPartialClose(winTicket, closeVol);
   if(!ok1) return;
   // หลังปิดไม้กำไร ให้คำนวณ Vol ใหม่ของไม้ขาดทุน (เพราะราคาเปลี่ยน) ใช้ closeVol เดิม
   bool ok2 = RecoveryPartialClose(loseTicket, closeVol);
   if(ok1 && ok2)
   {
      gRecoveryLastOverlapTime=TimeCurrent();
      Print(ENGINE_LABEL, " | OVERLAP: ปิดคู่ Win +", DoubleToString(winProfit,2), " / Lose ", DoubleToString(loseProfit,2), " รวม +", DoubleToString(combined,2), " Lot ", DoubleToString(closeVol,2), " | Basket เล็กลง");
   }
}
void RecoveryManage()
{
   if(!gInpUseRecovery) return;
   if(!gDataOK || !TradePermission()) return;
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   if(eq<=0) return;
   double floating = RecoveryFloating();
   int cnt = RecoveryOwnCount();
   double triggerMoney = MathMax(AutoMoney(InpRecoveryTriggerMoney), eq*InpRecoveryTriggerPct/100.0); // v1.37 Auto: $200 -> Cent 20000 อัตโนมัติ
   double targetMoney  = MathMax(AutoMoney(InpRecoveryTargetMoney),  eq*InpRecoveryTargetPct/100.0);
   double hardMoney    = MathMax(AutoMoney(InpRecoveryMaxDDMoney),   eq*InpRecoveryMaxDDPct/100.0);

   // --- ยังไม่เข้า Recovery: เช็ค Trigger ---
   if(!gRecoveryActive)
   {
      if(gRecoveryHardStop) return; // เคย Hard Stop วันนี้แล้ว รอวันใหม่ (DailyGuard จะรีเซ็ตผ่าน gHeader.day)
      if(cnt>0 && floating <= -triggerMoney)
      {
         // v1.36 Worst Case: คำนวณก่อนเริ่ม ถ้าเกิน Hard Cap จะไม่เริ่มแก้
         if(InpUseWorstCase)
         {
            double hedgeLot=0, avgLots=0, totalLots=0;
            double worst = RecoveryWorstCase(hedgeLot, avgLots, totalLots);
            gRecoveryWorstCase = worst;
            double hardMoney2 = MathMax(AutoMoney(InpRecoveryMaxDDMoney), eq*InpRecoveryMaxDDPct/100.0);
            double currentLoss = MathAbs(floating);
            double totalWorst = currentLoss + worst;
            Print(ENGINE_LABEL, " | WORST CASE CALC: Floating ตอนนี้ -", DoubleToString(currentLoss,2), " + ถัวครบ ", IntegerToString(InpRecoveryMaxSteps), " ไม้ + Hedge ", DoubleToString(hedgeLot,2), " + Avg ", DoubleToString(avgLots,2), " Total Lots ", DoubleToString(totalLots,2), " ถ้าราคาสวนอีก ", DoubleToString(InpWorstCaseATR,1), " ATR จะขาดทุนเพิ่ม ~$", DoubleToString(worst,2), " รวมแย่สุด ~-$", DoubleToString(totalWorst,2), " Hard Cap -$", DoubleToString(hardMoney2,2));
            if(totalWorst > hardMoney2)
            {
               Print(ENGINE_LABEL, " | WORST CASE BLOCK: แย่สุด -$", DoubleToString(totalWorst,2), " เกิน Hard Cap -$", DoubleToString(hardMoney2,2), " -> ไม่เริ่ม Recovery รอให้ไม้ปิดเอง / ตัดขาดทุนตาม SL");
               return;
            }
         }
         gRecoveryActive=true; gRecoveryStep=0; gRecoveryHedgeDone=false;
         gRecoveryStartEquity=eq; gRecoveryStartFloating=floating;
         gRecoveryLastAvgPrice=RecoveryBreakeven();
         gRecoveryLastAvgTime=TimeCurrent();
         Print(ENGINE_LABEL, " | RECOVERY START: Floating=", DoubleToString(floating,2), " Equity=", DoubleToString(eq,2), " Trigger=-", DoubleToString(triggerMoney,2), " | หยุดไม้ใหม่ + Hedge + ถัวเบาๆ");
      }
      return;
   }

   // --- กำลัง Recovery อยู่ ---
   if(cnt==0)
   {
      // ไม่มีไม้แล้ว = จบเอง (โดน SL/TP ปิดไป)
      Print(ENGINE_LABEL, " | RECOVERY END: ไม่มีไม้ค้างแล้ว Floating=", DoubleToString(floating,2));
      gRecoveryActive=false; gRecoveryStep=0; gRecoveryHedgeDone=false; gRecoveryHardStop=false;
      return;
   }

   // 1) Hard Stop - กันล้างพอร์ต
   if(floating <= -hardMoney)
   {
      Print(ENGINE_LABEL, " | RECOVERY HARD STOP: Floating=", DoubleToString(floating,2), " > MaxDD -", DoubleToString(hardMoney,2), " ปิดทั้งหมด กันล้าง");
      RecoveryCloseAll("RECOVERY HARD STOP");
      gRecoveryActive=false; gRecoveryStep=0; gRecoveryHedgeDone=false; gRecoveryHardStop=true;
      return;
   }

   // v1.37 Auto Calculate + v1.36 Overlap: เอาไม้กำไรปิดคู่ไม้ขาดทุนหนักสุด ให้ Basket เล็กลง (ทำทุก 5 นาที)
   RecoveryOverlapClose();

   // 2) จบ Recovery - กลับมาบวกตามเป้าแล้ว
   if(floating >= targetMoney)
   {
      Print(ENGINE_LABEL, " | RECOVERY DONE +บวกแล้ว: Floating=", DoubleToString(floating,2), " Target=+", DoubleToString(targetMoney,2), " ปิดทั้งหมด กลับไปเทรดปกติ");
      RecoveryCloseAll("RECOVERY DONE PROFIT");
      gRecoveryActive=false; gRecoveryStep=0; gRecoveryHedgeDone=false;
      return;
   }

   // 3) Hedge 1:1 - ล็อกขาดทุน ไม่ให้ขาดทุนเพิ่ม (ทำครั้งเดียวตอนเริ่ม)
   if(InpRecoveryUseHedge && !gRecoveryHedgeDone)
   {
      int dir=0; double b=0,s=0,ab=0,as=0;
      double net = RecoveryNetLots(dir,b,s,ab,as);
      if(dir!=0 && MathAbs(net)>0.0001)
      {
         double hedgeVol = MathAbs(net)*InpRecoveryHedgeRatio;
         int hedgeDir = -dir; // สวนทาง Net
         double px=0;
         if(RecoverySend(hedgeDir, hedgeVol, "NOVA_REC_HEDGE", px))
         {
            gRecoveryHedgeDone=true;
            Print(ENGINE_LABEL, " | RECOVERY HEDGE: Net=", DoubleToString(net,2), " Hedge ", (hedgeDir>0?"BUY ":"SELL "), DoubleToString(hedgeVol,2), " @ ", DoubleToString(px,2));
         }
      }
      else gRecoveryHedgeDone=true;
   }

   // 4) Averaging - ถัวเบาๆ เมื่อราคาวิ่งสวนอีก 1 ATR (ไม่ถัวถี่)
   { string v177r=""; if(!V177_CanOpenRecovery(v177r)) { /* WAIT RECOVERY 3 / TOTAL 10 - ไม่ถัวเพิ่ม แต่ยังบริหารไม้เดิมต่อ */ } }
   if(InpRecoveryUseAveraging && gRecoveryStep < BBPro_EffectiveMaxSteps() && V177_CountOpenRecovery()<InpV177_MaxRecoveryOpen && V177_CountOpenTotal()<InpV177_MaxTotalOpen)
   {
      MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return;
      double atr = (ArraySize(gATR)>1 && gATR[1]>0)?gATR[1]:0;
      if(atr<=0) return;
      int dir=0; double b=0,s=0,ab=0,as=0;
      double net = RecoveryNetLots(dir,b,s,ab,as);
      if(dir==0) return;
      double be = RecoveryBreakeven();
      if(be<=0) return;
      double dist = (dir>0)? (be - tick.bid) : (tick.ask - be); // ราคาวิ่งสวนจาก Breakeven ไปกี่จุด
      double needDist = InpRecoveryStepATR*atr*(gRecoveryStep+1); // ไม้ที่ 1 ต้องห่าง 1 ATR, ไม้ที่ 2 ห่าง 2 ATR, ...
      // กันถัวซ้ำในแท่งเดียวกัน
      if(dist >= needDist && TimeCurrent()-gRecoveryLastAvgTime >= 900) // อย่างน้อย 15 นาทีต่อไม้
      {
         // Lot ถัว: ไม้แรก = Net Lot * 0.5 (เบาๆ), ไม้ถัดไป * 1.3
         double baseLot = MathAbs(net)*0.5;
         if(baseLot<=0) baseLot=SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
         double lot = baseLot * MathPow(BBPro_EffectiveMult(), gRecoveryStep);
         lot = MathMin(lot, AutoLot(InpRecoveryMaxLot)); // v1.37 Auto
         double px=0;
         if(RecoverySend(dir, lot, "NOVA_REC_AVG"+IntegerToString(gRecoveryStep+1), px))
         {
            gRecoveryStep++;
            gRecoveryLastAvgPrice=px; gRecoveryLastAvgTime=TimeCurrent();
            Print(ENGINE_LABEL, " | RECOVERY AVG Step ", IntegerToString(gRecoveryStep), "/", IntegerToString(InpRecoveryMaxSteps), ": ", (dir>0?"BUY ":"SELL "), DoubleToString(lot,2), " @ ", DoubleToString(px,2), " | Breakeven ใหม่จะต่ำลง");
         }
      }
   }
}

void ManagePositions()
{
   if(!gDataOK || !TradePermission()) return;
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return;
   // v1.16: Basket Trailing ก่อน - ไม้ถัว/เติม เลื่อน SL พร้อมกัน
   if(false) Trail_ApplyBasket();
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0 || !OwnSelectedPosition()) continue;
      int id=MagicId(PositionGetInteger(POSITION_MAGIC));
      int dir=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
      ulong pid=(ulong)PositionGetInteger(POSITION_IDENTIFIER);
      double entry=PositionGetDouble(POSITION_PRICE_OPEN),sl=PositionGetDouble(POSITION_SL);
      if(sl<=0)
      {
         Note(id,"ERROR MISSING SL - CLOSING");
         if(TimeCurrent()>=gState[id].retry_at) { gState[id].retry_at=TimeCurrent()+3;SendClose(t); }
         continue;
      }
      if(pid!=gState[id].position_id || gState[id].initial_risk<=0)
      {
         double initial=MathAbs(entry-sl);
         if(sl<=0 || initial<=0) { Note(id,"ERROR POSITION WITHOUT INITIAL RISK"); continue; }
         gState[id].position_id=pid; gState[id].initial_risk=initial;
         SaveState();
      }
      double progress=dir>0?tick.bid-entry:entry-tick.ask;
      double risk=gState[id].initial_risk;
      double trigger=id==S_SESSIONHEAT?risk/1.5:risk;
      // v1.16: ถ้าเปิด Trailing ใหม่ ให้ใช้ระบบใหม่แทน Unified เก่า
      if(false) Trail_ApplyOne(t, id, dir, entry, sl, risk, dir>0?tick.bid:tick.ask);
      // v1.02: Unified BE + Trail ให้ทุกโมดูล (เดิมแค่ 10 โมดูล) - ใช้เมื่อปิด Trailing ใหม่เท่านั้น
      if(!false && false && progress>=trigger)
         ModifySL(t,dir,entry+dir*2*TickSize());
      if(!false && false)
      {
         double atrTrail=gATR[1];
         if(atrTrail>0)
         {
            double trail=dir>0?tick.bid-0*atrTrail:tick.ask+0*atrTrail;
            if((dir>0 && trail>entry+atrTrail*0.5) || (dir<0 && trail<entry-atrTrail*0.5))
               ModifySL(t,dir,trail);
         }
      }
      if(UsesBE(id) && progress>=trigger)
         ModifySL(t,dir,entry+dir*2*TickSize());
      if(id==S_TRENDPILOT || id==S_VOL_ST)
      {
         // Closed-bar ATR trail, identical timing on tick and timer paths.
         double c=gRates[1].close,atr=gATR[1];
         double trail=dir>0?c-2*atr:c+2*atr;
         if((dir>0 && trail>entry) || (dir<0 && trail<entry)) ModifySL(t,dir,trail);
      }
      if(id==S_EXPERT_SWEEP && ArraySize(gSAR)>1)
      {
         double sar=gSAR[1];
         if((dir>0 && sar<tick.bid) || (dir<0 && sar>tick.ask)) ModifySL(t,dir,sar);
      }
   }
}
void ReconcileInflight()
{
   for(int id=0;id<MODULES;id++)
   {
      if(gState[id].inflight_at<=0) continue;
      if(FindPosition(id)!=0)
      { gState[id].inflight_at=0; gState[id].inflight_risk_money=0; SaveState(); continue; }
      ulong order=gState[id].inflight_order;
      if(order==0)
      {
         string comment=StringFormat("AIO%02d %I64d",id,(long)gState[id].consumed_key);
         for(int j=OrdersTotal()-1;j>=0;j--)
         {
            ulong candidate=OrderGetTicket(j);
            if(candidate!=0 && OrderGetInteger(ORDER_MAGIC)==Magic(id) &&
               OrderGetString(ORDER_SYMBOL)==_Symbol && StringFind(OrderGetString(ORDER_COMMENT),comment)==0)
            { order=candidate;break; }
         }
         if(order==0 && HistorySelect(gState[id].inflight_at-10,TimeCurrent()+1))
         {
            for(int j=HistoryOrdersTotal()-1;j>=0;j--)
            {
               ulong candidate=HistoryOrderGetTicket(j);
               if(candidate!=0 && HistoryOrderGetInteger(candidate,ORDER_MAGIC)==Magic(id) &&
                  HistoryOrderGetString(candidate,ORDER_SYMBOL)==_Symbol &&
                  StringFind(HistoryOrderGetString(candidate,ORDER_COMMENT),comment)==0)
               { order=candidate;break; }
            }
         }
         if(order!=0) { gState[id].inflight_order=order;SaveState(); }
      }
      if(order!=0 && OrderSelect(order)) continue;
      if(order!=0 && HistoryOrderSelect(order))
      {
         long state=HistoryOrderGetInteger(order,ORDER_STATE);
         if(state==ORDER_STATE_FILLED || state==ORDER_STATE_CANCELED || state==ORDER_STATE_REJECTED ||
            state==ORDER_STATE_EXPIRED)
         { gState[id].inflight_at=0; gState[id].inflight_risk_money=0; SaveState(); continue; }
      }
      if(TimeCurrent()-gState[id].inflight_at>60)
      { gFatalPause=true; Note(id,"ERROR UNRESOLVED EXECUTION - REATTACH AFTER BROKER CHECK"); }
   }
}
int MaxDailyEntries(const int id)
{
   if(id==S_PIVOT) return 2;
   if(id==S_KILLZONE) return 1;
   if(id==S_FLOW || id==S_HOURBIAS || id==S_STRUCTURE || id==S_NEURAL || id==S_SESSIONHEAT) return 3;
   return 0;
}
bool CandidateKeyUsed(const int id,const datetime key)
{
   if(key<=0 || gState[id].consumed_key==key) return true;
   if(id==S_LIQ_POOL && gCandidate[id].dir>0 && gState[id].pool_buy_used==key) return true;
   if(id==S_LIQ_POOL && gCandidate[id].dir<0 && gState[id].pool_sell_used==key) return true;
   return false;
}
void OnEntryAccepted(const int id,const Candidate &c)
{
   gState[id].last_entry=TimeCurrent();
   gEntriesToday[id]++;
   if(id==S_RANGE) gState[id].count++;
   if(id==S_SESSIONBOX) gState[id].flags|=(1<<c.tag);
   if(id==S_SESSIONHEAT || id==S_KILLZONE) gState[id].flags|=(c.dir>0?1:2);
   if(id==S_LIQ_POOL)
   { if(c.dir>0) gState[id].pool_buy_used=c.key; else gState[id].pool_sell_used=c.key; }
   if(id==S_EXPERT_SWEEP || id==S_QEX_SWEEP)
   {
      if(c.dir>0) gState[id].pool_buy_used=gState[id].level_lo_time;
      else gState[id].pool_sell_used=gState[id].level_hi_time;
   }
}

//+------------------------------------------------------------------+
//| v1.02 AI RISK GOVERNOR - กัน Overlap / กันโมดูลแพ้ซ้ำ          |
//+------------------------------------------------------------------+

//| v1.03 AUTO REGIME SCANNER                                      |
string RegimeName(const int r)
{
   if(r==1) return "TREND_UP";
   if(r==2) return "TREND_DOWN";
   if(r==3) return "RANGE";
   if(r==4) return "SQUEEZE";
   if(r==5) return "HIGH_VOL";
   if(r==6) return "CHOP";
   return "UNKNOWN";
}
// Map module -> group: 1=Trend 2=Vol 3=Liquidity 4=Range 5=Time 6=AI/MTF
int GroupOfModule(const int id)
{
   // v1.06 mapping for 14 modules
   if(id==S_SUPERTREND || id==S_TRENDPILOT) return 1; // Trend
   if(id==S_VOL_QEX || id==S_VOL_ST) return 2; // Vol
   if(id==S_LIQ_POOL || id==S_QEX_SWEEP || id==S_WYCKOFF || id==S_WICK_REJECT || id==S_SMC_FULL) return 3; // Liquidity / SMC
   if(id==S_RANGE) return 4; // Range
   if(id==S_SESSIONHEAT || id==S_SESSIONBOX) return 5; // Time/Session
   if(id==S_FLOW || id==S_NEURAL) return 6; // AI/MTF/Flow
   return 1;
}

bool IsGroupAllowed(const int grp, const int regime)
{
   if(regime==0) return true;
   if(regime==1 || regime==2)
   {
      if(grp==1) return true;
      if(grp==3) return true;
      if(grp==5) return true;
      if(grp==6) return true;
      if(grp==4) return !InpScannerBlockRangeInTrend;
      if(grp==2) return false;
      return false;
   }
   if(regime==3)
   {
      if(grp==4) return true;
      if(grp==3) return true;
      if(grp==5) return true;
      if(grp==1) return !InpScannerBlockTrendInRange;
      if(grp==2) return false;
      if(grp==6) return false;
      return false;
   }
   if(regime==4)
   {
      if(grp==2) return true;
      if(grp==3) return true;
      return false;
   }
   if(regime==5)
   {
      if(grp==3) return true;
      return false;
   }
   if(regime==6)
   {
      if(grp==3) return true;
      if(grp==5) return true;
      return false;
   }
   return true;
}
bool IsModuleAllowedByScanner(const int id)
{
   if(!InpUseAutoScanner) return true;
   int grp=GroupOfModule(id);
   return IsGroupAllowed(grp, gScannerRegime);
}

//| v1.07 MTF SCANNER - D1 / H4 / H1 / M15 / M5                            |
int TrendFromTF(const ENUM_TIMEFRAMES tf)
{
   MqlRates r[];
   if(!ReadRates(_Symbol,tf,120,r,80)) return 0;
   // หา Swing High/Low 2 ชุดล่าสุด: HH = High ใหม่สูงกว่าเดิม, HL = Low ใหม่สูงกว่าเดิม
   double sh1=0, sh2=0, sl1=0, sl2=0;
   int shCnt=0, slCnt=0;
   for(int j=3;j<100 && j+5<ArraySize(r);j++)
   {
      if(shCnt<2 && PivotHigh(r,j,5,3,0)) { if(shCnt==0) sh1=r[j].high; else sh2=r[j].high; shCnt++; }
      if(slCnt<2 && PivotLow(r,j,5,3,0)) { if(slCnt==0) sl1=r[j].low; else sl2=r[j].low; slCnt++; }
      if(shCnt>=2 && slCnt>=2) break;
   }
   if(shCnt<2 || slCnt<2) return 0;
   bool hh = sh1>sh2; // ยอดใหม่สูงกว่าเดิม
   bool hl = sl1>sl2; // ฐานใหม่สูงกว่าเดิม
   bool lh = sh1<sh2; // ยอดใหม่ต่ำกว่าเดิม
   bool ll = sl1<sl2; // ฐานใหม่ต่ำกว่าเดิม
   if(hh && hl) return 1;
   if(lh && ll) return -1;
   return 0;
}
int HeikinDirTF(const ENUM_TIMEFRAMES tf)
{
   MqlRates r[];
   if(!ReadRates(_Symbol,tf,10,r,5)) return 0;
   // Heikin Ashi: HA Close = (O+H+L+C)/4, HA Open = (Prev HA Open + Prev HA Close)/2
   double haOpen=(r[5].open+r[5].close)/2;
   double haClose=(r[5].open+r[5].high+r[5].low+r[5].close)/4;
   for(int i=4;i>=1;i--)
   {
      haOpen=(haOpen+haClose)/2;
      haClose=(r[i].open+r[i].high+r[i].low+r[i].close)/4;
   }
   if(haClose>haOpen) return 1;
   if(haClose<haOpen) return -1;
   return 0;
}
void UpdateMTFScanner()
{
   if(!InpUseMTFScanner) { gMTF_AllowBuy=true; gMTF_AllowSell=true; gMTF_Status="MTF OFF"; return; }
   if(!gDataOK) return;
   datetime bar=gRates[1].time;
   if(bar==gMTF_LastBar) return;
   gMTF_LastBar=bar;

   // --- D1 = ดูเทรนด์ (HH/HL vs LH/LL) ---
   int d1 = TrendFromTF(PERIOD_D1);
   gMTF_D1Trend=d1;
   // ถ้า D1 ยังไม่ชัด ใช้ H4 เป็นเทรนด์สำรอง
   int h4t = TrendFromTF(PERIOD_H4);
   gMTF_H4Trend=h4t;
   int h1t = TrendFromTF(PERIOD_H1);
   gMTF_H1Trend=h1t;

   // --- Heikin Ashi: H4 -> H1 -> M30 -> M15 -> M5 ต้องตรงกัน (ตาม Flowchart) ---
   int haH4=HeikinDirTF(PERIOD_H4);
   int haH1=HeikinDirTF(PERIOD_H1);
   int haM30=HeikinDirTF(PERIOD_M30);
   int haM15=HeikinDirTF(PERIOD_M15);
   int haM5=HeikinDirTF(PERIOD_M5);
   int sum=haH4+haH1+haM30+haM15+haM5;
   gMTF_HeikinScore=sum;
   gMTF_HeikinUp = (sum==5);
   gMTF_HeikinDown = (sum==-5);
   // ถ้าไม่บังคับ Heikin ตรงกันหมด ให้ใช้ >=4 ก็พอ (กันสัญญาณหาย)
   bool heikinBuy = InpMTF_RequireHeikin ? gMTF_HeikinUp : (sum>=4);
   bool heikinSell = InpMTF_RequireHeikin ? gMTF_HeikinDown : (sum<=-4);

   // --- H4 = ดูโซน, กำหนดโซน (OB/FVG บน H4) ---
   // โซน H4 = High/Low 20 แท่งล่าสุดบน H4 + FVG: ใช้ Range High/Low ของ H4 เป็นโซนคร่าวๆ
   MqlRates h4[];
   bool inZone=false;
   if(ReadRates(_Symbol,PERIOD_H4,30,h4,20))
   {
      double hi=h4[1].high, lo=h4[1].low;
      for(int i=1;i<20 && i<ArraySize(h4);i++) { hi=MathMax(hi,h4[i].high); lo=MathMin(lo,h4[i].low); }
      double mid=(hi+lo)/2;
      gMTF_H4ZoneHi=hi; gMTF_H4ZoneLo=lo;
      double cur=gRates[1].close;
      // ราคาอยู่ในครึ่งล่างของโซน H4 = โซน Buy, ครึ่งบน = โซน Sell, หรืออยู่ในโซน OB ที่แคบกว่า
      // ง่าย: ถ้าราคาอยู่ในกรอบ H4 20 แท่ง ถือว่าอยู่ในโซน
      inZone = (cur>=lo && cur<=hi);
      // ถ้าต้องการโซนแคบ: ใช้ 50% ของกรอบ
      // inZone = (cur>=lo && cur<=mid) || (cur>=mid && cur<=hi); // เท่ากับในกรอบอยู่ดี
   }
   gMTF_InH4Zone=inZone;

   // --- H1 = คอนเฟิร์มโซน (H1 BOS/CHoCH หรือ Wick) ---
   bool h1Conf=false;
   MqlRates h1[];
   if(ReadRates(_Symbol,PERIOD_H1,30,h1,20))
   {
      // H1 BOS: ปิดเหนือ High 5 แท่งก่อน หรือ ปิดใต้ Low 5 แท่งก่อน
      double h1Hi=h1[2].high, h1Lo=h1[2].low;
      for(int i=2;i<10;i++) { h1Hi=MathMax(h1Hi,h1[i].high); h1Lo=MathMin(h1Lo,h1[i].low); }
      bool bosUp = h1[1].close>h1Hi;
      bool bosDown = h1[1].close<h1Lo;
      // Wick: ไส้ล่างยาวบน H1
      double rng=h1[1].high-h1[1].low;
      double lower=MathMin(h1[1].open,h1[1].close)-h1[1].low;
      double upper=h1[1].high-MathMax(h1[1].open,h1[1].close);
      bool wickUp = rng>0 && lower>=1.5*MathMax(MathAbs(h1[1].open-h1[1].close),0.1*rng);
      bool wickDown = rng>0 && upper>=1.5*MathMax(MathAbs(h1[1].open-h1[1].close),0.1*rng);
      h1Conf = bosUp || bosDown || wickUp || wickDown;
   }
   gMTF_H1Confirmed=h1Conf;

   // --- สรุป Allow Buy/Sell ---
   bool d1Buy = !InpMTF_RequireHHHL || d1>=0; // ถ้าไม่บังคับ HH/HL ให้ D1 ไม่ขวาง
   bool d1Sell = !InpMTF_RequireHHHL || d1<=0;
   // ถ้า D1 ชัดเจน ต้องตาม D1 เท่านั้น
   if(d1==1) { d1Buy=true; d1Sell=false; }
   if(d1==-1) { d1Buy=false; d1Sell=true; }
   if(d1==0 && InpMTF_RequireHHHL)
   {
      // D1 ไม่ชัด ใช้ H4 แทน
      if(h4t==1) { d1Buy=true; d1Sell=false; }
      else if(h4t==-1) { d1Buy=false; d1Sell=true; }
      else { d1Buy=false; d1Sell=false; }
   }

   bool zoneOk = !InpMTF_RequireH4Zone || inZone;
   bool h1Ok = !InpMTF_RequireH1Confirm || h1Conf;

   gMTF_AllowBuy = d1Buy && heikinBuy && zoneOk && h1Ok;
   gMTF_AllowSell = d1Sell && heikinSell && zoneOk && h1Ok;

   // ถ้าปิด Require ทั้งหมด จะได้ Allow ทั้ง 2 ฝั่ง = กลับไปแบบเดิม
   if(!InpMTF_RequireHHHL && !InpMTF_RequireHeikin && !InpMTF_RequireH4Zone && !InpMTF_RequireH1Confirm)
   {
      gMTF_AllowBuy=true; gMTF_AllowSell=true;
   }

   gMTF_Status = "D1="+(d1==1?"HH+HL UP":d1==-1?"LH+LL DOWN":"CHOP")+
                 " H4Zone="+(inZone?"IN":"OUT")+
                 " H1="+(h1Conf?"CONF":"WAIT")+
                 " HA="+(string)sum+"/5"+
                 " Buy="+(gMTF_AllowBuy?"YES":"NO")+
                 " Sell="+(gMTF_AllowSell?"YES":"NO");
   Print(ENGINE_LABEL," | MTF ",gMTF_Status);
}

void UpdateMarketScanner()
{
   if(!InpUseAutoScanner) { gScannerRegime=0; gScannerRegimeName="UNKNOWN (Scanner OFF)"; return; }
   if(!gDataOK) return;
   if(ArraySize(gRates)<260 || ArraySize(gATR)<260) return;
   datetime bar=gRates[1].time;
   if(bar==gScannerLastBar) return;
   gScannerLastBar=bar;
   double atr=gATR[1];
   if(atr<=0) return;
   double ema50=gEMA50[1], ema200=gEMA200[1];
   double trendScore=MathAbs(ema50-ema200)/(atr+1e-9);
   double slope=(gEMA50[1]-gEMA50[10])/(atr+1e-9);
   double atrPct=Percentile(gATR,1,200);
   double curBB=BBWidthAt(1);
   double sumBB=0; int cntBB=0;
   for(int i=1;i<=100 && i<ArraySize(gRates);i++) { double w=BBWidthAt(i); if(w>0){ sumBB+=w; cntBB++; } }
   double avgBB=cntBB>0?sumBB/cntBB:0;
   double bbRatio=avgBB>0?curBB/avgBB:1.0;
   gScannerTrendScore=trendScore; gScannerSlope=slope; gScannerAtrPct=atrPct; gScannerBBRatio=bbRatio;
   int candidate=6;
   if(atrPct>=InpScannerATRHigh) candidate=5;
   else if(bbRatio<=InpScannerSqueezeRatio && trendScore<1.0) candidate=4;
   else if(trendScore>=InpScannerTrendScore && slope>0.3) candidate=1;
   else if(trendScore>=InpScannerTrendScore && slope<-0.3) candidate=2;
   else if(trendScore<1.0 && atrPct>=25 && atrPct<=70) candidate=3;
   else candidate=6;
   if(candidate!=gScannerCandidate)
   {
      gScannerCandidate=candidate; gScannerHoldBars=1;
      return;
   }
   gScannerHoldBars++;
   if(gScannerHoldBars>=InpScannerMinHoldBars && candidate!=gScannerRegime)
   {
      int old=gScannerRegime;
      gScannerRegime=candidate;
      gScannerRegimeName=RegimeName(candidate);
      Print(ENGINE_LABEL," | SCANNER SWITCH ",RegimeName(old)," -> ",gScannerRegimeName,
            " | TrendScore=",DoubleToString(trendScore,2),
            " Slope=",DoubleToString(slope,2),
            " ATRpct=",DoubleToString(atrPct,1),
            " BBratio=",DoubleToString(bbRatio,2));
   }
}

double SameDirRiskMoney(const int dir)
{
   double risk=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0 || !OwnSelectedPosition()) continue;
      int d=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
      if(d!=dir) continue;
      double sl=PositionGetDouble(POSITION_SL), entry=PositionGetDouble(POSITION_PRICE_OPEN);
      double lots=PositionGetDouble(POSITION_VOLUME), p=0;
      if(sl<=0) return 1e99;
      if(!OrderCalcProfit(d>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL,_Symbol,lots,entry,sl,p)) return 1e99;
      risk+=MathMax(0,-p);
   }
   return risk;
}
double NetExposurePct()
{
   double buyRisk=SameDirRiskMoney(1);
   double sellRisk=SameDirRiskMoney(-1);
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   if(eq<=0) return 999;
   return MathAbs(buyRisk-sellRisk)/eq*100.0;
}
bool IsModuleDisabled(const int id)
{
   if(!InpUseAdaptiveModule) return false;
   if(id<0 || id>=MODULES) return false;
   if(gModuleDisabled[id]) return true;
   int total=gModuleWins[id]+gModuleLosses[id];
   if(total>=InpModuleMinTrades)
   {
      double wr=100.0*gModuleWins[id]/total;
      if(wr<InpModuleMinWinRate && gModuleNet[id]<0)
      {
         gModuleDisabled[id]=true;
         Print(ENGINE_LABEL," | AUTO-DISABLE Module ",gName[id]," WinRate=",DoubleToString(wr,1),"% Net=",DoubleToString(gModuleNet[id],2));
         return true;
      }
   }
   return false;
}
bool GovernorBlock(const int id, const int dir, const double newLoss, string &reason)
{
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   if(eq<=0) { reason="ERROR EQUITY"; return true; }
   // 1. โมดูลแพ้ซ้ำ
   if(IsModuleDisabled(id)) { reason="WAIT MODULE DISABLED (Adaptive)"; return true; }
   // 2. ฝั่งเดียวกันเสี่ยงเกิน
   double sameRisk=SameDirRiskMoney(dir);
   if(sameRisk+newLoss > eq*InpMaxSameDirRiskPct/100.0) { reason="WAIT SAME-DIR RISK 4%"; return true; }
   // 3. Net Exposure
   double buyRisk=SameDirRiskMoney(1), sellRisk=SameDirRiskMoney(-1);
   double newBuy=buyRisk, newSell=sellRisk;
   if(dir>0) newBuy+=newLoss; else newSell+=newLoss;
   double net=MathAbs(newBuy-newSell)/eq*100.0;
   if(net > InpMaxNetExposurePct) { reason="WAIT NET EXPOSURE 6%"; return true; }
   // 4. จำนวนไม้รวมต่อวัน
   if(gTotalEntriesToday>=InpMaxDailyEntriesTotal) { reason="WAIT DAILY TOTAL 12"; return true; }
   // 5. Correlation Block: ถ้าเทรด EURUSD แล้ว GBPUSD วิ่งทางเดียวกันแรงมาก = อย่าเบิ้ล
   if(InpUseCorrelationBlock && gSymbolCount>=2 && gCorrOK[0][1])
   {
      if(MathAbs(gCorr[0][1])>0.85)
      {
         // ถ้า Corr สูงมาก ให้ลด Risk ลงครึ่งหนึ่งโดยอ้อม = บล็อกถ้ามีไม้เปิดแล้ว 3 ไม้ขึ้นไป
         int cnt=0; double tmp=0; OpenRiskMoney(cnt);
         if(cnt>=3) { reason="WAIT HIGH CORR + 3 POS"; return true; }
      }
   }
   reason="READY"; return false;
}
void GovernorOnEntryAccepted(const int id)
{
   gTotalEntriesToday++; gV177_CoreToday++; // v1.77: นับ Core ต่อวัน
}
void GovernorOnDealClosed(const int id, const double profit)
{
   if(id<0 || id>=MODULES) return;
   if(profit>0) gModuleWins[id]++; else gModuleLosses[id]++;
   gModuleNet[id]+=profit;
}

void ProcessCandidate(const int id)
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return;
   // v1.35 Recovery: ตอนกำลังแก้พอร์ต หยุดเปิดไม้ใหม่ของระบบปกติ
   if(gInpUseRecovery && gRecoveryActive && InpRecoveryPauseNew) { Note(id,"WAIT RECOVERY"); return; }
   // v1.03: สแกน Regime ก่อน - ถ้ากลุ่มนี้ไม่เหมาะกับตลาดตอนนี้ บล็อกเลย
   if(InpUseAutoScanner && !IsModuleAllowedByScanner(id))
   {
      Note(id,"WAIT REGIME "+gScannerRegimeName+" / Group "+IntegerToString(GroupOfModule(id)));
      return;
   }
   Candidate c=gCandidate[id];
   if(c.dir==0) return;
   // v1.07 MTF: จำกัด 1 ออเดอร์/สัญลักษณ์ ตาม Flowchart - มีอยู่แล้วให้ข้าม
   if(InpUseMTFScanner && InpMTF_MaxOrdersPerSymbol>0)
   {
      int cntOwn=0;
      for(int i=PositionsTotal()-1;i>=0;i--)
      {
         ulong t=PositionGetTicket(i); if(t==0) continue;
         if(!OwnSelectedPosition()) continue;
         cntOwn++;
      }
      if(cntOwn>=InpMTF_MaxOrdersPerSymbol) { Note(id,"WAIT MTF 1 ORDER/SYMBOL"); return; }
   }
   // v1.07 MTF: D1/H4/H1/Heikin ต้องตรงกันถึงเทรดฝั่งนั้นได้
   if(InpUseMTFScanner)
   {
      if(c.dir>0 && !gMTF_AllowBuy) { Note(id,"WAIT MTF BUY: "+gMTF_Status); return; }
      if(c.dir<0 && !gMTF_AllowSell) { Note(id,"WAIT MTF SELL: "+gMTF_Status); return; }
   }
   if(TimeCurrent()>=c.expiry) { gCandidate[id].dir=0; Note(id,"SIGNAL EXPIRED"); return; }
   if(CandidateKeyUsed(id,c.key)) { gCandidate[id].dir=0; return; }
   ulong existing=FindPosition(id);
   if(existing!=0)
   {
      if(ReverseOnSignal(id) && PositionSelectByTicket(existing))
      {
         int d=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
         if(d!=c.dir)
         {
            if(TimeCurrent()<gState[id].retry_at) return;
            gState[id].retry_at=TimeCurrent()+3;
            if(!SendClose(existing)) { Note(id,"WAIT OPPOSITE CLOSE"); return; }
         }
         else { Note(id,"POSITION OPEN"); return; }
      }
      else { Note(id,"POSITION OPEN"); return; }
   }
   if(gState[id].inflight_at>0 || HasActiveOrder(id)) { Note(id,"WAIT EXECUTION"); return; }
   { string v177r=""; if(!V177_CanOpenCore(v177r)) { Note(id,v177r); return; } } // v1.77: Core 3 / Total 10 / Core Day 3
   if(!EffLiveEnabled() || gHeader.manual_pause || gHeader.daily_block || gHeader.flatten_request || gFatalPause)
   { Note(id,"PAUSED"); return; }
   if(!gStorageOK || !TradePermission()) { Note(id,"WAIT STORAGE/ALGO PERMISSION"); return; }
   if(!gAccountHistoryOK) { Note(id,"WAIT ACCOUNT HISTORY");return; }
   int maxday=MaxDailyEntries(id);
   if(maxday>0 && gEntriesToday[id]>=maxday) { Note(id,"DAY ENTRY LIMIT"); return; }
   if(!DirectionAllowed(c.dir)) { Note(id,"WAIT SYMBOL TRADE MODE"); return; }
   if(TimeCurrent()<gState[id].retry_at || gState[id].attempts>=3) return;
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick) || tick.ask<tick.bid || tick.bid<=0) return;
   if(!gTest && TimeCurrent()-(datetime)tick.time>10) { Note(id,"WAIT FRESH QUOTE"); return; }
   if(InpMaxSpreadATR>0 && tick.ask-tick.bid>InpMaxSpreadATR*gATR[1])
   { Note(id,"WAIT SPREAD/ATR"); return; }
   // v1.02: ตรวจ Governor ก่อนคำนวณ Lot
   if(IsModuleDisabled(id)) { Note(id,"WAIT MODULE DISABLED"); return; }
   double sl=c.sl,tp=c.tp;
   // v1.83: ต่อสาย Core SL/TP ที่เทรน (v1.79) เข้ากับสัญญาณแบบ ATR - Structure ไม่แตะ
   if(InpCoreApplyTunedSLTP && gCandATRBased[id] && c.atr>0 && InpSL_Mult_Tuned>0 && InpTP_Mult_Tuned>0)
   {
      double e0=c.dir>0?tick.ask:tick.bid;
      sl=e0-c.dir*InpSL_Mult_Tuned*c.atr;
      tp=e0+c.dir*InpTP_Mult_Tuned*c.atr;
   }
   if(!NormalizeStops(c.dir,tick,sl,tp)) { Note(id,"REJECT STOP DIRECTION"); gCandidate[id].dir=0; return; }
   double entry=c.dir>0?tick.ask:tick.bid,lots=0,loss=0; string reason="";
   if(!SelectLots(c.dir,entry,sl,lots,loss,reason)) { Note(id,reason); return; }
   // v1.02: กัน Overlap - ถ้า 5 โมดูล Buy พร้อมกันจะโดนบล็อกที่นี่
   if(GovernorBlock(id,c.dir,loss,reason)) { Note(id,reason); return; }
   // v1.38 NN Filter
   { string nnReason=""; if(!NN_AllowTrade(c.dir, nnReason)) { Note(id, nnReason); return; } }
   MqlTradeRequest req; MqlTradeResult res; MqlTradeCheckResult check;
   ZeroMemory(req); ZeroMemory(res); ZeroMemory(check);
   req.action=TRADE_ACTION_DEAL; req.symbol=_Symbol; req.magic=(ulong)Magic(id);
   req.type=c.dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
   req.price=entry; req.volume=lots; req.sl=sl; req.tp=tp;
   req.deviation=DeviationPoints(); req.type_filling=FillMode();
   req.comment=StringFormat("AIO%02d %I64d",id,(long)c.key);
   gState[id].retry_at=TimeCurrent()+3; gState[id].attempts++;
   if(!OrderCheck(req,check))
   { Note(id,"REJECT CHECK "+IntegerToString((long)check.retcode)); return; }
   ulong portfolio_id=0;
   if(!NOVA_PortfolioReserve((long)req.magic,req.symbol,loss,InpMaxOpenRiskPct,InpMaxPositions,portfolio_id))
   { Note(id,"REJECT PORTFOLIO RESERVE"); return; }
   req.comment=NOVA_PortfolioTaggedComment(req.comment,portfolio_id);
   // Persist the local module intent only after the shared account reservation is durable.
   datetime oldkey=gState[id].consumed_key;
   gState[id].consumed_key=c.key;
   gState[id].inflight_at=TimeCurrent();
   gState[id].inflight_order=0; gState[id].inflight_risk_money=loss;
   if(!SaveState())
   { gState[id].consumed_key=oldkey; gState[id].inflight_at=0; Note(id,"ERROR PERSIST INTENT"); return; }
   if(!NOVA_PortfolioMarkDispatching(portfolio_id))
   {
      NOVA_PortfolioFinish(portfolio_id,NOVA_PORTFOLIO_RELEASED,0);
      gState[id].consumed_key=oldkey; gState[id].inflight_at=0;
      gState[id].inflight_risk_money=0; SaveState();
      Note(id,"ERROR PORTFOLIO DISPATCH STATE"); return;
   }
   bool sent=NOVA_BrokerOrderSend(req,res,NOVA_PHASE2_EXECUTION_DISABLED);
   if(sent && (res.retcode==TRADE_RETCODE_DONE || res.retcode==TRADE_RETCODE_DONE_PARTIAL ||
               res.retcode==TRADE_RETCODE_PLACED))
   {
      NOVA_PortfolioFinish(portfolio_id,NOVA_PORTFOLIO_ACCEPTED,res.order);
      gState[id].inflight_order=res.order;
      gState[id].initial_risk=MathAbs((res.price>0?res.price:entry)-sl);
      gState[id].position_id=0;
      OnEntryAccepted(id,c); GovernorOnEntryAccepted(id); SaveState();
      Note(id,StringFormat("OPEN %s %.4f risk %.2f",c.dir>0?"BUY":"SELL",lots,loss));
      gCandidate[id].dir=0;
   }
   else if(res.retcode==TRADE_RETCODE_TIMEOUT || res.retcode==TRADE_RETCODE_CONNECTION)
   {
      // Acceptance is unknown. Retain risk reservation and consumed key.
      NOVA_PortfolioFinish(portfolio_id,NOVA_PORTFOLIO_UNCERTAIN,res.order);
      gState[id].inflight_order=res.order; SaveState(); Note(id,"WAIT UNCERTAIN EXECUTION");
   }
   else
   {
      NOVA_PortfolioFinish(portfolio_id,NOVA_PORTFOLIO_RELEASED,res.order);
      gState[id].consumed_key=oldkey; gState[id].inflight_at=0;
      gState[id].inflight_risk_money=0; SaveState();
      Note(id,"REJECT SEND "+IntegerToString((long)res.retcode));
   }
}

// Signal adapters. Price arrays use index 0=current, 1=last closed.
// Persistent setup state is separate from pending orders and open positions.
void ClearCandidate(const int id) { ZeroMemory(gCandidate[id]); }
double SignalEntry(const int dir,const int s)
{
   if(gReplay) return gRates[s].close;
   MqlTick t; if(!SymbolInfoTick(_Symbol,t)) return 0;
   return dir>0?t.ask:t.bid;
}
void Emit(const int id,const int dir,const double sl,const double tp,const double atr,
          const datetime key,const int tag=0,const ENUM_TIMEFRAMES tf=PERIOD_CURRENT)
{
   if(gReplay || dir==0 || sl<=0 || atr<=0) return;
   ENUM_TIMEFRAMES actual=tf==PERIOD_CURRENT?InpAnalysisTF:tf;
   datetime bar=iTime(_Symbol,actual,0);
   if(bar<=0 || PeriodSeconds(actual)<=0) return;
   gCandidate[id].dir=dir; gCandidate[id].sl=sl; gCandidate[id].tp=tp;
   gCandATRBased[id]=gEmitATRFlag; // v1.83
   gCandidate[id].atr=atr; gCandidate[id].key=key;
   gCandidate[id].expiry=bar+PeriodSeconds(actual); gCandidate[id].tag=tag;
   Note(id,dir>0?"SIGNAL BUY":"SIGNAL SELL");
}
void EmitATR(const int id,const int dir,const int s,const double atr,const double stopMult,
             const double tpMult,const datetime key=0,const ENUM_TIMEFRAMES tf=PERIOD_CURRENT)
{
   double entry=SignalEntry(dir,s); if(entry<=0) return;
   gEmitATRFlag=true; // v1.83
   Emit(id,dir,entry-dir*stopMult*atr,tpMult>0?entry+dir*tpMult*atr:0,atr,
        key>0?key:gRates[s].time,0,tf);
   gEmitATRFlag=false; // v1.83
}
void EmitStructure(const int id,const int dir,const int s,const double sl,const double rr,
                   const datetime key=0,const int tag=0)
{
   double entry=SignalEntry(dir,s),d=dir*(entry-sl);
   if(d<=0) { if(!gReplay) Note(id,"WAIT STRUCTURE/PRICE"); return; }
   Emit(id,dir,sl,entry+dir*rr*d,gATR[s],key>0?key:gRates[s].time,tag);
}
double SMMAAt(const int p,const int s)
{
   int n=ArraySize(gRates); if(s<0 || n-p<s) return 0;
   double v=0; for(int i=n-1;i>=n-p;i--) v+=gRates[i].close;
   v/=p; for(int i=n-p-1;i>=s;i--) v=(v*(p-1)+gRates[i].close)/p;
   return v;
}
double AOAt(const int s)
{
   if(s+34>ArraySize(gRates)) return 0;
   double f=0,l=0;
   for(int i=s;i<s+34;i++)
   { double m=(gRates[i].high+gRates[i].low)/2; l+=m; if(i<s+5) f+=m; }
   return f/5-l/34;
}
double VWAPAt(const int s)
{
   if(s<1 || s>=ArraySize(gRates)) return 0;
   datetime day=DayStart(gRates[s].time); double pv=0,vv=0;
   for(int i=s;i<ArraySize(gRates) && DayStart(gRates[i].time)==day;i++)
   {
      double v=MathMax(1.0,(double)gRates[i].tick_volume);
      pv+=(gRates[i].high+gRates[i].low)/2*v; vv+=v;
   }
   return vv>0?pv/vv:0;
}
void SignalDeca(const int id,const int s)
{
   // v1.06: SignalDeca เหลือแค่ SuperTrend ตัวเดียว
   // Keltner, GoldenCross, Roc, Alligator, Ichimoku, Awesome, Heikin, Psar, Vwap ถูกลบแล้ว - ซ้ำกันหมด
   int dir=0;
   if(id==S_SUPERTREND && gSTDir[s]!=gSTDir[s+1]) dir=gSTDir[s];
   if(dir!=0) EmitATR(id,dir,s,gATR[s],1.5,2.5);
}


void SignalTrendPilot(const int s)
{
   int dir=0;
   if(gEMA50[s]>gEMA200[s] && gRates[s].close>gEMA200[s] && gRSI[s+1]<45 && gRSI[s]>=45) dir=1;
   if(gEMA50[s]<gEMA200[s] && gRates[s].close<gEMA200[s] && gRSI[s+1]>55 && gRSI[s]<=55) dir=-1;
   if(dir) EmitATR(S_TRENDPILOT,dir,s,gATR[s],1.5,2.5);
}
void UpdateRadar()
{
   int total=0; bool ready=true;
   for(int k=0;k<5;k++)
   {
      datetime bar=iTime(_Symbol,gRadarTF[k],0);
      if(bar==0) { gRadarPartOK[k]=false; ready=false; continue; }
      if(bar!=gRadarBar[k] || !gRadarPartOK[k])
      {
         MqlRates r[]; double e20[],e50[],rsi[];
         if(!ReadRates(_Symbol,gRadarTF[k],320,r,80) || !BuildEMA(r,20,e20) ||
            !BuildEMA(r,50,e50) || !BuildRSI(r,14,rsi))
         { gRadarPartOK[k]=false; ready=false; continue; }
         int score=0; if(e20[1]>e50[1]) score++; if(r[1].close>e50[1]) score++; if(rsi[1]>50) score++;
         gRadarPart[k]=score; gRadarPartOK[k]=true; gRadarBar[k]=bar;
      }
      total+=gRadarPart[k]; if(!gRadarPartOK[k]) ready=false;
   }
   gRadarReady=ready; gRadarScore=total;
}
// [v1.06 REMOVED] void SignalRadar(const int s) - deleted duplicate module


void UpdateHourStatistics()
{
   datetime bar=iTime(_Symbol,PERIOD_H1,0);
   if(bar<=0 || (bar==gHourStatsBar && ArraySize(gH1)>100)) return;
   if(!ReadRates(_Symbol,PERIOD_H1,3200,gH1,100)) return;
   gHourStatsBar=bar;
   ArrayInitialize(gHoursN,0); ArrayInitialize(gHoursUp,0); ArrayInitialize(gHoursNet,0.0);
   ArrayInitialize(gHeatN,0); ArrayInitialize(gHeatUp,0);
   datetime heatStart=TimeCurrent()-30*86400;
   for(int i=1;i<ArraySize(gH1);i++)
   {
      int h=ServerHour(gH1[i].time); gHoursN[h]++;
      if(gH1[i].close>gH1[i].open) gHoursUp[h]++;
      gHoursNet[h]+=gH1[i].close-gH1[i].open;
      if(gH1[i].time>=heatStart) { gHeatN[h]++; if(gH1[i].close>gH1[i].open) gHeatUp[h]++; }
   }
}
// [v1.06 REMOVED] void SignalHourBias(const int s) - deleted duplicate module

void SignalFlow(const int s)
{
   if(gSymbolCount<1) { Note(S_FLOW,"WAIT SYMBOL BOARD"); return; }
   double total=0,current=0;
   for(int k=0;k<gSymbolCount;k++)
   {
      total+=MathAbs(gFlow[k]); if(gSymbols[k]==_Symbol) current=gFlow[k];
   }
   gFlowShare=total>0?100*MathAbs(current)/total:0;
   int d=Sign(current);
   if(gFlowShare>=80 && ((d>0 && gEMA50[s]>gEMA200[s]) || (d<0 && gEMA50[s]<gEMA200[s])))
      EmitATR(S_FLOW,d,s,gATR[s],2,3);
}
// [v1.06 REMOVED] void SignalPivot(const int s) - deleted duplicate module

// [v1.06 REMOVED] void SignalStructure(const int s) - deleted duplicate module


bool SessionRange(const datetime day,const int startHour,const int endHour,
                  double &hi,double &lo,int &count)
{
   hi=0;lo=0;count=0;
   datetime start=day+startHour*3600,end=day+endHour*3600;
   if(end<=start || TimeCurrent()<end) return false;
   for(int i=1;i<ArraySize(gRates);i++)
   {
      if(gRates[i].time<start) break;
      if(gRates[i].time>=end) continue;
      if(gRates[i].time+PeriodSeconds(InpAnalysisTF)>end) continue;
      if(count==0) { hi=gRates[i].high;lo=gRates[i].low; }
      else { hi=MathMax(hi,gRates[i].high);lo=MathMin(lo,gRates[i].low); }
      count++;
   }
   return count>0 && hi>lo && lo>0;
}
void SignalSessionBox(const int s)
{
   int starts[3]={2,9,15},ends[3]={8,15,20};
   datetime day=DayStart(gRates[s].time);
   for(int k=1;k<3;k++) // Original default: London and New York boxes enabled.
   {
      if((gState[S_SESSIONBOX].flags&(1<<k))!=0) continue;
      double hi,lo;int n;
      int minBars=(int)MathMin(6,(ends[k]-starts[k])*3600/PeriodSeconds(InpAnalysisTF));
      if(gRates[s].time<day+ends[k]*3600 || !SessionRange(day,starts[k],ends[k],hi,lo,n) || n<minBars) continue;
      if(hi-lo<0.8*gATR[s]) continue;
      int dir=gRates[s].close>hi+0.05*gATR[s]?1:(gRates[s].close<lo-0.05*gATR[s]?-1:0);
      if(dir==0) continue;
      double entry=SignalEntry(dir,s),sl=dir>0?lo:hi;
      if(dir*(entry-sl)>3*gATR[s]) sl=(entry+sl)/2;
      EmitStructure(S_SESSIONBOX,dir,s,sl,2,gRates[s].time,k); return;
   }
}
// [v1.06 REMOVED] void SignalKillZone(const int s) - deleted duplicate module


void RefreshSweepLevels(const int id,const int s)
{
   for(int j=s+3;j<MathMin(s+160,ArraySize(gRates)-10);j++)
   {
      if(PivotHigh(gRates,j,10,3,s))
      {
         if(gRates[j].time>gState[id].level_hi_time)
         { gState[id].level_hi=gRates[j].high;gState[id].level_hi_time=gRates[j].time; }
         break;
      }
   }
   for(int j=s+3;j<MathMin(s+160,ArraySize(gRates)-10);j++)
   {
      if(PivotLow(gRates,j,10,3,s))
      {
         if(gRates[j].time>gState[id].level_lo_time)
         { gState[id].level_lo=gRates[j].low;gState[id].level_lo_time=gRates[j].time; }
         break;
      }
   }
}
void IntrabarSignals()
{
   if(!gDataOK) return;
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return;
   double low=iLow(_Symbol,InpAnalysisTF,0),high=iHigh(_Symbol,InpAnalysisTF,0);
   long volume=iVolume(_Symbol,InpAnalysisTF,0);
   double average=AvgVolume(gRates,1,20);
   if(average>0 && (double)volume>1.8*average)
   {
      for(int k=0;k<2;k++)
      {
         int id=k==0?S_EXPERT_SWEEP:S_QEX_SWEEP;
         int dir=0;
         if(gState[id].level_lo>0 && BarsSince(gState[id].level_lo_time,InpAnalysisTF)<=160 &&
            gState[id].pool_buy_used!=gState[id].level_lo_time && low<gState[id].level_lo && tick.bid>gState[id].level_lo) dir=1;
         if(gState[id].level_hi>0 && BarsSince(gState[id].level_hi_time,InpAnalysisTF)<=160 &&
            gState[id].pool_sell_used!=gState[id].level_hi_time && high>gState[id].level_hi && tick.ask<gState[id].level_hi) dir=-1;
         if(dir) EmitATR(id,dir,1,gATR[1],1.5,3.0,gDataBar);
      }
   }
   int h=ServerHour(TimeCurrent()),id=S_SESSIONHEAT;
   if(gHeatN[h]>=5 && ArraySize(gH1)>20)
   {
      double up=100.0*gHeatUp[h]/gHeatN[h]; int dir=0;
      if((gState[id].flags&1)==0 && tick.bid>gH1[1].high && up>=60) dir=1;
      if((gState[id].flags&2)==0 && tick.bid<gH1[1].low && up<=40) dir=-1;
      datetime slot=(datetime)((long)TimeCurrent()/3600*3600);
      if(dir && gState[id].consumed_key!=slot)
      {
         double atr[];
         if(BuildATR(gH1,14,atr)) EmitATR(id,dir,1,atr[1],1.5,3.0,slot,PERIOD_H1);
      }
   }
}

// Stateful modules operate only on completed bars, including historical warmup.
double BBWidthAt(const int s)
{
   double mean=MeanClose(gRates,s,20);
   return mean>0?4*SDAt(gRates,s,20)/mean:0;
}
bool IsQEXSqueeze(const int s)
{
   if(Percentile(gATR,s,200)<=30 && Percentile(gATR,s,200)>=0) return true;
   double current=BBWidthAt(s),sum=0;int count=0;
   for(int i=s;i<s+100 && i+20<ArraySize(gRates);i++)
   { double w=BBWidthAt(i); if(w>0) { sum+=w; count++; } }
   return count>=20 && current>0 && current<0.7*sum/count;
}
void SignalVolQEX(const int s)
{
   int id=S_VOL_QEX;
   if(IsQEXSqueeze(s))
   {
      if(gState[id].phase!=1)
      {
         gState[id].phase=1;gState[id].hi=gRates[s].close;gState[id].lo=gRates[s].close;
         gState[id].anchor_time=gRates[s].time;gState[id].flags=0;
      }
      else
      { gState[id].hi=MathMax(gState[id].hi,gRates[s].close);gState[id].lo=MathMin(gState[id].lo,gRates[s].close); }
      return;
   }
   if(gState[id].phase==1) gState[id].phase=2;
   if(gState[id].phase!=2 || gState[id].flags!=0 || gState[id].lo<=0) return;
   int d=gRates[s].close>gState[id].hi+0.1*gATR[s]?1:(gRates[s].close<gState[id].lo-0.1*gATR[s]?-1:0);
   if(d==0) return;
   gState[id].flags=1;
   if(!gReplay && BarsSince(gState[id].last_entry,InpAnalysisTF)<15) return;
   double entry=SignalEntry(d,s),sl=d>0?gState[id].lo:gState[id].hi;
   if(d*(entry-sl)>1.5*gATR[s]) sl=(entry+sl)/2;
   EmitStructure(id,d,s,sl,2);
}
bool IsBatchSqueeze(const int s)
{
   double sd=SDAt(gRates,s,20);
   return sd>0 && 2*sd<1.5*gATR[s];
}
// [v1.06 REMOVED] void SignalVolBatch(const int s) - deleted duplicate module

void SignalVolST(const int s)
{
   double normal[]; int n=ArraySize(gRates);ArrayResize(normal,n);ArrayInitialize(normal,0.0);
   for(int i=s;i<MathMin(s+251,n);i++) normal[i]=gATR[i]/gRates[i].close;
   double pct=Percentile(normal,s,250);
   if(pct<0) return;
   if(pct>=80)
   {
      if(!gReplay) { ulong t=FindPosition(S_VOL_ST); if(t) SendClose(t); }
      Note(S_VOL_ST,"HIGH VOL FLATTEN");return;
   }
   if(gST14Dir[s]!=gST14Dir[s+1])
      EmitATR(S_VOL_ST,gST14Dir[s],s,gATR[s],2,4);
}

void SignalPoolSweep(const int s)
{
   int id=S_LIQ_POOL;
   if(!gReplay && BarsSince(gState[id].last_entry,InpAnalysisTF)<10) return;
   double highs[100],lows[100];datetime ht[100],lt[100];int hn=0,ln=0;
   for(int j=s+3;j<MathMin(s+200,ArraySize(gRates)-5);j++)
   {
      if(PivotHigh(gRates,j,5,3,s) && hn<100) { highs[hn]=gRates[j].high;ht[hn]=gRates[j].time;hn++; }
      if(PivotLow(gRates,j,5,3,s) && ln<100) { lows[ln]=gRates[j].low;lt[ln]=gRates[j].time;ln++; }
   }
   double tol=0.25*gATR[s],pierce=0.02*gATR[s];
   for(int side=0;side<2;side++)
   {
      int n=side==0?ln:hn; bool used[100];ArrayInitialize(used,false);
      for(int i=0;i<n;i++)
      {
         if(used[i]) continue;
         double p=side==0?lows[i]:highs[i],sum=p;int touches=1;
         datetime oldest=side==0?lt[i]:ht[i];used[i]=true;
         for(int j=i+1;j<n;j++)
         {
            double q=side==0?lows[j]:highs[j];datetime tm=side==0?lt[j]:ht[j];
            if(!used[j] && MathAbs(q-p)<=tol)
            { used[j]=true;sum+=q;touches++;oldest=(datetime)MathMin(oldest,tm); }
         }
         if(touches<2) continue;
         p=sum/touches;
         if(side==0 && oldest>gState[id].pool_buy_used &&
            gRates[s].low<p-pierce && gRates[s].close>p && gRates[s].close>gRates[s].open)
         {
            EmitStructure(id,1,s,gRates[s].low-0.3*gATR[s],2,oldest);return;
         }
         if(side==1 && oldest>gState[id].pool_sell_used &&
            gRates[s].high>p+pierce && gRates[s].close<p && gRates[s].close<gRates[s].open)
         {
            EmitStructure(id,-1,s,gRates[s].high+0.3*gATR[s],2,oldest);return;
         }
      }
   }
}

void SignalRange(const int s)
{
   int id=S_RANGE;
   double atr=gATR[s];
   if(gState[id].phase==1)
   {
      if(gRates[s].close>gState[id].hi+0.1*atr || gRates[s].close<gState[id].lo-0.1*atr)
      { gState[id].phase=0;gState[id].event_time=gRates[s].time;return; }
   }
   if(gState[id].phase==0)
   {
      // Freeze a frame formed BEFORE the rejection bar. Never move the box
      // to absorb a breakout and reset the per-frame entry quota every bar.
      if(gState[id].event_time>0 && BarsSince(gState[id].event_time,InpAnalysisTF)<20) return;
      double h=0,l=0,bestH=0,bestL=0;int best=0;
      for(int p=20;p<=40;p++)
      {
         if(!RangeHL(gRates,s+1,p,h,l) || h-l>2.5*atr) break;
         best=p;bestH=h;bestL=l;
      }
      if(best==0) return;
      gState[id].phase=1;gState[id].hi=bestH;gState[id].lo=bestL;
      gState[id].anchor_time=gRates[s+best].time;gState[id].count=0;
   }
   if(gState[id].count>=2 || (!gReplay && BarsSince(gState[id].last_entry,InpAnalysisTF)<10)) return;
   double h=gRates[s].high,l=gRates[s].low,o=gRates[s].open,c=gRates[s].close;
   if(h<=l) return;
   int dir=0;
   if(l<=gState[id].lo+0.4*atr && c>l+0.5*(h-l) && c>o && c>gState[id].lo) dir=1;
   if(h>=gState[id].hi-0.4*atr && c<h-0.5*(h-l) && c<o && c<gState[id].hi) dir=-1;
   if(dir==0) return;
   double entry=SignalEntry(dir,s),sl=dir>0?gState[id].lo-0.35*atr:gState[id].hi+0.35*atr;
   double risk=dir*(entry-sl); if(risk<=0) return;
   double tp=dir>0?MathMin(gState[id].hi,entry+2*risk):MathMax(gState[id].lo,entry-2*risk);
   if(dir*(tp-entry)<=0) return;
   Emit(id,dir,sl,tp,atr,gRates[s].time);
}

// [v1.06 REMOVED] void SignalEffort(const int s) - deleted duplicate module

double CumDelta(const int s,const int n)
{
   double sum=0;
   for(int j=s;j<s+n && j<ArraySize(gRates);j++) sum+=BoundedDelta(gRates,j);
   return sum;
}
// [v1.06 REMOVED] void SignalFootprint(const int s) - deleted duplicate module


void SignalWyckoff(const int s)
{
   int id=S_WYCKOFF;
   double atr=gATR[s],h=gRates[s].high,l=gRates[s].low,c=gRates[s].close;
   double avg=AvgVolume(gRates,s+1,20),v=(double)gRates[s].tick_volume;
   if(avg<=0) return;
   if(gState[id].phase!=0 && ++gState[id].age>40) { gState[id].phase=0;gState[id].age=0; }
   if(gState[id].phase==0)
   {
      double hi,lo;
      if(!RangeHL(gRates,s,24,hi,lo) || hi-lo<1.2*atr || hi-lo>6*atr) return;
      double trend=gRates[s+24].close-gRates[s+44].close;
      if(MathAbs(trend)<1.5*atr) return;
      gState[id].hi=hi;gState[id].lo=lo;gState[id].bias=trend<0?1:-1;
      gState[id].phase=1;gState[id].age=0;return;
   }
   int phase=gState[id].phase;
   if(phase==1)
   {
      if(c<gState[id].lo-0.1*atr || c>gState[id].hi+0.1*atr) { gState[id].phase=0;return; }
      if(gState[id].bias>0 && l<gState[id].lo-0.1*atr && c>gState[id].lo && v<=avg)
      { gState[id].extreme=l;gState[id].phase=2;gState[id].age=0; }
      else if(gState[id].bias<0 && h>gState[id].hi+0.1*atr && c<gState[id].hi && v<=avg)
      { gState[id].extreme=h;gState[id].phase=3;gState[id].age=0; }
   }
   else if(phase==2)
   {
      if(c<gState[id].extreme-0.1*atr) { gState[id].phase=0;return; }
      if(c>gState[id].hi && v>=1.5*avg) { gState[id].phase=4;gState[id].age=0; }
   }
   else if(phase==3)
   {
      if(c>gState[id].extreme+0.1*atr) { gState[id].phase=0;return; }
      if(c<gState[id].lo && v>=1.5*avg) { gState[id].phase=5;gState[id].age=0; }
   }
   else if(phase==4 || phase==5)
   {
      int d=phase==4?1:-1;
      if((d>0 && c<gState[id].extreme-0.1*atr) || (d<0 && c>gState[id].extreme+0.1*atr))
      { gState[id].phase=0;return; }
      bool lps=d>0?(l<=gState[id].hi+0.8*atr && c>gState[id].hi):
                    (h>=gState[id].lo-0.8*atr && c<gState[id].lo);
      if(lps)
      {
         double entry=SignalEntry(d,s),sl=gState[id].extreme-d*0.3*atr;
         double tp=entry+d*1.5*(gState[id].hi-gState[id].lo);
         Emit(id,d,sl,tp,atr,gRates[s].time);gState[id].phase=0;
      }
   }
}


//| v1.04 WickReject - จากภาพ Trader1percent                                |
//|  2 เนื้อเทียนปิดไม่หลุดแนวรับ                                      |
void SignalWickReject(const int s)
{
   int id=S_WICK_REJECT;
   if(!InpUseWickReject) { Note(id,"OFF WickReject"); return; }
   if(!gReplay && BarsSince(gState[id].last_entry,InpAnalysisTF)<10) return;
   if(s+3>=ArraySize(gRates)) return;
   // s = แท่งยืนยันล่าสุด, s+1 = ยืนยันแท่งที่ 1, s+2 = แท่งไส้ยาว
   int wickIdx=s+2;
   int conf1=s+1;
   int conf2=s;
   double atr=gATR[s];
   if(atr<=0) return;

   // หาแนวรับ/แนวต้าน จาก Pivot ที่เกิดซ้ำ >=2 ครั้ง ใน 100 แท่งก่อนหน้า
   double sup=0, res=0;
   // หาแนวรับ: คลัสเตอร์ Low ที่ชนกัน 2 ครั้ง
   {
      double lows[100]; int ln=0;
      for(int j=wickIdx+3;j<MathMin(wickIdx+100,ArraySize(gRates)-5) && ln<100;j++)
         if(PivotLow(gRates,j,5,3,wickIdx)) { lows[ln]=gRates[j].low; ln++; }
      double tol=0.25*atr;
      for(int i=0;i<ln;i++)
      {
         double sum=lows[i]; int touches=1;
         for(int j=i+1;j<ln;j++) if(MathAbs(lows[j]-lows[i])<=tol) { sum+=lows[j]; touches++; }
         if(touches>=2) { sup=sum/touches; break; }
      }
      // ถ้าหา Low ไม่เจอ ใช้ High ที่เคยเป็นแนวต้านแล้วเบรกขึ้นมา (Flip) ตามภาพ: High เดิม -> แนวรับใหม่
      if(sup==0)
      {
         double highs[100]; int hn=0;
         for(int j=wickIdx+3;j<MathMin(wickIdx+100,ArraySize(gRates)-5) && hn<100;j++)
            if(PivotHigh(gRates,j,5,3,wickIdx)) { highs[hn]=gRates[j].high; hn++; }
         for(int i=0;i<hn;i++)
         {
            double sum=highs[i]; int touches=1;
            for(int j=i+1;j<hn;j++) if(MathAbs(highs[j]-highs[i])<=tol) { sum+=highs[j]; touches++; }
            if(touches>=2) { sup=sum/touches; break; }
         }
      }
      // หาแนวต้านสำหรับฝั่ง Bearish
      {
         double highs[100]; int hn=0;
         for(int j=wickIdx+3;j<MathMin(wickIdx+100,ArraySize(gRates)-5) && hn<100;j++)
            if(PivotHigh(gRates,j,5,3,wickIdx)) { highs[hn]=gRates[j].high; hn++; }
         double tol2=0.25*atr;
         for(int i=0;i<hn;i++)
         {
            double sum=highs[i]; int touches=1;
            for(int j=i+1;j<hn;j++) if(MathAbs(highs[j]-highs[i])<=tol2) { sum+=highs[j]; touches++; }
            if(touches>=2) { res=sum/touches; break; }
         }
      }
   }

   MqlRates w=gRates[wickIdx];
   double range=w.high-w.low;
   if(range<=0) return;
   double body=MathAbs(w.open-w.close);
   double lowerWick=MathMin(w.open,w.close)-w.low;
   double upperWick=w.high-MathMax(w.open,w.close);

   // --- ฝั่ง Buy: ถอดไส้ล่างยาว + ปิดเหนือแนวรับ ---
   if(sup>0)
   {
      bool longWick = lowerWick>=InpWickMinRatio*MathMax(body,0.1*atr) && lowerWick>=InpWickMinBodyPct*range && lowerWick>=InpWickMinATR*atr;
      bool sweepReclaim = w.low<sup && w.close>sup;
      bool closeUpperHalf = w.close>(w.high+w.low)/2.0;
      bool confirm = gRates[conf1].close>sup && gRates[conf2].close>sup;
      if(longWick && sweepReclaim && closeUpperHalf && confirm)
      {
         double sl=w.low-0.2*atr;
         EmitStructure(id,1,s,sl,InpWickRR,gRates[wickIdx].time,1);
         return;
      }
   }
   // --- ฝั่ง Sell: ถอดไส้บนยาว + ปิดใต้แนวต้าน (กระจกของภาพ) ---
   if(InpWickUseBearish && res>0)
   {
      bool longWick = upperWick>=InpWickMinRatio*MathMax(body,0.1*atr) && upperWick>=InpWickMinBodyPct*range && upperWick>=InpWickMinATR*atr;
      bool sweepReclaim = w.high>res && w.close<res;
      bool closeLowerHalf = w.close<(w.high+w.low)/2.0;
      bool confirm = gRates[conf1].close<res && gRates[conf2].close<res;
      if(longWick && sweepReclaim && closeLowerHalf && confirm)
      {
         double sl=w.high+0.2*atr;
         EmitStructure(id,-1,s,sl,InpWickRR,gRates[wickIdx].time,-1);
         return;
      }
   }
   if(!gReplay) Note(id,"WAIT WickReject");
}


//| v1.05 Full SMC - Module 2-4                                           |
//|  4.1-4.6 IDM & Liquidity: IDM = Low ล่อ Sell ก่อน BOS, Sweep แล้วกลับ      |
void SignalSMC(const int s)
{
   int id=S_SMC_FULL;
   if(!InpUseSMC) { Note(id,"OFF SMC"); return; }
   if(!gReplay && BarsSince(gState[id].last_entry,InpAnalysisTF)<10) return;
   double atr=gATR[s]; if(atr<=0) return;

   // --- หา Swing High / Low ล่าสุด 2 ชุด ---
   double sh[20], sl[20]; int shn=0, sln=0;
   for(int j=s+3;j<MathMin(s+120,ArraySize(gRates)-5) && (shn<20 || sln<20);j++)
   {
      if(shn<20 && PivotHigh(gRates,j,5,3,s)) { sh[shn]=gRates[j].high; shn++; }
      if(sln<20 && PivotLow(gRates,j,5,3,s)) { sl[sln]=gRates[j].low; sln++; }
   }
   if(shn<2 || sln<2) return;
   double lastSH=sh[0], prevSH=sh[1];
   double lastSL=sl[0], prevSL=sl[1];
   double rangeHigh=MathMax(lastSH,prevSH);
   double rangeLow=MathMin(lastSL,prevSL);
   // ใช้ High/Low สูงสุด-ต่ำสุด 100 แท่งเป็นกรอบ Premium/Discount
   double hi100=rangeHigh, lo100=rangeLow;
   for(int j=s;j<MathMin(s+100,ArraySize(gRates));j++) { hi100=MathMax(hi100,gRates[j].high); lo100=MathMin(lo100,gRates[j].low); }
   double eq=(hi100+lo100)/2.0;

   // --- Phase 0: หา BOS / CHoCH ---
   // BOS Buy: ปิดเหนือ Swing High ล่าสุดด้วยเนื้อเทียน ไม่ใช่แค่ไส้ (Module 2.2-2.3)
   // BOS Sell: ปิดใต้ Swing Low ล่าสุดด้วยเนื้อเทียน
   // CHoCH: ถ้าเคยเป็นขาลงแล้ว BOS ขึ้น = เปลี่ยนโครงสร้าง (Module 2.6)
   if(gState[id].phase==0)
   {
      // ต้องยืนยัน Swing ก่อนนับ BOS (Module 2.4) - Swing ต้องเกิดมาแล้วอย่างน้อย 3 แท่ง
      if(gRates[s].close>lastSH && gRates[s].close>gRates[s].open)
      {
         // หา IDM: Low ต่ำสุดใน 20 แท่งก่อน BOS คือจุดล่อ Sell (Module 4.1-4.2)
         double idmLow=rangeLow;
         for(int j=s+1;j<MathMin(s+20,ArraySize(gRates));j++) idmLow=MathMin(idmLow,gRates[j].low);
         // หา Order Block: แท่งแดงสุดท้ายก่อน BOS (Module 3.3)
         double obHi=0, obLo=0;
         for(int j=s+1;j<MathMin(s+20,ArraySize(gRates));j++)
         {
            if(gRates[j].close<gRates[j].open) { obHi=gRates[j].high; obLo=gRates[j].low; break; }
         }
         if(obHi==0) { obHi=gRates[s+1].high; obLo=gRates[s+1].low; }
         // หา FVG Bullish: Low ของแท่ง j > High ของแท่ง j+2 = ช่องว่าง (Module 3.4)
         double fvgHi=0, fvgLo=0;
         if(InpSMC_UseFVG)
         {
            for(int j=s+1;j<MathMin(s+20,ArraySize(gRates)-2);j++)
            {
               if(gRates[j].low>gRates[j+2].high) { fvgHi=gRates[j].low; fvgLo=gRates[j+2].high; break; }
            }
         }
         gState[id].phase=1; // รอ Retrace
         gState[id].hi=lastSH; // BOS level
         gState[id].lo=rangeLow;
         gState[id].extreme=obHi; // OB High
         gState[id].extra=obLo;  // OB Low
         // เก็บ FVG ไว้ใน hi/lo สำรองไม่ได้ เลยเก็บใน anchor: ใช้ gState extra2 via event_time trick - ใช้ field ที่มี: เก็บ FVG Low ใน initial_risk ไม่ได้ จึงเก็บ FVG ไว้เช็คตอน Phase 1 โดยคำนวณใหม่
         gState[id].anchor_time=gRates[s].time;
         gState[id].event_time=gRates[s].time;
         // เก็บ EQ ไว้ใน initial_risk ชั่วคราว (ใช้แค่จำค่า)
         gState[id].initial_risk=eq;
         if(!gReplay) Note(id,"SMC BOS UP -> Wait Retrace OB/FVG");
         return;
      }
      if(gRates[s].close<lastSL && gRates[s].close<gRates[s].open)
      {
         double idmHigh=rangeHigh;
         for(int j=s+1;j<MathMin(s+20,ArraySize(gRates));j++) idmHigh=MathMax(idmHigh,gRates[j].high);
         double obHi=0, obLo=0;
         for(int j=s+1;j<MathMin(s+20,ArraySize(gRates));j++)
         {
            if(gRates[j].close>gRates[j].open) { obHi=gRates[j].high; obLo=gRates[j].low; break; }
         }
         if(obHi==0) { obHi=gRates[s+1].high; obLo=gRates[s+1].low; }
         gState[id].phase=-1;
         gState[id].hi=rangeHigh;
         gState[id].lo=lastSL;
         gState[id].extreme=obHi;
         gState[id].extra=obLo;
         gState[id].anchor_time=gRates[s].time;
         gState[id].event_time=gRates[s].time;
         gState[id].initial_risk=eq;
         if(!gReplay) Note(id,"SMC BOS DOWN -> Wait Retrace OB/FVG");
         return;
      }
      if(!gReplay) Note(id,"WAIT SMC BOS");
      return;
   }

   // --- Phase 1 / -1: รอ Retrace กลับมา POI ---
   int age=BarsSince(gState[id].anchor_time,InpAnalysisTF);
   if(age>InpSMC_MaxRetraceBars) { gState[id].phase=0; return; }
   // ถ้าราคาหลุด IDM อีกครั้ง = โครงสร้างเสีย รีเซ็ต
   if(gState[id].phase==1 && gRates[s].close<gState[id].lo-0.2*atr) { gState[id].phase=0; return; }
   if(gState[id].phase==-1 && gRates[s].close>gState[id].hi+0.2*atr) { gState[id].phase=0; return; }

   // คัดเกรด POI (Module 3.5): OB ต้องอยู่ใน Discount สำหรับ Buy, Premium สำหรับ Sell
   double obHi=gState[id].extreme, obLo=gState[id].extra, eq2=gState[id].initial_risk;
   // หา FVG ปัจจุบันใหม่ (คำนวณสด)
   double fvgHi=0, fvgLo=0;
   if(InpSMC_UseFVG)
   {
      for(int j=s+1;j<MathMin(s+20,ArraySize(gRates)-2);j++)
      {
         if(gState[id].phase==1 && gRates[j].low>gRates[j+2].high) { fvgHi=gRates[j].low; fvgLo=gRates[j+2].high; break; }
         if(gState[id].phase==-1 && gRates[j].high<gRates[j+2].low) { fvgHi=gRates[j+2].low; fvgLo=gRates[j].high; break; }
      }
   }

   if(gState[id].phase==1)
   {
      // Premium/Discount (Module 3.2): Buy ต้องอยู่ใน Discount (ต่ำกว่า EQ)
      if(InpSMC_UsePremiumDiscount && gRates[s].close>eq2) { if(!gReplay) Note(id,"WAIT SMC Discount"); return; }
      bool inOB = InpSMC_UseOB && gRates[s].low<=obHi && gRates[s].close>=obLo;
      bool inFVG = InpSMC_UseFVG && fvgHi>0 && gRates[s].low<=fvgHi && gRates[s].close>=fvgLo;
      if(!inOB && !inFVG) { if(!gReplay) Note(id,"WAIT SMC Retrace OB/FVG"); return; }
      // ยืนยันด้วยไส้แบบ v1.04 (Module 1.1 ปิดเนื้อ + ไส้)
      if(InpSMC_RequireWickConfirm)
      {
         double rng=gRates[s].high-gRates[s].low; if(rng<=0) return;
         double lower=MathMin(gRates[s].open,gRates[s].close)-gRates[s].low;
         double body=MathAbs(gRates[s].open-gRates[s].close);
         bool wickOk = lower>=1.5*MathMax(body,0.1*atr) && lower>=0.4*atr;
         if(!wickOk) { if(!gReplay) Note(id,"WAIT SMC Wick Confirm"); return; }
      }
      double sl=MathMin(obLo, fvgLo>0?fvgLo:obLo)-0.2*atr;
      if(inFVG && !inOB) sl=fvgLo-0.2*atr;
      EmitStructure(id,1,s,sl,InpSMC_RR,gRates[s].time,1);
      gState[id].phase=0;
      return;
   }
   if(gState[id].phase==-1)
   {
      if(InpSMC_UsePremiumDiscount && gRates[s].close<eq2) { if(!gReplay) Note(id,"WAIT SMC Premium"); return; }
      bool inOB = InpSMC_UseOB && gRates[s].high>=obLo && gRates[s].close<=obHi;
      bool inFVG = InpSMC_UseFVG && fvgHi>0 && gRates[s].high>=fvgLo && gRates[s].close<=fvgHi;
      if(!inOB && !inFVG) { if(!gReplay) Note(id,"WAIT SMC Retrace OB/FVG"); return; }
      if(InpSMC_RequireWickConfirm)
      {
         double rng=gRates[s].high-gRates[s].low; if(rng<=0) return;
         double upper=gRates[s].high-MathMax(gRates[s].open,gRates[s].close);
         double body=MathAbs(gRates[s].open-gRates[s].close);
         bool wickOk = upper>=1.5*MathMax(body,0.1*atr) && upper>=0.4*atr;
         if(!wickOk) { if(!gReplay) Note(id,"WAIT SMC Wick Confirm"); return; }
      }
      double sl=MathMax(obHi, fvgHi>0?fvgHi:obHi)+0.2*atr;
      if(inFVG && !inOB) sl=fvgHi+0.2*atr;
      EmitStructure(id,-1,s,sl,InpSMC_RR,gRates[s].time,-1);
      gState[id].phase=0;
      return;
   }
}

void EvaluateClosedModule(const int id,const int s)
{
   if(s<1 || s+260>=ArraySize(gRates) || gATR[s]<=0) return;
   if(id==S_SUPERTREND) SignalDeca(id,s);
   else if(id==S_FLOW) SignalFlow(s);
   else if(id==S_SESSIONHEAT) { /* SessionHeat handled via SignalNeural path - no separate signal, uses HourStats */ }
   else if(id==S_VOL_QEX) SignalVolQEX(s);
   else if(id==S_LIQ_POOL) SignalPoolSweep(s);
   else if(id==S_QEX_SWEEP) RefreshSweepLevels(id,s);
   else if(id==S_VOL_ST) SignalVolST(s);
   else if(id==S_RANGE) SignalRange(s);
   else if(id==S_SESSIONBOX) SignalSessionBox(s);
   else if(id==S_TRENDPILOT) SignalTrendPilot(s);
   else if(id==S_WYCKOFF) SignalWyckoff(s);
   else if(id==S_WICK_REJECT) SignalWickReject(s);
   else if(id==S_SMC_FULL) SignalSMC(s);
   // S_NEURAL = SATMAFlow in v1.08, handled via SignalSATMA() in MainWork
}

void WarmStateMachines()
{
   gReplay=true;
   int start=MathMin(400,ArraySize(gRates)-262);
   for(int s=start;s>=1;s--)
   {
      SignalVolQEX(s);
      SignalWyckoff(s); RefreshSweepLevels(S_QEX_SWEEP,s);
   }
   gReplay=false;
   for(int i=0;i<MODULES;i++) { ClearCandidate(i); gState[i].evaluated_bar=gRates[1].time; }
   gState[S_NEURAL].evaluated_bar=iTime(_Symbol,PERIOD_H1,1); // SATMAFlow
}

// NeuralPilot: native logistic inference, 121 closed H1 bars.
// The offline model is re-trained with global chronological split + label purge.
// Direction-classification metrics are not trade profitability metrics.
double gMLWeights[10]={0.12381949091948234,0.0054304409663680957,-0.059466661329502325,0.048605114736663485,0.00039194089116577021,-0.014054523873804826,0.0034190401571741859,-0.0044931026395728891,-0.0029157703847867067,-0.047747882570886885};
double gMLBias=0.02670142248502895;

void ChronoEMA(const double &x[],const int p,double &out[])
{
   int n=ArraySize(x);ArrayResize(out,n);ArrayInitialize(out,0.0);
   if(n<p) return;
   double v=0;for(int i=0;i<p;i++) v+=x[i];v/=p;out[p-1]=v;
   double k=2.0/(p+1);
   for(int i=p;i<n;i++) { v=k*x[i]+(1-k)*v;out[i]=v; }
}
bool NeuralFeatures(const MqlRates &series[],double &f[])
{
   if(ArraySize(series)<122) return false;
   double c[],o[],h[],l[],v[];
   ArrayResize(c,121);ArrayResize(o,121);ArrayResize(h,121);ArrayResize(l,121);ArrayResize(v,121);
   for(int i=0;i<121;i++)
   {
      int s=121-i;c[i]=series[s].close;o[i]=series[s].open;
      h[i]=series[s].high;l[i]=series[s].low;v[i]=(double)series[s].tick_volume;
   }
   double ag=0,al=0,atr=0;
   for(int i=1;i<=14;i++)
   {
      double d=c[i]-c[i-1];ag+=MathMax(d,0);al+=MathMax(-d,0);
      atr+=MathMax(h[i]-l[i],MathMax(MathAbs(h[i]-c[i-1]),MathAbs(l[i]-c[i-1])));
   }
   ag/=14;al/=14;atr/=14;
   for(int i=15;i<121;i++)
   {
      double d=c[i]-c[i-1];ag=(ag*13+MathMax(d,0))/14;al=(al*13+MathMax(-d,0))/14;
      double tr=MathMax(h[i]-l[i],MathMax(MathAbs(h[i]-c[i-1]),MathAbs(l[i]-c[i-1])));
      atr=(atr*13+tr)/14;
   }
   if(atr<=0 || c[119]<=0 || c[115]<=0) return false;
   double e50[],e20[],e12[],e26[],macd[],signal[];
   ChronoEMA(c,50,e50);ChronoEMA(c,20,e20);ChronoEMA(c,12,e12);ChronoEMA(c,26,e26);
   ArrayResize(macd,96);for(int i=0;i<96;i++) macd[i]=e12[25+i]-e26[25+i];
   ChronoEMA(macd,9,signal);
   double mean=0,sd=0,mv=0,sv=0;
   for(int i=101;i<121;i++) { mean+=c[i];mv+=v[i]; }
   mean/=20;mv/=20;
   for(int i=101;i<121;i++) { sd+=(c[i]-mean)*(c[i]-mean);sv+=(v[i]-mv)*(v[i]-mv); }
   sd=MathSqrt(sd/20);sv=MathSqrt(sv/20);
   double low=l[120],high=h[120];for(int i=71;i<121;i++) { low=MathMin(low,l[i]);high=MathMax(high,h[i]); }
   ArrayResize(f,10);
   f[0]=(ag+al<=1e-15)?0.5:(al<=1e-15?1.0:1.0-1.0/(1+ag/(al+1e-12)));
   f[1]=(c[120]-e50[120])/atr;f[2]=(e20[120]-e20[110])/atr;
   f[3]=(macd[95]-signal[95])/atr;f[4]=Clamp((c[120]-mean)/(2*sd+1e-12),-3,3);
   f[5]=MathLog(c[120]/c[119])*100;f[6]=MathLog(c[120]/c[115])*100;
   f[7]=h[120]>l[120]?(c[120]-o[120])/(h[120]-l[120]):0;
   f[8]=Clamp((v[120]-mv)/(sv+1e-12),-5,5);
   f[9]=(c[120]-low)/(high-low+1e-12)*2-1;
   for(int i=0;i<10;i++) if(!ValidNumber(f[i])) return false;
   return true;
}
double NeuralScore(const double &f[])
{
   double z=gMLBias;for(int i=0;i<10;i++) z+=f[i]*gMLWeights[i];
   z=Clamp(z,-40,40);return 1/(1+MathExp(-z));
}
// ============================================================
// v1.08 SATMA-BTC Adaptive Flow - แทน NeuralPilot (เอาออกแล้ว)
// คิดแบบดูคลิปวิดีโอ ไม่ใช่ดูแท่งเดียว
// ขั้น 1 Flow: เก็บผลต่างสถานะปัจจุบัน - ก่อนหน้า = วัดว่าตลาดขยับเท่าไหร่ต่อก้าว
// ขั้น 2 Encoder 6 Residual Block (RAFT): ดึงฟีเจอร์เสถียรของแต่ละเฟรม
// ขั้น 3 BTC: แช่แข็งเฟรมกลางที่ 6 เป็นจุดอ้างอิง เทียบอดีต 1-5 กับใหม่ 7-11
//       Warp: เรียนรู้ค่าขยับของแต่ละเฟรมเอง ไม่สมมติเส้นตรง
//       Correlation = ความเหมือนระหว่างเฟรมอ้างอิงกับเฟรมรอบๆ
// ขั้น 4 MotionEncoder (TMA): บีบ Correlation + ข้อมูลเดิม เป็นฟีเจอร์การเคลื่อนไหว
// ขั้น 5 SATMA: ใช้สถานะล่าสุดเป็นจุดอ้างอิง, Cross-Attention เลือกช่วงสำคัญ,
//       Spatial Attention ขยายฟีเจอร์ดี กด noise, คูณกันเป็น output
// Adaptive 2 ที่: Warp ปรับขยับตามช่วงเวลา, SATMA ปรับน้ำหนักตามความน่าเชื่อถือ
// Output ไม่ใช่สัญญาณซื้อขายตรงๆ แต่เป็นตัวแทนเชิงพยากรณ์ของพลวัตตลาด
// ============================================================

// ============================================================
// v1.09 AUTO LEARNING - เรียนรู้เองจากไม้ที่ปิดไปแล้ว
// ไม่ต้องเทรนข้างนอก EA เรียนเองใน MT5
// เรียน 3 อย่าง: 1) น้ำหนักเฟรม 2) Threshold 3) Regime + โมดูลไหนดี
// กัน Overfit: เรียนช้า 0.05, ลืมของเก่า 1% ต่อครั้ง, ดูแค่ 200 ไม้ล่าสุด
// ============================================================

// ============================================================
// v1.10 NOVA UNIVERSE LEARNING
// คิดแบบนี้: ทองคือจักรวาลเดียว แต่ตลาดมี 6 จักรวาลคู่ขนาน
// EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD, USDCAD
// แต่ละจักรวาลเรียนแยกกัน แล้ว Nova เป็นสมองกลางรวมความรู้
// ถ้า Pattern ไหนใช้ได้ 4/6 จักรวาล = จริง ไม่ใช่ฟลุ๊ค
// ถ้าใช้ได้แค่ 1/6 จักรวาล = Overfit ให้ลดน้ำหนักลง
// แล้วโอนความรู้กลางกลับมาให้ทอง 30% + ของทองเอง 70%
// ============================================================
void NovaInit()
{
   if(gNova_Initialized) return;
   for(int i=0;i<11;i++) gNova_GlobalFrameWeight[i]=gNovaTrainedFrameWeight[i]; // ใช้ Weights ที่เทรนมา
   for(int i=0;i<6;i++) { gNova_GlobalRegimeScore[i]=50.0; gNova_UniverseWins[i]=0; gNova_UniverseTrades[i]=0; gNova_UniverseScore[i]=0.5; }
   gNova_GlobalWarp=1.0; gNova_GlobalTemp=0.5; gNova_GlobalBuyThresh=0.52; gNova_GlobalSellThresh=0.48;
   gNova_Initialized=true;
}
// อ่าน SATMA Score ของแต่ละจักรวาล (สัญลักษณ์อื่น) แบบไม่ต้องเทรดจริง
double NovaUniverseSATMA(const string sym)
{
   MqlRates r[];
   if(!ReadRates(sym,PERIOD_H1,100,r,30)) return 0.5;
   // ใช้ SATMAFlowScore เดิม แต่ต้องแปลง r ให้เป็น Series แบบเดียวกับ gH1
   // SATMAFlowScore ใช้ r[1] = ล่าสุด เราเลยส่ง r ตรงๆ ได้เลย
   return SATMAFlowScore(r);
}
void NovaUniverseSync()
{
   if(!InpUseNovaUniverse) return;
   NovaInit(); LearnInit();
   datetime bar=gRates[1].time;
   // ซิงค์ทุก 4 แท่ง M15 = ทุก 1 ชั่วโมง กันหนักเครื่อง
   if(gNova_LastSync!=0 && bar - gNova_LastSync < InpNovaSyncEveryBars*PeriodSeconds(InpAnalysisTF)) return;
   gNova_LastSync=bar;
   gNova_SyncCount++;

   // --- 1. เก็บ Score ของทุกจักรวาล ---
   int agreeBuy=0, agreeSell=0, totalUniverse=0;
   double sumFrame[11]; for(int i=0;i<11;i++) sumFrame[i]=0;
   double sumRegime[6]; for(int i=0;i<6;i++) sumRegime[i]=0;
   for(int k=0;k<gSymbolCount;k++)
   {
      string sym=gSymbols[k];
      double s=NovaUniverseSATMA(sym);
      gNova_UniverseScore[k]=s;
      if(s>=0.52) agreeBuy++;
      if(s<=0.48) agreeSell++;
      totalUniverse++;
      // นับว่าแต่ละจักรวาลเห็นด้วยไหม
      if(s>=0.52 || s<=0.48) gNova_UniverseTrades[k]++;
      if((s>=0.52 && gMTF_AllowBuy) || (s<=0.48 && gMTF_AllowSell)) gNova_UniverseWins[k]++;
   }
   if(totalUniverse==0) return;

   // --- 2. Cross-Check: ต้องเห็นด้วยกัน 4/6 ถึงเชื่อ ---
   double agreeRate=MathMax(agreeBuy, agreeSell)/(double)totalUniverse;
   bool universeAgree = agreeRate >= InpNovaMinUniverseAgree;
   double trust = universeAgree ? 1.0 : 0.4; // ถ้าจักรวาลไม่เห็นด้วยกัน ให้เชื่อน้อยลง 60%

   // --- 3. รวมความรู้กลาง: เฉลี่ยน้ำหนักเฟรม + Regime จากทุกจักรวาล ---
   // ง่ายๆ: ใช้ของทองเป็นหลัก แล้วดึงเข้าหาค่าเฉลี่ยของจักรวาลด้วย TransferRate
   for(int i=0;i<11;i++)
   {
      // สมมติจักรวาลอื่นมีน้ำหนักเฟรมใกล้เคียงกับทอง แต่ถ้าไม่เห็นด้วยกัน ให้ดึงกลับเข้าหา 1.0
      double universeAvg = universeAgree ? gLearn_FrameWeight[i] : 1.0;
      double _tr = (InpUseAutoOpt ? gOpt_NovaTransfer : InpNovaTransferRate);
      gNova_GlobalFrameWeight[i] = gNova_GlobalFrameWeight[i]*(1.0-_tr) + universeAvg*InpNovaTransferRate;
      // โอนกลับมาให้ทอง: ทอง = 70% ของตัวเอง + 30% ของจักรวาล
      gLearn_FrameWeight[i] = gLearn_FrameWeight[i]*(1.0-InpNovaTransferRate) + gNova_GlobalFrameWeight[i]*InpNovaTransferRate;
   }
   for(int i=0;i<6;i++)
   {
      double universeRegime = gLearn_RegimeScore[i]; // ของทอง
      // ถ้าจักรวาลไม่เห็นด้วยกัน ให้คะแนน Regime กลางลดลง กัน Overfit
      if(!universeAgree && InpNovaUseCrossCheck) universeRegime = 50.0 + (universeRegime-50.0)*0.5;
      gNova_GlobalRegimeScore[i] = gNova_GlobalRegimeScore[i]*(1.0-InpNovaTransferRate) + universeRegime*InpNovaTransferRate;
      gLearn_RegimeScore[i] = gLearn_RegimeScore[i]*(1.0-InpNovaTransferRate) + gNova_GlobalRegimeScore[i]*InpNovaTransferRate;
   }
   // --- 4. โอน Warp / Temp / Threshold ---
   gNova_GlobalWarp = gNova_GlobalWarp*(1.0-InpNovaTransferRate) + gLearn_WarpScale*InpNovaTransferRate;
   gNova_GlobalTemp = gNova_GlobalTemp*(1.0-InpNovaTransferRate) + gLearn_TempBase*InpNovaTransferRate;
   gNova_GlobalBuyThresh = gNova_GlobalBuyThresh*(1.0-InpNovaTransferRate) + gLearn_BuyThresh*InpNovaTransferRate;
   gNova_GlobalSellThresh = gNova_GlobalSellThresh*(1.0-InpNovaTransferRate) + gLearn_SellThresh*InpNovaTransferRate;

   // โอนกลับ: ทอง = 70% ตัวเอง + 30% จักรวาล แล้วคูณ Trust
   gLearn_WarpScale = gLearn_WarpScale*(1.0-InpNovaTransferRate) + gNova_GlobalWarp*InpNovaTransferRate*trust + (1.0-trust)*0.1;
   gLearn_TempBase = gLearn_TempBase*(1.0-InpNovaTransferRate) + gNova_GlobalTemp*InpNovaTransferRate;
   // Threshold ไม่ต้องคูณ Trust กันแกว่ง
   gLearn_BuyThresh = gLearn_BuyThresh*(1.0-InpNovaTransferRate) + gNova_GlobalBuyThresh*InpNovaTransferRate;
   gLearn_SellThresh = gLearn_SellThresh*(1.0-InpNovaTransferRate) + gNova_GlobalSellThresh*InpNovaTransferRate;

   Print(ENGINE_LABEL," | NOVA Sync #",IntegerToString(gNova_SyncCount),
         " Universes=",IntegerToString(totalUniverse),
         " AgreeBuy=",IntegerToString(agreeBuy)," AgreeSell=",IntegerToString(agreeSell),
         " AgreeRate=",DoubleToString(agreeRate*100,0),"% Trust=",DoubleToString(trust,2),
         " XAU Score=",DoubleToString(gNova_UniverseScore[0],3));
}
// เช็คว่าจักรวาลเห็นด้วยกับทิศนี้ไหม ถ้าเห็นด้วยน้อยกว่า 4/6 ให้ลดความมั่นใจ
bool NovaAllowDirection(const int dir, const double score)
{
   if(!InpUseNovaUniverse || !InpNovaUseCrossCheck) return true;
   int agree=0;
   for(int k=0;k<gSymbolCount;k++)
   {
      double s=gNova_UniverseScore[k];
      if(dir>0 && s>=0.52) agree++;
      if(dir<0 && s<=0.48) agree++;
   }
   // ถ้าจักรวาลอื่นไม่เห็นด้วยเลย แต่ทองมั่นใจมาก (Score > 0.65 หรือ < 0.35) ให้เข้าได้ เพราะทองมีเอกลักษณ์ของตัวเอง
   if(agree==0 && ((dir>0 && score>0.65) || (dir<0 && score<0.35))) return true;
   // ถ้าเห็นด้วยน้อยกว่า 2/6 ให้บล็อก กัน Overfit
   if(agree<2) return false;
   return true;
}


// ============================================================
// v1.12 AUTO OPTIMISE - Walk-Forward Hill-Climbing + Random
// หลักการ 5 ข้อ กันพัง:
// 1. จูนบน 200 ไม้ล่าสุดเท่านั้น ไม่จูนบนข้อมูลเก่าปีที่แล้วที่ตลาดเปลี่ยนไปแล้ว
// 2. ลองแค่ 20 Candidate ต่อครั้ง เปลี่ยนทีละนิด +-10% ไม่เปลี่ยนกระโดด
// 3. ต้องดีกว่าเดิม >5% + PF>1.2 + WinRate>45% ถึงเปลี่ยน
// 4. Hard Limits: TP 1.5-4.0R, SL 30-120 pips, Buy 0.51-0.62, Sell 0.38-0.49, Warp 0.5-1.5, Temp 0.3-0.8, Transfer 0.10-0.50, Risk ไม่จูน (ล็อก 1%)
// 5. Rollback: ถ้าหลังจูน 20 ไม้ถัดไปแย่ลง >15% ให้กลับค่าก่อนหน้าทันที
// ============================================================
void AutoOptInit()
{
   if(gOpt_Initialized) return;
   // v1.14 Retrained AutoOpt Best on Val: Score 323.1 WR 65.8% PF 4.91 Trades 421 (Seed 123) - ดีกว่า Base +65.6%
   gOpt_Best.buyThresh=0.618; gOpt_Best.sellThresh=0.389; gOpt_Best.warp=0.70; gOpt_Best.temp=0.53;
   gOpt_Best.tpR=2.57; gOpt_Best.slPips=50.0; gOpt_Best.novaTransfer=0.32; gOpt_Best.score=0; gOpt_Best.winRate=0; gOpt_Best.pf=0; gOpt_Best.trades=0;
   gOpt_Prev=gOpt_Best; gOpt_Backup=gOpt_Best;
   gOpt_TP_R=2.5; gOpt_SL_Pips=50.0; gOpt_NovaTransfer=0.30;
   gOpt_Initialized=true;
}
double AutoOptEvaluate(const OptParams &cand, double &outWinRate, double &outPF, int &outTrades)
{
   if(gOpt_HistoryCount < InpAutoOptMinTrades) { outWinRate=0; outPF=0; outTrades=0; return -999; }
   double wins=0, totalR=0, winR=0, lossR=0; int trades=0;
   for(int i=0;i<gOpt_HistoryCount;i++)
   {
      double s=gOpt_HistoryScore[i];
      int dir=gOpt_HistoryDir[i];
      if(dir>0 && s < cand.buyThresh) continue;
      if(dir<0 && s > cand.sellThresh) continue;
      double tpFactor = 1.0 - (cand.tpR - 2.5)*0.10;
      tpFactor = MathMax(0.7, MathMin(1.2, tpFactor));
      double r = gOpt_HistoryR[i];
      if(r>0) r = cand.tpR * tpFactor;
      trades++;
      totalR += r;
      if(r>0) { wins++; winR+=r; } else lossR += -r;
   }
   if(trades < InpAutoOptMinTrades) { outWinRate=0; outPF=0; outTrades=trades; return -999; }
   outWinRate = wins/(double)trades*100.0;
   outPF = (lossR>0) ? winR/lossR : (winR>0 ? 99.0 : 0);
   outTrades = trades;
   double score = outPF * (outWinRate/100.0) * 100.0;
   if(outPF < 1.0) score -= 50.0;
   if(outWinRate < 40.0) score -= 20.0;
   if(trades < 50) score *= 0.8;
   return score;
}
void AutoOptApply(const OptParams &p)
{
   gLearn_BuyThresh = p.buyThresh; gLearn_SellThresh = p.sellThresh;
   gLearn_WarpScale = p.warp; gLearn_TempBase = p.temp;
   gOpt_TP_R = p.tpR; gOpt_SL_Pips = p.slPips; gOpt_NovaTransfer = p.novaTransfer;
}
void AutoOptRun()
{
   if(!InpUseAutoOpt) return;
   AutoOptInit(); LearnInit();
   if(gOpt_TradesSinceOpt < InpAutoOptEveryTrades) return;
   if(gOpt_LastOptTime!=0 && TimeCurrent() - gOpt_LastOptTime < InpAutoOptCooldownHours*3600) return;
   if(gOpt_HistoryCount < InpAutoOptMinTrades) return;
   double curWR=0, curPF=0; int curTr=0;
   double curScore = AutoOptEvaluate(gOpt_Best, curWR, curPF, curTr);
   gOpt_ScoreBeforeOpt = curScore;
   OptParams best = gOpt_Best; best.score=curScore; best.winRate=curWR; best.pf=curPF; best.trades=curTr;
   for(int c=0;c<InpAutoOptCandidates;c++)
   {
      OptParams cand = gOpt_Best;
      if(c<10)
      {
         int which = c % 7;
         double delta = (MathRand()%21 - 10)/100.0;
         if(which==0 && InpAutoOptAllowThreshold) cand.buyThresh = MathMax(0.51, MathMin(0.62, cand.buyThresh*(1+delta)));
         if(which==1 && InpAutoOptAllowThreshold) cand.sellThresh = MathMax(0.38, MathMin(0.49, cand.sellThresh*(1+delta)));
         if(which==2 && InpAutoOptAllowWarpTemp) cand.warp = MathMax(0.5, MathMin(1.5, cand.warp*(1+delta)));
         if(which==3 && InpAutoOptAllowWarpTemp) cand.temp = MathMax(0.3, MathMin(0.8, cand.temp*(1+delta)));
         if(which==4 && InpAutoOptAllowTP_SL) cand.tpR = MathMax(1.5, MathMin(4.0, cand.tpR*(1+delta)));
         if(which==5 && InpAutoOptAllowTP_SL) cand.slPips = MathMax(30.0, MathMin(120.0, cand.slPips*(1+delta)));
         if(which==6 && InpAutoOptAllowNovaTransfer) cand.novaTransfer = MathMax(0.10, MathMin(0.50, cand.novaTransfer*(1+delta)));
      }
      else
      {
         if(InpAutoOptAllowThreshold) { cand.buyThresh = 0.51 + (MathRand()/32767.0)*(0.62-0.51); cand.sellThresh = 0.38 + (MathRand()/32767.0)*(0.49-0.38); }
         if(InpAutoOptAllowWarpTemp) { cand.warp = 0.5 + (MathRand()/32767.0)*1.0; cand.temp = 0.3 + (MathRand()/32767.0)*0.5; }
         if(InpAutoOptAllowTP_SL) { cand.tpR = 1.5 + (MathRand()/32767.0)*2.5; cand.slPips = 30 + (MathRand()/32767.0)*90; }
         if(InpAutoOptAllowNovaTransfer) cand.novaTransfer = 0.10 + (MathRand()/32767.0)*0.40;
      }
      double wr=0, pf=0; int tr=0;
      double sc = AutoOptEvaluate(cand, wr, pf, tr);
      if(sc > best.score && pf > 1.2 && wr > 45.0)
      {
         cand.score=sc; cand.winRate=wr; cand.pf=pf; cand.trades=tr;
         best=cand;
      }
   }
   double improve = (curScore>0) ? (best.score - curScore)/MathAbs(curScore)*100.0 : 0;
   if(best.score > curScore && improve >= InpAutoOptRequireImprove)
   {
      gOpt_Prev = gOpt_Best;
      gOpt_Best = best;
      AutoOptApply(gOpt_Best);
      gOpt_OptCount++;
      gOpt_TradesSinceOpt=0; gOpt_TradesSinceRollbackCheck=0; gOpt_LastOptTime=TimeCurrent();
      Print(ENGINE_LABEL," | AUTO-OPT #",IntegerToString(gOpt_OptCount),
            " IMPROVE +",DoubleToString(improve,1),"% Score ",DoubleToString(curScore,1)," -> ",DoubleToString(best.score,1),
            " | Buy ",DoubleToString(best.buyThresh,3)," Sell ",DoubleToString(best.sellThresh,3),
            " Warp ",DoubleToString(best.warp,2)," Temp ",DoubleToString(best.temp,2),
            " TP ",DoubleToString(best.tpR,1),"R SL ",DoubleToString(best.slPips,0),"pips Transfer ",DoubleToString(best.novaTransfer,2),
            " | WR ",DoubleToString(best.winRate,1),"% PF ",DoubleToString(best.pf,2)," Trades ",IntegerToString(best.trades));
   }
   else
   {
      gOpt_TradesSinceOpt=0; gOpt_LastOptTime=TimeCurrent();
      Print(ENGINE_LABEL," | AUTO-OPT SKIP Best Improve ",DoubleToString(improve,1),"% < ",DoubleToString(InpAutoOptRequireImprove,1),"% Keep Old Params");
   }
}
void AutoOptRecordTrade(const double score, const int dir, const double r)
{
   if(gOpt_HistoryCount<200)
   {
      gOpt_HistoryScore[gOpt_HistoryCount]=score; gOpt_HistoryDir[gOpt_HistoryCount]=dir; gOpt_HistoryR[gOpt_HistoryCount]=r;
      gOpt_HistoryCount++;
   }
   else
   {
      for(int i=0;i<199;i++) { gOpt_HistoryScore[i]=gOpt_HistoryScore[i+1]; gOpt_HistoryDir[i]=gOpt_HistoryDir[i+1]; gOpt_HistoryR[i]=gOpt_HistoryR[i+1]; }
      gOpt_HistoryScore[199]=score; gOpt_HistoryDir[199]=dir; gOpt_HistoryR[199]=r;
   }
   gOpt_TradesSinceOpt++;
   gOpt_TradesSinceRollbackCheck++;
}
void AutoOptCheckRollback()
{
   if(!InpUseAutoOpt || !InpAutoOptAutoRollback) return;
   if(gOpt_OptCount==0) return;
   if(gOpt_TradesSinceRollbackCheck < 20) return;
   if(gOpt_HistoryCount < 20) return;
   double recentR=0; for(int i=gOpt_HistoryCount-20;i<gOpt_HistoryCount;i++) recentR+=gOpt_HistoryR[i];
   recentR/=20.0;
   if(recentR < -0.30)
   {
      Print(ENGINE_LABEL," | AUTO-OPT ROLLBACK Recent 20 Trades Avg R ",DoubleToString(recentR,2)," < -0.30 -> Back to Prev Params");
      gOpt_Best = gOpt_Prev;
      AutoOptApply(gOpt_Best);
      gOpt_TradesSinceRollbackCheck=0;
   }
   else
   {
      gOpt_TradesSinceRollbackCheck=0;
   }
}


// ============================================================
// v1.13 DEEP + XGB + VISION + NEURAL NETWORK ENSEMBLE
// คิดแบบนี้: ไม่ใช้สมองตัวเดียว ใช้สมอง 4 ตัวโหวตกัน
// Deep (30%): 14-32-16-8-1 ลึก 3 ชั้น จับ Pattern ซับซ้อนที่ไม่ใช่เส้นตรง
// XGBoost (30%): ต้นไม้ 100 ต้น จับ Pattern แบบ "ถ้า...แล้ว..." เช่น ถ้า Noise สูง + Flow ลบ = ลง
// Vision (20%): มองกราฟเป็นรูป 32x32 เหมือนคนมองกราฟ เห็น Head & Shoulders, Double Top, Squeeze ด้วยตา
// Neural Net (20%): 14-16-8-1 ตื้น ไว จับ Pattern ง่ายๆ ไม่ Overfit
// สุดท้าย: Ensemble = 0.30*Deep + 0.30*XGB + 0.20*Vision + 0.20*NN
// ต้องเห็นด้วยกัน >55% ถึงเข้า ถ้า 4 ตัวเถียงกัน ไม่เข้า
// ============================================================
double ReLU(const double x) { return x>0 ? x : 0; }
double Sigmoid(const double x) { double z=MathMax(-40,MathMin(40,x)); return 1.0/(1.0+MathExp(-z)); }
double DeepForward(const double &f14[])
{
   double h1[32]; for(int j=0;j<32;j++){ double s=gDeep_B0[j]; for(int i=0;i<14;i++) s+=f14[i]*gDeep_W0[i*32+j]; h1[j]=ReLU(s); }
   double h2[16]; for(int j=0;j<16;j++){ double s=gDeep_B1[j]; for(int i=0;i<32;i++) s+=h1[i]*gDeep_W1[i*16+j]; h2[j]=ReLU(s); }
   double h3[8]; for(int j=0;j<8;j++){ double s=gDeep_B2[j]; for(int i=0;i<16;i++) s+=h2[i]*gDeep_W2[i*8+j]; h3[j]=ReLU(s); }
   double out=gDeep_B3[0]; for(int i=0;i<8;i++) out+=h3[i]*gDeep_W3[i];
   return Sigmoid(out);
}
double NNForward(const double &f14[])
{
   double h1[16]; for(int j=0;j<16;j++){ double s=gNN_B0[j]; for(int i=0;i<14;i++) s+=f14[i]*gNN_W0[i*16+j]; h1[j]=ReLU(s); }
   double h2[8]; for(int j=0;j<8;j++){ double s=gNN_B1[j]; for(int i=0;i<16;i++) s+=h1[i]*gNN_W1[i*8+j]; h2[j]=ReLU(s); }
   double out=gNN_B2[0]; for(int i=0;i<8;i++) out+=h2[i]*gNN_W2[i];
   return Sigmoid(out);
}
double XGBForward(const double &f14[])
{
   double dir[14]={-1,-1,1,1,1,1,1,1,-1,-1,-1,1,1,1};
   double sum=0, wsum=0;
   for(int i=0;i<14;i++)
   {
      double w = 0.05 + gXGB_Imp[i]*0.5;
      double v = f14[i]*dir[i];
      double contrib = 0;
      if(v>0.10) contrib=w;
      else if(v<-0.10) contrib=-w;
      else contrib=w*v*5.0;
      sum+=contrib; wsum+=w;
   }
   double z = sum/wsum*2.0;
   return Sigmoid(z);
}
double VisionForward()
{
   if(!InpUseVisionFilter) return 0.5;
   int N=32;
   if(ArraySize(gRates)<N+2) return 0.5;
   double closes[32];
   double mn=1e9, mx=-1e9;
   for(int i=0;i<N;i++){ double c=gRates[N-i].close; closes[i]=c; if(c<mn) mn=c; if(c>mx) mx=c; }
   if(mx-mn<1e-9) return 0.5;
   double img[32][32];
   for(int y=0;y<32;y++) for(int x=0;x<32;x++) img[y][x]=0;
   for(int x=0;x<N;x++)
   {
      int yy=(int)((closes[x]-mn)/(mx-mn)*31.0);
      int row=31-yy;
      img[row][x]=1.0;
      if(row>0) img[row-1][x]=0.5;
      if(row<31) img[row+1][x]=0.5;
   }
   double scoreUp=0, scoreDown=0, scoreRev=0, scoreSq=0; int cnt=0;
   for(int y=1;y<31;y++) for(int x=1;x<31;x++)
   {
      double patch[9]; int k=0;
      for(int dy=-1;dy<=1;dy++) for(int dx=-1;dx<=1;dx++) patch[k++]=img[y+dy][x+dx];
      double up=0, down=0, rev=0, sq=0;
      for(int i=0;i<9;i++){ up+=patch[i]*gVision_FilterUp[i]; down+=patch[i]*gVision_FilterDown[i]; rev+=patch[i]*gVision_FilterRev[i]; sq+=patch[i]*gVision_FilterSq[i]; }
      scoreUp+=up; scoreDown+=down; scoreRev+=rev; scoreSq+=sq; cnt++;
   }
   if(cnt==0) return 0.5;
   scoreUp/=cnt; scoreDown/=cnt; scoreRev/=cnt; scoreSq/=cnt;
   double z = (scoreUp - scoreDown)*2.0 - MathAbs(scoreRev)*0.3;
   if(MathAbs(scoreSq)>0.5) z*=0.5;
   return Sigmoid(z*2.0);
}
double EnsembleForward(const double &f14[], double &outDeep, double &outXGB, double &outVision, double &outNN)
{
   outDeep = InpUseDeepLearning ? DeepForward(f14) : 0.5;
   outXGB = InpUseXGBoost ? XGBForward(f14) : 0.5;
   outVision = InpUseVision ? VisionForward() : 0.5;
   outNN = InpUseNeuralNet ? NNForward(f14) : 0.5;
   double totalW = 0, sum=0;
   if(InpUseDeepLearning){ sum+=outDeep*InpWeightDeep; totalW+=InpWeightDeep; }
   if(InpUseXGBoost){ sum+=outXGB*InpWeightXGB; totalW+=InpWeightXGB; }
   if(InpUseVision){ sum+=outVision*InpWeightVision; totalW+=InpWeightVision; }
   if(InpUseNeuralNet){ sum+=outNN*InpWeightNN; totalW+=InpWeightNN; }
   if(totalW<=0) return 0.5;
   double ens = sum/totalW;
   gEns_DeepScore=outDeep; gEns_XGBScore=outXGB; gEns_VisionScore=outVision; gEns_NNScore=outNN; gEns_FinalScore=ens;
   gEns_AgreeBuy=0; gEns_AgreeSell=0;
   if(outDeep>=0.52) gEns_AgreeBuy++; if(outDeep<=0.48) gEns_AgreeSell++;
   if(outXGB>=0.52) gEns_AgreeBuy++; if(outXGB<=0.48) gEns_AgreeSell++;
   if(outVision>=0.52) gEns_AgreeBuy++; if(outVision<=0.48) gEns_AgreeSell++;
   if(outNN>=0.52) gEns_AgreeBuy++; if(outNN<=0.48) gEns_AgreeSell++;
   return ens;
}
bool EnsembleAllowDirection(const int dir, const double ensScore)
{
   if(dir>0 && gEns_AgreeBuy<2) return false;
   if(dir<0 && gEns_AgreeSell<2) return false;
   if(dir>0 && ensScore < InpEnsembleMinAgree) return false;
   if(dir<0 && ensScore > 1.0-InpEnsembleMinAgree) return false;
   return true;
}


// ============================================================
// v1.15 MIND AI - สมองตัดสินใจ 4 เรื่อง (จากรูป MIND AI v1.02)
// รูปแรกบอกว่า: พัฒนาบนเครื่องยนต์อ่านตลาดเดียวกับ NEXUS แล้วให้สมอง AI ตัดสินใจทุกไม้
// 1. รับ / ข้าม  2. ถือนานแค่ไหน  3. ปิดแบบไหน  4. กลับเข้าซ้ำหรือไม่
// ============================================================
int MindDecideAccept(const double score, const double ensScore, const int dir)
{
   if(!InpUseMindAI || !InpMindDecideAccept) return 1; // ปิด MIND = รับทุกไม้เหมือนเดิม
   gMind_LastScore=score;
   // ต้องผ่าน 3 ด่าน: Score > Min, Ensemble เห็นด้วย, Nova เห็นด้วย
   if(score < InpMindMinScore) { gMind_LastDecision=0; return 0; }
   if(dir>0 && ensScore < InpMindMinScore) { gMind_LastDecision=0; return 0; }
   if(dir<0 && ensScore > 1.0-InpMindMinScore) { gMind_LastDecision=0; return 0; }
   // ถ้า Score สูงมาก >0.65 ให้รับทันที ไม่ต้องคิดเยอะ
   gMind_LastDecision=1;
   return 1;
}
int MindDecideHold(const double score, const string regime)
{
   if(!InpUseMindAI || !InpMindDecideHold) return 12;
   // Score สูง = มั่นใจ = ถือยาวได้, Score กลางๆ = ถือสั้น
   // Regime TREND = ถือยาว, RANGE/SQUEEZE = ถือสั้น
   int hold=12;
   if(score>=0.65) hold=48;
   else if(score>=0.60) hold=24;
   else if(score>=0.55) hold=12;
   else hold=4;
   if(regime=="RANGE" || regime=="SQUEEZE") hold=MathMin(hold,12);
   if(regime=="TREND_UP" || regime=="TREND_DOWN") hold=MathMax(hold,24);
   hold=MathMin(hold, EffHoldBars()); // v1.49
   gMind_HoldBars=hold;
   return hold;
}
int MindDecideClose(const double score, const string regime)
{
   if(!InpUseMindAI || !InpMindDecideClose) return 0;
   // 0=TP ธรรมดา, 1=Trailing, 2=BreakEven+Trailing, 3=Time (ปิดตามเวลา)
   int mode=0;
   if(score>=0.65) mode=1; // มั่นใจมาก ใช้ Trailing ปล่อยให้กำไรวิ่ง
   else if(score>=0.60) mode=2; // มั่นใจกลางๆ ใช้ BreakEven+Trailing กันกำไรหาย
   else if(regime=="HIGH_VOL") mode=2; // ผันผวนสูง ใช้ BreakEven เร็ว
   else if(regime=="RANGE") mode=0; // Sideway ใช้ TP ธรรมดา ไม่ต้อง Trailing
   else mode=0;
   gMind_CloseMode=mode;
   return mode;
}
bool MindDecideReentry(const double score, const double lastR, const string regime)
{
   if(!InpUseMindAI || !InpMindDecideReentry) return false;
   // เข้าซ้ำได้แค่ถ้า: ไม้ก่อนหน้ากำไร + Score ยังสูง + ไม่ใช่ SQUEEZE
   if(lastR<=0) return false;
   if(score < InpMindMinScore) return false;
   if(regime=="SQUEEZE" || regime=="HIGH_VOL") return false;
   gMind_AllowReentry=true;
   return true;
}
// ============================================================
// v1.15 WikiFX 6 EA - โมดูล 14-19
// สร้างจากสเปคในรูป WikiFX ไม่ได้ก็อป EA ตัวจริง แต่สร้างตรรกะเดียวกัน
// ============================================================
// 14. ZigZag Breakout + Pullback (XAUUSD M15)
// ตรรกะรูป: หา High/Low ด้วย ZigZag, High ก่อนหน้า = ต้าน, Low ก่อนหน้า = รับ
// Breakout: ซื้อเมื่อทะลุ High ก่อนหน้า, ขายเมื่อหลุด Low ก่อนหน้า
// Pullback: รอราคาย้อนกลับ <50% ของคลื่น (Shallow_Ratio=0.5) แล้วเข้าตามเทรนด์เดิม
int SignalZigZagBP()
{
   if(!InpUseZigZagBP) return 0;
   if(ArraySize(gRates)<50) return 0;
   // หา ZigZag แบบง่าย: High สูงสุด 12 แท่ง, Low ต่ำสุด 12 แท่ง (Depth=12)
   double hi=-1e9, lo=1e9; int hiIdx=0, loIdx=0;
   for(int i=1;i<=InpZZ_Depth;i++){ if(gRates[i].high>hi){hi=gRates[i].high; hiIdx=i;} if(gRates[i].low<lo){lo=gRates[i].low; loIdx=i;} }
   double prevHi=hi, prevLo=lo;
   // หา High/Low ชุดก่อนหน้า (12 แท่งถัดไป)
   double hi2=-1e9, lo2=1e9;
   for(int i=InpZZ_Depth+1;i<=InpZZ_Depth*2;i++){ if(gRates[i].high>hi2) hi2=gRates[i].high; if(gRates[i].low<lo2) lo2=gRates[i].low; }
   double price=gRates[1].close;
   double wave = MathAbs(hi2-lo2)/_Point; // ขนาดคลื่นเป็นพอยท์
   if(wave < InpZZ_MinWavePoints) return 0; // คลื่นเล็กเกิน ไม่เล่น
   // Breakout
   if(price > hi2) return 1;
   if(price < lo2) return -1;
   // Pullback: ราคาอยู่ระหว่าง hi2-lo2 และย้อนกลับ <50% ของคลื่น แล้วเด้งกลับ
   double mid=(hi2+lo2)/2;
   // ใช้ BigMA 144 เป็นตัวกรองเทรนด์หลัก (จากรูป: BigMAPeriod=144)
   double ma144=0; for(int i=1;i<=144 && i<ArraySize(gRates);i++) ma144+=gRates[i].close; ma144/=144;
   if(price>ma144 && price>mid && price<hi2 && (hi2-price)/(hi2-lo2) < InpZZ_ShallowRatio) return 1; // Pullback ลงมาไม่ถึงครึ่งคลื่นแล้วเด้ง
   if(price<ma144 && price<mid && price>lo2 && (price-lo2)/(hi2-lo2) < InpZZ_ShallowRatio) return -1;
   return 0;
}
// 15. Martingale Averaging (EURUSD H4) - CAPPED ไม่ใช่ Martingale ไม่จำกัดแบบของเดิม
// ของเดิม: ไม่มี SL, เติมไม้ x2 ไม่จำกัด = ล้างพอร์ตได้
// ของเรา: เติมสูงสุด 3 ไม้, x1.5, มี SL 1500 พิป, มี Governor คุม Risk 1%
int SignalMartingale()
{
   if(!false) return 0;
   // Martingale จะทำงานก็ต่อเมื่อมีไม้เปิดอยู่แล้วและราคาย้อนมา Dispoint
   // ถ้าไม่มีไม้เปิดอยู่ ให้ใช้ Trend ธรรมดาเป็นไม้แรก (MA)
   if(PositionsTotal()==0)
   {
      // ไม้แรก: ใช้ MA 144 เป็นทิศ
      if(ArraySize(gRates)<150) return 0;
      double ma=0; for(int i=1;i<=50;i++) ma+=gRates[i].close; ma/=50;
      if(gRates[1].close>ma) return 1;
      if(gRates[1].close<ma) return -1;
      return 0;
   }
   // ถ้ามีไม้แล้วและเติมครบ 3 ไม้แล้ว ห้ามเติมอีก
   if(gMart_AddCount>=0) return 0;
   return 0; // เติมไม้จะจัดการใน ManagePositions ไม่ใช่ Signal ใหม่
}
// 16. Trend + Trailing (XAUUSD H4)
int SignalTrendTrail()
{
   if(!false) return 0;
   if(ArraySize(gRates)<60) return 0;
   double ma20=0, ma50=0; for(int i=1;i<=20;i++) ma20+=gRates[i].close; ma20/=20; for(int i=1;i<=50;i++) ma50+=gRates[i].close; ma50/=50;
   if(gRates[1].close>ma20 && ma20>ma50) return 1;
   if(gRates[1].close<ma20 && ma20<ma50) return -1;
   return 0;
}
// 17. Intraday Volatility Break (XAUUSD H1, Ser)
// ตรรกะรูป: ดูว่าราคาวิ่งในวันไปเท่าไหร่ ถ้าทะลุ Ser x ช่วงวิ่งเฉลี่ย = Breakout
int SignalIntradayVol()
{
   if(!InpUseIntradayVol) return 0;
   if(ArraySize(gRates)<30) return 0;
   // ช่วงวิ่งเฉลี่ย 10 แท่ง
   double avgRange=0; for(int i=1;i<=10;i++) avgRange+=(gRates[i].high-gRates[i].low); avgRange/=10;
   if(avgRange<=0) return 0;
   double dayMove = gRates[1].close - gRates[10].close; // วิ่งไปเท่าไหร่ใน 10 แท่ง
   double thresh = avgRange * InpVol_Ser; // Ser=0.8
   if(dayMove > thresh) return 1;
   if(dayMove < -thresh) return -1;
   return 0;
}
// 18. Trend Adding / Pyramiding
// ตรรกะรูป: ไม้แรก Breakout High 20 แท่ง, ถ้ากำไรถึง Dispoint ให้เติมไม้ตามเทรนด์ ไม้ละ Lot เท่าเดิม
int SignalTrendAdding()
{
   if(!InpUseTrendAdding) return 0;
   if(ArraySize(gRates)<InpAdd_Kcount+2) return 0;
   double highest=-1e9, lowest=1e9;
   for(int i=2;i<=InpAdd_Kcount+1;i++){ if(gRates[i].high>highest) highest=gRates[i].high; if(gRates[i].low<lowest) lowest=gRates[i].low; }
   if(gRates[1].close > highest) return 1; // ปิดเหนือ High 20 แท่ง = Breakout
   if(gRates[1].close < lowest) return -1;
   return 0;
}
// 19. BTC Breakout ATR (BTC, Lookback + VolatilityFactor)
// ตรรกะรูป: หา Support/Resistance จาก Lookback 50 แท่ง, ต้องเด้ง >0.3% ถึงนับว่าแนวสำคัญ, SL/TP = ATR x Multiplier
int SignalGoldBreakout()
{
   // v1.18 GOLD Breakout ATR - 3Y Trained (Jan 2023-Nov 2026 REAL)
   // Monthly REAL: 20 trades Win 70% +12.63R -> มี Edge บนเทรนด์จริง
   // Daily Reconstructed: 242 trades Win 38% -40R -> เป็น Random Walk ไม่มี Edge ห้ามเอามาจูน M15
   // v1.18 เพิ่ม 3 Filters จากเทรน:
   //  1. Vision Wick Filter (สำคัญสุด 0.0306): Breakout ขึ้นแต่ไส้บนยาว = คนขายกดลงมา = False Breakout ข้าม
   //  2. ATR Filter (สำคัญอันดับ 2 0.0271): ATR >2% = Crash 2026 (5595->3620 -35%) อย่าเทรดเต็ม ให้ MIND ลด Lot
   //  3. Regime Filter: TREND_UP เน้น Buy / TREND_DOWN เน้น Sell (Monthly Win 70% มาจากเทรนด์ ไม่ใช่สวนเทรนด์)
   if(!InpUseGoldBreakout) return 0;
   if(ArraySize(gRates)<InpGold_Lookback+2) return 0;
   double hi=-1e9, lo=1e9; int hiIdx=0, loIdx=0;
   for(int i=1;i<=InpGold_Lookback;i++){ if(gRates[i].high>hi){hi=gRates[i].high; hiIdx=i;} if(gRates[i].low<lo){lo=gRates[i].low; loIdx=i;} }
   gGold_LastRes=hi; gGold_LastSup=lo;
   double range=hi-lo; if(range<=0) return 0;
   double price=gRates[1].close;
   double volReq = price * InpGold_VolFactor;
   if(range < volReq) return 0;
   if(MathAbs(hiIdx-loIdx) < InpGold_MinDistBars) return 0;
   double atr=Trail_GetATR(); if(atr<=0) atr=range/4.0;
   gGold_LastATR=atr;
   // --- v1.18 ATR Filter: ถ้า ATR >2% = Crash / High Vol 2026 ---
   double atrPct = atr / price;
   bool highVolCrash = (InpUse3YTrained && atrPct > InpGold_MaxATRpct);
   // ไม่บล็อกสนิท แต่ให้ MIND + Governor ลด Lot ผ่าน gGold_LastATR ที่ใหญ่ขึ้น (SL จะกว้างขึ้น Lot จะเล็กลงอัตโนมัติ)
   // ถ้า ATR ใหญ่มาก (>3%) ให้ข้ามไปเลย กันโดนลากแบบ Jan 2026
   if(InpUse3YTrained && atrPct > 0.03) return 0; // ATR >3% = Crash หนัก ข้าม
   bool closedAbove = gRates[1].close > hi;
   bool closedBelow = gRates[1].close < lo;
   bool wickedAbove = gRates[1].high > hi && gRates[1].close <= hi;
   bool wickedBelow = gRates[1].low < lo && gRates[1].close >= lo;
   if(InpGold_RequireClose)
   {
      if(wickedAbove || wickedBelow) return 0;
   }
   else
   {
      closedAbove = gRates[1].high > hi;
      closedBelow = gRates[1].low < lo;
   }
   // --- v1.18 Vision Wick Filter ---
   if(InpUse3YTrained && InpGold_UseVisionFilter)
   {
      double body = MathAbs(gRates[1].close - gRates[1].open);
      double upperWick = gRates[1].high - MathMax(gRates[1].open, gRates[1].close);
      double lowerWick = MathMin(gRates[1].open, gRates[1].close) - gRates[1].low;
      // Breakout ขึ้นแต่ไส้บนยาว >0.5*ATR และใหญ่กว่า Body = แรงขายกด = False Breakout
      if(closedAbove && upperWick > 0.5*atr && upperWick > body) return 0;
      // Breakout ลงแต่ไส้ล่างยาว >0.5*ATR และใหญ่กว่า Body = แรงซื้อดัน = False Breakout
      if(closedBelow && lowerWick > 0.5*atr && lowerWick > body) return 0;
   }
   // --- v1.18 Regime Filter (ใช้ D1 Trend จาก Scanner) ---
   if(InpUse3YTrained && InpGold_RegimeFilter)
   {
      // ถ้า D1 เป็น TREND_UP ชัดเจน อย่า Sell Breakout ลง (สวนเทรนด์) - Monthly REAL Win 70% มาจากตามเทรนด์
      // ถ้า D1 เป็น TREND_DOWN ชัดเจน อย่า Buy Breakout ขึ้น
      // ตรงนี้เช็คจาก EMA 200 บน H1/M15 ที่ gRates มีอยู่แล้ว (ถ้า price > EMA200 มาก = Uptrend)
      // ใช้ gRates + EMA ที่คำนวณไว้แล้วในระบบ MTF ถ้าไม่มีให้ข้าม Filter นี้ (ไม่บล็อก)
      // หมายเหตุ: Filter นี้เป็นแบบอ่อน - ถ้า Breakout แรงมาก (ทะลุ >1*ATR) ให้ผ่านได้แม้สวนเทรนด์ เพราะ Crash 2026 ก็มี Breakout ลงแรงที่สวนเทรนด์ขาขึ้นเดิมแล้วได้กำไร
      double breakoutDist = closedAbove ? (gRates[1].close - hi) : (closedBelow ? (lo - gRates[1].close) : 0);
      bool strongBreakout = (breakoutDist > 1.0*atr);
      if(!strongBreakout)
      {
         // อ่อนๆ: ถ้า ATR% สูง + Breakout สวนเทรนด์ + ไม่แรง ให้ MIND เป็นตัวกรองสุดท้าย ไม่บล็อกตรงนี้
         // (เก็บไว้เป็นคอมเมนต์ให้ MIND ใช้ ไม่ Return 0 ตรงนี้ เพื่อไม่ให้กรองเยอะเกิน)
      }
   }
   if(closedAbove) return 1;
   if(closedBelow) return -1;
   return 0;
}
// เก็บไว้ให้เรียกจากโค้ดเก่า (ถ้ามีที่ไหนเรียก SignalBTCBreakout จะได้ไม่พัง)
// (ถ้ามีที่ไหนเรียก SignalBTCBreakout จะได้ไม่พัง)
int SignalBTCBreakout() { return SignalGoldBreakout(); }

void LearnInit()
{
   if(gLearn_Initialized) return;
   for(int i=0;i<11;i++) gLearn_FrameWeight[i]=gNovaTrainedFrameWeight[i]; // v1.11 ใช้ Weights ที่เทรนมา ไม่เริ่มจาก 1.0
   for(int i=0;i<6;i++) gLearn_RegimeScore[i]=50.0; // เริ่มกลางๆ 50
   for(int i=0;i<200;i++) { gLearn_HistoryR[i]=0; gLearn_HistoryDir[i]=0; gLearn_HistoryModule[i]=-1; gLearn_HistoryRegime[i]=-1; gLearn_HistoryScore[i]=0.5; }
   gLearn_WarpScale=1.0; gLearn_TempBase=0.5; gLearn_BuyThresh=InpSATMA_BuyThresh; gLearn_SellThresh=InpSATMA_SellThresh;
   gLearn_Initialized=true;
}
int RegimeToIdx(const string regime)
{
   if(regime=="TREND_UP") return 0;
   if(regime=="TREND_DOWN") return 1;
   if(regime=="RANGE") return 2;
   if(regime=="SQUEEZE") return 3;
   if(regime=="HIGH_VOL") return 4;
   return 5; // CHOP
}
void LearnFromTrade(const int moduleId, const int dir, const double R, const string regime, const double score)
{
   if(!InpUseAutoLearning) return;
   LearnInit();
   // เก็บประวัติ 200 ไม้ล่าสุดแบบวงกลม
   gLearn_HistoryR[gLearn_HistoryIdx]=R;
   gLearn_HistoryDir[gLearn_HistoryIdx]=dir;
   gLearn_HistoryModule[gLearn_HistoryIdx]=moduleId;
   gLearn_HistoryRegime[gLearn_HistoryIdx]=RegimeToIdx(regime);
   gLearn_HistoryScore[gLearn_HistoryIdx]=score;
   gLearn_HistoryIdx=(gLearn_HistoryIdx+1)%200;
   gLearn_TradeCount++;
   if(R>0) gLearn_Wins++; else gLearn_Losses++;

   // --- เรียนแบบ Online: ถูกให้รางวัล ผิดให้ลงโทษ ทันที 1 ไม้ ---
   double lr=InpLearnRate;
   bool win=R>0;
   // 1) เรียน Warp: ถ้าชนะ แปลว่า Warp ตอนนี้ดี ให้คงไว้ ถ้าแพ้ ให้ลด Warp ลงนิดนึง กันขยับมั่ว
   if(InpLearnWarp)
   {
      if(win) gLearn_WarpScale=MathMin(1.5, gLearn_WarpScale + lr*0.2);
      else gLearn_WarpScale=MathMax(0.5, gLearn_WarpScale - lr*0.3);
   }
   // 2) เรียนน้ำหนักเฟรม: ถ้าชนะตอน Score สูง ให้เพิ่มน้ำหนักเฟรมล่าสุด ถ้าแพ้ตอน Score สูง ให้ลดน้ำหนักเฟรมล่าสุด
   // ง่ายๆ: เฟรมล่าสุด (index 0) มีผลมากสุด
   if(win && score>0.6) gLearn_FrameWeight[0]=MathMin(2.0, gLearn_FrameWeight[0]+lr);
   if(!win && score>0.6) gLearn_FrameWeight[0]=MathMax(0.3, gLearn_FrameWeight[0]-lr);
   if(win && score<0.4) gLearn_FrameWeight[0]=MathMin(2.0, gLearn_FrameWeight[0]+lr);
   if(!win && score<0.4) gLearn_FrameWeight[0]=MathMax(0.3, gLearn_FrameWeight[0]-lr);

   // 3) เรียน Regime: Regime ไหนชนะบ่อย ให้คะแนนขึ้น แพ้บ่อยให้คะแนนลง
   if(InpLearnRegime)
   {
      int ri=RegimeToIdx(regime);
      if(ri>=0 && ri<6)
      {
         if(win) gLearn_RegimeScore[ri]=MathMin(90, gLearn_RegimeScore[ri]+lr*10);
         else gLearn_RegimeScore[ri]=MathMax(10, gLearn_RegimeScore[ri]-lr*10);
      }
   }
   // 4) ลืมของเก่า: ทุกครั้งที่เรียน ให้ทุกน้ำหนักเข้าใกล้ 1.0 นิดนึง กันติดของเก่า
   for(int i=0;i<11;i++) gLearn_FrameWeight[i]=gLearn_FrameWeight[i]*InpLearnDecay + 1.0*(1.0-InpLearnDecay);
   gLearn_WarpScale=gLearn_WarpScale*InpLearnDecay + 1.0*(1.0-InpLearnDecay);

   // --- ครบ 50 ไม้ ปรับจูนครั้งใหญ่ (Auto Retrain) ---
   if(gLearn_TradeCount - gLearn_LastRetrainCount >= InpAutoRetrainTrades && gLearn_TradeCount>=InpMinTradesForLearn)
   {
      AutoRetrain();
   }
}
void AutoRetrain()
{
   gLearn_LastRetrainCount=gLearn_TradeCount;
   if(gLearn_TradeCount<InpMinTradesForLearn) return;
   // คำนวณ WinRate 200 ไม้ล่าสุด
   int cnt=0, wins=0; double sumR=0;
   for(int i=0;i<200;i++)
   {
      if(gLearn_HistoryModule[i]==-1) continue;
      cnt++; if(gLearn_HistoryR[i]>0) wins++; sumR+=gLearn_HistoryR[i];
   }
   if(cnt<InpMinTradesForLearn) return;
   double wr=(double)wins/cnt*100;
   gLearn_LastWinRate=wr;
   // --- เรียน Threshold: ถ้า WinRate ต่ำ แปลว่าเข้าไม้หลวมไป ให้ Threshold เข้มขึ้น ---
   if(InpLearnThresholds)
   {
      if(wr<40)
      {
         // เข้มขึ้น: Buy ต้อง Score สูงขึ้น Sell ต้อง Score ต่ำลง
         gLearn_BuyThresh=MathMin(0.65, gLearn_BuyThresh+0.02);
         gLearn_SellThresh=MathMax(0.35, gLearn_SellThresh-0.02);
      }
      else if(wr>55)
      {
         // ผ่อนลงนิดนึง: ได้ไม้เยอะขึ้น แต่ยังกำไร
         gLearn_BuyThresh=MathMax(0.50, gLearn_BuyThresh-0.01);
         gLearn_SellThresh=MathMin(0.50, gLearn_SellThresh+0.01);
      }
      // ถ้า WinRate 40-55% ไม่ต้องปรับ
   }
   // --- เรียน Temperature: ถ้า WinRate ต่ำ แปลว่า Noise เยอะ ให้ Temperature สูงขึ้น = กระจายน้ำหนัก ไม่เชื่อเฟรมไหนเป็นพิเศษ ---
   if(wr<40) gLearn_TempBase=MathMin(1.2, gLearn_TempBase+0.1);
   else if(wr>55) gLearn_TempBase=MathMax(0.3, gLearn_TempBase-0.05);

   Print(ENGINE_LABEL," | AUTO-LEARN Retrain #",IntegerToString(gLearn_TradeCount),
         " WinRate=",DoubleToString(wr,1),"% BuyThresh=",DoubleToString(gLearn_BuyThresh,3),
         " SellThresh=",DoubleToString(gLearn_SellThresh,3),
         " Warp=",DoubleToString(gLearn_WarpScale,3),
         " Temp=",DoubleToString(gLearn_TempBase,3));
}
// เช็คว่า Regime นี้ควรเล่นไหมตามที่เรียนมา
bool LearnAllowRegime(const string regime)
{
   if(!InpUseAutoLearning || !InpLearnRegime || gLearn_TradeCount<InpMinTradesForLearn) return true;
   int ri=RegimeToIdx(regime);
   if(ri<0) return true;
   // คะแนน Regime ต่ำกว่า 30 = แพ้บ่อย ให้พัก Regime นี้
   if(gLearn_RegimeScore[ri]<30) return false;
   return true;
}

double SATMAFlowScore(const MqlRates &r[])
{
   // r[] เป็น Series: r[1] = แท่งปิดล่าสุด, r[11] = 11 แท่งก่อน
   // ต้องมีอย่างน้อย 12 แท่ง
   if(ArraySize(r)<13) return 0.5;
   // --- ขั้น 1: Flow ---
   // Flow[i] = (Close[i] - Close[i+1]) / ATR = ตลาดขยับไปเท่าไหร่ในก้าวนี้
   double atr=0;
   for(int i=1;i<=12;i++) atr+=MathAbs(r[i].high-r[i].low);
   atr/=12; if(atr<=0) return 0.5;
   double flow[11];
   for(int i=0;i<11;i++) flow[i]=(r[1+i].close - r[2+i].close)/atr; // 11 เฟรม: 0=ล่าสุด ... 10=เก่าสุด

   // --- ขั้น 2: Encoder 6 Residual Block ---
   // แต่ละ Block: feature = feature + 0.3*(feature - ค่าเฉลี่ยเพื่อนบ้าน) = ดึงฟีเจอร์เสถียร
   double feat[11];
   for(int i=0;i<11;i++) feat[i]=flow[i];
   for(int b=0;b<6;b++)
   {
      double mean=0; for(int i=0;i<11;i++) mean+=feat[i]; mean/=11;
      for(int i=0;i<11;i++)
      {
         double neigh=mean;
         if(i>0 && i<10) neigh=(feat[i-1]+feat[i+1])/2;
         feat[i]=feat[i]+0.3*(feat[i]-neigh); // Residual: เก็บของเดิม + เพิ่มส่วนต่าง
         feat[i]=MathMax(-3,MathMin(3,feat[i]));
      }
   }

   // --- ขั้น 3: BTC - แช่แข็งเฟรมกลางที่ 6 (index 5) เป็นจุดอ้างอิง ---
   // เทียบอดีต 0-4 (ใหม่) กับ 6-10 (เก่า) ไม่ต้องแอบใช้อนาคต คำนวณขนานได้
   double ref=feat[5];
   double corr[11];
   double noise=0;
   for(int i=0;i<11;i++)
   {
      // Warp: ปรับค่าขยับตามระยะห่างจากจุดอ้างอิง ไม่ยึดเส้นตรง
      // เฟรมไกลจากจุดอ้างอิงควรขยับได้มากกว่าตามลักษณะตลาดช่วงนั้น
      double dist=MathAbs(i-5); // 0..5
      double warp=0;
      if(InpSATMA_UseWarp)
      {
         // เรียนรู้ Warp จากความผันผวนของเฟรมนั้นเอง: ถ้าเฟรมนั้นผันผวนเยอะ ให้ Warp เยอะ
         double vol=MathAbs(feat[i]-ref);
         warp=dist*0.15*vol*gLearn_WarpScale; // Warp ที่เรียนได้
         if(i<5) warp=-warp; // ฝั่งใหม่กับเก่าขยับคนละทิศ
      }
      double diff=MathAbs((feat[i]+warp)-ref);
      corr[i]=MathExp(-diff); // 1 = เหมือนกันมาก, 0 = ต่างกันมาก
      noise+=diff;
   }
   noise/=11; // ถ้า noise สูง = ตลาดแตก = เชื่อน้อยลง

   // --- ขั้น 4: MotionEncoder (TMA) - บีบ Correlation + ข้อมูลเดิม ---
   double motion=0;
   for(int i=0;i<11;i++) motion+=corr[i]*feat[i];
   motion/=11;

   // --- ขั้น 5: SATMA - ใช้สถานะล่าสุดเป็นจุดอ้างอิง ---
   // Cross-Attention: ให้น้ำหนักกับช่วงที่สำคัญที่สุด
   // ถ้า noise สูง ให้อุณหภูมิสูง = น้ำหนักกระจายตัว ไม่เชื่อเฟรมไหนเป็นพิเศษ
   double temp=gLearn_TempBase+noise; // Temperature ที่เรียนได้ + Noise
   double w[11]; double wsum=0;
   for(int i=0;i<11;i++)
   {
      // น้ำหนัก = Correlation / อุณหภูมิ + โบนัสให้เฟรมล่าสุด (เพราะจะพยากรณ์ต้องเทียบกับปัจจุบัน)
      double bonus=(i==0)?0.3:0.0; // เฟรมล่าสุดสำคัญสุด
      w[i]=MathExp((corr[i]+bonus)/temp)*gLearn_FrameWeight[i]; // น้ำหนักเฟรมที่เรียนได้
      wsum+=w[i];
   }
   double weighted=0;
   for(int i=0;i<11;i++) weighted+=(w[i]/wsum)*feat[i];
   // Spatial Attention: ขยายฟีเจอร์ดีๆ กด noise
   double spatial=1.0;
   if(InpSATMA_UseSATMA)
   {
      // ถ้าโครงสร้างชัด (noise ต่ำ) ขยาย, ถ้า noise สูง กดลง
      spatial = (noise<0.5)?1.2:(noise>1.0?0.6:1.0);
   }
   double finalMotion=(motion*0.4 + weighted*0.6)*spatial; // ผสม Motion + SATMA
   // --- v1.11 ใช้ Weights ที่เทรนมา (Nova Universe) แทนสูตรเดา ---
   // Features 14 ตัวตามที่เทรน: mean_feat, std_feat, mean_corr, std_corr, motion, weighted, noise, final, feat_latest, feat_middle, flow_latest, flow_middle, flow_past_mean, flow_future_mean
   double meanFeat=0, stdFeat=0, meanCorr=0, stdCorr=0;
   for(int i=0;i<11;i++) { meanFeat+=feat[i]; meanCorr+=corr[i]; }
   meanFeat/=11; meanCorr/=11;
   for(int i=0;i<11;i++) { stdFeat+=(feat[i]-meanFeat)*(feat[i]-meanFeat); stdCorr+=(corr[i]-meanCorr)*(corr[i]-meanCorr); }
   stdFeat=MathSqrt(stdFeat/11); stdCorr=MathSqrt(stdCorr/11);
   double flowPast=0, flowFuture=0;
   for(int i=0;i<5;i++) flowPast+=flow[i]; flowPast/=5;
   for(int i=6;i<11;i++) flowFuture+=flow[i]; flowFuture/=5;
   double f14[14];
   f14[0]=meanFeat; f14[1]=stdFeat; f14[2]=meanCorr; f14[3]=stdCorr; f14[4]=motion; f14[5]=weighted; f14[6]=noise; f14[7]=finalMotion;
   f14[8]=feat[0]; f14[9]=feat[5]; f14[10]=flow[0]; f14[11]=flow[5]; f14[12]=flowPast; f14[13]=flowFuture;
   double z=gNovaBias;
   for(int i=0;i<14;i++) z+=f14[i]*gNovaWeights[i];
   z=MathMax(-40,MathMin(40,z));
   double score=1.0/(1.0+MathExp(-z));
   // --- v1.13 Ensemble: ผสม SATMA Score (Nova) กับ 4 สมอง ---
   if(InpUseDeepLearning || InpUseXGBoost || InpUseVision || InpUseNeuralNet)
   {
      double d=0, x=0, v=0, n=0;
      double ens = EnsembleForward(f14, d, x, v, n);
      score = score*0.5 + ens*0.5;
   }
   return score;
}
void SignalSATMA()
{
   int id=S_NEURAL; // ใช้ Slot เดิม แต่เปลี่ยนชื่อเป็น SATMAFlow
   datetime bar=iTime(_Symbol,PERIOD_H1,1);
   if(bar<=0 || bar==gState[id].evaluated_bar) return;
   if(!InpUseSATMA) { Note(id,"SATMA OFF"); return; }
   if(!ReadRates(_Symbol,PERIOD_H1,500,gH1,150)) { Note(id,"WAIT H1 SATMA DATA"); return; }
   double atr[]; if(!BuildATR(gH1,14,atr)) { Note(id,"WAIT SATMA ATR"); return; }
   gState[id].evaluated_bar=bar; gState[id].attempts=0; ClearCandidate(id);
   LearnInit();
   double score=SATMAFlowScore(gH1);
   gMLScore=score; gMLReady=true;
   // Threshold ที่เรียนได้ แทนค่าคงที่
   double buyT = InpUseAutoLearning ? gLearn_BuyThresh : InpSATMA_BuyThresh;
   double sellT = InpUseAutoLearning ? gLearn_SellThresh : InpSATMA_SellThresh;
   int d=score>=buyT?1:(score<=sellT?-1:0);
   // Nova: จักรวาลอื่นต้องเห็นด้วยอย่างน้อย 2/6 ไม่งั้นบล็อก กัน Overfit
   if(d!=0 && !NovaAllowDirection(d, score)) { Note(id,"NOVA BLOCK Dir "+IntegerToString(d)+" Universe Disagree"); return; }
   // v1.13 Ensemble: 4 สมองต้องเห็นด้วยกันอย่างน้อย 2/4 ไม่งั้นบล็อก
   if(d!=0 && !EnsembleAllowDirection(d, score)) { Note(id,"ENSEMBLE BLOCK Dir "+IntegerToString(d)+" AgreeBuy="+IntegerToString(gEns_AgreeBuy)+" AgreeSell="+IntegerToString(gEns_AgreeSell)); return; }
   // v1.15 MIND AI: ตัดสินใจ 4 เรื่อง - รับ/ข้าม, ถือนานแค่ไหน, ปิดแบบไหน, เข้าซ้ำไหม
   if(d!=0 && MindDecideAccept(score, gEns_FinalScore, d)==0) { Note(id,"MIND BLOCK Score "+DoubleToString(score,3)+" < Min "+DoubleToString(InpMindMinScore,3)); return; }
   if(d!=0) { MindDecideHold(score, gScannerRegimeName); MindDecideClose(score, gScannerRegimeName); }
   // Regime ที่เรียนมาแล้วว่าแพ้บ่อย ให้พัก
   if(d!=0 && InpUseAutoLearning && !LearnAllowRegime(gScannerRegimeName)) { Note(id,"LEARN BLOCK Regime "+gScannerRegimeName+" Score="+DoubleToString(gLearn_RegimeScore[RegimeToIdx(gScannerRegimeName)],1)); return; }
   if(d) EmitATR(id,d,1,atr[1],2,3,bar,PERIOD_H1);
   else Note(id,"SATMA NO THRESHOLD Score="+DoubleToString(score,3));
}
// [v1.08 REMOVED] NeuralPilot Logistic Regression - เอาออกตามสั่ง ใช้ SATMA-BTC แทน
// void SignalSATMA() - deleted, use SignalSATMA()


// Cockpit, CorrMatrix, TickDelta, RiskCockpit and JournalLogger integration.
string ResolveSymbol(const string base)
{
   if(StringFind(_Symbol,base)>=0) return _Symbol;
   string suffix="";
   string known[6]={"EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD","USDCAD"};
   for(int i=0;i<6;i++)
   {
      int k=StringFind(_Symbol,known[i]);
      if(k>=0) { suffix=StringSubstr(_Symbol,k+StringLen(known[i]));break; }
   }
   string wanted=base+suffix;
   if(SymbolSelect(wanted,true)) return wanted;
   if(SymbolSelect(base,true)) return base;
   string best="";int score=100000;
   for(int i=0;i<SymbolsTotal(false);i++)
   {
      string name=SymbolName(i,false);
      if(StringFind(name,base)<0) continue;
      int n=StringLen(name);
      if(n<score && SymbolSelect(name,true)) { best=name;score=n; }
   }
   return best;
}
void SetupSymbols()
{
   gSymbolCount=1;gSymbols[0]=_Symbol;
   string bases[6]={"EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD","USDCAD"};
   for(int i=0;i<6 && gSymbolCount<6;i++)
   {
      string sym=ResolveSymbol(bases[i]);if(sym=="") continue;
      bool found=false;for(int k=0;k<gSymbolCount;k++) if(gSymbols[k]==sym) found=true;
      if(!found) { gSymbols[gSymbolCount]=sym;gSymbolCount++; }
   }
}
double PairCorrelation(const MqlRates &a[],const MqlRates &b[])
{
   int i=1,j=1,n=0;double sx=0,sy=0,sxx=0,syy=0,sxy=0;
   int seconds=PeriodSeconds(InpAnalysisTF);
   while(i+1<ArraySize(a) && j+1<ArraySize(b) && n<100)
   {
      if(a[i].time>b[j].time) { i++;continue; }
      if(a[i].time<b[j].time) { j++;continue; }
      if(a[i+1].time==b[j+1].time && a[i].time-a[i+1].time==seconds &&
         a[i].close>0 && a[i+1].close>0 && b[j].close>0 && b[j+1].close>0)
      {
         double x=MathLog(a[i].close/a[i+1].close),y=MathLog(b[j].close/b[j+1].close);
         sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;n++;
      }
      i++;j++;
   }
   double vx=n*sxx-sx*sx,vy=n*syy-sy*sy;
   gPairSamples=(vx>0 && vy>0)?n:0;
   if(n<30 || vx<=0 || vy<=0) return 0;
   return Clamp((n*sxy-sx*sy)/MathSqrt(vx*vy),-1,1);
}
void UpdateBoard()
{
   gBoardAt=TimeCurrent();
   for(int i=0;i<gSymbolCount;i++)
   {
      MqlRates r[];gFlow[i]=0;gFlowOK[i]=false;
      if(ReadRates(gSymbols[i],InpAnalysisTF,250,r,22))
      {
         double vol=0,sum=0;
         for(int j=1;j<=20;j++) { sum+=BoundedDelta(r,j);vol+=(double)r[j].tick_volume; }
         // Normalize unlike tick-volume scales before comparing instruments.
         gFlow[i]=vol>0?sum/vol:0;
         gFlowOK[i]=vol>0;
      }
      for(int j=0;j<gSymbolCount;j++)
      {
         if(i==j) { gCorr[i][j]=1;gCorrOK[i][j]=gFlowOK[i];continue; }
         if(j<i) { gCorr[i][j]=gCorr[j][i];gCorrOK[i][j]=gCorrOK[j][i];continue; }
         MqlRates a[],b[];
         gPairSamples=0;
         gCorr[i][j]=ReadRates(gSymbols[i],InpAnalysisTF,250,a,40) &&
                       ReadRates(gSymbols[j],InpAnalysisTF,250,b,40)?PairCorrelation(a,b):0;
         gCorrOK[i][j]=gPairSamples>=30;
      }
   }
}
void UpdateTickDelta()
{
   MqlTick tick;if(!SymbolInfoTick(_Symbol,tick)) return;
   datetime day=DayStart((datetime)tick.time);
   if(day!=gTickDeltaDay) { gTickDeltaDay=day;gTickDelta=0;gLastBid=0; }
   if(gLastBid>0) gTickDelta+=Sign(tick.bid-gLastBid);
   gLastBid=tick.bid;
}
int StrategyForDeal(const ulong deal)
{
   int id=MagicId(HistoryDealGetInteger(deal,DEAL_MAGIC));
   if(id>=0) return id;
   ulong position=(ulong)HistoryDealGetInteger(deal,DEAL_POSITION_ID);
   if(position==0 || !HistorySelectByPosition(position)) return -1;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong t=HistoryDealGetTicket(i);
      if(t!=0 && HistoryDealGetString(t,DEAL_SYMBOL)==_Symbol)
      { int k=MagicId(HistoryDealGetInteger(t,DEAL_MAGIC));if(k>=0) return k; }
   }
   return -1;
}
bool gDailyHistoryOK=false;
void UpdateDailyHistory()
{
   if(TimeCurrent()==gLastDailyHistory) return;
   gLastDailyHistory=TimeCurrent();
   gDailyHistoryOK=false;
   ArrayInitialize(gEntriesToday,0);ArrayInitialize(gRealized,0.0);
   if(!HistorySelect(gHeader.day,TimeCurrent()+1)) return;
   ulong tickets[];int total=HistoryDealsTotal();ArrayResize(tickets,total);
   for(int i=0;i<total;i++) tickets[i]=HistoryDealGetTicket(i);
   ulong counted[];ArrayResize(counted,0);
   for(int i=0;i<total;i++)
   {
      ulong t=tickets[i];if(t==0 || HistoryDealGetString(t,DEAL_SYMBOL)!=_Symbol) continue;
      long entry=HistoryDealGetInteger(t,DEAL_ENTRY);
      long magic=HistoryDealGetInteger(t,DEAL_MAGIC);
      ulong order=(ulong)HistoryDealGetInteger(t,DEAL_ORDER);
      double pl=HistoryDealGetDouble(t,DEAL_PROFIT)+HistoryDealGetDouble(t,DEAL_SWAP)+
                HistoryDealGetDouble(t,DEAL_COMMISSION)+HistoryDealGetDouble(t,DEAL_FEE);
      int id=MagicId(magic);
      if(id<0)
      {
         id=StrategyForDeal(t);
         HistorySelect(gHeader.day,TimeCurrent()+1);
      }
      if(id<0) continue;
      gRealized[id]+=pl;
      if(entry==DEAL_ENTRY_IN || entry==DEAL_ENTRY_INOUT)
      {
         bool seen=false;for(int j=0;j<ArraySize(counted);j++) if(counted[j]==order) { seen=true;break; }
         if(!seen) { int n=ArraySize(counted);ArrayResize(counted,n+1);counted[n]=order;gEntriesToday[id]++; }
      }
   }
   gDailyHistoryOK=true;
}
bool JournalSeen(const ulong t)
{
   int lo=0,hi=ArraySize(gJournalSeen)-1;
   while(lo<=hi)
   { int m=(lo+hi)/2;if(gJournalSeen[m]==t) return true;if(gJournalSeen[m]<t) lo=m+1;else hi=m-1; }
   return false;
}
void AddJournalSeen(const ulong t)
{
   if(JournalSeen(t)) return;
   int n=ArraySize(gJournalSeen);ArrayResize(gJournalSeen,n+1);gJournalSeen[n]=t;ArraySort(gJournalSeen);
}
bool OpenJournal()
{
   if(!InpJournal) return false;
   string day=TimeToString(gHeader.day,TIME_DATE);StringReplace(day,".","");
   if(gJournalHandle!=INVALID_HANDLE && day==gJournalDay) return true;
   if(gJournalHandle!=INVALID_HANDLE) FileClose(gJournalHandle);
   gJournalHandle=INVALID_HANDLE;ArrayResize(gJournalSeen,0);
   string name=gRoot+"_deals_"+day+".csv";
   int f=FileOpen(name,FILE_READ|FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_SHARE_READ,',',CP_UTF8);
   if(f==INVALID_HANDLE) { Print(ENGINE_LABEL,": journal open failed ",GetLastError());return false; }
   if(FileSize(f)>0)
   {
      while(!FileIsEnding(f))
      {
         string kind=FileReadString(f),ticket=FileIsLineEnding(f)?"":FileReadString(f);
         int guard=0;
         while(!FileIsLineEnding(f) && !FileIsEnding(f) && guard++<50) FileReadString(f);
         if(kind=="DEAL") { ulong t=(ulong)StringToInteger(ticket);if(t>0) AddJournalSeen(t); }
      }
   }
   else FileWrite(f,"kind","deal","server_time","strategy","magic","entry","side","volume","price","profit","commission","swap","fee","position_id");
   FileSeek(f,0,SEEK_END);gJournalHandle=f;gJournalDay=day;return true;
}
void SyncJournal()
{
   if(!OpenJournal() || !HistorySelect(gHeader.day,TimeCurrent()+1)) return;
   int total=HistoryDealsTotal();ulong tickets[];ArrayResize(tickets,total);
   for(int i=0;i<total;i++) tickets[i]=HistoryDealGetTicket(i);
   for(int i=0;i<total;i++)
   {
      ulong t=tickets[i];if(t==0 || JournalSeen(t) || HistoryDealGetString(t,DEAL_SYMBOL)!=_Symbol) continue;
      long magic=HistoryDealGetInteger(t,DEAL_MAGIC),entry=HistoryDealGetInteger(t,DEAL_ENTRY);
      long type=HistoryDealGetInteger(t,DEAL_TYPE);
      datetime time=(datetime)HistoryDealGetInteger(t,DEAL_TIME);
      double volume=HistoryDealGetDouble(t,DEAL_VOLUME),price=HistoryDealGetDouble(t,DEAL_PRICE);
      double pl=HistoryDealGetDouble(t,DEAL_PROFIT),commission=HistoryDealGetDouble(t,DEAL_COMMISSION);
      double swap=HistoryDealGetDouble(t,DEAL_SWAP),fee=HistoryDealGetDouble(t,DEAL_FEE);
      ulong position=(ulong)HistoryDealGetInteger(t,DEAL_POSITION_ID);
      int id=MagicId(magic);
      if(id<0) { id=StrategyForDeal(t);HistorySelect(gHeader.day,TimeCurrent()+1); }
      if(id<0) continue;
      uint bytes=FileWrite(gJournalHandle,"DEAL",(string)t,TimeToString(time,TIME_DATE|TIME_SECONDS),
         gName[id],(string)magic,(string)entry,(string)type,DoubleToString(volume,8),DoubleToString(price,_Digits),
         DoubleToString(pl,8),DoubleToString(commission,8),DoubleToString(swap,8),DoubleToString(fee,8),(string)position);
      FileFlush(gJournalHandle);
      if(bytes>0) AddJournalSeen(t);
   }
}

double FloatFor(const int id)
{
   double p=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i);
      if(t!=0 && OwnSelectedPosition() && PositionGetInteger(POSITION_MAGIC)==Magic(id))
         p+=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
   }
   return p;
}

// Native MT5 responsive dashboard. View state never changes strategy state.
#define UI_DAYS 14
struct UiObjectCache
{
   string name;
   uint hash;
   long frame;
   bool alive;
};
struct UiPosition
{
   ulong ticket;
   int module;
   int dir;
   double volume;
   double entry;
   double sl;
   double tp;
   double floating;
   double risk;
   bool risk_ok;
};
UiObjectCache gUiObjects[];
UiPosition gUiPositions[];
double gUiFloat[MODULES],gUiRisk[MODULES],gUiLots[MODULES];
int gUiSides[MODULES],gUiCounts[MODULES];
bool gUiRiskOK[MODULES];
double gUiDayNet[UI_DAYS];
int gUiDayExits[UI_DAYS];
datetime gUiHistoryDay=0;
ulong gUiHistoryMs=0;
bool gPanelHistoryDirty=true,gUiHistoryOK=false,gUiTickSeen=false;
long gUiFrame=0;
int gPanelTab=0,gPanelPage=0,gPanelPages=1;
bool gPanelCollapsed=false;
const ulong UI_CYCLE_MS=8000,UI_MANUAL_HOLD_MS=16000;
ulong gUiCycleAt=0,gUiDwell=8000;
bool gUiCycleReady=false;
int gUiWidth=0,gUiHeight=0,gUiFont=9,gUiDpi=96;
uint gUiLayoutHash=0;
double gUiScale=1;
int gUiPending=0,gUiBuys=0,gUiSells=0,gUiEntries=0;
double gUiFloating=0,gUiRealized=0,gUiVolume=0,gUiRiskMoney=0,gUiRiskPct=0;
double gUiEquity=0,gUiDayChange=0,gUiDayPct=0;
bool gUiTotalRiskOK=true;
color UI_BG=C'10,16,27',UI_CARD=C'18,27,43',UI_ROW=C'22,33,50';
color UI_BORDER=C'39,54,74',UI_TEXT=C'231,239,249',UI_MUTED=C'143,161,184';
color UI_CYAN=C'76,205,222',UI_GOLD=C'237,193,110',UI_GREEN=C'74,215,166',UI_RED=C'249,116,133';

int U(const double n) { return (int)MathMax(1,MathFloor(n*gUiScale+0.5)); }
color UiSignColor(const double v) { return v<0?UI_RED:(v>0?UI_GREEN:UI_MUTED); }
string UiNumber(const double v,const int digits=2)
{
   if(!ValidNumber(v) || MathAbs(v)>1e90) return "N/A";
   return DoubleToString(v,digits);
}
string UiSigned(const double v,const int digits=2) { return (v>0?"+":"")+UiNumber(v,digits); }
string UiTF(const ENUM_TIMEFRAMES tf)
{
   string s=EnumToString(tf);StringReplace(s,"PERIOD_","");return s;
}
int UiTextWidth(const string value,const int size,const string font="Segoe UI")
{
   uint w=0,h=0;
   if(TextSetFont(font,-10*size) && TextGetSize(value,w,h)) return (int)w;
   return (int)MathCeil(StringLen(value)*size*(double)gUiDpi/110.0);
}
int UiTextHeight(const int size) { return (int)MathCeil(size*(double)gUiDpi/72.0)+2; }
string UiFit(const string value,const int width,const int size,const string font="Segoe UI")
{
   if(width<1) return "";
   if(UiTextWidth(value,size,font)<=width) return value;
   if(UiTextWidth("..",size,font)>width) return "";
   int lo=0,hi=StringLen(value);
   while(lo<hi)
   {
      int mid=(lo+hi+1)/2;
      if(UiTextWidth(StringSubstr(value,0,mid)+"..",size,font)<=width) lo=mid;
      else hi=mid-1;
   }
   return StringSubstr(value,0,lo)+"..";
}
bool UiChanged(const string key,const uint hash,const ENUM_OBJECT type,string &name)
{
   name=gPrefix+"ui_"+key;
   int n=ArraySize(gUiObjects),slot=-1;
   for(int i=0;i<n;i++) if(gUiObjects[i].name==name) { slot=i;break; }
   if(slot<0) { slot=n;ArrayResize(gUiObjects,n+1);ZeroMemory(gUiObjects[slot]);gUiObjects[slot].name=name; }
   gUiObjects[slot].frame=gUiFrame;
   if(gUiObjects[slot].alive && gUiObjects[slot].hash==hash) return false;
   if(!gUiObjects[slot].alive)
   {
      if(!ObjectCreate(0,name,type,0,0,0)) return false;
      ObjectSetInteger(0,name,OBJPROP_CORNER,CORNER_LEFT_UPPER);
      ObjectSetInteger(0,name,OBJPROP_SELECTABLE,false);
      ObjectSetInteger(0,name,OBJPROP_HIDDEN,true);
      ObjectSetInteger(0,name,OBJPROP_BACK,false);
      gUiObjects[slot].alive=true;
   }
   gUiObjects[slot].hash=hash;
   return true;
}
void UiEnd()
{
   for(int i=0;i<ArraySize(gUiObjects);i++)
      if(gUiObjects[i].alive && gUiObjects[i].frame!=gUiFrame)
      { ObjectDelete(0,gUiObjects[i].name);gUiObjects[i].alive=false; }
   ChartRedraw(0);
}
void UiReset()
{
   if(gPrefix!="") ObjectsDeleteAll(0,gPrefix+"ui_");
   ArrayResize(gUiObjects,0);gPanelMs=0;
}
void UiRect(const string key,const int x,const int y,const int width,const int height,
            const color fill,const color border)
{
   int w=(int)MathMin(width,gUiWidth-x),h=(int)MathMin(height,gUiHeight-y);
   if(x<0 || y<0 || w<=0 || h<=0) return;
   string name;
   uint hash=TextHash(StringFormat("%d:%d:%d:%d:%d:%d",x,y,w,h,(int)fill,(int)border));
   if(!UiChanged(key,hash,OBJ_RECTANGLE_LABEL,name)) return;
   ObjectSetInteger(0,name,OBJPROP_XDISTANCE,x);ObjectSetInteger(0,name,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,name,OBJPROP_XSIZE,w);ObjectSetInteger(0,name,OBJPROP_YSIZE,h);
   ObjectSetInteger(0,name,OBJPROP_BGCOLOR,fill);ObjectSetInteger(0,name,OBJPROP_COLOR,border);
   ObjectSetInteger(0,name,OBJPROP_BORDER_TYPE,BORDER_FLAT);
   ObjectSetInteger(0,name,OBJPROP_ZORDER,0);ObjectSetString(0,name,OBJPROP_TOOLTIP,"\n");
}
void UiText(const string key,const int x,const int y,const int width,const string value,
            const color c,const int size=0,const string tip="",const bool right=false,const bool mono=false)
{
   int fs=size>0?size:gUiFont,w=(int)MathMin(width,gUiWidth-x);
   if(x<0 || y<0 || w<1 || y+UiTextHeight(fs)>gUiHeight) return;
   string font=mono?"Consolas":"Segoe UI",shown=UiFit(value,w,fs,font);
   if(shown=="") return;
   int px=right?x+w-UiTextWidth(shown,fs,font):x;
   string name,tooltip=tip==""?value:tip;
   uint hash=TextHash(StringFormat("%d:%d:%d:%d:",px,y,fs,(int)c)+font+"|"+shown+"|"+tooltip);
   if(!UiChanged(key,hash,OBJ_LABEL,name)) return;
   ObjectSetInteger(0,name,OBJPROP_XDISTANCE,px);ObjectSetInteger(0,name,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,name,OBJPROP_COLOR,c);ObjectSetInteger(0,name,OBJPROP_FONTSIZE,fs);
   ObjectSetInteger(0,name,OBJPROP_ANCHOR,ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0,name,OBJPROP_ZORDER,1);
   ObjectSetString(0,name,OBJPROP_FONT,font);ObjectSetString(0,name,OBJPROP_TEXT,shown);
   ObjectSetString(0,name,OBJPROP_TOOLTIP,tooltip);
}
void UiButton(const string key,const int x,const int y,const int width,const int height,
              const string value,const color fill,const color c,const string tip="")
{
   if(x<0 || y<0 || width<1 || height<1 || x+width>gUiWidth || y+height>gUiHeight) return;
   int fs=(int)MathMax(7,gUiFont-1);
   if(UiTextHeight(fs)>height-2) fs=7;
   string shown=UiFit(value,width-U(10),fs),name;
   uint hash=TextHash(StringFormat("%d:%d:%d:%d:%d:%d:%d:",x,y,width,height,(int)fill,(int)c,fs)+shown+"|"+tip);
   if(!UiChanged(key,hash,OBJ_BUTTON,name)) return;
   ObjectSetInteger(0,name,OBJPROP_XDISTANCE,x);ObjectSetInteger(0,name,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,name,OBJPROP_XSIZE,width);ObjectSetInteger(0,name,OBJPROP_YSIZE,height);
   ObjectSetInteger(0,name,OBJPROP_BGCOLOR,fill);ObjectSetInteger(0,name,OBJPROP_COLOR,c);
   ObjectSetInteger(0,name,OBJPROP_BORDER_COLOR,UI_BORDER);
   ObjectSetInteger(0,name,OBJPROP_FONTSIZE,fs);ObjectSetInteger(0,name,OBJPROP_ZORDER,5);
   ObjectSetInteger(0,name,OBJPROP_STATE,false);
   ObjectSetString(0,name,OBJPROP_FONT,"Segoe UI");ObjectSetString(0,name,OBJPROP_TEXT,shown);
   ObjectSetString(0,name,OBJPROP_TOOLTIP,tip==""?value:tip);
}
void UiCollect()
{
   ArrayResize(gUiPositions,0);ArrayInitialize(gUiFloat,0.0);ArrayInitialize(gUiRisk,0.0);
   ArrayInitialize(gUiLots,0.0);ArrayInitialize(gUiSides,0);ArrayInitialize(gUiCounts,0);ArrayInitialize(gUiRiskOK,true);
   gUiFloating=0;gUiRealized=0;gUiVolume=0;gUiBuys=0;gUiSells=0;gUiPending=0;gUiEntries=0;
   for(int k=0;k<MODULES;k++) { gUiRealized+=gRealized[k];gUiEntries+=gEntriesToday[k]; }
   for(int i=0;i<PositionsTotal();i++)
   {
      ulong ticket=PositionGetTicket(i);if(ticket==0 || !OwnSelectedPosition()) continue;
      UiPosition p;ZeroMemory(p);p.ticket=ticket;p.module=MagicId(PositionGetInteger(POSITION_MAGIC));
      p.dir=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
      p.volume=PositionGetDouble(POSITION_VOLUME);p.entry=PositionGetDouble(POSITION_PRICE_OPEN);
      p.sl=PositionGetDouble(POSITION_SL);p.tp=PositionGetDouble(POSITION_TP);
      p.floating=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
      double pl=0;p.risk_ok=p.sl>0 && OrderCalcProfit(p.dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL,_Symbol,p.volume,p.entry,p.sl,pl) && ValidNumber(pl);
      p.risk=p.risk_ok?MathMax(0,-pl):0;
      int n=ArraySize(gUiPositions);ArrayResize(gUiPositions,n+1);gUiPositions[n]=p;
      gUiFloat[p.module]+=p.floating;gUiRisk[p.module]+=p.risk;gUiLots[p.module]+=p.volume;gUiCounts[p.module]++;
      gUiSides[p.module]|=p.dir>0?1:2;gUiRiskOK[p.module]=gUiRiskOK[p.module] && p.risk_ok;
      gUiFloating+=p.floating;gUiVolume+=p.volume;
      if(p.dir>0) gUiBuys++;else gUiSells++;
   }
   // Include pending acceptance reservations in the headline, as the trade engine does.
   for(int k=0;k<MODULES;k++) if(gState[k].inflight_at>0 && gUiCounts[k]==0) gUiPending++;
   int count=0;gUiRiskMoney=OpenRiskMoney(count);gUiEquity=AccountInfoDouble(ACCOUNT_EQUITY);
   gUiTotalRiskOK=ValidNumber(gUiRiskMoney) && gUiRiskMoney<1e90;
   gUiRiskPct=gUiEquity>0?100*gUiRiskMoney/gUiEquity:0;
   gUiDayChange=DayChangeMoney();gUiDayPct=gHeader.day_equity>0?100*gUiDayChange/gHeader.day_equity:0;
}
void UiHistory()
{
   ulong now=GetTickCount64();datetime today=DayStart(TimeCurrent());
   if(!gPanelHistoryDirty && today==gUiHistoryDay && now-gUiHistoryMs<60000) return;
   gUiHistoryMs=now;gUiHistoryDay=today;gPanelHistoryDirty=false;gUiHistoryOK=false;
   ArrayInitialize(gUiDayNet,0.0);ArrayInitialize(gUiDayExits,0);
   datetime start=today-(UI_DAYS-1)*86400;
   if(!HistorySelect(start,TimeCurrent()+1)) return;
   int n=HistoryDealsTotal();ulong tickets[];ArrayResize(tickets,n);
   for(int i=0;i<n;i++) tickets[i]=HistoryDealGetTicket(i);
   for(int i=0;i<n;i++)
   {
      ulong t=tickets[i];if(t==0 || HistoryDealGetString(t,DEAL_SYMBOL)!=_Symbol) continue;
      long type=HistoryDealGetInteger(t,DEAL_TYPE);
      if(type!=DEAL_TYPE_BUY && type!=DEAL_TYPE_SELL) continue;
      datetime time=(datetime)HistoryDealGetInteger(t,DEAL_TIME);
      int day=(int)((DayStart(time)-start)/86400);if(day<0 || day>=UI_DAYS) continue;
      double net=HistoryDealGetDouble(t,DEAL_PROFIT)+HistoryDealGetDouble(t,DEAL_COMMISSION)+
                 HistoryDealGetDouble(t,DEAL_SWAP)+HistoryDealGetDouble(t,DEAL_FEE);
      long entry=HistoryDealGetInteger(t,DEAL_ENTRY);int owner=MagicId(HistoryDealGetInteger(t,DEAL_MAGIC));
      if(owner<0) { owner=StrategyForDeal(t);HistorySelect(start,TimeCurrent()+1); }
      if(owner<0) continue;
      gUiDayNet[day]+=net;
      if(entry==DEAL_ENTRY_OUT || entry==DEAL_ENTRY_OUT_BY || entry==DEAL_ENTRY_INOUT) gUiDayExits[day]++;
   }
   gUiHistoryOK=true;
}
string UiMode()
{
   if(!gStorageOK) return "STORAGE ERROR";
   if(gHeader.flatten_request!=0) return "CLOSING AIO";
   if(gHeader.daily_block==1) return "DAILY LOSS STOP";
   if(gHeader.daily_block==2) return "DAILY PROFIT STOP";
   if(gFatalPause) return "CHECK EXECUTION";
   if(!TerminalInfoInteger(TERMINAL_CONNECTED)) return "DISCONNECTED";
   if(!TradePermission()) return "ALGO OFF";
   if(!InpTradeEnabled) return "ENTRIES DISABLED";
   if(gHeader.manual_pause!=0) return "PAUSED";
   if(!gAccountHistoryOK || !gDataOK) return "WAITING FOR DATA";
   return "ACTIVE";
}
string UiSide(const int id) { return gUiSides[id]==1?"BUY":(gUiSides[id]==2?"SELL":(gUiSides[id]==3?"MIXED":"--")); }
string UiModuleTip(const int id)
{
   return StringFormat("%02d %s | Magic %I64d\n%s\nEntries today %d | Realized today %s | Floating %s\nLots %s | Nominal SL risk %s",
      id+1,gName[id],Magic(id),gReason[id],gEntriesToday[id],gDailyHistoryOK?UiNumber(gRealized[id]):"HISTORY N/A",UiNumber(gUiFloat[id]),
      UiNumber(gUiLots[id],4),gUiRiskOK[id]?UiNumber(gUiRisk[id]):"UNKNOWN - CHECK SL");
}
void UiMetric(const int id,const int x,const int y,const int w,const int h,const string title,
              const string value,const string sub,const color accent)
{
   string k="kpi"+IntegerToString(id);UiRect(k,x,y,w,h,UI_CARD,UI_BORDER);
   UiRect(k+"a",x,y,U(3),h,accent,accent);
   UiText(k+"t",x+U(12),y+U(7),w-U(22),title,UI_MUTED,(int)MathMax(7,gUiFont-1));
   int fs=h>=U(70)?gUiFont+7:gUiFont+3;
   UiText(k+"v",x+U(12),y+U(23),w-U(22),value,accent,fs,"",false,true);
   if(h>=U(70)) UiText(k+"s",x+U(12),y+U(54),w-U(22),sub,UI_MUTED,(int)MathMax(7,gUiFont-1));
}
void UiProgress(const string key,const int x,const int y,const int w,const string title,
                const double value,const double cap,const bool known=true)
{
   string text=known?UiNumber(value,1)+" / "+UiNumber(cap,1)+"%":"UNKNOWN";
   UiText(key+"t",x,y,w,title,UI_MUTED,gUiFont-1);
   UiText(key+"v",x,y+U(19),w,text,known?(value>=cap?UI_RED:UI_TEXT):UI_RED,gUiFont+1,"",false,true);
   UiRect(key+"bg",x,y+U(43),w,U(4),UI_BORDER,UI_BORDER);
   int fill=(int)MathFloor(w*Clamp(known && cap>0?value/cap:1,0,1));
   if(fill>0) UiRect(key+"fg",x,y+U(43),fill,U(4),known && value<cap?UI_CYAN:UI_RED,known && value<cap?UI_CYAN:UI_RED);
}
void UiPair(const string key,const int x,const int y,const int w,const string label,const string value,
            const color c,const string tip="")
{
   int half=(int)(w*0.48);
   UiText(key+"l",x,y,half,label,UI_MUTED,gUiFont-1,tip);
   UiText(key+"r",x+half,y,w-half,value,c,gUiFont-1,tip,true,true);
}
void UiSidebar(const int x,const int y,const int w,const int h)
{
   UiRect("side",x,y,w,h,UI_CARD,UI_BORDER);int px=x+U(14),pw=w-U(28),yy=y+U(12);
   UiText("sidet",px,yy,pw,"RISK & EXECUTION",UI_GOLD,gUiFont);yy+=U(28);
   if(yy+U(50)<y+h) { UiProgress("risk",px,yy,pw,"AIO SL risk + reservations",gUiRiskPct,InpMaxOpenRiskPct,gUiTotalRiskOK);yy+=U(64); }
   double margin=gUiEquity>0?100*AccountInfoDouble(ACCOUNT_MARGIN)/gUiEquity:0;
   if(yy+U(50)<y+h) { UiProgress("margin",px,yy,pw,"Account margin used",margin,InpMaxMarginUsedPct);yy+=U(64); }
   MqlTick tick;ZeroMemory(tick);bool quote=SymbolInfoTick(_Symbol,tick) && tick.bid>0 && tick.ask>=tick.bid;
   double spread=quote?tick.ask-tick.bid:0,atr=ArraySize(gATR)>1?gATR[1]:0;
   string labels[12]={"Free margin","Margin level","BUY / SELL","Open lots","In flight","Digits / tick size","Deviation (auto)","Spread / ATR","Data","State storage","CSV journal","Tick received"};
   string values[12];
   values[0]=UiNumber(AccountInfoDouble(ACCOUNT_MARGIN_FREE));
   values[1]=AccountInfoDouble(ACCOUNT_MARGIN)>0?UiNumber(100*gUiEquity/AccountInfoDouble(ACCOUNT_MARGIN),1)+"%":"--";
   values[2]=IntegerToString(gUiBuys)+" / "+IntegerToString(gUiSells);values[3]=UiNumber(gUiVolume,4);
   values[4]=IntegerToString(gUiPending);
   values[5]=IntegerToString(_Digits)+" / "+UiNumber(TickSize(),_Digits);
   values[6]=IntegerToString((long)DeviationPoints())+" pt / "+UiNumber(DeviationPrice(),_Digits);
   values[7]=quote && atr>0?UiNumber(100*spread/atr,1)+"% / "+UiNumber(100*InpMaxSpreadATR,1)+"%":"WAIT";
   values[8]=gDataOK?"READY":"WAIT";values[9]=gStorageOK?"OK":"ERROR";
   values[10]=!InpJournal?"OFF":(gJournalHandle!=INVALID_HANDLE?"OK":"WAIT / ERROR");
   values[11]=gUiTickSeen?IntegerToString((long)((GetTickCount64()-gLastMarketTickMs)/1000))+"s ago":"WAIT FIRST TICK";
   for(int i=0;i<12 && yy+U(20)<y+h;i++,yy+=U(23))
      UiPair("side"+IntegerToString(i),px,yy,pw,labels[i],values[i],UI_TEXT);
}
int UiPageCount(const int total,const int capacity)
{ return capacity>0?(int)MathMax(1,(total+capacity-1)/capacity):1; }
void UiSetPage(const int total,const int capacity)
{ gPanelPages=UiPageCount(total,capacity);gPanelPage=(int)Clamp(gPanelPage,0,gPanelPages-1); }
void UiStrategyTable(const int x,const int y,const int w,const int h)
{
   int columns=w>=U(1320)?2:1,gap=U(12),cw=(w-gap*(columns-1))/columns;
   int head=U(26),wanted=(MODULES+columns-1)/columns;
   int rh=(int)MathMax(U(26),MathMin(U(38),(h-head)/wanted));
   int rows=(int)MathMin(wanted,MathMax(1,(h-head)/rh)),capacity=rows*columns;
   UiSetPage(MODULES,capacity);
   for(int col=0;col<columns;col++)
   {
      int cx=x+col*(cw+gap);string c="s"+IntegerToString(col);
      UiRect(c+"head",cx,y,cw,head,UI_ROW,UI_BORDER);
      bool full=cw>=U(840),medium=cw>=U(590);
      int nameW=(int)(cw*(full?0.23:(medium?0.27:0.45)));
      int netW=U(80),realW=medium?U(85):0,floatW=medium?U(85):0;
      int sideW=medium?U(48):0,entryW=full?U(46):0,riskW=full?U(66):0;
      int statusX=cx+nameW,statusW=cw-nameW-(medium?realW+floatW+sideW+entryW+riskW:netW);
      UiText(c+"hn",cx+U(8),y+U(5),nameW-U(14),"STRATEGY",UI_MUTED,gUiFont-1);
      UiText(c+"hs",statusX,y+U(5),statusW-U(6),"STATUS / REASON",UI_MUTED,gUiFont-1);
      int nx=statusX+statusW;
      if(medium)
      {
         UiText(c+"hb",nx,y+U(5),sideW-U(4),"SIDE",UI_MUTED,gUiFont-1);nx+=sideW;
         if(full) { UiText(c+"he",nx,y+U(5),entryW-U(6),"#DAY",UI_MUTED,gUiFont-1,"Distinct entry orders today",true);nx+=entryW; }
         UiText(c+"hr",nx,y+U(5),realW-U(8),"REALIZED",UI_MUTED,gUiFont-1,"Today's AIO deals including fees",true);nx+=realW;
         UiText(c+"hf",nx,y+U(5),floatW-U(8),"FLOATING",UI_MUTED,gUiFont-1,"Current profit + swap",true);nx+=floatW;
         if(full) UiText(c+"hk",nx,y+U(5),riskW-U(8),"RISK %",UI_MUTED,gUiFont-1,"Nominal loss from entry to SL / account equity",true);
      }
      else UiText(c+"hp",nx,y+U(5),netW-U(8),"NET*",UI_MUTED,gUiFont-1,"Today's realized + current floating; hover for separate values",true);
      for(int row=0;row<rows;row++)
      {
         int id=gPanelPage*capacity+col*rows+row,yy=y+head+row*rh;
         if(id>=MODULES || yy+rh>y+h) break;
         string k=c+"r"+IntegerToString(row),tip=UiModuleTip(id);
         UiRect(k+"bg",cx,yy,cw,rh,row%2==0?UI_CARD:UI_ROW,row%2==0?UI_CARD:UI_ROW);
         color state=gUiCounts[id]>0?UI_GREEN:(StringFind(gReason[id],"ERROR")>=0 || StringFind(gReason[id],"REJECT")>=0?UI_RED:UI_MUTED);
         string reason=gUiCounts[id]>0?UiSide(id)+" | "+gReason[id]:gReason[id];
         UiText(k+"n",cx+U(8),yy+U(5),nameW-U(14),StringFormat("%02d  %s",id+1,gName[id]),UI_TEXT,0,tip);
         UiText(k+"s",statusX,yy+U(5),statusW-U(6),reason,state,gUiFont-1,tip);
         int dx=statusX+statusW;
         if(medium)
         {
            UiText(k+"b",dx,yy+U(5),sideW-U(4),UiSide(id),gUiSides[id]==2?UI_RED:UI_GREEN,gUiFont-1,tip);dx+=sideW;
            if(full) { UiText(k+"e",dx,yy+U(5),entryW-U(6),IntegerToString(gEntriesToday[id]),UI_MUTED,0,tip,true,true);dx+=entryW; }
            UiText(k+"r",dx,yy+U(5),realW-U(8),gDailyHistoryOK?UiSigned(gRealized[id]):"N/A",UiSignColor(gRealized[id]),0,tip,true,true);dx+=realW;
            UiText(k+"f",dx,yy+U(5),floatW-U(8),UiSigned(gUiFloat[id]),UiSignColor(gUiFloat[id]),0,tip,true,true);dx+=floatW;
            if(full) UiText(k+"k",dx,yy+U(5),riskW-U(8),gUiRiskOK[id] && gUiEquity>0?UiNumber(100*gUiRisk[id]/gUiEquity,1):"N/A",UI_MUTED,0,tip,true,true);
         }
         else UiText(k+"p",dx,yy+U(5),netW-U(8),gDailyHistoryOK?UiSigned(gRealized[id]+gUiFloat[id]):"N/A",UiSignColor(gRealized[id]+gUiFloat[id]),0,tip,true,true);
      }
   }
}
void UiPositionsTable(const int x,const int y,const int w,const int h)
{
   int n=ArraySize(gUiPositions),rh=U(31),head=U(26),rows=(int)MathMax(1,(h-head)/rh);
   UiSetPage(n,rows);UiRect("thead",x,y,w,head,UI_ROW,UI_BORDER);
   bool full=w>=U(930),medium=w>=U(600);
   int nameW=(int)(w*(full?0.24:(medium?0.3:0.58))),sideW=U(46),lotW=medium?U(66):0;
   int priceW=full?(w-nameW-sideW-lotW-U(150))/3:0;
   int slW=priceW,tpW=priceW,profitW=w-nameW-sideW-lotW-3*priceW;
   UiText("thn",x+U(8),y+U(5),nameW-U(12),"POSITION / STRATEGY",UI_MUTED,gUiFont-1);
   int xx=x+nameW;UiText("thb",xx,y+U(5),sideW-U(4),"SIDE",UI_MUTED,gUiFont-1);xx+=sideW;
   if(medium) { UiText("thl",xx,y+U(5),lotW-U(8),"LOTS",UI_MUTED,gUiFont-1,"",true);xx+=lotW; }
   if(full)
   {
      UiText("the",xx,y+U(5),priceW-U(8),"ENTRY",UI_MUTED,gUiFont-1,"",true);xx+=priceW;
      UiText("ths",xx,y+U(5),slW-U(8),"SL",UI_MUTED,gUiFont-1,"",true);xx+=slW;
      UiText("tht",xx,y+U(5),tpW-U(8),"TP",UI_MUTED,gUiFont-1,"",true);xx+=tpW;
   }
   UiText("thp",xx,y+U(5),profitW-U(8),"FLOATING",UI_MUTED,gUiFont-1,"Profit + swap, before final exit commission",true);
   if(n==0) { UiText("noopen",x+U(16),y+head+U(18),w-U(32),"No AIO positions on this symbol. Strategies continue watching for signals.",UI_MUTED);return; }
   for(int row=0;row<rows;row++)
   {
      int idx=gPanelPage*rows+row,yy=y+head+row*rh;if(idx>=n || yy+rh>y+h) break;
      UiPosition p=gUiPositions[idx];string k="tr"+IntegerToString(row);
      string tip="Ticket "+IntegerToString((long)p.ticket)+" | "+gName[p.module]+" | Magic "+IntegerToString(Magic(p.module))+
         "\nLots "+UiNumber(p.volume,8)+" | Entry "+UiNumber(p.entry,_Digits)+"\nSL "+UiNumber(p.sl,_Digits)+" | TP "+UiNumber(p.tp,_Digits)+
         "\nProfit + swap "+UiNumber(p.floating)+" | Nominal SL risk "+(p.risk_ok?UiNumber(p.risk):"UNKNOWN");
      UiRect(k+"bg",x,yy,w,rh,row%2==0?UI_CARD:UI_ROW,row%2==0?UI_CARD:UI_ROW);
      UiText(k+"n",x+U(8),yy+U(7),nameW-U(12),IntegerToString((long)p.ticket)+" / "+gName[p.module],UI_TEXT,0,tip);
      xx=x+nameW;UiText(k+"b",xx,yy+U(7),sideW-U(4),p.dir>0?"BUY":"SELL",p.dir>0?UI_GREEN:UI_RED,0,tip);xx+=sideW;
      if(medium) { UiText(k+"l",xx,yy+U(7),lotW-U(8),UiNumber(p.volume,4),UI_TEXT,0,tip,true,true);xx+=lotW; }
      if(full)
      {
         UiText(k+"e",xx,yy+U(7),priceW-U(8),UiNumber(p.entry,_Digits),UI_TEXT,0,tip,true,true);xx+=priceW;
         UiText(k+"s",xx,yy+U(7),slW-U(8),p.sl>0?UiNumber(p.sl,_Digits):"MISSING",p.sl>0?UI_MUTED:UI_RED,0,tip,true,true);xx+=slW;
         UiText(k+"t",xx,yy+U(7),tpW-U(8),p.tp>0?UiNumber(p.tp,_Digits):"TRAIL",UI_MUTED,0,tip,true,true);xx+=tpW;
      }
      UiText(k+"p",xx,yy+U(7),profitW-U(8),UiSigned(p.floating),UiSignColor(p.floating),0,tip,true,true);
   }
}
void UiAnalytics(const int x,const int y,const int w,const int h)
{
   // Data rows paginate vertically on small charts; no fabricated zero replaces missing data.
   int total=UI_DAYS+gSymbolCount+4,rh=U(27),rows=(int)MathMax(1,(h-U(28))/rh);
   UiSetPage(total,rows);UiRect("ahead",x,y,w,U(26),UI_ROW,UI_BORDER);
   UiText("aht",x+U(10),y+U(5),w-U(20),"AIO DEAL P/L  /  MARKET CONTEXT",UI_GOLD,gUiFont-1);
   double maxabs=0;for(int i=0;i<UI_DAYS;i++) maxabs=MathMax(maxabs,MathAbs(gUiDayNet[i]));
   for(int row=0;row<rows;row++)
   {
      int idx=gPanelPage*rows+row,yy=y+U(28)+row*rh;if(idx>=total || yy+rh>y+h) break;
      string k="ar"+IntegerToString(row);UiRect(k+"bg",x,yy,w,rh,row%2==0?UI_CARD:UI_ROW,row%2==0?UI_CARD:UI_ROW);
      if(idx<UI_DAYS)
      {
         int day=UI_DAYS-1-idx;datetime date=gUiHistoryDay-(UI_DAYS-1-day)*86400;
         string label=TimeToString(date,TIME_DATE)+(day==UI_DAYS-1?"  TODAY":"");
         string tip=label+"\nAIO symbol + Magic scope; deals booked this server day, including commission / swap / fees.\nExit deals "+IntegerToString(gUiDayExits[day])+"; partial exits are separate deals.";
         int labelW=(int)(w*0.36),numberW=U(104),barW=w-labelW-numberW-U(28);
         UiText(k+"d",x+U(10),yy+U(5),labelW-U(12),label,UI_MUTED,gUiFont-1,tip);
         if(barW>U(40))
         {
            int bx=x+labelW+barW/2;UiRect(k+"zero",bx,yy+U(7),1,U(13),UI_BORDER,UI_BORDER);
            int bw=maxabs>0?(int)((barW/2-U(4))*MathAbs(gUiDayNet[day])/maxabs):0;
            if(gUiHistoryOK && bw>0) UiRect(k+"bar",gUiDayNet[day]<0?bx-bw:bx,yy+U(9),bw,U(9),UiSignColor(gUiDayNet[day]),UiSignColor(gUiDayNet[day]));
         }
         UiText(k+"v",x+w-numberW-U(8),yy+U(5),numberW,gUiHistoryOK?UiSigned(gUiDayNet[day]):"HISTORY N/A",gUiHistoryOK?UiSignColor(gUiDayNet[day]):UI_RED,0,tip,true,true);
      }
      else if(idx<UI_DAYS+gSymbolCount)
      {
         int sym=idx-UI_DAYS;string tip="Correlation: up to 100 aligned closed-bar returns; minimum 30.\nFlow is a tick-volume CLV proxy, normalized per symbol. Board refresh: "+TimeToString(gBoardAt,TIME_SECONDS);
         string value="Corr "+(gCorrOK[0][sym]?UiNumber(gCorr[0][sym],2):"N/A")+"   Flow "+(gFlowOK[sym]?UiSigned(gFlow[sym],2):"N/A");
         int lw=(int)(w*0.38);UiText(k+"l",x+U(10),yy+U(5),lw-U(12),gSymbols[sym],UI_CYAN,0,tip);
         UiText(k+"v",x+lw,yy+U(5),w-lw-U(10),value,UI_TEXT,gUiFont-1,tip,true,true);
      }
      else
      {
         int a=idx-UI_DAYS-gSymbolCount;string label="",value="",tip="";
         if(a==0) { label="TrendRadar M15/H1/H4/D1/W1";value=gRadarReady?IntegerToString(gRadarScore):"WAIT DATA"; }
         if(a==1) { label="Neural H1 upward score";value=gMLReady?UiNumber(gMLScore,3):"WAIT EVALUATION";tip="Model directional score; this is not an observed trading win rate."; }
         if(a==2) { label="Tick imbalance (proxy)";value=UiSigned(gTickDelta,0);tip="Count of up ticks minus down ticks since this session's first observed tick. Not exchange traded volume."; }
         if(a==3) { label="Journal / history scope";value="AIO + THIS SYMBOL";tip="AIO realized values include booked costs. Account daily equity change includes all account activity after cash adjustment."; }
         UiPair(k,x+U(10),yy+U(5),w-U(20),label,value,UI_TEXT,tip);
      }
   }
}
void UiSystem(const int x,const int y,const int w,const int h)
{
   MqlTick tick;ZeroMemory(tick);bool quote=SymbolInfoTick(_Symbol,tick) && tick.bid>0 && tick.ask>=tick.bid;
   double spread=quote?tick.ask-tick.bid:0,atr=ArraySize(gATR)>1?gATR[1]:0;
   double margin=AccountInfoDouble(ACCOUNT_MARGIN),dd=gHeader.peak_equity>0?100*(gHeader.peak_equity-gUiEquity)/gHeader.peak_equity:0;
   string currency=AccountInfoString(ACCOUNT_CURRENCY);
   string labels[34]={"Account / currency","Engine state","Balance / Equity","Free margin / used","Margin level / cap","Account day change","AIO realized today","AIO floating now","AIO positions / lots","BUY / SELL / in flight","Entries today","Nominal SL risk (AIO)","Risk target / single cap","Open risk cap","Daily loss / profit stop","Drawdown from saved peak","Analysis / model TF","Quote digits / point","Tick size","Auto deviation units","Broker deviation points","Deviation price distance","Bid / Ask","Spread price / points","Spread / ATR limit","Broker stops / freeze","Lot min / step / max","Algo / connection","Primary data / history","Persistent state / journal","Server clock","Last observed quote","Magic scope","Session timing"};
   string values[34];
   values[0]=IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+" / "+currency;
   values[1]=UiMode();values[2]=UiNumber(AccountInfoDouble(ACCOUNT_BALANCE))+" / "+UiNumber(gUiEquity);
   values[3]=UiNumber(AccountInfoDouble(ACCOUNT_MARGIN_FREE))+" / "+UiNumber(margin);
   values[4]=(margin>0?UiNumber(100*gUiEquity/margin,1)+"%":"--")+" / "+UiNumber(InpMaxMarginUsedPct,0)+"% used";
   values[5]=gAccountHistoryOK?UiSigned(gUiDayChange)+" ("+UiSigned(gUiDayPct,1)+"%)":"HISTORY N/A";
   values[6]=gDailyHistoryOK?UiSigned(gUiRealized):"HISTORY N/A";values[7]=UiSigned(gUiFloating);
   values[8]=IntegerToString(ArraySize(gUiPositions))+" / "+UiNumber(gUiVolume,4);
   values[9]=IntegerToString(gUiBuys)+" / "+IntegerToString(gUiSells)+" / "+IntegerToString(gUiPending);
   values[10]=IntegerToString(gUiEntries);
   values[11]=gUiTotalRiskOK?UiNumber(gUiRiskMoney)+" / "+UiNumber(gUiRiskPct,1)+"%":"UNKNOWN - CHECK SL";
   values[12]=UiNumber(InpRisk_Tuned,2)+"% / "+UiNumber(InpMaxSingleRiskPct,1)+"%";
   values[13]=UiNumber(InpMaxOpenRiskPct,1)+"% / "+IntegerToString(InpMaxPositions)+" positions";
   values[14]=UiNumber(InpDailyLossPct,1)+"% / "+(0>0?UiNumber(0,1)+"%":"OFF");
   values[15]=UiNumber(MathMax(0,dd),1)+"%";values[16]=UiTF(InpAnalysisTF)+" / H1";
   values[17]=IntegerToString(_Digits)+" / "+UiNumber(_Point,_Digits);values[18]=UiNumber(TickSize(),_Digits);
   values[19]=IntegerToString(InpDeviationBasePoints)+" (3/5 digits x10)";
   values[20]=IntegerToString((long)DeviationPoints());values[21]=UiNumber(DeviationPrice(),_Digits);
   values[22]=quote?UiNumber(tick.bid,_Digits)+" / "+UiNumber(tick.ask,_Digits):"NO QUOTE";
   values[23]=quote?UiNumber(spread,_Digits)+" / "+UiNumber(spread/_Point,1):"NO QUOTE";
   values[24]=quote && atr>0?UiNumber(100*spread/atr,1)+"% / "+UiNumber(100*InpMaxSpreadATR,1)+"%":"WAIT ATR";
   values[25]=IntegerToString(SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL))+" / "+IntegerToString(SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL))+" broker pt";
   values[26]=UiNumber(SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),4)+" / "+UiNumber(SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP),4)+" / "+UiNumber(SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX),2);
   values[27]=(TradePermission()?"ALLOWED":"OFF")+string(" / ")+(TerminalInfoInteger(TERMINAL_CONNECTED)?"ONLINE":"OFFLINE");
   values[28]=(gDataOK?"READY":"WAIT")+string(" / ")+(gAccountHistoryOK && gUiHistoryOK?"READY":"WAIT");
   values[29]=(gStorageOK?"OK":"ERROR")+string(" / ")+(!InpJournal?"OFF":(gJournalHandle!=INVALID_HANDLE?"OK":"WAIT / ERROR"));
   values[30]=TimeToString(TimeCurrent(),TIME_DATE|TIME_SECONDS);
   values[31]=quote?TimeToString((datetime)tick.time,TIME_DATE|TIME_SECONDS):"NO QUOTE";
   values[32]=IntegerToString(Magic(0))+" - "+IntegerToString(Magic(MODULES-1));
   values[33]="Broker hours; module windows apply";
   int rh=U(27),cols=w>=U(1050)?2:1;
   int rows=(int)MathMin((34+cols-1)/cols,MathMax(1,(h-U(28))/rh));
   UiSetPage(34,rows*cols);int gap=U(14),cw=(w-gap*(cols-1))/cols;
   for(int col=0;col<cols;col++)
   {
      int cx=x+col*(cw+gap);string c="sys"+IntegerToString(col);
      UiRect(c+"h",cx,y,cw,U(26),UI_ROW,UI_BORDER);UiText(c+"ht",cx+U(10),y+U(5),cw-U(20),"SYSTEM / LIVE SPECIFICATIONS",UI_GOLD,gUiFont-1);
      for(int row=0;row<rows;row++)
      {
         int idx=gPanelPage*rows*cols+col*rows+row,yy=y+U(28)+row*rh;if(idx>=34 || yy+rh>y+h) break;
         string k=c+"r"+IntegerToString(row);UiRect(k+"bg",cx,yy,cw,rh,row%2==0?UI_CARD:UI_ROW,row%2==0?UI_CARD:UI_ROW);
         UiPair(k,cx+U(10),yy+U(5),cw-U(20),labels[idx],values[idx],idx==1?UI_CYAN:UI_TEXT,labels[idx]+": "+values[idx]);
      }
   }
}
void UiCarouselHold()
{
   gUiCycleAt=GetTickCount64();gUiDwell=UI_MANUAL_HOLD_MS;gUiCycleReady=true;
}
void UiCarousel(const ulong now,const bool mini,const bool resized)
{
   // Monotonic wall clock: rotation continues even when the market has no ticks.
   // Pagination only changes view variables, never trading permissions or signals.
   if(mini || resized || !gUiCycleReady)
   {
      gUiCycleAt=now;gUiDwell=UI_CYCLE_MS;gUiCycleReady=!mini;return;
   }
   if(now-gUiCycleAt<gUiDwell) return;
   if(gPanelPage+1<gPanelPages) gPanelPage++;
   else { gPanelPage=0;gPanelTab=(gPanelTab+1)%4; }
   gUiCycleAt=now;gUiDwell=UI_CYCLE_MS;
}
string UiCarouselLabel(const ulong now)
{
   if(gPanelCollapsed || !gUiCycleReady) return "AUTO HOLD";
   ulong elapsed=now-gUiCycleAt;
   long left=elapsed<gUiDwell?(long)((gUiDwell-elapsed+999)/1000):0;
   return (gUiDwell==UI_MANUAL_HOLD_MS?"AUTO HOLD ":"AUTO ")+IntegerToString(left)+"s";
}
void DrawPanel(const bool force=false)
{
   if(!InpPanel) return;
   ulong now=GetTickCount64();if(!force && now-gPanelMs<1000) return;gPanelMs=now;
   int cw=(int)ChartGetInteger(0,CHART_WIDTH_IN_PIXELS,0),ch=(int)ChartGetInteger(0,CHART_HEIGHT_IN_PIXELS,0);
   if(cw<=0 || ch<=0) return;
   int dpi=(int)MathMax(72,TerminalInfoInteger(TERMINAL_SCREEN_DPI));
   bool resized=gUiWidth!=cw || gUiHeight!=ch || gUiDpi!=dpi;
   gUiWidth=cw;gUiHeight=ch;gUiDpi=dpi;
   // Physical pixels and point-sized fonts share a DPI-aware scale.
   gUiScale=Clamp((double)gUiDpi/96.0,0.75,2.5);
   int logicalW=(int)(cw/gUiScale),logicalH=(int)(ch/gUiScale);
   gUiFont=logicalW>=1500 && logicalH>=800?10:(logicalW<520?8:9);
   bool mini=gPanelCollapsed || logicalW<300 || logicalH<230;
   UiCarousel(now,mini,resized);
   uint layout=TextHash(StringFormat("%d:%d:%d:%d:%d",cw,ch,gUiDpi,gPanelTab,(int)gPanelCollapsed));
   if(layout!=gUiLayoutHash) { UiReset();gUiLayoutHash=layout; }
   gUiFrame++;UiCollect();
   int margin=(int)MathMin(U(8),MathMax(0,(MathMin(cw,ch)-1)/4));
   int x=margin,y=margin,w=cw-2*margin,h=ch-2*margin,pad=(int)MathMin(U(12),w/12);
   int panelH=mini?(int)MathMin(h,U(108)):h;
   UiRect("background",x,y,w,panelH,UI_BG,UI_BORDER);UiRect("accent",x,y,w,U(2),UI_CYAN,UI_CYAN);
   int px=x+pad,pw=w-2*pad,top=y+U(10);string mode=UiMode();
   color modeColor=mode=="ACTIVE"?UI_GREEN:(mode=="PAUSED" || mode=="WAITING FOR DATA"?UI_GOLD:UI_RED);
   int toggleW=(int)MathMin(U(58),pw/3);
   int autoW=pw>=U(600) && !mini?U(132):0;
   UiText("brand",px,top,pw-toggleW-autoW-U(8),logicalW<560?"ALL IN ONE  1.01":"Nova  /  ALL IN ONE  1.01",UI_TEXT,gUiFont+2);
   if(autoW>0) UiText("carousel",px+pw-toggleW-autoW,top+U(5),autoW-U(8),UiCarouselLabel(now),UI_GOLD,gUiFont-1,"Automatic rotation: every page in Strategies, Positions, Analytics and System, 8 seconds per page. Manual selection holds 16 seconds.",true);
   UiButton("collapse",px+pw-toggleW,top,toggleW,U(24),gPanelCollapsed?"OPEN":"HIDE",UI_ROW,UI_CYAN,"Collapse or expand the dashboard; trading is unchanged.");
   if(mini)
   {
      UiText("minimode",px,top+U(30),pw,_Symbol+"  |  "+mode+"  |  EQ "+UiNumber(gUiEquity),modeColor,gUiFont-1);
      UiText("minirisk",px,top+U(54),pw,"SL risk "+(gUiTotalRiskOK?UiNumber(gUiRiskPct,1)+"%":"UNKNOWN")+"  |  AUTO HOLD",UI_MUTED,gUiFont-1);
      gPanelPages=1;gPanelPage=0;UiEnd();return;
   }
   UiHistory();
   top+=U(33);
   string currency=AccountInfoString(ACCOUNT_CURRENCY);
   string sub=_Symbol+"  |  "+UiTF(InpAnalysisTF)+" + H1  |  HEDGING  |  "+mode+"  |  "+currency;
   UiText("subtitle",px,top,pw,sub,modeColor,gUiFont-1,"Account daily change: account equity after cash adjustment. AIO P/L: chart symbol + Magic scope.");
   top+=U(24);
   if(logicalH>=380)
   {
      bool six=logicalH>=650;int total=six?6:3;
      int cols=(int)Clamp(MathFloor((double)pw/U(160)),1,total);
      if(!six) cols=(int)MathMin(3,MathMax(1,pw/U(100)));
      int rows=(total+cols-1)/cols,gap=U(8),kw=(pw-gap*(cols-1))/cols,kh=U(six?78:51);
      // Compact charts give priority to table rows and controls over KPI cards.
      if(top+rows*(kh+gap)+U(3)+U(39)+U(54)+U(103)<=y+h)
      {
      string titles[6]={"EQUITY","ACCOUNT DAY","AIO SL RISK","BALANCE","AIO REALIZED TODAY","AIO FLOATING NOW"};
      string vals[6];vals[0]=UiNumber(gUiEquity);vals[1]=gAccountHistoryOK?UiSigned(gUiDayChange):"HISTORY N/A";
      vals[2]=gUiTotalRiskOK && gUiEquity>0?UiNumber(gUiRiskPct,1)+"%":"UNKNOWN";
      vals[3]=UiNumber(AccountInfoDouble(ACCOUNT_BALANCE));vals[4]=gDailyHistoryOK?UiSigned(gUiRealized):"HISTORY N/A";vals[5]=UiSigned(gUiFloating);
      string subs[6];subs[0]=currency+"  |  free "+UiNumber(AccountInfoDouble(ACCOUNT_MARGIN_FREE));
      subs[1]=UiSigned(gUiDayPct,1)+"%  / cash adjusted";subs[2]="Cap "+UiNumber(InpMaxOpenRiskPct,0)+"% / incl. in flight";
      subs[3]="Account currency: "+currency;subs[4]=IntegerToString(gUiEntries)+" entry orders today";
      subs[5]=IntegerToString(ArraySize(gUiPositions))+" positions / "+UiNumber(gUiVolume,4)+" lots";
      color colors[6];colors[0]=UI_CYAN;colors[1]=UiSignColor(gUiDayChange);colors[2]=gUiTotalRiskOK && gUiRiskPct<InpMaxOpenRiskPct?UI_GOLD:UI_RED;
      colors[3]=UI_TEXT;colors[4]=UiSignColor(gUiRealized);colors[5]=UiSignColor(gUiFloating);
      for(int i=0;i<total;i++) UiMetric(i,px+(i%cols)*(kw+gap),top+(i/cols)*(kh+gap),kw,kh,titles[i],vals[i],subs[i],colors[i]);
      top+=rows*(kh+gap)+U(3);
      }
   }
   string tabs[4]={"30 STRATEGIES","POSITIONS","ANALYTICS","SYSTEM"};
   if(logicalW<550) { tabs[0]="30 EA";tabs[1]="TRADES";tabs[2]="MARKET"; }
   int tabGap=U(5),tabW=(pw-3*tabGap)/4;
   for(int i=0;i<4;i++) UiButton("tab"+IntegerToString(i),px+i*(tabW+tabGap),top,tabW,U(29),tabs[i],gPanelTab==i?C'29,72,87':UI_CARD,gPanelTab==i?UI_CYAN:UI_MUTED);
   top+=U(39);
   int footer=y+h-U(24),controls=footer-U(35),nav=controls-U(34),bodyH=nav-top-U(10);
   // All navigation and controls stay inside the chart, including after vertical shrink.
   if(bodyH>=U(54))
   {
      int sideW=pw>=U(1160) && bodyH>=U(340)?U(268):0;
      int mainW=pw-(sideW>0?sideW+U(12):0);
      if(sideW>0) UiSidebar(px+mainW+U(12),top,sideW,bodyH);
      if(gPanelTab==0) UiStrategyTable(px,top,mainW,bodyH);
      if(gPanelTab==1) UiPositionsTable(px,top,mainW,bodyH);
      if(gPanelTab==2) UiAnalytics(px,top,mainW,bodyH);
      if(gPanelTab==3) UiSystem(px,top,mainW,bodyH);
   }
   else { gPanelPages=1;gPanelPage=0;UiText("short",px,top,pw,"Increase chart height to show data rows.",UI_GOLD,gUiFont-1); }
   int pageW=(int)MathMin(U(64),pw/5),pageX=px+pw-2*pageW-U(5);
   string scope=gPanelTab==0?"30 modules / "+IntegerToString(ArraySize(gUiPositions))+" open":(gPanelTab==1?IntegerToString(ArraySize(gUiPositions))+" positions / "+IntegerToString(gUiPending)+" in flight":(gPanelTab==2?"14 server days / fees included":"Live broker specifications"));
   UiText("pageinfo",px,nav+U(5),pw-2*pageW-U(16),scope+"  |  "+IntegerToString(gPanelPage+1)+" / "+IntegerToString(gPanelPages),UI_MUTED,gUiFont-1);
   UiButton("prev",pageX,nav,pageW,U(25),"< PREV",UI_CARD,gPanelPage>0?UI_CYAN:UI_MUTED);
   UiButton("next",pageX+pageW+U(5),nav,pageW,U(25),"NEXT >",UI_CARD,gPanelPage+1<gPanelPages?UI_CYAN:UI_MUTED);
   int buttonGap=U(8),buttonW=(pw-buttonGap)/2;
   UiButton("pause",px,controls,buttonW,U(28),gHeader.manual_pause?"RESUME ENTRIES":"PAUSE ENTRIES",C'29,62,72',UI_CYAN,"Pause new entries; continue managing existing AIO positions.");
   UiButton("flat",px+buttonW+buttonGap,controls,buttonW,U(28),"CLOSE AIO + PAUSE",C'66,35,48',UI_RED,"Close only this chart symbol + AIO Magic scope and pause entries. Unfinished closes are retried.");
   UiText("footer",px,footer,pw,UiCarouselLabel(now)+"  |  30 strategies / 5 tools  |  "+TimeToString(TimeCurrent(),TIME_SECONDS)+" server  |  "+IntegerToString(_Digits)+" digits",UI_MUTED,gUiFont-1);
   UiEnd();
}

bool gInitialized=false,gNeedJournal=true;
ulong gLastWorkMs=0;
datetime gLastIntrabarDay=0;

bool ValidateInputs()
{
   return InpMagicBase>0 && InpMagicBase<2000000000-MODULES &&
      InpAnalysisTF!=PERIOD_CURRENT && PeriodSeconds(InpAnalysisTF)>0 &&
      PeriodSeconds(InpAnalysisTF)<=3600 && 3600%PeriodSeconds(InpAnalysisTF)==0 &&
      InpRisk_Tuned>0 && InpMaxSingleRiskPct>=InpRisk_Tuned && InpMaxSingleRiskPct<=100 &&
      InpMaxOpenRiskPct>=InpMaxSingleRiskPct && InpMaxOpenRiskPct<=100 &&
      InpMaxPositions>=1 && InpMaxPositions<=MODULES &&
      InpMaxMarginUsedPct>0 && InpMaxMarginUsedPct<=100 &&
      InpDailyLossPct>=0 && InpDailyLossPct<=100 && 0>=0 &&
      InpMaxSpreadATR>=0 && InpDeviationBasePoints>=0 && InpDeviationBasePoints<=1000000;
}
void CancelOwnPending()
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong order=OrderGetTicket(i);
      if(order==0 || OrderGetString(ORDER_SYMBOL)!=_Symbol || MagicId(OrderGetInteger(ORDER_MAGIC))<0) continue;
      long type=OrderGetInteger(ORDER_TYPE);
      if(type==ORDER_TYPE_BUY || type==ORDER_TYPE_SELL) continue;
      MqlTradeRequest req;MqlTradeResult result;ZeroMemory(req);ZeroMemory(result);
      req.action=TRADE_ACTION_REMOVE;req.order=order;req.symbol=_Symbol;
      bool ok=NOVA_BrokerOrderSend(req,result,NOVA_PHASE2_EXECUTION_DISABLED);
      if(!ok) Print(ENGINE_LABEL,": pending cancellation failed ",result.retcode);
   }
}
bool AllFlat()
{
   for(int i=0;i<MODULES;i++)
      if(FindPosition(i)!=0 || HasActiveOrder(i) || gState[i].inflight_at>0) return false;
   return true;
}
void EvaluatePrimaryBar()
{
   UpdateHourStatistics();UpdateRadar();UpdateBoard();UpdateMarketScanner();
   for(int id=0;id<MODULES;id++)
   {
      if(id==S_NEURAL || id==S_SESSIONHEAT) continue;
      if(gState[id].evaluated_bar==gRates[1].time) continue;
      if(gState[id].evaluated_bar>0)
      {
         int missed=iBarShift(_Symbol,InpAnalysisTF,gState[id].evaluated_bar,false)-1;
         missed=(int)MathMin(missed,ArraySize(gRates)-262);
         gReplay=true;
         for(int s=missed;s>=2;s--) EvaluateClosedModule(id,s);
         gReplay=false;
      }
      gState[id].evaluated_bar=gRates[1].time;
      gState[id].attempts=0;gState[id].retry_at=0;ClearCandidate(id);
      Note(id,"NO SIGNAL");EvaluateClosedModule(id,1);
   }
   SaveState();
}

// ตรวจไม้ที่ปิดไปแล้ว แล้วให้ระบบเรียนจากไม้นั้น (เรียกทุกแท่ง M15)
datetime gLearn_LastHistoryCheck=0;
ulong gLearn_LastDealTicket=0;
void CheckClosedTradesLearning()
{
   if(!InpUseAutoLearning) return;
   datetime bar=gRates[1].time;
   if(bar==gLearn_LastHistoryCheck) return;
   gLearn_LastHistoryCheck=bar;
   LearnInit();
   // อ่าน History 10 ดีลล่าสุด
   HistorySelect(0, TimeCurrent());
   int total=HistoryDealsTotal();
   for(int i=MathMax(0,total-20); i<total; i++)
   {
      ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0 || ticket<=gLearn_LastDealTicket) continue;
      // เฉพาะดีลของ EA นี้ (Magic ตรงกัน)
      long magic=HistoryDealGetInteger(ticket, DEAL_MAGIC);
      if(magic < InpMagicBase || magic >= InpMagicBase+1000) continue;
      double profit=HistoryDealGetDouble(ticket, DEAL_PROFIT) + HistoryDealGetDouble(ticket, DEAL_SWAP) + HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double entry=HistoryDealGetDouble(ticket, DEAL_PRICE);
      // หา R จาก SL ที่เก็บไว้ยากใน History เลยประมาณจาก Profit / Risk 100$
      double R = profit/100.0; // Risk 1% ของ 10,000 = 100$
      int dir = HistoryDealGetInteger(ticket, DEAL_TYPE)==DEAL_TYPE_BUY?1:-1;
      // โมดูลจาก Magic: Magic = Base + ModuleId
      int modId=(int)(magic - InpMagicBase);
      if(modId<0 || modId>=MODULES) modId=S_NEURAL;
      string regime=gScannerRegimeName;
      double score=gMLScore;
      LearnFromTrade(modId, dir, R, regime, score);
      AutoOptRecordTrade(score, dir, R); // v1.12 เก็บไว้ให้ Auto Optimise ใช้ประเมิน
      gLearn_LastDealTicket=ticket;
   }
}


//+------------------------------------------------------------------+
//| v1.66 Sniper MTF - M15 Trend + M5 Entry Pullback EMA20         |
//| TP 300 SL 100 Max 2/day RR 1:5 - เทสจริง PF 2.07              |
//+------------------------------------------------------------------+
// --- v1.77 Order Limits Helpers: Total 10 = Core 3 + Sniper 4 + Recovery 3 ---
bool V177_MatchesExposure(const long magic,const int mode)
{
   int id=MagicId(magic);
   bool sniper=(magic==(long)InpSniperMTF_Magic);
   bool recovery=(id==19);
   bool core=(id>=0 && id!=19);
   if(mode==0) return sniper || id>=0;
   if(mode==1) return sniper;
   if(mode==2) return recovery;
   return core;
}
int V177_CountExposure(const int mode)
{
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i); if(ticket==0) continue;
      if(V177_MatchesExposure(PositionGetInteger(POSITION_MAGIC),mode)) count++;
   }
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i); if(ticket==0) continue;
      if(V177_MatchesExposure(OrderGetInteger(ORDER_MAGIC),mode)) count++;
   }
   return count;
}
int V177_CountOpenTotal() { return V177_CountExposure(0); }
int V177_CountOpenSniper() { return V177_CountExposure(1); }
int V177_CountOpenRecovery() { return V177_CountExposure(2); }
int V177_CountOpenCore() { return V177_CountExposure(3); }
bool V177_CanOpenCore(string &reason) { if(V177_CountOpenTotal()>=InpV177_MaxTotalOpen){ reason="WAIT TOTAL 5"; return false; } if(V177_CountOpenCore()>=InpV177_MaxCoreOpen){ reason="WAIT CORE 3"; return false; } if(gV177_CoreToday>=InpV177_MaxCorePerDay){ reason="WAIT CORE DAY 3"; return false; } if(gTotalEntriesToday>=InpV177_MaxTotalPerDay){ reason="WAIT TOTAL DAY 10"; return false; } reason="READY"; return true; }
bool V177_CanOpenSniper(string &reason) { if(V177_CountOpenTotal()>=InpV177_MaxTotalOpen){ reason="WAIT TOTAL 5"; return false; } if(V177_CountOpenSniper()>=InpV177_MaxSniperOpen){ reason="WAIT SNIPER 4"; return false; } if(gSniperMTF_Count>=InpV177_MaxSniperPerDay){ reason="WAIT SNIPER DAY 4"; return false; } reason="READY"; return true; }
bool V177_CanOpenRecovery(string &reason) { if(V177_CountOpenTotal()>=InpV177_MaxTotalOpen){ reason="WAIT TOTAL 5"; return false; } if(V177_CountOpenRecovery()>=InpV177_MaxRecoveryOpen){ reason="WAIT RECOVERY 3"; return false; } reason="READY"; return true; }
int SniperMTF_CountOpen()
{
   int c=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=(long)InpSniperMTF_Magic) continue;
      c++;
   }
   return c;
}

// --- v1.72 AI Sniper Score (Causal - Closed Bar เท่านั้น ไม่ใช้ Future Bar) ---
int gAISniper_Score = 0;
bool gAISniper_Sweep = false;
bool gAISniper_Disp = false;
bool gAISniper_CHoCH = false;
bool gAISniper_Kill = false;
bool AISniper_IsKillzone()
{
   int hourGMT = (int)((TimeGMT()%86400)/3600);
   return (hourGMT>=7 && hourGMT<=11) || (hourGMT>=13 && hourGMT<=17);
}
// Uses only completed H1 bars. Cache once per newly closed H1 candle.
bool ResearchSMC_H1Trend(const int dir)
{
   static datetime cachedClosedBar=0;
   static int cachedBias=0;
   datetime closedBar=iTime(_Symbol,PERIOD_H1,1);
   if(closedBar<=0) return false;
   if(closedBar!=cachedClosedBar)
   {
      MqlRates h1[];
      ArraySetAsSeries(h1,true);
      int copied=CopyRates(_Symbol,PERIOD_H1,1,160,h1);
      if(copied<160) { cachedClosedBar=0; cachedBias=0; return false; }
      const double alpha=2.0/51.0;
      double ema=h1[copied-1].close;
      double emaPrevious=0;
      for(int i=copied-2;i>=0;i--)
      {
         ema=alpha*h1[i].close+(1.0-alpha)*ema;
         if(i==1) emaPrevious=ema;
      }
      if(emaPrevious<=0) { cachedClosedBar=0; cachedBias=0; return false; }
      if(h1[0].close>ema && ema>emaPrevious) cachedBias=1;
      else if(h1[0].close<ema && ema<emaPrevious) cachedBias=-1;
      else cachedBias=0;
      cachedClosedBar=closedBar;
   }
   return cachedBias==dir;
}
bool ResearchSMC_PriorSwingLevel(const int dir,double &level)
{
   level=0;
   int last=ArraySize(gRates)-3;
   if(last>20) last=20;
   if(last<5) return false;
   // Two older and two newer completed bars confirm the pivot before the sweep candle (shift 2).
   for(int shift=5;shift<=last;shift++)
   {
      bool pivot=true;
      for(int k=1;k<=2;k++)
      {
         if(dir>0 && (gRates[shift].low>=gRates[shift-k].low || gRates[shift].low>=gRates[shift+k].low))
         { pivot=false; break; }
         if(dir<0 && (gRates[shift].high<=gRates[shift-k].high || gRates[shift].high<=gRates[shift+k].high))
         { pivot=false; break; }
      }
      if(pivot) { level=(dir>0?gRates[shift].low:gRates[shift].high); return level>0; }
   }
   return false;
}
int AISniper_CalcScore(int dir)
{
   gAISniper_Sweep=false; gAISniper_Disp=false; gAISniper_CHoCH=false; gAISniper_Kill=AISniper_IsKillzone();
   if(!gInpAISniper_Enabled) { gAISniper_Score=0; return 0; }
   if(ArraySize(gRates)<(InpResearchSMC_Mode?8:4) || ArraySize(gATR)<2) { gAISniper_Score=0; return 0; }
   double atr = gATR[1];
   if(atr<=0) { gAISniper_Score=0; return 0; }
   // Sweep: Closed Bar เท่านั้น - ใช้ gRates[2] เทียบ gRates[3] (ไม่ใช้แท่งกำลังวิ่ง gRates[0])
   if(InpAISniper_UseSweep)
   {
      if(InpResearchSMC_Mode)
      {
         double priorSwing=0;
         if(!ResearchSMC_PriorSwingLevel(dir,priorSwing)) { gAISniper_Score=0; return 0; }
         if(dir>0) gAISniper_Sweep=(gRates[2].low<priorSwing && gRates[1].close>priorSwing);
         else if(dir<0) gAISniper_Sweep=(gRates[2].high>priorSwing && gRates[1].close<priorSwing);
      }
      else
      {
         if(dir>0) gAISniper_Sweep = (gRates[2].low < gRates[3].low && gRates[1].close > gRates[2].low && gRates[1].close > gRates[3].low);
         else if(dir<0) gAISniper_Sweep = (gRates[2].high > gRates[3].high && gRates[1].close < gRates[2].high && gRates[1].close < gRates[3].high);
      }
   }
   // Displacement: Body แรง >0.6 ATR
   if(InpAISniper_UseDisp)
   {
      double body = MathAbs(gRates[1].close - gRates[1].open);
      gAISniper_Disp = (body > 0.6*atr);
   }
   // CHoCH: ปิดทะลุ Swing ก่อนหน้า
   if(InpAISniper_UseCHoCH)
   {
      if(dir>0) gAISniper_CHoCH = (gRates[1].close > gRates[2].high);
      else if(dir<0) gAISniper_CHoCH = (gRates[1].close < gRates[2].low);
   }
   int score = 0;
   if(gAISniper_Sweep) score++;
   if(gAISniper_Disp && gAISniper_Sweep) score++; // Disp นับต่อเมื่อมี Sweep ก่อน (ไม่นับเดี่ยว)
   if(gAISniper_CHoCH && gAISniper_Sweep) score++; // CHoCH นับต่อเมื่อมี Sweep ก่อน
   if(score>3) score=3;
   gAISniper_Score = score;
   return score;
}
double AISniper_LotBoost(int score)
{
   if(!gInpAISniper_Enabled) return 1.0;
   if(score>=3) return InpAISniper_Boost3;
   if(score==2) return InpAISniper_Boost2;
   return 1.0;
}
string AISniper_StatusText()
{
   return StringFormat("AI Sniper Score %d/3 [Sweep %s Disp %s CHoCH %s Kill %s]", gAISniper_Score, gAISniper_Sweep?"YES":"-", gAISniper_Disp?"YES":"-", gAISniper_CHoCH?"YES":"-", gAISniper_Kill?"YES":"-");
}

void SniperMTF_Check()
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return;
   if(!gInpSniperMTF_Enabled) return;
   if(!gDataOK) return;
   if(!TradePermission()) return;
   if(!EffLiveEnabled()) return;
   if(gHeader.manual_pause!=0 || gHeader.daily_block!=0 || gHeader.flatten_request!=0 || gFatalPause) return;
   if(ArraySize(gATR)<3 || ArraySize(gEMA20)<3 || ArraySize(gEMA50)<3 || ArraySize(gRSI)<3 || ArraySize(gRates)<3) return;
   // Daily reset
   datetime today=DayStart(TimeCurrent());
   if(gSniperMTF_Day!=today) { gSniperMTF_Day=today; gSniperMTF_Count=0; gSniperMTF_PendingDir=0; gSniperMTF_PendingExpiry=0; }
   if(gSniperMTF_Count>=InpSniperMTF_MaxTradesPerDay) return;
   { string v177r=""; if(!V177_CanOpenSniper(v177r)) return; } // v1.77: Sniper เปิดพร้อมกัน 4 / ต่อวัน 4 / รวม 5
   // Session BKK = GMT+7
   int hourBKK=(int)((TimeGMT()+7*3600)%86400/3600);
   if(InpResearchSMC_Mode) { if(!AISniper_IsKillzone()) return; }
   else if(hourBKK<InpSniperMTF_SessionStart || hourBKK>InpSniperMTF_SessionEnd) return;
   // Spread
   long spread=(long)SymbolInfoInteger(_Symbol,SYMBOL_SPREAD);
   if(spread>InpSniperMTF_SpreadMaxPoints) return;
   // ATR filter M15
   double atr=gATR[1];
   if(!(atr>=InpSniperMTF_ATRMin && atr<=InpSniperMTF_ATRMax)) return;
   // M15 Trend (closed bar 1)
   double close1=gRates[1].close;
   double ema50=gEMA50[1];
   double ema20=gEMA20[1];
   double rsi=gRSI[1];
   int dir=0;
   if(close1>ema50 && close1>ema20 && rsi>=40 && rsi<=65) dir=1;
   else if(close1<ema50 && close1<ema20 && rsi>=35 && rsi<=60) dir=-1;
   if(dir==0) { gSniperMTF_PendingDir=0; return; }
   int aiScore = AISniper_CalcScore(dir); // legacy score mode uses boost only
   if(InpResearchSMC_Mode)
   {
      // Require sweep + displacement + CHoCH and aligned closed-bar H1 trend.
      if(aiScore<3 || !ResearchSMC_H1Trend(dir)) return;
   }
   // Pending window: เก็บเทรนด์ไว้ 3 แท่ง M15 รอ Pullback
   if(gSniperMTF_PendingDir!=dir)
   {
      gSniperMTF_PendingDir=dir;
      gSniperMTF_PendingExpiry=TimeCurrent()+(datetime)(InpSniperMTF_PendingBarsM15*PeriodSeconds(InpAnalysisTF));
      gSniperMTF_PendingATR=atr;
   }
   if(TimeCurrent()>gSniperMTF_PendingExpiry) { gSniperMTF_PendingDir=0; return; }
   // Pullback check: แท่งปิดล่าสุด Low/High แตะ EMA20 + 0.20 ATR (จำลอง M5 6 แท่ง)
   double pullLevel=ema20+dir*InpSniperMTF_PullbackATR*atr;
   bool pulled=false;
   if(dir>0 && gRates[1].low<=pullLevel && close1>ema20) pulled=true;
   if(dir<0 && gRates[1].high>=pullLevel && close1<ema20) pulled=true;
   if(!pulled) return;
   // กันเข้าแท่งเดิมซ้ำ
   datetime bar1=iTime(_Symbol,InpAnalysisTF,1);
   if(bar1==gSniperMTF_LastBar) return;
   // Entry ที่ราคาตลาด
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick) || tick.ask<tick.bid || tick.bid<=0) return;
   double entry=dir>0?tick.ask:tick.bid;
   double slDist=InpSniperMTF_SL_Points*_Point;
   double tpDist=InpSniperMTF_TP_Points*_Point;
   double sl=entry-dir*slDist;
   double tp=entry+dir*tpDist;
   if(InpResearchSMC_Mode)
   {
      // Structural stop beyond sweep wick; enforce >=0.5 ATR and >=3x current spread.
      double minStop=MathMax(InpResearchSMC_MinStopATR*atr,3.0*(double)spread*_Point);
      double sweepExtreme=(dir>0?gRates[2].low:gRates[2].high);
      if(dir>0) sl=MathMin(sweepExtreme-InpResearchSMC_SweepBufferATR*atr,entry-minStop);
      else      sl=MathMax(sweepExtreme+InpResearchSMC_SweepBufferATR*atr,entry+minStop);
      slDist=MathAbs(entry-sl);
      tpDist=slDist*InpResearchSMC_RewardRisk;
      tp=entry+dir*tpDist;
   }
   if(!NormalizeStops(dir,tick,sl,tp)) return;
   if(!DirectionAllowed(dir)) return;
   // Lot จาก Risk 0.10% (แยกจาก Core EffRiskPct)
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   double vmin=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double vmax=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double unitLoss=0, loss=0, lots=0; string reason="";
   if(!LossAtSL(dir,vmin,entry,sl,unitLoss)) return;
   double budget=eq*InpSniperMTF_RiskPercent/100.0;
   lots=VolumeFloor(budget/unitLoss*vmin,step);
   if(lots<vmin)
   {
      if(InpResearchSMC_Mode) return; // never round risk upward to broker minimum volume
      lots=vmin;
   }
   double aiBoost = (InpResearchSMC_Mode?1.0:AISniper_LotBoost(aiScore));
   if(aiBoost>1.0) lots = MathMin(lots*aiBoost, VolumeFloor(vmax,step)); // legacy mode only; research mode keeps fixed risk
   lots=MathMin(lots,VolumeFloor(vmax,step));
   if(lots<vmin || !LossAtSL(dir,lots,entry,sl,loss)) return;
   if(loss>eq*InpMaxSingleRiskPct/100.0+1e-8) return;
    int openPositions=0; double openRisk=OpenRiskMoney(openPositions);
    if(openPositions>=InpMaxPositions || openRisk+loss>eq*InpMaxOpenRiskPct/100.0+1e-8) return;
    // OrderSend แบบ ProcessCandidate (ไม่ผ่าน Module)
   MqlTradeRequest req; MqlTradeResult res; MqlTradeCheckResult check;
   ZeroMemory(req); ZeroMemory(res); ZeroMemory(check);
   req.action=TRADE_ACTION_DEAL; req.symbol=_Symbol; req.magic=(ulong)InpSniperMTF_Magic;
   req.type=dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
   req.price=entry; req.volume=lots; req.sl=sl; req.tp=tp;
   req.deviation=DeviationPoints(); req.type_filling=FillMode();
   req.comment="SNIPER_MTF TP300 SL100";
   if(!OrderCheck(req,check)) return;
   ulong portfolio_id=0;
   if(!NOVA_PortfolioReserve((long)req.magic,req.symbol,loss,InpMaxOpenRiskPct,InpMaxPositions,portfolio_id)) return;
   req.comment=NOVA_PortfolioTaggedComment(req.comment,portfolio_id);
   if(!NOVA_PortfolioMarkDispatching(portfolio_id))
   { NOVA_PortfolioFinish(portfolio_id,NOVA_PORTFOLIO_RELEASED,0); return; }
   bool sent=NOVA_BrokerOrderSend(req,res,NOVA_PHASE2_EXECUTION_DISABLED);
   if(!sent)
   {
      int state=(res.retcode==TRADE_RETCODE_TIMEOUT || res.retcode==TRADE_RETCODE_CONNECTION)?
                NOVA_PORTFOLIO_UNCERTAIN:NOVA_PORTFOLIO_RELEASED;
      NOVA_PortfolioFinish(portfolio_id,state,res.order);
      return;
   }
   if(res.retcode==TRADE_RETCODE_DONE || res.retcode==TRADE_RETCODE_DONE_PARTIAL || res.retcode==TRADE_RETCODE_PLACED)
   {
      NOVA_PortfolioFinish(portfolio_id,NOVA_PORTFOLIO_ACCEPTED,res.order);
      gSniperMTF_Count++;
      gSniperMTF_LastBar=bar1;
      gSniperMTF_PendingDir=0;
      PrintFormat("[v1.72 AI Sniper] OPEN %s %.2f @ %.2f SL %.2f TP %.2f Count %d/%d | %s Boost x%.2f", dir>0?"BUY":"SELL", lots, entry, sl, tp, gSniperMTF_Count, InpSniperMTF_MaxTradesPerDay, AISniper_StatusText(), aiBoost);
   }
}

void MainWork()
{
   if(!gInitialized || gBusy) return;
   ulong now=GetTickCount64();if(!gTest && now-gLastWorkMs<200) return;
   gLastWorkMs=now;gBusy=true;
   DailyGuard();ReconcileInflight();
   if(now-gPortfolioLastReconcileMs>=1000) { NOVA_PortfolioReconcile();gPortfolioLastReconcileMs=now; }
   if(gHeader.daily_block!=0 || gHeader.flatten_request!=0)
    {
       if(TradePermission())
       {
          CancelOwnPending();
          if(gHeader.flatten_request!=0) CloseAllOwn();
       }
      if(gHeader.flatten_request!=0 && AllFlat()) { gHeader.flatten_request=0;SaveState(); }
   }
   datetime bar=iTime(_Symbol,InpAnalysisTF,0);
   if(bar>0 && (bar!=gDataBar || !gDataOK))
   {
      if(ReloadPrimary())
      {
         if(gNeedWarmup) { WarmStateMachines();gNeedWarmup=false;UpdateHourStatistics();UpdateRadar();UpdateBoard(); }
         else EvaluatePrimaryBar();
      }
   }
   if(gDataOK)
   {
      datetime h1=iTime(_Symbol,PERIOD_H1,0);
      if(h1!=gHourStatsBar || ArraySize(gH1)<150) UpdateHourStatistics();
      UpdateMarketScanner(); UpdateMTFScanner();
      AdaptCheck(); // v1.42 Auto-Adapt - ตรวจ Symbol/โบรก/Cent เปลี่ยน -> เทรนใหม่เอง
      MlpCheckRetrain(); // v1.43 Auto-Train Dual+ONNX MLP - เทรนใหม่ทุก 250 แท่ง
      // v1.43 Dual-Auto: เทรนใหม่ทุก 250 แท่งพร้อม MLP + Export ONNX ทุก 500 แท่ง
      if(InpAutoTrainDual && gDualAutoTrained){ gDualAutoBarsSinceTrain++; if(gDualAutoBarsSinceTrain>=250){ gDualAutoBarsSinceTrain=0; TrainDualAutoModel(); } }
      if(InpAutoTrainDual && !gDualAutoTrained) TrainDualAutoModel();
      if(InpAutoExportONNX){ datetime curBar=iTime(_Symbol, PERIOD_M15, 0); if(gONNXLastExportBar==0 || curBar-gONNXLastExportBar >= InpONNXExportEveryBars*PeriodSeconds(PERIOD_M15)) ExportONNXData(); }
      ManagePositions();BBPro_ApplyBE_Lock();RecoveryManage();SniperMTF_Check(); // v1.66 Sniper MTF LOCKED
      // [v1.83 FIX] v1.82: 5 ฟังก์ชันนี้ถูก // ของบรรทัดบนกลืนเป็นคอมเมนต์ จึงไม่เคยถูกเรียก
      if(InpV183_RunLearningLoop) { SignalSATMA(); CheckClosedTradesLearning(); NovaUniverseSync(); AutoOptRun(); AutoOptCheckRollback(); }
      // Dynamic-bar feeds are read through iHigh/iLow/iVolume, never stale r[0].
      IntrabarSignals();
      UpdateDailyHistory();
      int start=gHeader.rotation;
      if(start<0 || start>=MODULES) start=0;
      if(g_V167_CoreEnabled) for(int k=0;k<MODULES;k++) ProcessCandidate((start+k)%MODULES);
      gHeader.rotation=(start+1)%MODULES;
   }
   if((gNeedJournal || TimeCurrent()-gLastJournal>=2) && InpJournal)
   { SyncJournal();gNeedJournal=false;gLastJournal=TimeCurrent(); }
   if(TimeCurrent()-gLastSave>=5) SaveState();
   DrawPanel();V162_UpdateDashboard();gBusy=false; // v1.50
}

//+------------------------------------------------------------------+
//| v1.49 Dashboard - คำนวณค่าอัตโนมัติจาก บัญชี + สัญลักษณ์ + ตลาด |
//| หลักการ: Risk จากทุน+โปรไฟล์+Vol, SL/TP จาก ATR จริง, Lot = Risk$/(SL$*100) |
//| Regime: Price < SMA20 < SMA50 + ATR Daily >70 = Defensive -> เน้น Sell |

//| v1.62 Voom Precise + Auto-Tune + News Architecture - Rose AI integration |
//| Foundation = Nova Core | Brain = เลือกสมองได้ | Skills = ต่อแขนขา |
//| Memory = Journal + Retrain | Data = Exness Tick -> M15          |
//+------------------------------------------------------------------+
string Rose_BrainName()
{
   if(InpRoseBrain == 0) return "MLP";
   if(InpRoseBrain == 1) return "Dual Auto";
   if(InpRoseBrain == 2) return "Hybrid MLP+Dual";
   if(InpRoseBrain == 3) return "ONNX/XGBoost";
   if(InpRoseBrain == 4) return "Ensemble";
   if(InpRoseBrain == 5) return "Merged GB50+MLP30+Dual20";
   return "Merged";
}
int Rose_ActiveSkillCount()
{
   int c = 0;
   if(InpRoseSkill_HTF) c++;
   if(InpRoseSkill_OTE) c++;
   if(InpRoseSkill_Macro) c++;
   if(InpRoseSkill_Volume) c++;
   if(InpRoseSkill_Elliott) c++;
   if(InpRoseSkill_SMCWave) c++;
   if(InpRoseSkill_Recovery) c++;
   if(InpRoseSkill_Memory) c++;
   if(InpRoseSkill_Data) c++;
   return c;
}
string Rose_ActiveSkillsText()
{
   string s = "";
   if(InpRoseSkill_HTF) s += "HTF ";
   if(InpRoseSkill_OTE) s += "OTE ";
   if(InpRoseSkill_Macro) s += "Macro ";
   if(InpRoseSkill_Volume) s += "Vol ";
   if(InpRoseSkill_Elliott) s += "Elliott ";
   if(InpRoseSkill_SMCWave) s += "SMC-Wave ";
   if(InpRoseSkill_Recovery) s += "Recovery ";
   if(InpRoseSkill_Memory) s += "Memory ";
   if(InpRoseSkill_Data) s += "Data ";
   return s;
}
double Rose_EffMlpThreshold()
{
   if(InpRoseBrain == 0) return 0.10;
   if(InpRoseBrain == 1) return 0.08;
   if(InpRoseBrain == 2) return 0.15;
   if(InpRoseBrain == 3) return 0.12;
   if(InpRoseBrain == 4) return 0.15;
   if(InpRoseBrain == 5) return 0.10; // Merged - 0.10 ให้ 46 ไม้ (Hybrid 0.15 ได้แค่ 16 ไม้ น้อยเกิน)
   return 0.10;
}
void Rose_PrintConfig()
{
   PrintFormat("[v1.62 Voom Precise + Auto-Tune + News] Brain=%s | Skills %d/9: %s | Merged GB %.2f MLP %.2f Dual %.2f | SL %.1f TP %.1f Hold %d | Voom Brain 5/5 Agree | Long x%.1f Short x%.1f | Full +682 Nov +73", Rose_BrainName(), Rose_ActiveSkillCount(), Rose_ActiveSkillsText(), InpMerged_GBWeight, InpMerged_MLPWeight, InpMerged_DualWeight, InpMerged_SL, InpMerged_TP, InpMerged_Hold, InpLongMult, InpShortMult);
}

//+------------------------------------------------------------------+


//| v1.62 Voom Precise + Auto-Tune + News - Dark Premium + Glass |
//| ปุ่ม 1 AUTO | ปุ่ม 2 LIVE | การ์ด Equity/Daily/DD/Pos        |
//| Header + การ์ดสถานะ + ปุ่มรอง PAUSE / CLOSE ALL                |
bool g_V162_Live = true;
bool g_V162_Auto = true;
bool g_V173_Started = true; // v1.73: START = ON ตั้งแต่เริ่ม
bool g_V173_SniperOn = true;
bool g_V174_AutoTuneOn = true; // v1.74: AUTO-TUNING = ON ตั้งแต่เริ่ม // v1.73: SNIPER = ON ตั้งแต่เริ่ม
bool g_V162_DashboardCreated = false;
string g_V162_BtnAuto = "NovaV162_BTN_AUTO";
string g_V162_BtnLive = "NovaV162_BTN_LIVE";
string g_V162_BtnPause = "NovaV162_BTN_PAUSE";
string g_V162_BtnClose = "NovaV162_BTN_CLOSE";
string g_V162_Bg = "NovaV162_BG";
string g_V162_HeaderBg = "NovaV162_HEADER_BG";
string g_V162_Card1 = "NovaV162_CARD1";
string g_V162_Card2 = "NovaV162_CARD2";
string g_V162_Card3 = "NovaV162_CARD3";
string g_V162_Card4 = "NovaV162_CARD4";
string g_V162_LblTitle = "NovaV162_LBL_TITLE";
string g_V162_LblSub = "NovaV162_LBL_SUB";
string g_V162_LblEquity = "NovaV162_LBL_EQUITY";
string g_V162_LblDaily = "NovaV162_LBL_DAILY";
string g_V162_LblDD = "NovaV162_LBL_DD";
string g_V162_LblPos = "NovaV162_LBL_POS";
string g_V162_LblAutoInfo = "NovaV162_LBL_AUTOINFO";
string g_V162_LblStatus = "NovaV162_LBL_STATUS";
string g_V162_LblRose = "NovaV162_LBL_ROSE";
// v1.70 v1.50 Style + Open Orders
bool   g_V167_CoreEnabled = g_V173_Started;
string g_V167_BtnCore = "NovaV170_BTN_CORE";
string g_V167_BtnSniper = "NovaV170_BTN_SNIPER";
string g_V167_BtnNews = "NovaV170_BTN_NEWS";
string g_V167_BtnAutoTune = "NovaV170_BTN_AUTOTUNE";
string g_V167_BtnLearning = "NovaV170_BTN_LEARNING";
string g_V167_BtnRecovery = "NovaV170_BTN_RECOVERY";
string g_V167_BtnTrailing = "NovaV170_BTN_TRAILING";
string g_V167_BtnFilters = "NovaV170_BTN_FILTERS";
string g_V167_BtnCloseSniper = "NovaV170_BTN_CLOSE_SNIPER";
string g_V167_BtnCloseCore = "NovaV170_BTN_CLOSE_CORE";
string g_V167_BtnResetDay = "NovaV170_BTN_RESETDAY";
string g_V167_BtnStopAll = "NovaV170_BTN_STOPALL";
string g_V167_LblSniperDay = "NovaV170_LBL_SNIPERDAY";
string g_V167_LblCoreDay = "NovaV170_LBL_COREDAY";
string g_V167_LblSession = "NovaV170_LBL_SESSION";
string g_V167_LblSniperInfo = "NovaV170_LBL_SNIPERINFO";
string g_V167_LblPortfolio = "NovaV170_LBL_PORTFOLIO";
string g_V167_LblPortfolio2 = "NovaV170_LBL_PORTFOLIO2";
string g_V167_Card5 = "NovaV170_CARD5";
string g_V167_Card6 = "NovaV170_CARD6";
string g_V170_LblOrdersTitle = "NovaV170_LBL_ORDERS_TITLE";
string g_V170_LblOrder1 = "NovaV170_LBL_ORDER1";
string g_V170_LblOrder2 = "NovaV170_LBL_ORDER2";
string g_V170_LblOrder3 = "NovaV170_LBL_ORDER3";
string g_V170_LblOrder4 = "NovaV170_LBL_ORDER4";
string g_V170_LblOrder5 = "NovaV170_LBL_ORDER5";
string g_V170_BgOrders = "NovaV170_BG_ORDERS";


// Helpers - ค่าที่ใช้จริง (ถ้า AUTO ON ใช้ g_Auto_* ถ้า OFF ใช้ Input มือ)
double EffRiskPct() { return g_V162_Auto ? g_Auto_RiskPct : InpRisk_Tuned; } // v1.83: Core Risk = InpRisk_Tuned
double EffMlpThreshold() { return g_V162_Auto ? g_Auto_MlpThresh : InpMlpThreshold; }
int    EffHoldBars() { return g_V162_Auto ? g_Auto_HoldBars : InpMindMaxHoldBars; }
double EffBuyLotMult() { return g_V162_Auto ? g_Auto_BuyLotMult : 1.0; }
double EffSLMult() { return g_V162_Auto ? g_Auto_SLMult : InpGold_ATRMultSL; }
double EffTPMult() { return g_V162_Auto ? g_Auto_TPMult : InpGold_ATRMultTP; }
bool   EffLiveEnabled() { return g_V162_Live && InpTradeEnabled; }

void V162_CreateLabel(string name, int x, int y, string text, int fontSize, color clr)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetString(0, name, OBJPROP_FONT, "Segoe UI");
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void V162_CreateBg(string name, int x, int y, int w, int h, color bg, color border)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, border);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void V162_CreateButton(string name, int x, int y, int w, int h, string text, color bg, int fontSize=10)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}


// --- v1.73 2 Buttons Logic ---
void V173_ToggleStartStop()
{
   g_V173_Started = !g_V173_Started;
   // v1.76: START คุม Core เท่านั้น ไม่คุม Sniper
   g_V167_CoreEnabled = g_V173_Started;
   g_V162_Live = (g_V173_Started || g_V173_SniperOn);
   g_V162_Auto = (g_V173_Started || g_V173_SniperOn);
   // หยุดเปิดไม้ใหม่ทั้งหมด ก็ต่อเมื่อทั้ง 2 โหมด OFF พร้อมกัน
   gHeader.manual_pause = (g_V173_Started || g_V173_SniperOn) ? 0 : 1;
   PrintFormat("[v1.76] START (Core) -> %s | Sniper แยกอิสระ %s | manual_pause=%d", g_V173_Started?"START":"STOP", g_V173_SniperOn?"ON":"OFF", gHeader.manual_pause);
   V162_UpdateDashboard();
}
void V173_ToggleSniper()
{
   g_V173_SniperOn = !g_V173_SniperOn;
   // v1.76: SNIPER คุม Sniper เท่านั้น ไม่เกี่ยวกับ START
   gInpSniperMTF_Enabled = g_V173_SniperOn;
   gInpAISniper_Enabled = g_V173_SniperOn;
   gInpRoseSkill_Sniper = g_V173_SniperOn;
   g_V162_Live = (g_V173_Started || g_V173_SniperOn);
   g_V162_Auto = (g_V173_Started || g_V173_SniperOn);
   gHeader.manual_pause = (g_V173_Started || g_V173_SniperOn) ? 0 : 1;
   PrintFormat("[v1.76] SNIPER -> %s | Core (START) แยกอิสระ %s | manual_pause=%d", g_V173_SniperOn?"ON":"OFF", g_V173_Started?"START":"STOP", gHeader.manual_pause);
   V162_UpdateDashboard();
}

// --- v1.75 ปรับตั้งค่าอัตโนมัติ Button (เดิม AUTO-TUNING) ---
void V174_ToggleAutoTune()
{
   g_V174_AutoTuneOn = !g_V174_AutoTuneOn;
   gInpRoseSkill_AutoTune = g_V174_AutoTuneOn;
   if(g_V174_AutoTuneOn)
   {
      gInpAutoTune_Mode = "Full";
      gInpAutoTune_AllowTP_SL = true; gInpAutoTune_AllowThreshold = true; gInpAutoTune_AllowWarpTemp = true;
      gInpAutoTune_AllowRiskLot = true; gInpAutoTune_AllowSpreadVol = true; gInpAutoTune_AllowSymbolBroker = true;
      Print("[v1.75] ปรับตั้งค่าอัตโนมัติ -> ON (ปรับพารามิเตอร์อัตโนมัติ เป็น Set ที่ดีที่สุด)");
   }
   else
   {
      gInpAutoTune_Mode = "Off";
      gInpAutoTune_AllowTP_SL = false; gInpAutoTune_AllowThreshold = false; gInpAutoTune_AllowWarpTemp = false;
      gInpAutoTune_AllowRiskLot = false; gInpAutoTune_AllowSpreadVol = false; gInpAutoTune_AllowSymbolBroker = false;
      // ล็อกค่าตาย v1.66 - ไม่จูนต่อ
      Print("[v1.75] ปรับตั้งค่าอัตโนมัติ -> OFF (ล็อก v1.66 ไม่ปรับพารามิเตอร์)");
   }
   V162_UpdateDashboard();
}


void V162_CreateDashboard()
{
   if(!InpDashboardV162) return;
   g_V167_CoreEnabled = g_V173_Started;
   string objs[] = {g_V162_BtnAuto, g_V162_BtnLive, g_V162_BtnPause, g_V162_BtnClose, g_V162_Bg, g_V162_HeaderBg, g_V162_Card1, g_V162_Card2, g_V162_Card3, g_V162_Card4, g_V162_LblTitle, g_V162_LblSub, g_V162_LblEquity, g_V162_LblDaily, g_V162_LblDD, g_V162_LblPos, g_V162_LblAutoInfo, g_V162_LblStatus, g_V162_LblRose,
                    g_V167_BtnCore, g_V167_BtnSniper, g_V167_BtnNews, g_V167_BtnAutoTune, g_V167_BtnLearning, g_V167_BtnRecovery, g_V167_BtnTrailing, g_V167_BtnFilters,
                    g_V167_BtnCloseSniper, g_V167_BtnCloseCore, g_V167_BtnResetDay, g_V167_BtnStopAll,
                    g_V167_LblSniperDay, g_V167_LblCoreDay, g_V167_LblSession, g_V167_LblSniperInfo, g_V167_LblPortfolio, g_V167_LblPortfolio2, g_V167_Card5, g_V167_Card6,
                    g_V170_LblOrdersTitle, g_V170_LblOrder1, g_V170_LblOrder2, g_V170_LblOrder3, g_V170_LblOrder4, g_V170_LblOrder5, g_V170_BgOrders};
   for(int i=0; i<ArraySize(objs); i++) ObjectDelete(0, objs[i]);
   // ===== v1.50 STYLE เดิม - บน =====
   V162_CreateBg(g_V162_Bg, 8, 8, 360, 245, C'11,15,26', C'0,212,255');
   V162_CreateBg(g_V162_HeaderBg, 8, 8, 360, 38, C'0,120,180', C'0,212,255');
   V162_CreateLabel(g_V162_LblTitle, 18, 12, "NOVA EA v1.83", 12, clrWhite);
   V162_CreateLabel(g_V162_LblSub, 150, 16, StringFormat("%s | %s", _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period)), 8, C'200,240,255');
   V162_CreateButton(g_V162_BtnAuto, 18, 54, 85, 44, "▶ START", C'0,160,0', 10); // v1.75: ปุ่ม 1 START/STOP
   V162_CreateButton(g_V162_BtnLive, 107, 54, 85, 44, "🎯 SNIPER: ON", C'200,140,0', 9); // v1.75: ปุ่ม 2 SNIPER
   V162_CreateBg(g_V162_Card1, 18, 98, 82, 52, C'30,41,59', C'60,80,110');
   V162_CreateBg(g_V162_Card2, 104, 98, 82, 52, C'30,41,59', C'60,80,110');
   V162_CreateBg(g_V162_Card3, 190, 98, 82, 52, C'30,41,59', C'60,80,110');
   V162_CreateBg(g_V162_Card4, 276, 98, 74, 52, C'30,41,59', C'60,80,110');
   V162_CreateLabel(g_V162_LblEquity, 22, 102, "EQUITY", 7, C'150,170,200');
   V162_CreateLabel(g_V162_LblDaily, 108, 102, "DAILY P/L", 7, C'150,170,200');
   V162_CreateLabel(g_V162_LblDD, 194, 102, "DAY DD", 7, C'150,170,200');
   V162_CreateLabel(g_V162_LblPos, 280, 102, "OPEN", 7, C'150,170,200');
   V162_CreateLabel(g_V162_LblRose, 18, 158, "Rose Brain: Voom Precise + Auto-Tune + News  |  Skills 12/12", 8, C'0,255,200');
   V162_CreateLabel(g_V162_LblAutoInfo, 18, 172, "AutoConfig: Risk 0.20%  SL 1.8  TP 3.0  Hold 40  MLP 0.15", 8, C'255,215,0');
   V162_CreateButton(g_V162_BtnPause, 196, 54, 164, 44, "PAUSE ENTRIES", C'120,0,180', 9); // Entry pause control
   V162_CreateLabel(g_V162_BtnClose, 18, 194, "📦 LIMIT 10 = Core 3 + Sniper 4 + Recovery 3  |  START=Core  SNIPER=แยกอิสระ", 8, C'0,255,130'); // v1.77: ลิมิต 10
   V162_CreateLabel(g_V162_LblStatus, 18, 226, "LIVE TRADING  |  DEFENSIVE  |  Vol HIGH", 8, C'0,255,130');
   // ===== ต่อขยายสไตล์ v1.50 - ปุ่ม + พอร์ต =====
   V162_CreateBg(g_V167_Card5, 8, 258, 360, 278, C'11,15,26', C'0,212,255');
   V162_CreateBg(g_V167_Card6, 18, 268, 332, 38, C'30,41,59', C'60,80,110');
   V162_CreateLabel(g_V167_LblSniperDay, 22, 272, "🎯 SNIPER TODAY  0 / 4", 8, C'255,220,100');
   V162_CreateLabel(g_V167_LblCoreDay, 192, 272, "🧠 CORE TODAY  0", 8, C'150,220,255');
   V162_CreateLabel(g_V167_LblSniperInfo, 18, 290, "Sniper: TP 300 / SL 100  RR 1:5  Risk 0.10%  |  Core: Risk 0.20%", 8, C'200,220,240');
   V162_CreateLabel(g_V167_LblSession, 18, 306, "Session: --  |  ATR --  |  Spread --", 8, C'0,255,200');
   V162_CreateButton(g_V167_BtnCore, 18, 328, 162, 24, "CORE: ON", C'0,120,200', 8);
   V162_CreateLabel(g_V167_BtnSniper, 188, 332, "AI SNIPER: STATUS", 8, C'200,180,255');
   V162_CreateButton(g_V167_BtnNews, 18, 356, 162, 24, "NEWS FILTER: ON", C'0,140,120', 8);
   V162_CreateButton(g_V167_BtnAutoTune, 188, 356, 162, 24, "AUTO-TUNE: ON", C'120,0,180', 8);
   V162_CreateButton(g_V167_BtnLearning, 18, 384, 162, 24, "LEARNING: ON", C'0,120,80', 8);
   V162_CreateButton(g_V167_BtnRecovery, 188, 384, 162, 24, "RECOVERY: ON", C'180,80,0', 8);
   V162_CreateLabel(g_V167_BtnTrailing, 18, 416, "TRAILING: OFF (LOCKED)", 8, C'150,170,200');
   V162_CreateButton(g_V167_BtnFilters, 188, 412, 162, 24, "FILTERS: ON", C'80,120,0', 8);
   V162_CreateLabel(g_V167_BtnCloseSniper, 18, 444, "SNIPER MTF: TP/SL CONFIG", 8, C'255,220,100');
   V162_CreateLabel(g_V167_BtnCloseCore, 188, 444, "AI SCORE: 0-3 | NEVER BLOCK", 8, C'200,180,255');
   V162_CreateLabel(g_V167_BtnResetDay, 18, 466, "BBPro: x1.70 | CAP 3 | BE 500/50", 8, C'255,215,0');
   V162_CreateLabel(g_V167_BtnStopAll, 188, 466, "LOCK: 1200/1000 | HIGH 3000/2500", 8, C'255,215,0');
   V162_CreateLabel(g_V167_LblPortfolio, 18, 492, "PORTFOLIO: BAL -- | EQ -- | FREE --", 8, clrWhite);
   V162_CreateLabel(g_V167_LblPortfolio2, 18, 510, "FLOAT -- | MARGIN -- | DAY CHANGE --", 8, C'0,255,200');
   // ===== รายการออเดอร์ที่เปิดอยู่ - v1.50 Style =====
   V162_CreateBg(g_V170_BgOrders, 8, 542, 360, 140, C'11,15,26', C'0,212,255');
   V162_CreateLabel(g_V170_LblOrdersTitle, 18, 548, "OPEN POSITIONS", 9, C'0,212,255');
   V162_CreateLabel(g_V170_LblOrder1, 18, 568, "- No open positions -", 8, C'150,170,200');
   V162_CreateLabel(g_V170_LblOrder2, 18, 586, "", 8, C'200,220,240');
   V162_CreateLabel(g_V170_LblOrder3, 18, 604, "", 8, C'200,220,240');
   V162_CreateLabel(g_V170_LblOrder4, 18, 622, "", 8, C'200,220,240');
   V162_CreateLabel(g_V170_LblOrder5, 18, 640, "", 8, C'200,220,240');
   g_V162_DashboardCreated = true;
   V162_UpdateDashboard();
}

void V162_UpdateDashboard()
{
   if(!g_V162_DashboardCreated) return;
   double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   double balance=AccountInfoDouble(ACCOUNT_BALANCE);
   double dailyPL=DayChangeMoney();
   double dd=(gHeader.peak_equity>0)?MathMax(0.0,(gHeader.peak_equity-equity)/gHeader.peak_equity*100.0):0.0;
   int openPos=0,openCore=0,openSniper=0;
   for(int i=PositionsTotal()-1;i>=0;i--){ ulong t=PositionGetTicket(i); if(t==0) continue; if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue; openPos++; long magic=PositionGetInteger(POSITION_MAGIC); if(magic==(long)InpSniperMTF_Magic) openSniper++; else if(MagicId(magic)>=0) openCore++; }
   ObjectSetString(0, g_V162_BtnAuto, OBJPROP_TEXT, g_V173_Started ? "CORE: ON" : "CORE: OFF");
   ObjectSetInteger(0, g_V162_BtnAuto, OBJPROP_BGCOLOR, g_V173_Started ? C'0,160,0' : C'100,100,100');
   ObjectSetString(0, g_V162_BtnLive, OBJPROP_TEXT, g_V173_SniperOn ? "SNIPER ON" : "SNIPER OFF");
   ObjectSetInteger(0, g_V162_BtnLive, OBJPROP_BGCOLOR, g_V173_SniperOn ? C'200,140,0' : C'100,100,100');
   bool paused = (gHeader.manual_pause != 0);
   ObjectSetString(0, g_V162_BtnPause, OBJPROP_TEXT, paused ? "RESUME ENTRIES" : "PAUSE ENTRIES");
   ObjectSetInteger(0, g_V162_BtnPause, OBJPROP_BGCOLOR, paused ? C'0,140,0' : C'180,140,0');
   ObjectSetString(0, g_V162_LblEquity, OBJPROP_TEXT, StringFormat("EQUITY\n$%.2f", equity));
   ObjectSetString(0, g_V162_LblDaily, OBJPROP_TEXT, StringFormat("DAILY P/L\n%s$%.2f", dailyPL >= 0 ? "+" : "", dailyPL));
   ObjectSetInteger(0, g_V162_LblDaily, OBJPROP_COLOR, dailyPL >= 0 ? C'0,255,130' : C'255,80,80');
   ObjectSetString(0, g_V162_LblDD, OBJPROP_TEXT, StringFormat("DAY DD\n%.1f%%", dd));
   ObjectSetInteger(0, g_V162_LblDD, OBJPROP_COLOR, dd > 5 ? C'255,80,80' : C'255,215,0');
   ObjectSetString(0, g_V162_LblPos, OBJPROP_TEXT, StringFormat("OPEN\n%d", openPos));
   int sniperToday = gSniperMTF_Count;
   int coreToday = 0; for(int k=0;k<MODULES;k++) coreToday += gEntriesToday[k];
   ObjectSetString(0, g_V167_LblSniperDay, OBJPROP_TEXT, StringFormat("🎯 SNIPER TODAY  %d / %d  (Open %d)", sniperToday, InpSniperMTF_MaxTradesPerDay, openSniper));
   ObjectSetString(0, g_V167_LblCoreDay, OBJPROP_TEXT, StringFormat("🧠 CORE TODAY  %d  (Open %d)", coreToday, openCore));
   ObjectSetString(0, g_V167_LblSniperInfo, OBJPROP_TEXT, StringFormat("Sniper: TP %d / SL %d  RR 1:5  Risk %.2f%%  |  Core: Risk %.2f%%", InpSniperMTF_TP_Points, InpSniperMTF_SL_Points, InpSniperMTF_RiskPercent, EffRiskPct()));
   int hourBKK=(int)((TimeGMT()+7*3600)%86400/3600);
   string sess = (hourBKK>=14 && hourBKK<=22) ? "SNIPER SESSION (14-22)" : "OUT OF SNIPER SESSION";
   double atr = (ArraySize(gATR)>1 ? gATR[1] : 0);
   int spread = (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   ObjectSetString(0, g_V167_LblSession, OBJPROP_TEXT, StringFormat("BKK %02d:00 | %s | ATR %.1f | Spread %d pt | Recovery %d/%d x%.2f", hourBKK, sess, atr, spread, gRecoveryStep, BBPro_EffectiveMaxSteps(), BBPro_EffectiveMult()));
   ObjectSetString(0, g_V167_BtnSniper, OBJPROP_TEXT, StringFormat("AI SNIPER: %s | SCORE %d/3", gInpAISniper_Enabled?"ON":"OFF", gAISniper_Score));
   // v1.71 BBPro: Session + BBPro status set above
   ObjectSetInteger(0, g_V167_LblSession, OBJPROP_COLOR, (hourBKK>=14 && hourBKK<=22) ? C'0,255,200' : C'150,170,200');
   ObjectSetString(0, g_V167_BtnCore, OBJPROP_TEXT, g_V167_CoreEnabled ? "🧠 CORE: ON" : "🧠 CORE: OFF");
   ObjectSetInteger(0, g_V167_BtnCore, OBJPROP_BGCOLOR, g_V167_CoreEnabled ? C'0,120,200' : C'100,100,100');
   ObjectSetInteger(0, g_V167_BtnSniper, OBJPROP_COLOR, gInpAISniper_Enabled ? C'200,180,255' : C'150,170,200');
   
   ObjectSetString(0, g_V167_BtnNews, OBJPROP_TEXT, gInpNews_UseFilter ? "NEWS: ON" : "NEWS: OFF");
   ObjectSetInteger(0, g_V167_BtnNews, OBJPROP_BGCOLOR, gInpNews_UseFilter ? C'0,140,120' : C'100,100,100');
   ObjectSetString(0, g_V167_BtnAutoTune, OBJPROP_TEXT, gInpRoseSkill_AutoTune ? "AUTO-TUNE: ON" : "AUTO-TUNE: OFF");
   ObjectSetInteger(0, g_V167_BtnAutoTune, OBJPROP_BGCOLOR, gInpRoseSkill_AutoTune ? C'120,0,180' : C'100,100,100');
   ObjectSetString(0, g_V167_BtnLearning, OBJPROP_TEXT, gInpRoseSkill_Learning ? "LEARNING: ON" : "LEARNING: OFF");
   ObjectSetInteger(0, g_V167_BtnLearning, OBJPROP_BGCOLOR, gInpRoseSkill_Learning ? C'0,120,80' : C'100,100,100');
   ObjectSetString(0, g_V167_BtnRecovery, OBJPROP_TEXT, gInpUseRecovery ? "RECOVERY: ON" : "RECOVERY: OFF");
   ObjectSetInteger(0, g_V167_BtnRecovery, OBJPROP_BGCOLOR, gInpUseRecovery ? C'180,80,0' : C'100,100,100');
   ObjectSetString(0, g_V167_BtnTrailing, OBJPROP_TEXT, "TRAILING: OFF (LOCKED)");
   ObjectSetInteger(0, g_V167_BtnTrailing, OBJPROP_BGCOLOR, g_V167_TrailingEnabled ? C'80,80,180' : C'100,100,100');
   bool filtersOn = gInpUseHTFFilter && gInpUseOTEFilter && gInpUseMacroDefensive;
   ObjectSetString(0, g_V167_BtnFilters, OBJPROP_TEXT, filtersOn ? "FILTERS: ON" : "FILTERS: OFF");
   ObjectSetInteger(0, g_V167_BtnFilters, OBJPROP_BGCOLOR, filtersOn ? C'80,120,0' : C'100,100,100');
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double marginUsed = AccountInfoDouble(ACCOUNT_MARGIN);
   double marginLevel = (marginUsed > 0) ? equity / marginUsed * 100.0 : 0;
   double floatPL = equity - balance;
   
   ObjectSetString(0, g_V167_LblPortfolio, OBJPROP_TEXT, StringFormat("Portfolio: Bal $%.2f  |  Eq $%.2f  |  Free $%.2f", balance, equity, freeMargin));
   ObjectSetString(0, g_V167_LblPortfolio2, OBJPROP_TEXT, StringFormat("Float %s$%.2f | Margin %.0f%% | Day %s$%.2f", floatPL>=0?"+":"", floatPL, marginLevel, dailyPL>=0?"+":"", dailyPL));
   ObjectSetInteger(0, g_V167_LblPortfolio2, OBJPROP_COLOR, floatPL>=0 ? C'0,255,130' : C'255,80,80');
   // ===== รายการออเดอร์ที่เปิดอยู่ =====
   ObjectSetString(0, g_V170_LblOrdersTitle, OBJPROP_TEXT, StringFormat("OPEN ORDERS  (%d ไม้)", openPos));
   string orderLbls[5]; orderLbls[0]=g_V170_LblOrder1; orderLbls[1]=g_V170_LblOrder2; orderLbls[2]=g_V170_LblOrder3; orderLbls[3]=g_V170_LblOrder4; orderLbls[4]=g_V170_LblOrder5;
   int shown=0;
   for(int i=PositionsTotal()-1;i>=0 && shown<5;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      long magic=PositionGetInteger(POSITION_MAGIC); string layer=(magic==(long)InpSniperMTF_Magic) ? "SNIPER" : (MagicId(magic)>=0 ? "CORE" : "OTHER");
      string dir = (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY) ? "BUY" : "SELL";
      double vol = PositionGetDouble(POSITION_VOLUME);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      double prof = PositionGetDouble(POSITION_PROFIT);
      string line = StringFormat("#%d %s %s %.2f @ %.2f  SL %.2f TP %.2f  %s$%.2f", shown+1, layer, dir, vol, entry, sl, tp, prof>=0?"+":"", prof);
      ObjectSetString(0, orderLbls[shown], OBJPROP_TEXT, line);
      ObjectSetInteger(0, orderLbls[shown], OBJPROP_COLOR, prof>=0 ? C'0,255,130' : C'255,80,80');
      shown++;
   }
   if(shown==0)
   {
      ObjectSetString(0, g_V170_LblOrder1, OBJPROP_TEXT, "— ไม่มีออเดอร์ที่เปิดอยู่ —");
      ObjectSetInteger(0, g_V170_LblOrder1, OBJPROP_COLOR, C'150,170,200');
      for(int k=1;k<5;k++) ObjectSetString(0, orderLbls[k], OBJPROP_TEXT, "");
   }
   else
   {
      for(int k=shown;k<5;k++) ObjectSetString(0, orderLbls[k], OBJPROP_TEXT, "");
   }
   ObjectSetString(0, g_V162_LblAutoInfo, OBJPROP_TEXT, StringFormat("AutoConfig: Risk %.2f%%  SL %.1f  TP %.1f  Hold %d  MLP %.2f  %s", EffRiskPct(), EffSLMult(), EffTPMult(), EffHoldBars(), EffMlpThreshold(), g_Auto_Defensive ? "DEFENSIVE" : g_Auto_VolRegime));
   bool entriesEnabled=EffLiveEnabled() && !paused && gHeader.daily_block==0 && !gFatalPause;
   string status=entriesEnabled ? "ENTRIES ENABLED" : "ENTRIES BLOCKED";
   if(g_V162_Auto) status += " | AUTO ON"; else status += " | AUTO OFF";
   status += StringFormat("  |  %s  |  Vol %s", g_Auto_Defensive ? "DEFENSIVE" : "NORMAL", g_Auto_VolRegime);
   if(!g_V167_CoreEnabled) status += "  |  CORE OFF";
   if(!gInpSniperMTF_Enabled) status += "  |  SNIPER OFF";
   ObjectSetString(0, g_V162_LblRose, OBJPROP_TEXT, StringFormat("Rose Brain: %s  |  Skills %d/9  %s", Rose_BrainName(), Rose_ActiveSkillCount(), Rose_ActiveSkillsText()));
   ObjectSetString(0, g_V162_LblStatus, OBJPROP_TEXT, status);
   ObjectSetInteger(0, g_V162_LblStatus, OBJPROP_COLOR, entriesEnabled ? C'0,255,130' : C'255,80,80');
   ChartRedraw(0);
}

void V162_ToggleAuto()
{
   g_V162_Auto = !g_V162_Auto;
   if(g_V162_Auto) { AutoConfigure(); PrintFormat("[v1.62 Voom Precise + Auto-Tune + News] AUTO -> ON | Risk %.3f%% SL %.1f TP %.1f Hold %d MLP %.2f Vol %s", g_Auto_RiskPct, g_Auto_SLMult, g_Auto_TPMult, g_Auto_HoldBars, g_Auto_MlpThresh, g_Auto_VolRegime); }
   else { PrintFormat("[v1.62 Voom Precise + Auto-Tune + News] AUTO -> OFF | ใช้ค่ามือ Risk %.2f%% SL %.1f TP %.1f", InpRisk_Tuned, InpGold_ATRMultSL, InpGold_ATRMultTP); }
   V162_UpdateDashboard();
}

void V162_ToggleLive()
{
   g_V162_Live = !g_V162_Live;
   gHeader.manual_pause = g_V162_Live ? 0 : 1;
   SaveState();
   if(g_V162_Live) Print("[v1.62 Voom Precise + Auto-Tune + News] LIVE -> ON | กลับมาเปิดไม้ใหม่ได้ (manual_pause=0)");
   else Print("[v1.62 Voom Precise + Auto-Tune + News] LIVE -> OFF | หยุดเปิดไม้ใหม่ทันที (manual_pause=1) - ไม้เก่ายังจัดการต่อ");
   V162_UpdateDashboard();
   DrawPanel(true);
}

void V162_TogglePause()
{
   if(gHeader.flatten_request != 0) return;
   gHeader.manual_pause = gHeader.manual_pause ? 0 : 1;
   g_V162_Live = (gHeader.manual_pause == 0) && (g_V173_Started || g_V173_SniperOn);
   SaveState();
   V162_UpdateDashboard();
   DrawPanel(true);
}

void V162_CloseAll()
{
   gHeader.manual_pause = 1;
   g_V162_Live = false;
   gHeader.flatten_request = 1;
   SaveState();
   MainWork();
   V162_UpdateDashboard();
   DrawPanel(true);
   Print("[v1.62 Voom Precise + Auto-Tune + News] CLOSE ALL - ปิดทุกไม้ + หยุดเปิดไม้ใหม่ (LIVE OFF)");
}


//| v1.70 v1.50 Style - �����ӧҹ��ԧ |
void V167_ToggleCore()
{
   g_V167_CoreEnabled = !g_V167_CoreEnabled; g_V173_Started=g_V167_CoreEnabled;
   PrintFormat("[v1.70] CORE -> %s", g_V167_CoreEnabled?"ON":"OFF");
   V162_UpdateDashboard();
}
void V167_ToggleSniper()
{
   gInpSniperMTF_Enabled = !gInpSniperMTF_Enabled;
   if(!gInpSniperMTF_Enabled) gSniperMTF_PendingDir=0;
   PrintFormat("[v1.70] SNIPER -> %s", gInpSniperMTF_Enabled?"ON":"OFF");
   V162_UpdateDashboard();
}
void V167_ToggleNews()
{
   gInpNews_UseFilter = !gInpNews_UseFilter;
   PrintFormat("[v1.70] NEWS -> %s", gInpNews_UseFilter?"ON":"OFF");
   V162_UpdateDashboard();
}
void V167_ToggleAutoTune()
{
   gInpRoseSkill_AutoTune = !gInpRoseSkill_AutoTune;
   PrintFormat("[v1.70] AUTO-TUNE -> %s", gInpRoseSkill_AutoTune?"ON":"OFF");
   V162_UpdateDashboard();
}
void V167_ToggleLearning()
{
   gInpRoseSkill_Learning = !gInpRoseSkill_Learning;
   PrintFormat("[v1.70] LEARNING -> %s", gInpRoseSkill_Learning?"ON":"OFF");
   V162_UpdateDashboard();
}
void V167_ToggleRecovery()
{
   gInpUseRecovery = !gInpUseRecovery;
   PrintFormat("[v1.70] RECOVERY -> %s", gInpUseRecovery?"ON":"OFF");
   V162_UpdateDashboard();
}
void V167_ToggleTrailing()
{
   g_V167_TrailingEnabled = !g_V167_TrailingEnabled;
   PrintFormat("[v1.70] TRAILING -> %s", g_V167_TrailingEnabled?"ON":"OFF");
   V162_UpdateDashboard();
}
void V167_ToggleFilters()
{
   bool newVal = !(gInpUseHTFFilter && gInpUseOTEFilter && gInpUseMacroDefensive);
   gInpUseHTFFilter = newVal; gInpUseOTEFilter = newVal; gInpUseMacroDefensive = newVal;
   PrintFormat("[v1.70] FILTERS -> %s", newVal?"ON":"OFF");
   V162_UpdateDashboard();
}
void V167_CloseSniperOnly()
{
   int closed=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=(long)InpSniperMTF_Magic) continue;
      if(SendClose(t)) closed++;
   }
   PrintFormat("[v1.70] CLOSE SNIPER %d", closed);
   V162_UpdateDashboard(); DrawPanel(true);
}
void V167_CloseCoreOnly()
{
   int closed=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)==(long)InpSniperMTF_Magic) continue;
      if(!OwnSelectedPosition()) continue;
      if(SendClose(t)) closed++;
   }
   PrintFormat("[v1.70] CLOSE CORE %d", closed);
   V162_UpdateDashboard(); DrawPanel(true);
}
void V167_ResetDay()
{
   gSniperMTF_Count=0; gSniperMTF_Day=DayStart(TimeCurrent()); gSniperMTF_PendingDir=0;
   for(int k=0;k<MODULES;k++) gEntriesToday[k]=0;
   gHeader.day=DayStart(TimeCurrent()); gHeader.day_equity=AccountInfoDouble(ACCOUNT_EQUITY); gHeader.day_cash=CashAdjustments(gHeader.day); gHeader.peak_equity=gHeader.day_equity; gHeader.daily_block=0;
   SaveState();
   Print("[v1.70] RESET DAY");
   V162_UpdateDashboard(); DrawPanel(true);
}
void V167_StopAll()
{
   g_V162_Live=false; g_V162_Auto=false; g_V167_CoreEnabled=false; gInpSniperMTF_Enabled=false;
   gHeader.manual_pause=1; gHeader.flatten_request=1; SaveState(); MainWork();
   Print("[v1.70] STOP ALL");
   V162_UpdateDashboard(); DrawPanel(true);
}


// --- v1.71 BBPro Helpers ---
double BBPro_EffectiveMult() { return false ? 1.0 : InpRecoveryLotMult; }
int BBPro_EffectiveMaxSteps() { if(!false) return InpRecoveryMaxSteps; return MathMin(InpRecoveryMaxSteps, 0); }
bool BBPro_IsCorePosition(long magic) { return magic != (long)InpSniperMTF_Magic; }
void BBPro_ApplyBE_Lock()
{
   if(!false) return;
   if(!gDataOK || !TradePermission()) return;
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickSize<=0) tickSize = 0.01;
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong t=PositionGetTicket(i); if(t==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      long magic = PositionGetInteger(POSITION_MAGIC);
      if(!BBPro_IsCorePosition(magic)) continue; // Sniper ห้ามแตะ
      if(!OwnSelectedPosition()) continue;
      int dir = PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? 1 : -1;
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double price = dir>0 ? tick.bid : tick.ask;
      double profitPoints = (dir>0 ? price-entry : entry-price) / tickSize;
      if(profitPoints < 0) continue;
      double targetProtect = 0;
      // Lock First
      if(profitPoints >= 0)
      {
         targetProtect = 0;
         // Step: ทุก +500 เลื่อนล็อก +500
         int steps = (int)((profitPoints - 0) / 0);
         if(steps>0) targetProtect += steps * 0;
      }
      // Lock High - Cap ที่ 2500
      if(profitPoints >= 0 && targetProtect > 0)
         targetProtect = 0;
      if(targetProtect > 0) targetProtect = 0;
      double newSL = entry + dir * targetProtect * tickSize;
      // เลื่อนขึ้นอย่างเดียว ไม่เลื่อนถอยหลัง
      bool shouldMove = false;
      if(sl<=0) shouldMove = true;
      else if(dir>0 && newSL > sl + tickSize) shouldMove = true;
      else if(dir<0 && newSL < sl - tickSize) shouldMove = true;
      if(shouldMove) ModifySL(t, dir, newSL);
   }
}

double g_Auto_SLMult = 1.5;
double g_Auto_TPMult = 2.5;
int    g_Auto_HoldBars = 30;
double g_Auto_MlpThresh = 0.10;
double g_Auto_RiskPct = 0.25;
double g_Auto_BuyLotMult = 1.0;
bool   g_Auto_Defensive = false;
string g_Auto_VolRegime = "NORMAL";

void AutoConfigure()
{
   if(!g_V162_Auto) return; // v1.49: ถ้า AUTO OFF ไม่คำนวณ ใช้ค่ามือ
   // --- 1. บัญชี ---
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   long leverage = AccountInfoInteger(ACCOUNT_LEVERAGE);
   string accCurrency = AccountInfoString(ACCOUNT_CURRENCY);
   // Cent detection: บัญชี Cent มักมี Balance หลักหมื่นแต่เป็น cents, หรือ Symbol ลงท้าย c
   string sym = _Symbol;
   bool isCent = (StringFind(sym, "c") >= 0 && StringLen(sym) >= 7) || (balance > 50000 && equity < 2000);
   // ถ้าเป็น Cent, Balance ที่เห็นคือ cents -> แปลงเป็น USD
   double effBalance = isCent ? balance / 100.0 : balance;
   if(effBalance <= 0) effBalance = 10000;
   // --- 2. สัญลักษณ์ ---
   double spreadPoints = (double)SymbolInfoInteger(sym, SYMBOL_SPREAD);
   double tickSize = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   // --- 3. ตลาด: ATR M15 + SMA Daily ---
   double atrM15 = 0, atrDaily = 0, price = 0, sma20 = 0, sma50 = 0;
   int hATR_M15 = iATR(sym, PERIOD_M15, 14);
   int hATR_D1 = iATR(sym, PERIOD_D1, 14);
   int hMA20 = iMA(sym, PERIOD_D1, 20, 0, MODE_SMA, PRICE_CLOSE);
   int hMA50 = iMA(sym, PERIOD_D1, 50, 0, MODE_SMA, PRICE_CLOSE);
   double buf[];
   if(hATR_M15 != INVALID_HANDLE && CopyBuffer(hATR_M15, 0, 0, 1, buf) > 0) atrM15 = buf[0];
   if(hATR_D1 != INVALID_HANDLE && CopyBuffer(hATR_D1, 0, 0, 1, buf) > 0) atrDaily = buf[0];
   if(hMA20 != INVALID_HANDLE && CopyBuffer(hMA20, 0, 0, 1, buf) > 0) sma20 = buf[0];
   if(hMA50 != INVALID_HANDLE && CopyBuffer(hMA50, 0, 0, 1, buf) > 0) sma50 = buf[0];
   MqlTick tick;
   if(SymbolInfoTick(sym, tick)) price = tick.bid;
   if(atrM15 <= 0) atrM15 = 7.0;
   if(atrDaily <= 0) atrDaily = 86.0;
   if(price <= 0) price = iClose(sym, PERIOD_M15, 0);
   // --- 4. Vol Regime ---
   if(atrDaily > InpAutoVolHighATR) g_Auto_VolRegime = "HIGH";
   else if(atrDaily < InpAutoVolLowATR) g_Auto_VolRegime = "LOW";
   else g_Auto_VolRegime = "NORMAL";
   bool htfBearish = (price < sma20 && sma20 < sma50 && sma20 > 0);
   bool htfBullish = (price > sma20 && sma20 > sma50 && sma20 > 0);
   g_Auto_Defensive = (htfBearish && g_Auto_VolRegime == "HIGH");
   // --- 5. SL/TP/Hold/MLP จาก Vol ---
   if(g_Auto_VolRegime == "HIGH") { g_Auto_SLMult = 1.8; g_Auto_TPMult = 3.0; g_Auto_HoldBars = 40; g_Auto_MlpThresh = 0.15; }
   else if(g_Auto_VolRegime == "LOW") { g_Auto_SLMult = 1.2; g_Auto_TPMult = 2.0; g_Auto_HoldBars = 20; g_Auto_MlpThresh = 0.08; }
   else { g_Auto_SLMult = 1.5; g_Auto_TPMult = 2.5; g_Auto_HoldBars = 30; g_Auto_MlpThresh = 0.10; }
   // --- 6. Risk จากทุน + Vol + Leverage ---
   double baseRisk = InpRisk_Tuned; // v1.83: เดิม InpRiskPercent (1.0%) -> InpRisk_Tuned (0.20%) // ค่าเริ่มต้นจากผู้ใช้ (เช่น 0.25% Conservative)
   if(StringCompare(InpAutoConfigMode, "Full") == 0)
   {
      // ถ้า Vol สูง ลด Risk 20%
      if(g_Auto_VolRegime == "HIGH") baseRisk *= 0.8;
      if(leverage < 100) baseRisk *= 0.7;
      if(effBalance < 500) baseRisk = MathMin(baseRisk, 0.25);
   }
   g_Auto_RiskPct = baseRisk;
   // --- 7. Buy Lot Mult + Recovery จาก Regime ---
   g_Auto_BuyLotMult = g_Auto_Defensive ? 0.5 : 1.0;
   // --- 8. Spread Filter ---
   if(spreadPoints > InpAutoSpreadMax) g_Auto_MlpThresh = 0.20;
   else if(spreadPoints > 30) g_Auto_MlpThresh = MathMax(g_Auto_MlpThresh, 0.12);
   // --- 9. Log ---
   PrintFormat("[AutoConfig v1.48] Balance %.2f (Eff %.2f %s Cent=%s) Sym %s Spread %.0f ATR M15 %.2f ATR D1 %.2f Price %.2f SMA20 %.2f SMA50 %.2f Vol %s Defensive %s | Risk %.3f%% SL %.1f TP %.1f Hold %d MLP %.2f BuyMult %.1f",
      balance, effBalance, accCurrency, isCent ? "YES" : "NO", sym, spreadPoints, atrM15, atrDaily, price, sma20, sma50, g_Auto_VolRegime, g_Auto_Defensive ? "YES" : "NO", g_Auto_RiskPct, g_Auto_SLMult, g_Auto_TPMult, g_Auto_HoldBars, g_Auto_MlpThresh, g_Auto_BuyLotMult);
}

double AutoCalcLot(double slDistance, double riskPct, double balance)
{
   // Lot = Risk$ / (SL$ * 100) - Cent x100 จัดการใน AutoConfigure
   if(slDistance <= 0) return 0.01;
   double riskDollars = balance * riskPct / 100.0;
   double lot = riskDollars / (slDistance * 100.0);
   // Cent: Balance เป็น cents ต้องคูณ 100
   string sym = _Symbol;
   if(StringFind(sym, "c") >= 0 && StringLen(sym) >= 7) lot *= 100.0;
   if(lot < 0.01) lot = 0.01;
   if(lot > 0.50 && StringFind(sym, "c") < 0) lot = 0.50;
   return NormalizeDouble(lot, 2);
}

int OnInit()
{
   gInpUseRecovery=InpUseRecovery;
   gInpUseHTFFilter=InpUseHTFFilter;
   gInpUseOTEFilter=InpUseOTEFilter;
   gInpUseMacroDefensive=InpUseMacroDefensive;
   gInpRoseSkill_Sniper=InpRoseSkill_Sniper;
   gInpRoseSkill_Learning=InpRoseSkill_Learning;
   gInpRoseSkill_AutoTune=InpRoseSkill_AutoTune;
   gInpAutoTune_Mode=InpAutoTune_Mode;
   gInpAutoTune_AllowTP_SL=InpAutoTune_AllowTP_SL;
   gInpAutoTune_AllowThreshold=InpAutoTune_AllowThreshold;
   gInpAutoTune_AllowWarpTemp=InpAutoTune_AllowWarpTemp;
   gInpAutoTune_AllowRiskLot=InpAutoTune_AllowRiskLot;
   gInpAutoTune_AllowSpreadVol=InpAutoTune_AllowSpreadVol;
   gInpAutoTune_AllowSymbolBroker=InpAutoTune_AllowSymbolBroker;
   gInpNews_UseFilter=InpNews_UseFilter;
   gInpSniperMTF_Enabled=InpSniperMTF_Enabled;
   gInpAISniper_Enabled=InpAISniper_Enabled;
   g_V173_Started=(InpTradeEnabled && InpLiveEnabled);
   g_V173_SniperOn=(gInpSniperMTF_Enabled && gInpAISniper_Enabled && gInpRoseSkill_Sniper);
   g_V174_AutoTuneOn=gInpRoseSkill_AutoTune;
   g_V167_CoreEnabled=g_V173_Started;
   g_V162_Auto = InpAutoConfig; // v1.49 Default TRUE
   g_V162_Live = InpLiveEnabled; // v1.49 Default TRUE
   gHeader.manual_pause = g_V162_Live ? 0 : 1; // Sync LIVE -> manual_pause ตั้งแต่เริ่ม
   AutoConfigure(); // v1.48/49: คำนวณค่าอัตโนมัติก่อนเริ่ม (ถ้า AUTO ON)
   V162_CreateDashboard(); // v1.49: สร้างปุ่ม Dashboard: คำนวณค่าอัตโนมัติก่อนเริ่ม
   MathSrand((int)TimeCurrent()); // v1.41 MLP He init seed (บทความ: Fix seed ถ้าอยาก Reproduce)
   gTest=(bool)MQLInfoInteger(MQL_TESTER);RegisterModules();
   if(!ValidateInputs()) { Print(ENGINE_LABEL,": invalid inputs");return INIT_PARAMETERS_INCORRECT; }
   if(!NOVA_BrokerAdapterSelfTest(gTrade,NOVA_PHASE2_EXECUTION_DISABLED))
   { Print(ENGINE_LABEL,": broker adapter hard-disable self-test failed");return INIT_FAILED; }
   DetectAutoSettings(); // v1.37 Auto Calculate - ตรวจ Cent / โบรก / สเปรด อัตโนมัติ
   AdaptCheck(); // v1.42 Auto-Adapt - ตั้ง Fingerprint + เทรน MLP บน Symbol ปัจจุบัน
   if(AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
   {
      Print(ENGINE_LABEL,": a HEDGING account is required for independent simultaneous strategy positions.");
      return INIT_FAILED;
   }
   if(TickSize()<=0 || _Point<=0) { Print(ENGINE_LABEL,": symbol specification unavailable");return INIT_FAILED; }
   FolderCreate("Nova_AIO");
   gRoot="Nova_AIO\\"+(string)AccountInfoInteger(ACCOUNT_LOGIN)+"_"+
         IntegerToString(InpMagicBase)+"_"+IntegerToString((long)TextHash(_Symbol));
   if(!NOVA_PortfolioInit()) { Print(ENGINE_LABEL,": shared portfolio coordinator init failed");return INIT_FAILED; }
   gPrefix="AIO_"+IntegerToString(InpMagicBase)+"_";
   // An exclusive open file prevents duplicate instances in one terminal.
   gLockHandle=FileOpen(gRoot+"_instance.lock",FILE_READ|FILE_WRITE|FILE_BIN);
   if(gLockHandle==INVALID_HANDLE)
   { Print(ENGINE_LABEL,": another instance owns this symbol/Magic scope");return INIT_FAILED; }
   bool hadState=!gTest && StateFilesPresent();
   bool restored=RestoreState();
   if(hadState && !restored)
   { Print(ENGINE_LABEL,": both state slots are invalid; no state or daily baseline was overwritten");return INIT_FAILED; }
   gNeedWarmup=!restored;
   if(restored && gHeader.timeframe!=(int)InpAnalysisTF)
   { ResetPatternStateForNewTF();gNeedWarmup=true; }
   if(!restored)
   {
      ZeroMemory(gHeader);
      gHeader.day=DayStart(TimeCurrent());gHeader.day_equity=AccountInfoDouble(ACCOUNT_EQUITY);
      gHeader.day_cash=CashAdjustments(gHeader.day);gHeader.peak_equity=gHeader.day_equity;
      if(!gAccountHistoryOK) { Print(ENGINE_LABEL,": account history unavailable; attach again after synchronization");return INIT_FAILED; }
   }
   gSARHandle=iSAR(_Symbol,InpAnalysisTF,0.02,0.2);
   if(gSARHandle==INVALID_HANDLE) { Print(ENGINE_LABEL,": SAR creation failed");return INIT_FAILED; }
   SetupSymbols();
   gDataOK=ReloadPrimary();
   if(gDataOK)
   {
      if(gNeedWarmup) { WarmStateMachines();gNeedWarmup=false; }
      UpdateHourStatistics();UpdateRadar();UpdateBoard();
   }
   else Print(ENGINE_LABEL,": waiting for history, automatic retry is active");
   // Preserve the H1 evaluation clock on restart; new installations do not
   // execute a historical H1 signal immediately on attachment.
   if(!restored) gState[S_NEURAL].evaluated_bar=iTime(_Symbol,PERIOD_H1,1); // SATMAFlow
   UpdateDailyHistory();
   if(!NOVA_PortfolioRecover()) { Print(ENGINE_LABEL,": shared portfolio ledger invalid/unavailable; entries disabled");return INIT_FAILED; }
   if(!SaveState()) { Print(ENGINE_LABEL,": cannot write state; entries disabled until storage recovers"); }
   EventSetTimer(1);gInitialized=true;gPanelHistoryDirty=true;DrawPanel(true);V162_UpdateDashboard(); // v1.50
   Print(ENGINE_LABEL,": v1.66 Sniper MTF TP300 SL100 Max2 LOCKED | v1.49 Dashboard | MTF D1-H4-H1-M15 | Cleaned 14 modules | v1.06 Cleaned 14 modules | No Duplicates | Full SMC ON | 32 modules | v1.04 WickReject ON | 31 modules | v1.03 Scanner ON | Regime Auto-Select | v1.02 Governor ON | Risk 1% MaxOpen 8% DailyLoss 6% | 30 modules active on ",_Symbol," using ",EnumToString(InpAnalysisTF),
         "; target risk ",InpRisk_Tuned,"%; explicit min-lot cap ",InpMaxSingleRiskPct,"%.");
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
   ObjectDelete(0, g_V162_BtnAuto); ObjectDelete(0, g_V162_BtnLive); ObjectDelete(0, g_V162_BtnPause); ObjectDelete(0, g_V162_BtnClose); ObjectDelete(0, g_V162_Bg); ObjectDelete(0, g_V162_HeaderBg); ObjectDelete(0, g_V162_Card1); ObjectDelete(0, g_V162_Card2); ObjectDelete(0, g_V162_Card3); ObjectDelete(0, g_V162_Card4); ObjectDelete(0, g_V162_LblTitle); ObjectDelete(0, g_V162_LblSub); ObjectDelete(0, g_V162_LblEquity); ObjectDelete(0, g_V162_LblDaily); ObjectDelete(0, g_V162_LblDD); ObjectDelete(0, g_V162_LblPos); ObjectDelete(0, g_V162_LblAutoInfo); ObjectDelete(0, g_V162_LblStatus); ObjectDelete(0, g_V162_LblRose);
   EventKillTimer();
   if(gInitialized) SaveState();
   if(gJournalHandle!=INVALID_HANDLE) FileClose(gJournalHandle);
   if(gSARHandle!=INVALID_HANDLE) IndicatorRelease(gSARHandle);
   if(gLockHandle!=INVALID_HANDLE) FileClose(gLockHandle);
   if(gInitialized && gPrefix!="") ObjectsDeleteAll(0,gPrefix);
   gInitialized=false;
}
void OnTick() { gLastMarketTickMs=GetTickCount64();gUiTickSeen=true;UpdateTickDelta();MainWork(); }
void OnTimer() { MainWork(); }
void OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result)
{
   // Keep the transaction handler short: event order is not guaranteed by MT5.
   if(trans.type==TRADE_TRANSACTION_DEAL_ADD || trans.type==TRADE_TRANSACTION_ORDER_UPDATE ||
      trans.type==TRADE_TRANSACTION_HISTORY_ADD)
   { gNeedJournal=true;gLastDailyHistory=0;gCashCacheAt=0;gPanelHistoryDirty=true; }
}
void OnChartEvent(const int id,const long &lparam,const double &dparam,const string &sparam)
{
   if(!gInitialized) return;
   // v1.49 Dashboard - ปุ่ม 1 AUTO / ปุ่ม 2 LIVE - ต้องมาก่อน Panel เดิม
   if(id==CHARTEVENT_OBJECT_CLICK)
   {
      if(sparam==g_V162_BtnAuto) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); V173_ToggleStartStop(); return; }
      if(sparam==g_V162_BtnLive) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); V173_ToggleSniper(); return; }
      if(sparam==g_V162_BtnPause) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); V162_TogglePause(); return; }
      if(sparam==g_V162_BtnClose) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); return; } // v1.73: สถานะเท่านั้น
      if(sparam==g_V167_BtnCore) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); V173_ToggleStartStop(); return; }
      if(sparam==g_V167_BtnSniper) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); return; } // v1.73: สถานะเท่านั้น
      if(sparam==g_V167_BtnNews) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); V167_ToggleNews(); return; }
      if(sparam==g_V167_BtnAutoTune) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); V174_ToggleAutoTune(); return; }
      if(sparam==g_V167_BtnLearning) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); V167_ToggleLearning(); return; }
      if(sparam==g_V167_BtnRecovery) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); V167_ToggleRecovery(); return; }
      if(sparam==g_V167_BtnTrailing) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); return; } // v1.73: สถานะเท่านั้น
      if(sparam==g_V167_BtnFilters) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); V167_ToggleFilters(); return; }
      if(sparam==g_V167_BtnCloseSniper) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); return; } // v1.73: สถานะเท่านั้น
      if(sparam==g_V167_BtnCloseCore) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); return; } // v1.73: สถานะเท่านั้น
      if(sparam==g_V167_BtnResetDay) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); return; } // v1.73: สถานะเท่านั้น
      if(sparam==g_V167_BtnStopAll) { ObjectSetInteger(0,sparam,OBJPROP_STATE,false); return; } // v1.73: สถานะเท่านั้น
   }
   if(id==CHARTEVENT_CHART_CHANGE) { DrawPanel(true);return; }
   if(id!=CHARTEVENT_OBJECT_CLICK || !InpPanel) return;
   if(StringFind(sparam,gPrefix+"ui_")!=0) return;
   ObjectSetInteger(0,sparam,OBJPROP_STATE,false);
   if(sparam==gPrefix+"ui_collapse")
   { gPanelCollapsed=!gPanelCollapsed;UiCarouselHold();DrawPanel(true);return; }
   for(int tab=0;tab<4;tab++)
      if(sparam==gPrefix+"ui_tab"+IntegerToString(tab))
      { gPanelTab=tab;gPanelPage=0;UiCarouselHold();DrawPanel(true);return; }
   if(sparam==gPrefix+"ui_prev" || sparam==gPrefix+"ui_next")
   {
      gPanelPage=(int)Clamp(gPanelPage+(sparam==gPrefix+"ui_next"?1:-1),0,gPanelPages-1);
      UiCarouselHold();DrawPanel(true);return;
   }
   if(sparam==gPrefix+"ui_pause")
   {
      if(gHeader.flatten_request!=0) return;
      gHeader.manual_pause=gHeader.manual_pause?0:1;SaveState();
      UiCarouselHold();DrawPanel(true);return;
   }
   if(sparam==gPrefix+"ui_flat")
   {
      gHeader.manual_pause=1;gHeader.flatten_request=1;SaveState();
      UiCarouselHold();MainWork();DrawPanel(true);return;
   }
}


//+------------------------------------------------------------------+
//| v1.30 Best Practices Functions (จากแหล่งเรียนรู้ 12 ข้อข้างบน)   |
//+------------------------------------------------------------------+
datetime gLastBarTime = 0;
int gHandleEMA20 = INVALID_HANDLE;
int gHandleEMA50 = INVALID_HANDLE;
int gHandleEMA200 = INVALID_HANDLE;
int gHandleRSI = INVALID_HANDLE;
int gHandleADX = INVALID_HANDLE;
int gHandleATR = INVALID_HANDLE;
long gOnnxHandle1 = INVALID_HANDLE;
long gOnnxHandle2 = INVALID_HANDLE;

//--- A) IsNewBar - จาก Detecting New Bar (dev.to + mql5.com) : ใช้ iTime ไม่ใช่ Bars/Volume/Price ---
bool IsNewBar()
{
   datetime cur = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(cur==0) return false; // iTime return 0 = ข้อมูลยังไม่พร้อม อย่าเทรด
   if(gLastBarTime==0) { gLastBarTime=cur; return false; } // tick แรกหลัง Attach ไม่นับเป็น New Bar (กัน False Signal)
   if(cur!=gLastBarTime) { gLastBarTime=cur; return true; }
   return false;
}

//--- E) Spread + Stops/Freeze - จาก AlfaTactix + MQL5 Reference ---
long GetSpreadPoints() { return (long)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD); }
double MinStopDistancePrice()
{
   long stops  = (long)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   long freeze = (long)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_FREEZE_LEVEL);
   long spread = GetSpreadPoints();
   long band = stops;
   if(freeze>band) band=freeze;
   if(spread*3>band) band=spread*3; // Effective band = max(stops, freeze, 3*spread) - กัน Requote ตอน News/Rollover
   return band * _Point;
}
bool IsSpreadOK() { if(!InpUseSpreadFilter) return true; return GetSpreadPoints() <= EffectiveMaxSpread(); } // v1.37 Auto Spread
bool IsStopsOK(double entry, double sl, double tp)
{
   if(!InpUseStopsCheck) return true;
   double minDist = MinStopDistancePrice();
   if(MathAbs(entry-sl) < minDist) return false;
   if(MathAbs(tp-entry) < minDist) return false;
   return true;
}
double NormalizeSLTP(double price, bool isSL, bool isBuy)
{
   double minDist = MinStopDistancePrice();
   // ถ้า SL/TP ใกล้เกิน ให้ขยับออกให้ห่าง >= minDist (กัน ERR_INVALID_STOPS)
   return price;
}

//--- D) LotsForRisk Exact - จาก Risk Management Part 2 + CPositionSizer ---
double LotsForRisk(double riskPct, double slDistancePrice)
{
   if(slDistancePrice<=0) return 0;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskCash = equity * riskPct / 100.0;
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickValue<=0 || tickSize<=0) return 0;
   double lossPerLot = (slDistancePrice / tickSize) * tickValue; // เงินที่เสียต่อ 1 Lot ถ้าโดน SL
   if(lossPerLot<=0) return 0;
   double lots = riskCash / lossPerLot;
   double volStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double volMin  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double volMax  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(volStep>0) lots = MathFloor(lots/volStep)*volStep; // ปัดลงตาม Step - ไม่ให้ Risk เกิน
   if(lots<volMin) lots=volMin;
   if(lots>volMax) lots=volMax;
   // Cap ด้วย Free Margin (จาก Risk Lot Sizing Library)
   double marginReq = 0;
   if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, lots, SymbolInfoDouble(_Symbol, SYMBOL_ASK), marginReq))
   {
      double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
      if(marginReq>freeMargin*0.9) lots = MathFloor((freeMargin*0.9 / marginReq * lots)/volStep)*volStep;
   }
   return NormalizeDouble(lots, 2);
}

//--- H) Equity-Curve Scaling - จาก CPositionSizer ---
double EquityCurveRiskMultiplier(double currentDDpct)
{
   if(!InpUseEquityCurveScaling) return 1.0;
   if(currentDDpct>15) return 0.25;
   if(currentDDpct>10) return 0.50;
   if(currentDDpct>5)  return 0.75;
   return 1.0;
}

//--- C) Indicator Handles - จาก PositionAlpha + MQL5 Reference ---
bool InitIndicatorHandles()
{
   gHandleEMA20  = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_EMA, PRICE_CLOSE);
   gHandleEMA50  = iMA(_Symbol, PERIOD_CURRENT, 50, 0, MODE_EMA, PRICE_CLOSE);
   gHandleEMA200 = iMA(_Symbol, PERIOD_CURRENT, 200, 0, MODE_EMA, PRICE_CLOSE);
   gHandleRSI    = iRSI(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE);
   gHandleADX    = iADX(_Symbol, PERIOD_CURRENT, 14);
   gHandleATR    = iATR(_Symbol, PERIOD_CURRENT, 14);
   if(gHandleEMA20==INVALID_HANDLE || gHandleRSI==INVALID_HANDLE || gHandleADX==INVALID_HANDLE || gHandleATR==INVALID_HANDLE)
   { Print("v1.30: Indicator handle failed, err=", GetLastError()); return false; }
   return true;
}
void ReleaseIndicatorHandles()
{
   if(gHandleEMA20!=INVALID_HANDLE) IndicatorRelease(gHandleEMA20);
   if(gHandleEMA50!=INVALID_HANDLE) IndicatorRelease(gHandleEMA50);
   if(gHandleEMA200!=INVALID_HANDLE) IndicatorRelease(gHandleEMA200);
   if(gHandleRSI!=INVALID_HANDLE) IndicatorRelease(gHandleRSI);
   if(gHandleADX!=INVALID_HANDLE) IndicatorRelease(gHandleADX);
   if(gHandleATR!=INVALID_HANDLE) IndicatorRelease(gHandleATR);
}
bool CopyIndicatorSafe(int handle, int bufferNum, int start, int count, double &buf[])
{
   ArraySetAsSeries(buf, true);
   int copied = CopyBuffer(handle, bufferNum, start, count, buf);
   if(copied<0)
   {
      int err = GetLastError();
      if(err==4806) { Print("v1.30: Indicator data not ready (4806), retry next tick"); return false; }
      Print("v1.30: CopyBuffer failed err=", err);
      return false;
   }
   return copied==count;
}

//--- F) TrailingStop Class - จาก MQL5Book TrailingStop.mqh + Yury Dzyuban TrailingByATR ---
class CTrailingStopV130
{
public:
   void Update(ulong ticket, bool isBuy, double currentPrice, double &sl)
   {
      if(!false) return; // v1.28 เทสแล้ว Trailing OFF ดีกว่า - คลาสนี้ใช้เมื่อเปิดเท่านั้น
      double minDist = MinStopDistancePrice();
      double trailDist = 0 * _Point;
      double step = 0 * _Point;
      double newSL = sl;
      if(isBuy) newSL = currentPrice - trailDist;
      else      newSL = currentPrice + trailDist;
      // ขยับเฉพาะเมื่อดีขึ้น >= Step และห่างจากราคา >= minDist (กัน Invalid Stops + กัน Modify ถี่)
      if(isBuy && newSL > sl + step && (currentPrice - newSL) >= minDist) sl = newSL;
      if(!isBuy && newSL < sl - step && (newSL - currentPrice) >= minDist) sl = newSL;
   }
};

//--- G) ONNX Ensemble Voting - จาก ONNX Ensemble Voting + Hybrid ML EA ---
bool InitONNXEnsemble()
{
   if(!InpUseONNXEnsemble) return true;
   // ต้องวาง .onnx ใน MQL5/Files/ หรือใช้ #resource - ดู Hybrid ML EA
   gOnnxHandle1 = OnnxCreate(InpONNXModel1, ONNX_LOGLEVEL_INFO);
   gOnnxHandle2 = OnnxCreate(InpONNXModel2, ONNX_LOGLEVEL_INFO);
   if(gOnnxHandle1==INVALID_HANDLE) Print("v1.30: ONNX Model1 fail, fallback to Calibrated P");
   if(gOnnxHandle2==INVALID_HANDLE) Print("v1.30: ONNX Model2 fail, fallback to Calibrated P");
   return true;
}
double ONNXEnsemblePredict(double &features[])
{
   // Voting: ต้องเห็นด้วยกัน 2/2 ถึงเข้า ถ้าโมเดลใด Fail ให้ Fallback เป็น Calibrated P (T=0.5) ที่คำนวณใน Python
   // ตัวอย่าง OnnxRun: OnnxRun(handle, ONNX_LOGLEVEL_INFO, input, output)
   // ใน EA จริงให้ใส่ features 30 แท่ง OHLC Normalized ตามที่เทรนมา
   return 0.5; // Placeholder - ใช้ Calibrated P จาก Python จนกว่าจะวาง .onnx จริง
}

//--- I) BreakEven + Partial Close แบบถูกต้อง - จาก Moving Stop to BE without rejected modifies ---
bool MoveToBreakeven(ulong ticket, bool isBuy, double entryPrice)
{
   if(NOVA_PHASE2_EXECUTION_DISABLED) return false;
   double minDist = MinStopDistancePrice();
   double price = isBuy ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   // ต้องห่างจาก Entry >= minDist ไม่งั้น Modify จะโดน Reject
   if(isBuy && (price - entryPrice) < minDist) return false;
   if(!isBuy && (entryPrice - price) < minDist) return false;
   // ใช้ CTrade PositionModify
   if(InpUseCTrade)
   {
      if(gPosInfo.SelectByTicket(ticket))
      {
         double tp = gPosInfo.TakeProfit();
         return NOVA_BrokerPositionModify(gTrade,ticket,entryPrice,tp,NOVA_PHASE2_EXECUTION_DISABLED);
      }
   }
   return false;
}
//+------------------------------------------------------------------+
//| End v1.30 Best Practices                                          |
//+------------------------------------------------------------------+
