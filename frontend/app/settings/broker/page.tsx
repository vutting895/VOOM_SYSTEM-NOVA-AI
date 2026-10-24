export default function BrokerSettingsPage() {
  return (
    <main className="broker-page">
      <a className="back-link" href="/">← Back to overview</a>
      <span className="eyebrow">CONNECTIONS / BROKER</span>
      <h1>Broker connection</h1>
      <p className="intro">Connect an Alpaca account for read-only account summaries in the paper-trading environment.</p>
      <section className="broker-card">
        <div className="broker-heading"><span className="broker-symbol">A</span><div><h2>Alpaca</h2><p>OAuth connection · Paper environment</p></div><span className="broker-state">NOT CONNECTED</span></div>
        <div className="broker-warning"><strong>Before you connect</strong><p>The Cloudflare Worker, Supabase migration, OAuth callback URL and required secrets must be configured by the project owner. This page does not submit trades or collect broker credentials.</p></div>
        <p className="broker-footnote">Order placement is not implemented. Keep live trading disabled during integration and testing.</p>
      </section>
      <style>{`
        .broker-page{max-width:820px;margin:0 auto;padding:42px 24px;color:#eef3fa;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
        .back-link{display:inline-block;color:#c9f36a;font-size:13px;margin-bottom:38px;text-decoration:none}
        .eyebrow{display:block;color:#8b98aa;font-size:10px;letter-spacing:2px;font-weight:800}
        h1{font-size:36px;letter-spacing:-1px;margin:10px 0}
        .intro{color:#9eabba;line-height:1.7;max-width:600px}
        .broker-card{margin-top:28px;border:1px solid #283342;border-radius:16px;padding:24px;background:#101620}
        .broker-heading{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
        .broker-symbol{width:44px;height:44px;display:grid;place-items:center;background:#c9f36a;color:#11170b;border-radius:12px;font-weight:900;font-size:22px}
        .broker-heading h2{margin:0 0 5px;font-size:18px}.broker-heading p{margin:0;color:#8b98aa;font-size:12px}
        .broker-state{margin-left:auto;border:1px solid #514b31;border-radius:99px;padding:7px 10px;color:#e5c77d;font-size:9px;letter-spacing:1px}
        .broker-warning{margin-top:24px;padding:16px;border:1px solid #384333;background:#151c15;border-radius:10px}
        .broker-warning strong{font-size:12px}.broker-warning p,.broker-footnote{font-size:12px;line-height:1.7;color:#a6b2a1}
        .broker-footnote{color:#8b98aa;margin-bottom:0}
      `}</style>
    </main>
  );
}
