'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { label: 'Command Center', href: '/command-center', code: '00' },
  { label: 'Strategy Selection', href: '/strategies', code: '01' },
  { label: 'Dashboard', href: '/', code: '01' },
  { label: 'AI Chat', href: '/chat', code: '02' },
  { label: 'Markets', href: '/markets', code: '03' },
  { label: 'AI Analysis', href: '/gen-ai', code: '04' },
  { label: 'Trading Intelligence', href: '/trading-intelligence', code: '04T' },
  { label: 'Video Workspace', href: '/video', code: '04V' },
  { label: 'Backtest', href: '/backtest', code: '05' },
  { label: 'Learning Universe', href: '/learning-universe', code: '06' },
  { label: 'Broker Hub', href: '/broker', code: '07' },
  { label: 'Marketplace', href: '/marketplace', code: '08' },
];

export default function NovaNavigation() {
  const pathname = usePathname() || '/';

  // The customer command center is intentionally menu-free and owns its own header.
  if (pathname === '/command-center' || pathname.startsWith('/command-center/')
    || pathname === '/strategies' || pathname.startsWith('/strategies/')) return null;

  return (
    <header className="nova-global-nav">
      <div className="nova-global-nav-inner">
        <Link className="nova-global-brand" href="/" aria-label="VOOM NOVA Dashboard">
          <span className="nova-global-emblem">V</span>
          <span>
            <strong>VOOM <i>/ NOVA</i></strong>
            <small>INTELLIGENCE SYSTEMS</small>
          </span>
        </Link>

        <nav className="nova-global-links" aria-label="NOVA main navigation">
          {items.map((item) => {
            const active = item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={'nova-global-link' + (active ? ' active' : '')}
                aria-current={active ? 'page' : undefined}
              >
                <span className="nova-global-code">{item.code}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="nova-global-status" aria-label="Trading status">
          <span className="nova-global-led" />
          <span><strong>READ-ONLY</strong><small>LIVE TRADING OFF</small></span>
          <Link className={'nova-global-profile' + (pathname === '/profile' || pathname === '/login' ? ' active' : '')} href="/profile" aria-label="Profile and login">U</Link>
        </div>
      </div>
    </header>
  );
}
