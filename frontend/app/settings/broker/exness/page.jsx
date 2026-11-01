import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "ตรวจชนิดบัญชี",
    description: "ต้องเป็นบัญชี Exness Platform ที่รองรับ Trader API ไม่ใช่บัญชี MT4 หรือ MT5",
    state: "ยืนยันจากผู้ใช้แล้ว"
  },
  {
    number: "02",
    title: "เตรียม API แบบอ่านอย่างเดียว",
    description: "สร้าง API Key สำหรับ Trader API และเลือกสิทธิ์อ่านข้อมูลเท่านั้น เตรียม Account ID และ Private Signing Key ไว้ด้วย",
    state: "ผู้ใช้ยืนยันว่าเป็น Read-only"
  },
  {
    number: "03",
    title: "เชื่อมต่ออย่างปลอดภัย",
    description: "เมื่อระบบจัดเตรียมพื้นที่เก็บกุญแจลับแบบแยกเจ้าของเสร็จ จะมีแบบฟอร์มปลอดภัยให้กรอกและกดทดสอบได้จากหน้านี้",
    state: "กำลังพัฒนา"
  }
];

export default function ExnessApiSetupPage() {
  return (
    <main className="setup">
      <style>{`
        .setup{min-height:100vh;background:#090c13;color:#edf2fb;padding:28px 18px 64px;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
        .wrap{max-width:920px;margin:0 auto}.back{color:#b6a8ff;text-decoration:none;font-size:13px}
        .eyebrow{margin-top:34px;color:#a99aff;font-size:11px;letter-spacing:.18em;font-weight:800}
        h1{font-size:clamp(30px,6vw,48px);line-height:1.08;letter-spacing:-.045em;margin:12px 0}
        .intro{max-width:690px;color:#aab5c8;font-size:15px;line-height:1.8}
        .status{display:flex;gap:12px;align-items:flex-start;margin:24px 0;padding:17px;border:1px solid #66552f;background:#211d14;border-radius:15px;color:#f1d99e}
        .status strong{display:block;margin-bottom:5px;font-size:14px}.status p{margin:0;font-size:12px;line-height:1.7;color:#c6b98f}
        .steps{display:grid;gap:12px;margin-top:24px}.step{display:grid;grid-template-columns:54px 1fr;gap:14px;padding:19px;border:1px solid #293246;background:#111722;border-radius:15px}
        .num{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#26213e;color:#c5baff;font-weight:900}
        .step h2{font-size:16px;margin:1px 0 7px}.step p{font-size:13px;line-height:1.75;color:#a7b2c5;margin:0}
        .step small{display:inline-block;margin-top:10px;color:#b9e7c7;font-size:11px;font-weight:700}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}
        .panel{border:1px solid #293246;background:#111722;border-radius:15px;padding:18px}.panel h2{font-size:14px;margin:0 0 9px}
        .panel p,.panel li{font-size:12px;line-height:1.8;color:#a7b2c5}.panel ul{padding-left:18px;margin:8px 0 0}
        .links{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}.links a{display:inline-flex;padding:12px 15px;border-radius:10px;background:#c7f36b;color:#11170a;text-decoration:none;font-size:12px;font-weight:800}
        .links a.secondary{background:#1b2331;color:#e6eaf4;border:1px solid #394458}
        .foot{margin-top:24px;color:#7f8ba1;font-size:11px;line-height:1.8}
        @media(max-width:640px){.grid{grid-template-columns:1fr}.step{grid-template-columns:44px 1fr;padding:15px}.num{width:38px;height:38px}}
      `}</style>
      <div className="wrap">
        <Link className="back" href="/broker">← กลับหน้าเชื่อมต่อโบรกเกอร์</Link>
        <div className="eyebrow">NOVA / EXNESS TRADER API</div>
        <h1>เชื่อม Exness แบบง่าย</h1>
        <p className="intro">
          ไม่ต้องติดตั้ง MT5 ไม่ต้องเปิดคอมพิวเตอร์ Windows หรือเช่า VPS
          NOVA จะอ่านข้อมูลบัญชีและราคาโดยตรงจาก Exness Trader API ผ่านระบบเซิร์ฟเวอร์ที่ปลอดภัย
        </p>

        <section className="status" role="status">
          <span aria-hidden="true">●</span>
          <div>
            <strong>เตรียมการเชื่อมต่อแล้วบางส่วน · ยังไม่เชื่อมบัญชีจริง</strong>
            <p>ยืนยันชนิดบัญชี Exness Platform และสิทธิ์ API แบบ Read-only แล้ว แต่ระบบยังไม่เปิดรับ Private Signing Key จนกว่าพื้นที่เก็บกุญแจลับแบบแยกเจ้าของจะผ่านการตรวจสอบความปลอดภัย</p>
          </div>
        </section>

        <section className="steps" aria-label="ขั้นตอนเชื่อมต่อ">
          {steps.map((step) => (
            <article className="step" key={step.number}>
              <div className="num">{step.number}</div>
              <div>
                <h2>{step.title}</h2>
                <p>{step.description}</p>
                <small>{step.state}</small>
              </div>
            </article>
          ))}
        </section>

        <div className="grid">
          <section className="panel">
            <h2>เตรียมข้อมูลอะไรบ้าง?</h2>
            <ul>
              <li>Exness Trader API Key</li>
              <li>Private Signing Key ที่ Exness ให้หรือสร้างตามขั้นตอนทางการ</li>
              <li>Account ID ของบัญชี Exness Platform</li>
              <li>สิทธิ์ API สำหรับอ่านข้อมูลเท่านั้น</li>
            </ul>
          </section>
          <section className="panel">
            <h2>สิ่งที่ NOVA จะทำให้เอง</h2>
            <ul>
              <li>ตรวจสอบการเชื่อมต่อและบัญชีที่ผูกไว้</li>
              <li>ค้นหา Gateway ของ Exness อัตโนมัติ</li>
              <li>อ่านข้อมูลบัญชี รายการสินทรัพย์ และกราฟแท่งราคา</li>
              <li>แสดงสถานะและข้อผิดพลาดเป็นภาษาไทย</li>
            </ul>
          </section>
        </div>

        <div className="links">
          <a href="https://www.exness-api.com/authentication/api-key-and-host-setup" target="_blank" rel="noreferrer">ดูวิธีสร้าง API จาก Exness</a>
          <a className="secondary" href="https://get.exness.help/hc/en-us/articles/27866287512476-Exness-API" target="_blank" rel="noreferrer">ตรวจสอบบัญชีที่รองรับ</a>
          <Link className="secondary" href="/settings/broker">ดูหน้าสถานะ Broker เดิม</Link>
        </div>

        <p className="foot">
          ความปลอดภัย: อย่าส่ง API Key หรือ Private Signing Key ผ่านแชต อีเมล GitHub หรือช่องกรอกทั่วไป
          หน้านี้ยังไม่รับข้อมูลลับและยังไม่แสดงสถานะ Connected จนกว่าจะอ่านข้อมูลจากบัญชีของคุณได้จริง
          ระบบจะปิดคำสั่งซื้อขาย การแก้ไขสถานะ และการโอนเงินทั้งหมด
        </p>
      </div>
    </main>
  );
}
