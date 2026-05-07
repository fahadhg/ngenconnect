'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';

function LiveBadge() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-1 border border-border">
      <span className="live-dot" />
      <span className="text-[11px] text-ink-muted font-medium">Live Data</span>
      <span className="text-[10px] text-ink-faint">{today}</span>
    </div>
  );
}

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border bg-surface-0/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/trade" className="shrink-0 group">
          <span className="font-semibold text-sm tracking-tight group-hover:text-ngen transition-colors">ResilienceHQ</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          <Link
            href="/trade"
            className={clsx(
              'px-4 py-2 rounded-md text-sm transition-colors',
              pathname === '/' ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-1'
            )}
          >
            Industries
          </Link>
          <Link
            href="/trade/browse"
            className={clsx(
              'px-4 py-2 rounded-md text-sm transition-colors',
              pathname?.startsWith('/browse') ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-1'
            )}
          >
            Imports
          </Link>
          <Link
            href="/trade/exports"
            className={clsx(
              'px-4 py-2 rounded-md text-sm transition-colors',
              pathname?.startsWith('/exports') ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-1'
            )}
          >
            Exports
          </Link>
          <Link
            href="/trade/intel"
            className={clsx(
              'px-4 py-2 rounded-md text-sm transition-colors',
              pathname?.startsWith('/intel') ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:text-ink hover:bg-surface-1'
            )}
          >
            Intel
          </Link>
          <div className="w-px h-5 bg-border mx-2 hidden sm:block" />
          <a
            href="https://www.ngen.ca"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-faint hover:text-ngen text-sm px-3 py-2 transition-colors hidden sm:flex items-center gap-1.5"
          >
            NGen.ca
            <ExternalLink className="w-3 h-3" />
          </a>
        </nav>

        {/* Data freshness badge */}
        <LiveBadge />
      </div>
    </header>
  );
}
