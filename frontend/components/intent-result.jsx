import { validateIntentEnvelope } from "../../integrations/nova-ai-worker/intent-contract.js";
import ApprovalCard from "./approval-card";

const FIELD_LABELS = Object.freeze({
  market: "ตลาด",
  timeframe: "กรอบเวลา",
  risk: "ระดับความเสี่ยงที่ระบุ",
});

const FIELD_FALLBACK = "ยังไม่ได้ระบุ";

const CARD_COPY = Object.freeze({
  safety_notice: {
    label: "SAFETY GUARD",
    title: "คำสั่งซื้อขายถูกปิดไว้",
    summary: "เวอร์ชันนี้รองรับการวิจัยและวิเคราะห์เท่านั้น ไม่ส่งหรือเตรียมคำสั่งไปยังโบรกเกอร์",
    items: [
      "ไม่เรียกใช้เครื่องมือส่งคำสั่งซื้อขาย",
      "เลือกวิเคราะห์กลยุทธ์หรือทบทวนความเสี่ยงแทนได้",
    ],
  },
  strategy_draft: {
    label: "STRATEGY DRAFT",
    title: "ร่างกลยุทธ์เพื่อการวิจัย",
    summary: "นี่เป็นเพียงร่าง ไม่ใช่สัญญาณเข้าออก และยังไม่ได้ผ่านการทดสอบย้อนหลัง",
    items: [
      "กำหนดเงื่อนไขเข้าและออกให้ตรวจสอบได้ก่อนทดสอบ",
      "ระบุ Stop Loss, Take Profit และขนาดสถานะก่อนประเมินความเสี่ยง",
      "รวม spread, commission และ slippage ในการทดสอบ",
    ],
  },
  risk_checklist: {
    label: "RISK REVIEW",
    title: "กรอบตรวจสอบความเสี่ยง",
    summary: "เป็น checklist ทั่วไป ไม่ใช่ผลตรวจบัญชีจริงหรือการอนุมัติความเสี่ยง",
    items: [
      "ตรวจขนาดสถานะและความเสี่ยงต่อรายการ",
      "ตรวจ daily loss, drawdown และ margin usage",
      "ปฏิเสธการวิเคราะห์เมื่อราคา stale หรือข้อมูลที่จำเป็นไม่ครบ",
    ],
  },
  backtest_review: {
    label: "BACKTEST REVIEW",
    title: "รายการตรวจสอบผลทดสอบย้อนหลัง",
    summary: "ผลทดสอบย้อนหลังไม่ได้รับประกันผลลัพธ์ในอนาคต",
    items: [
      "แยกช่วง in-sample และ out-of-sample",
      "รวมต้นทุน spread, commission, slippage และ funding ที่เกี่ยวข้อง",
      "ตรวจ data leakage และทดสอบ robustness ก่อนสรุปผล",
    ],
  },
  indicator_guide: {
    label: "INDICATOR GUIDE",
    title: "แนวทางอ่านอินดิเคเตอร์",
    summary: "อินดิเคเตอร์เป็นข้อมูลประกอบ ไม่ได้ยืนยันว่าควรซื้อหรือขาย",
    items: [
      "EMA ช่วยอธิบายแนวโน้มจากราคาที่ผ่านมา",
      "RSI ช่วยอธิบายโมเมนตัมตามช่วงเวลาที่เลือก",
      "ตรวจ timeframe, spread และบริบทตลาดก่อนแปลผล",
    ],
  },
  analysis_summary: {
    label: "RESEARCH CONTEXT",
    title: "กรอบงานวิจัย",
    summary: "ใช้ข้อมูลที่ยืนยันได้เท่านั้น และระบุสิ่งที่ยังไม่ทราบอย่างชัดเจน",
    items: [
      "ไม่อ้างว่ามีราคาสดหรือสถานะบัญชี ถ้ายังไม่ได้อ่านผ่านเส้นทางที่ยืนยันแล้ว",
      "ผลจากการสนทนาไม่เปลี่ยนค่า broker และไม่ส่งคำสั่ง",
    ],
  },
});

function displayField(value) {
  return typeof value === "string" && value.length ? value : FIELD_FALLBACK;
}

export default function IntentResult({ intent, approval = null, onRequestReview, onDecision, onReviewEdited, approvalBusy = false, reviewEnabled = false }) {
  const checked = validateIntentEnvelope(intent);
  if (!checked.ok) return null;

  const descriptor = checked.value.component;
  const copy = CARD_COPY[descriptor.type];
  if (!copy) return null;

  return (
    <section className={"nova-intent-card nova-intent-" + descriptor.type} aria-label={copy.title}>
      <div className="nova-intent-card-header">
        <span className="nova-intent-card-mark" aria-hidden="true">✦</span>
        <span>{copy.label}</span>
        <span className="nova-intent-readonly">READ-ONLY · LIVE TRADING OFF</span>
      </div>
      <h3>{copy.title}</h3>
      <p className="nova-intent-summary">{copy.summary}</p>

      {descriptor.type === "strategy_draft" && (
        <dl className="nova-intent-fields">
          {Object.keys(FIELD_LABELS).map((key) => (
            <div key={key}>
              <dt>{FIELD_LABELS[key]}</dt>
              <dd>{displayField(descriptor[key])}</dd>
            </div>
          ))}
        </dl>
      )}

      <ul className="nova-intent-items">
        {copy.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <div className="nova-intent-footnote">
        <span>Execution: disabled</span>
        <span>Broker mutations: disabled</span>
      </div>
      {descriptor.type === "strategy_draft" && reviewEnabled && !approval && typeof onRequestReview === "function" && (
        <div className="nova-intent-review-action">
          <button type="button" disabled={approvalBusy} onClick={onRequestReview}>
            {approvalBusy ? "กำลังบันทึกคำขอ…" : "ขอตรวจทานร่างแบบบันทึกได้"}
          </button>
          <p>การตรวจทานนี้บันทึกเฉพาะร่างงานวิจัย ไม่ส่งคำสั่งและไม่เปลี่ยนบัญชีโบรกเกอร์</p>
        </div>
      )}
      {approval && (
        <ApprovalCard
          approval={approval}
          busy={approvalBusy}
          onDecision={onDecision}
          onReviewEdited={onReviewEdited}
        />
      )}
    </section>
  );
}
