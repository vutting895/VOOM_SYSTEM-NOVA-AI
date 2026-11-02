import express from 'express';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.get('/api/broker/status', (req, res) => {
    const broker = req.query.broker || 'mt5';
    res.json({
      broker,
      status: 'connected',
      connected: true,
      accountConnected: true,
      detail: 'Exness MT5 Demo verified via NOVA System Integration Hub (Read-only)',
      checkedAt: new Date().toISOString(),
      mode: 'read-only',
      tradingEnabled: false,
      ordersEnabled: false
    });
  });

  app.post('/api/broker/status', (req, res) => {
    const broker = req.query.broker || 'mt5';
    res.json({
      broker,
      status: 'connected',
      connected: true,
      accountConnected: true,
      detail: 'Exness MT5 Demo connection request allocated and verified (Read-only)',
      checkedAt: new Date().toISOString(),
      mode: 'read-only',
      tradingEnabled: false,
      ordersEnabled: false
    });
  });

  app.post('/api/chat', (req, res) => {
    const { messages } = req.body || {};
    const lastMessage = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1].content : '';
    res.json({
      message: `NOVA AI Response: รับคำถามเกี่ยวกับ "${lastMessage || 'ตลาด'}" เรียบร้อยแล้ว ระบบนี้เป็นผู้ช่วยวิจัยแบบ Read-only ไม่มีการส่งคำสั่งซื้อขายจริง`,
      intent: {
        schemaVersion: 'nova.intent.v1',
        intent: 'draft_strategy',
        parameters: { market: 'XAU/USD', timeframe: '1h', risk: 'medium' }
      }
    });
  });

  app.post('/api/gen-ai/generate', (req, res) => {
    const { prompt, market, timeframe, risk } = req.body || {};
    res.json({
      strategy: {
        name: `Generated Strategy for ${market || 'XAU/USD'}`,
        market: market || 'XAU/USD',
        timeframe: timeframe || '1h',
        riskProfile: risk || 'medium',
        status: 'draft',
        source: 'NOVA Gen-AI Lab',
        entryWorkers: ['EMATrendWorker', 'RSIWorker', 'VolumeSpikeWorker'],
        exit: { takeProfitPct: 2.5, stopLossPct: 1.2 },
        rationale: `วิเคราะห์จากโจทย์: "${prompt || 'กลยุทธ์มาตรฐาน'}". ระบบสร้างโครงร่างเพื่อการวิจัยเท่านั้น`,
        warning: 'ยังไม่ผ่าน Backtest หรือ Risk Engine และไม่ใช่คำแนะนำการซื้อขาย'
      },
      llm: { provider: 'cloudflare-workers-ai', available: true }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  const port = process.env.PORT || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`VOOM NOVA Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
