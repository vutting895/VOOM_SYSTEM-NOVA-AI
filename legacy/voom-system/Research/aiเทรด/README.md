# VOOM AI Trading Lab — Research-only MVP

โฟลเดอร์นี้แยกจากเส้นทางส่งคำสั่งซื้อขาย MT5 โดยตั้งใจ ระบบนี้สร้างแพ็กเกจกลยุทธ์สำหรับการวิจัยและค้นหาพารามิเตอร์จากข้อมูลย้อนหลังเท่านั้น ไม่มีการเชื่อมต่อ broker, ไม่มีการส่ง/แก้ไข/ปิดออเดอร์ และไม่เปลี่ยนค่า Live Trading ของระบบหลัก

## สิ่งที่ทำได้ในเวอร์ชันนี้

- สร้าง candidate กลยุทธ์จากแม่แบบที่กำหนดไว้ พร้อม SYSTEM.md และ SYSTEM.json
- ทำ offline grid search พารามิเตอร์ EMA/RSI กับไฟล์ OHLCV CSV
- แบ่งข้อมูลตามเวลาเป็น train/holdout เพื่อช่วยตรวจ overfitting ขั้นต้น
- คำนวณผลตอบแทนสุทธิแบบจำลอง, drawdown, จำนวนเทรด และค่าใช้จ่ายแบบ basis points
- เก็บรายงาน, data SHA-256 และ candidate versions ในโฟลเดอร์นี้
- สร้าง customer_catalog.json แต่ candidate ใหม่ทุกตัวเริ่มต้นซ่อนจากลูกค้า

## ใช้งานบน Windows

เปิด PowerShell:

    Set-Location 'C:\Users\Administrator\Documents\Voom_system\Research\aiเทรด'
    python .\lab.py generate --name ema-test-01 --fast 10 --slow 40
    python .\lab.py list

ฝึก/ค้นหาพารามิเตอร์ด้วยไฟล์ข้อมูลที่มีคอลัมน์ timestamp, open, high, low, close:

    python .\lab.py train --csv 'D:\data\XAUUSD_M5.csv' --train-fraction 0.7 --cost-bps 2

ใช้ข้อมูลที่ได้รับอนุญาตเท่านั้น และกำหนด cost-bps ให้เหมาะสมกับสินทรัพย์/โบรกเกอร์ ค่าเริ่มต้น 2 bps ต่อด้านเป็นเพียงสมมติฐาน ไม่ใช่การจำลอง spread, commission, swap, slippage และ contract specifications ของ XM หรือโบรกเกอร์ใดอย่างครบถ้วน

## โครงสร้าง

- candidates/<candidate-id>/SYSTEM.md, SYSTEM.json — กลยุทธ์ที่สร้าง/ปรับพารามิเตอร์
- reports/training_report_*.json — ผลการค้นหาพารามิเตอร์และ holdout
- customer_catalog.json — catalog ภายในพร้อมสถานะ/หลักฐาน
- tests/test_lab.py — offline tests ด้วยข้อมูลสังเคราะห์

## เกณฑ์ความปลอดภัยและการเปิดให้ลูกค้าเลือก

candidate จะไม่ปรากฏให้ลูกค้าเลือกโดยอัตโนมัติ แม้สถานะเป็น backtest_passed ก็ยังไม่เพียงพอ ต้องมีการทดสอบ walk-forward แบบหลายช่วง, ต้นทุนจริงตามสัญลักษณ์, การทดสอบ demo forward, การตรวจ risk, human approval และการเชื่อม catalog กับระบบบัญชี/สิทธิ์ลูกค้าก่อน

customer_catalog.json เป็น catalog ภายในเท่านั้น ไม่ใช่ API หรือหน้า dashboard ที่เชื่อมบัญชีลูกค้าแล้ว การเชื่อมต่อ UI และ customer entitlement ยังไม่ได้เปิดใช้งาน

## ความหมายของ "train"

ปัจจุบันเป็น **automated parameter search / optimization** ไม่ใช่การ fine-tune LLM หรือฝึก neural network และไม่ได้เปลี่ยนน้ำหนักโมเดล AI การเพิ่ม ML จริงต้องมี dataset ที่ตรวจสอบแล้ว, feature pipeline, split แบบไม่รั่วข้อมูล, evaluation/benchmark และ dependency/runtime ที่กำหนดชัดเจน

## ห้าม

- ห้ามใช้ผล backtest เป็นคำรับประกันผลกำไร
- ห้ามเปลี่ยนสถานะเป็น approved_for_ai ด้วยระบบอัตโนมัติ
- ห้ามเชื่อม candidate เข้ากับ MT5 order execution โดยตรง
- ห้ามเปิด Live Trading หรือแก้ risk limits จากเครื่องมือนี้
- ห้ามใส่ API keys, broker credentials หรือข้อมูลบัญชีลูกค้าในไฟล์/รายงาน
