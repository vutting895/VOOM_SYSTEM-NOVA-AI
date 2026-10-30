'use client';

import { useEffect, useState } from 'react';

const STATUS_COPY = Object.freeze({
  approved: 'ร่างได้รับการยืนยันเพื่อเก็บเป็นผลตรวจทานแล้ว',
  rejected: 'ร่างนี้ถูกปฏิเสธ',
  edited: 'บันทึกฉบับแก้ไขแล้ว แต่ยังไม่ผ่านการตรวจทานใหม่',
  expired: 'คำขอตรวจทานหมดอายุแล้ว',
});
const STATUS_LABEL = Object.freeze({
  pending: 'รอการตรวจทาน',
  approved: 'ยืนยันร่างแล้ว',
  rejected: 'ปฏิเสธแล้ว',
  edited: 'แก้ไขแล้ว',
  expired: 'หมดอายุ',
  cancelled: 'ยกเลิกแล้ว',
});

function pretty(value) {
  return typeof value === 'string' && value.length ? value : 'ยังไม่ได้ระบุ';
}

export default function ApprovalCard({ approval, busy = false, onDecision, onReviewEdited }) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(approval?.proposal?.summary || '');
  const [note, setNote] = useState('');

  useEffect(() => {
    setSummary(approval?.proposal?.summary || '');
    setEditing(false);
    setNote('');
  }, [approval?.id, approval?.status]);

  if (!approval?.id || !approval?.proposal) return null;

  const expired = approval.status === 'pending'
    && approval.server_confirmed_pending !== true
    && Number.isFinite(Date.parse(approval.expires_at))
    && Date.parse(approval.expires_at) <= Date.now();

  async function submitDecision(decision, editedProposal) {
    if (busy || typeof onDecision !== 'function') return;
    await onDecision({
      decision,
      ...(decision === "expire" ? {} : { note: note.trim() || null }),
      ...(editedProposal ? { editedProposal } : {}),
    });
    setEditing(false);
  }

  return (
    <section className="nova-approval-card" aria-label="ทบทวนร่างกลยุทธ์">
      <div className="nova-approval-card-head">
        <span className="nova-approval-mark" aria-hidden="true">✓</span>
        <div>
          <strong>RESEARCH DRAFT REVIEW</strong>
          <small>บันทึกผลตรวจทานเท่านั้น · ไม่มีการส่งคำสั่งซื้อขาย</small>
        </div>
        <span className={'nova-approval-state is-' + approval.status}>
          {expired ? 'หมดอายุ' : (STATUS_LABEL[approval.status] || 'สถานะ')}
        </span>
      </div>

      <h4>{pretty(approval.proposal.title)}</h4>
      <p className="nova-approval-summary">{pretty(approval.proposal.summary)}</p>
      <dl className="nova-approval-fields">
        <div><dt>ตลาด</dt><dd>{pretty(approval.proposal.market)}</dd></div>
        <div><dt>กรอบเวลา</dt><dd>{pretty(approval.proposal.timeframe)}</dd></div>
        <div><dt>ระดับความเสี่ยงที่ระบุ</dt><dd>{pretty(approval.proposal.riskProfile)}</dd></div>
      </dl>

      {approval.status === 'pending' && !expired && (
        <>
          {editing ? (
            <form className="nova-approval-edit" onSubmit={(event) => {
              event.preventDefault();
              const editedProposal = { ...approval.proposal, summary: summary.trim() };
              void submitDecision('edit', editedProposal);
            }}>
              <label htmlFor={'approval-summary-' + approval.id}>แก้ไขสรุปร่าง</label>
              <textarea
                id={'approval-summary-' + approval.id}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={600}
                rows={3}
                required
              />
              <div className="nova-approval-actions">
                <button type="submit" disabled={busy || !summary.trim()}>บันทึกฉบับแก้ไข</button>
                <button type="button" className="is-secondary" onClick={() => setEditing(false)} disabled={busy}>ยกเลิก</button>
              </div>
            </form>
          ) : (
            <>
              <label className="nova-approval-note-label" htmlFor={'approval-note-' + approval.id}>หมายเหตุ (ไม่บังคับ)</label>
              <textarea
                id={'approval-note-' + approval.id}
                className="nova-approval-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                rows={2}
                placeholder="ระบุเหตุผลในการตรวจทาน"
              />
              <div className="nova-approval-actions">
                <button type="button" disabled={busy} onClick={() => void submitDecision('approve')}>ยืนยันร่าง</button>
                <button type="button" className="is-danger" disabled={busy} onClick={() => void submitDecision('reject')}>ปฏิเสธ</button>
                <button type="button" className="is-secondary" disabled={busy} onClick={() => setEditing(true)}>แก้ไขร่าง</button>
              </div>
            </>
          )}
          <p className="nova-approval-expiry">หมดอายุ: {new Date(approval.expires_at).toLocaleString()}</p>
        </>
      )}

      {approval.status === 'pending' && expired && (
        <div className="nova-approval-expired" role="status">
          <p>คำขอนี้เกินเวลาหมดอายุตามนาฬิกาของอุปกรณ์แล้ว กรุณาตรวจสอบสถานะกับเซิร์ฟเวอร์ก่อนปิดรายการ</p>
          <button type="button" className="is-secondary" disabled={busy} onClick={() => void submitDecision('expire')}>
            ตรวจสอบสถานะหมดอายุกับเซิร์ฟเวอร์
          </button>
        </div>
      )}

      {approval.status !== 'pending' && (
        <div className="nova-approval-final-state" role="status">
          <p>{STATUS_COPY[approval.status] || 'สถานะการตรวจทานถูกบันทึกแล้ว'}</p>
          {approval.status === 'edited' && approval.decision_payload && (
            <>
              <p><strong>ฉบับแก้ไข:</strong> {pretty(approval.decision_payload.summary)}</p>
              <button type="button" disabled={busy || typeof onReviewEdited !== 'function'} onClick={() => onReviewEdited(approval.decision_payload)}>
                ส่งฉบับแก้ไขเพื่อตรวจทานใหม่
              </button>
            </>
          )}
        </div>
      )}

      <div className="nova-approval-safety">Execution disabled · Broker mutation disabled · Live Trading OFF</div>
    </section>
  );
}
