/* Customer trading desk: paper orders stored per user in Supabase, plus a read-only
   signals view. No broker connection and no order execution — paper only. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://tlyyxufuiimrbaksoitf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_YR_oZbHEc0t1XvLkDDKakA_8JX9XIFD';
  const START_BALANCE = 10000;
  const MODE_KEY = 'voom_trade_mode';

  // Simulated quotes for the paper desk. Never used for real pricing or P&L claims.
  const MARKETS = {
    EURUSD: { base: 1.0865, spread: 0.00012, units: 100000, digits: 5, jpy: false },
    XAUUSD: { base: 2385.4, spread: 0.25, units: 100, digits: 2, jpy: false },
    BTCUSD: { base: 67420, spread: 8, units: 1, digits: 2, jpy: false },
    USDJPY: { base: 157.85, spread: 0.012, units: 100000, digits: 3, jpy: true }
  };

  const quotes = {};
  Object.keys(MARKETS).forEach((key) => { quotes[key] = MARKETS[key].base; });

  const $ = (id) => document.getElementById(id);
  const usd = (value) => (value < 0 ? '−' : '') +
    Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const px = (symbol, value) => Number(value).toFixed(MARKETS[symbol].digits);
  const bidAsk = (symbol) => {
    const market = MARKETS[symbol];
    const mid = quotes[symbol];
    return { bid: mid - market.spread / 2, ask: mid + market.spread / 2 };
  };
  const markPrice = (order) => {
    const quote = bidAsk(order.symbol);
    return order.side === 'BUY' ? quote.bid : quote.ask;
  };
  const pnlOf = (order, exitPrice) => {
    const market = MARKETS[order.symbol];
    const direction = order.side === 'BUY' ? 1 : -1;
    const raw = (exitPrice - Number(order.entry_price)) * direction * Number(order.lots) * market.units;
    return market.jpy ? raw / exitPrice : raw;
  };
  const missingTable = (error) => ['42P01', 'PGRST205'].includes(error?.code) ||
    /does not exist|schema cache/i.test(error?.message || '');

  let client = null;
  let userId = null;
  let orders = [];

  function setNote(text, bad = false) {
    const note = $('ticketNote');
    if (!note) return;
    note.textContent = text;
    note.classList.toggle('error', bad);
  }

  function currentSymbol() {
    return $('ticketSymbol')?.value || 'EURUSD';
  }

  function renderQuotes() {
    const strip = $('quoteStrip');
    if (!strip) return;
    strip.textContent = '';
    Object.keys(MARKETS).forEach((symbol) => {
      const quote = bidAsk(symbol);
      const card = document.createElement('div');
      card.className = 'quote';
      const name = document.createElement('b');
      name.textContent = symbol;
      const prices = document.createElement('span');
      prices.textContent = `${px(symbol, quote.bid)} / ${px(symbol, quote.ask)}`;
      card.append(name, prices);
      strip.append(card);
    });
    const price = $('ticketPrice');
    if (price) {
      const symbol = currentSymbol();
      const quote = bidAsk(symbol);
      price.textContent = `${px(symbol, quote.bid)} / ${px(symbol, quote.ask)}`;
    }
  }

  function renderAccount() {
    const open = orders.filter((order) => order.status === 'open');
    const realized = orders
      .filter((order) => order.status === 'closed')
      .reduce((sum, order) => sum + Number(order.pnl || 0), 0);
    const floating = open.reduce((sum, order) => sum + pnlOf(order, markPrice(order)), 0);
    const balance = START_BALANCE + realized;

    if ($('acctBalance')) $('acctBalance').textContent = `$${usd(balance)}`;
    if ($('acctEquity')) $('acctEquity').textContent = `$${usd(balance + floating)}`;
    const floatingEl = $('acctFloating');
    if (floatingEl) {
      floatingEl.textContent = `$${usd(floating)}`;
      floatingEl.classList.toggle('pnl', false);
    }
    renderPositions(open, floating);
  }

  function renderPositions(open, floating) {
    const list = $('positionsBody');
    if (!list) return;
    list.textContent = '';
    if (!open.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'ยังไม่มีสถานะที่เปิดอยู่ — เลือกสินค้าและกดซื้อหรือขายด้านบน';
      list.append(empty);
      return;
    }
    open.forEach((order) => {
      const exit = markPrice(order);
      const pnl = pnlOf(order, exit);
      const row = document.createElement('div');
      row.className = 'pos-row';

      const top = document.createElement('div');
      top.className = 'pos-top';
      const name = document.createElement('b');
      name.textContent = order.symbol;
      const side = document.createElement('span');
      side.className = `side-badge ${order.side === 'BUY' ? 'buy' : 'sell'}`;
      side.textContent = order.side;
      top.append(name, side);

      const meta = document.createElement('div');
      meta.className = 'pos-meta';
      const lots = document.createElement('span');
      lots.textContent = `${Number(order.lots).toFixed(2)} lot`;
      const entry = document.createElement('span');
      entry.textContent = `เข้า ${px(order.symbol, order.entry_price)}`;
      const now = document.createElement('span');
      now.textContent = `ปัจจุบัน ${px(order.symbol, exit)}`;
      meta.append(lots, entry, now);

      const bottom = document.createElement('div');
      bottom.className = 'pos-bottom';
      const pnlEl = document.createElement('span');
      pnlEl.className = `pnl ${pnl >= 0 ? 'up' : 'down'}`;
      pnlEl.textContent = `${pnl >= 0 ? '+' : '−'}$${usd(pnl)}`;
      const close = document.createElement('button');
      close.className = 'btn close-btn';
      close.type = 'button';
      close.dataset.close = order.id;
      close.textContent = 'ปิดสถานะ';
      bottom.append(pnlEl, close);

      row.append(top, meta, bottom);
      list.append(row);
    });
  }

  function renderHistory() {
    const list = $('historyBody');
    if (!list) return;
    list.textContent = '';
    const closed = orders.filter((order) => order.status === 'closed').slice(0, 20);
    if (!closed.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'ยังไม่มีประวัติการปิดสถานะ';
      list.append(empty);
      return;
    }
    closed.forEach((order) => {
      const pnl = Number(order.pnl || 0);
      const row = document.createElement('div');
      row.className = 'pos-row';
      const top = document.createElement('div');
      top.className = 'pos-top';
      const name = document.createElement('b');
      name.textContent = `${order.symbol} · ${order.side}`;
      const pnlEl = document.createElement('span');
      pnlEl.className = `pnl ${pnl >= 0 ? 'up' : 'down'}`;
      pnlEl.textContent = `${pnl >= 0 ? '+' : '−'}$${usd(pnl)}`;
      top.append(name, pnlEl);
      const meta = document.createElement('div');
      meta.className = 'pos-meta';
      const entry = document.createElement('span');
      entry.textContent = `เข้า ${px(order.symbol, order.entry_price)}`;
      const exit = document.createElement('span');
      exit.textContent = `ออก ${px(order.symbol, order.exit_price)}`;
      const when = document.createElement('span');
      when.textContent = new Date(order.closed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
      meta.append(entry, exit, when);
      row.append(top, meta);
      list.append(row);
    });
  }

  function renderAll() {
    renderQuotes();
    renderAccount();
    renderHistory();
  }

  async function loadOrders() {
    const { data, error } = await client
      .from('paper_orders')
      .select('id,symbol,side,lots,entry_price,exit_price,status,pnl,opened_at,closed_at')
      .order('opened_at', { ascending: false })
      .limit(200);
    if (error) {
      if (missingTable(error)) {
        setNote('ยังไม่ได้ติดตั้งตาราง paper_orders — โปรดรัน Supabase/migrations/20261024_000003_customer_paper_trading.sql', true);
      } else {
        setNote(`โหลดออเดอร์ไม่สำเร็จ: ${error.message}`, true);
      }
      return;
    }
    orders = data || [];
    renderAll();
  }

  async function placeOrder(side) {
    const symbol = currentSymbol();
    const lots = Number($('ticketLots').value);
    if (!Number.isFinite(lots) || lots < 0.01 || lots > 10) {
      setNote('ขนาด Lot ต้องอยู่ระหว่าง 0.01 – 10', true);
      return;
    }
    const entry = side === 'BUY' ? bidAsk(symbol).ask : bidAsk(symbol).bid;
    const { error } = await client.from('paper_orders').insert({
      user_id: userId,
      symbol,
      side,
      lots,
      entry_price: Number(entry.toFixed(6))
    });
    if (error) {
      setNote(missingTable(error) ? 'ยังไม่ได้ติดตั้งตาราง paper_orders — โปรดรัน migration' : `เปิดออเดอร์ไม่สำเร็จ: ${error.message}`, true);
      return;
    }
    setNote(`เปิด ${side} ${symbol} ${lots.toFixed(2)} lot ที่ ${px(symbol, entry)} (จำลอง)`);
    await loadOrders();
  }

  async function closeOrder(id) {
    const order = orders.find((item) => item.id === id);
    if (!order || order.status !== 'open') return;
    const exit = markPrice(order);
    const pnl = pnlOf(order, exit);
    const { error } = await client
      .from('paper_orders')
      .update({
        exit_price: Number(exit.toFixed(6)),
        pnl: Number(pnl.toFixed(2)),
        status: 'closed',
        closed_at: new Date().toISOString()
      })
      .eq('id', id);
    if (error) {
      setNote(`ปิดสถานะไม่สำเร็จ: ${error.message}`, true);
      return;
    }
    setNote(`ปิดสถานะ ${order.symbol} ที่ ${px(order.symbol, exit)} · ${pnl >= 0 ? '+' : '−'}$${usd(pnl)}`);
    await loadOrders();
  }

  function signalRow(signal) {
    const row = document.createElement('div');
    row.className = 'signal-row';
    const top = document.createElement('div');
    top.className = 'signal-top';
    const name = document.createElement('b');
    name.textContent = signal.symbol;
    const badge = document.createElement('span');
    badge.className = `side-badge ${signal.direction === 'SELL' ? 'sell' : 'buy'}`;
    badge.textContent = signal.direction;
    top.append(name, badge);

    const meta = document.createElement('div');
    meta.className = 'pos-meta';
    if (signal.entry_price !== null && signal.entry_price !== undefined) {
      const entry = document.createElement('span');
      entry.textContent = `Entry ${signal.entry_price}`;
      meta.append(entry);
    }
    if (signal.stop_loss !== null && signal.stop_loss !== undefined) {
      const sl = document.createElement('span');
      sl.textContent = `SL ${signal.stop_loss}`;
      meta.append(sl);
    }
    if (signal.take_profit_1 !== null && signal.take_profit_1 !== undefined) {
      const tp = document.createElement('span');
      tp.textContent = `TP ${signal.take_profit_1}`;
      meta.append(tp);
    }
    const when = document.createElement('span');
    when.textContent = new Date(signal.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
    meta.append(when);
    row.append(top, meta);
    return row;
  }

  async function loadSignals() {
    const targets = [$('signalsList'), $('signalsCard')].filter(Boolean);
    if (!targets.length) return;
    const { data, error } = await client
      .from('strategy_signals')
      .select('id,symbol,direction,timeframe,entry_price,stop_loss,take_profit_1,score,paper_only,created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    targets.forEach((target) => { target.textContent = ''; });
    if (error) {
      targets.forEach((target) => {
        const message = document.createElement('p');
        message.className = 'empty error';
        message.textContent = `โหลดสัญญาณไม่สำเร็จ: ${error.message}`;
        target.append(message);
      });
      return;
    }
    if (!data || !data.length) {
      targets.forEach((target) => {
        const message = document.createElement('p');
        message.className = 'empty';
        message.textContent = 'ยังไม่มีสัญญาณของคุณ — สัญญาณจะแสดงที่นี่เมื่อระบบส่งมาให้บัญชีนี้';
        target.append(message);
      });
      return;
    }
    targets.forEach((target) => data.forEach((signal) => target.append(signalRow(signal))));
  }

  function setMode(mode) {
    const next = mode === 'signals' ? 'signals' : 'paper';
    document.querySelectorAll('[data-mode-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.modePanel !== next;
    });
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.mode === next ? 'true' : 'false');
    });
    const note = $('modeNote');
    if (note) {
      note.textContent = next === 'paper'
        ? 'โหมดเงินจำลอง (Paper) — ราคาเป็นราคาจำลองเพื่อทดสอบ ไม่ใช่ราคาตลาดจริง และไม่มีคำสั่งไปยังโบรกเกอร์'
        : 'โหมดดูสัญญาณ — อ่านสัญญาณของบัญชีนี้เท่านั้น ไม่มีปุ่มส่งคำสั่งซื้อขาย';
    }
    try { localStorage.setItem(MODE_KEY, next); } catch (e) { /* storage blocked */ }
  }

  function wire() {
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => setMode(button.dataset.mode));
    });
    $('ticketSymbol')?.addEventListener('change', renderQuotes);
    $('orderTicket')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const side = event.submitter?.dataset.side === 'SELL' ? 'SELL' : 'BUY';
      placeOrder(side);
    });
    $('positionsBody')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-close]');
      if (button) closeOrder(button.dataset.close);
    });
    let stored = 'paper';
    try { stored = localStorage.getItem(MODE_KEY) || 'paper'; } catch (e) { /* storage blocked */ }
    setMode(stored);
    setInterval(() => {
      Object.keys(MARKETS).forEach((symbol) => {
        quotes[symbol] *= 1 + (Math.random() - 0.5) * 0.0006;
      });
      renderQuotes();
      renderAccount();
    }, 2000);
  }

  async function init() {
    if (!window.supabase || !$('orderTicket')) return;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    wire();
    renderQuotes();
    const { data } = await client.auth.getSession();
    if (!data?.session) return; // customer.html redirects to the login page
    userId = data.session.user.id;
    await Promise.all([loadOrders(), loadSignals()]);
  }

  init();
})();
