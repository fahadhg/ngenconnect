'use client';

import { useState, useMemo } from 'react';
import { TariffItem, ImportOverlay, CHAPTER_NAMES, getHS6, getBestFTA, fmtVal, FTA_LABELS } from '@/lib/trade/data';

interface Props {
  tariffData: TariffItem[];
  importData: ImportOverlay;
}

interface ClassifyResult {
  matches: { item: TariffItem; score: number; reason: string }[];
}

function scoreMatch(item: TariffItem, keywords: string[]): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];
  const desc = item.d.toLowerCase();
  const hs = item.h;

  for (const kw of keywords) {
    if (desc.includes(kw)) {
      score += 10;
      reasons.push(`"${kw}" in description`);
    }
    if (hs.includes(kw)) {
      score += 15;
      reasons.push(`"${kw}" in HS code`);
    }
  }

  // Boost leaf codes (longer HS codes)
  if (hs.length >= 12) score += 3;
  // Boost items with UOM (actual tariff lines, not headings)
  if (item.u) score += 2;

  return { score, reason: reasons.join(', ') || 'Partial match' };
}

const EXAMPLES = [
  'stainless steel M8 hex bolt for marine use',
  'brushless DC motor 500W for industrial automation',
  'polyethylene shrink wrap film 50 micron',
  'hydraulic cylinder 100mm bore double acting',
  'copper electrical conductor 600V rated',
  'aluminum extrusion 6061-T6 bar stock',
  'automotive brake pad assembly ceramic',
  'printed circuit board populated SMT',
];

export default function HSClassifier({ tariffData, importData }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClassifyResult | null>(null);
  const [loading, setLoading] = useState(false);

  const classify = () => {
    if (!query.trim()) return;
    setLoading(true);

    // Local keyword matching (fast, no API needed)
    const keywords = query.toLowerCase()
      .replace(/[^a-z0-9\s.-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .filter(w => !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was'].includes(w));

    const scored = tariffData
      .map(item => {
        const { score, reason } = scoreMatch(item, keywords);
        return { item, score, reason };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    setTimeout(() => {
      setResults({ matches: scored });
      setLoading(false);
    }, 300);
  };

  return (
    <div className="animate-fade-in">
      <h2 className="font-display text-base font-medium mb-1">HS code classifier</h2>
      <p className="text-xs text-ink-muted mb-5">Describe a part in plain English and get matched HS codes with tariff rates</p>

      <div className="mb-4">
        <div className="flex gap-2">
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && classify()}
            placeholder="e.g. stainless steel M8 hex bolt for marine use"
            className="flex-1 bg-surface-2 border border-border rounded px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/40" />
          <button onClick={classify} disabled={loading || !query.trim()}
            className="px-4 py-2.5 bg-accent/15 border border-accent/30 rounded text-sm text-accent hover:bg-accent/25 transition-colors disabled:opacity-40">
            {loading ? 'Classifying...' : 'Classify'}
          </button>
        </div>
      </div>

      {/* Example queries */}
      {!results && (
        <div className="mb-6">
          <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-2">Try an example</div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => { setQuery(ex); }}
                className="text-[11px] px-2.5 py-1 bg-surface-1 border border-border rounded hover:border-accent/30 text-ink-muted hover:text-ink transition-colors">
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium">{results.matches.length} potential matches</h3>
            <button onClick={() => { setResults(null); setQuery(''); }}
              className="text-xs text-ink-muted hover:text-ink">Clear</button>
          </div>

          {results.matches.length === 0 ? (
            <div className="py-8 text-center text-ink-faint text-sm">
              No matches found. Try different keywords or be more specific about the material and use.
            </div>
          ) : (
            <div className="space-y-2 stagger">
              {results.matches.map((r, i) => {
                const imp = importData[getHS6(r.item.h)] || null;
                const best = getBestFTA(r.item);
                const confidence = r.score >= 20 ? 'High' : r.score >= 10 ? 'Medium' : 'Low';
                const confColor = r.score >= 20 ? 'text-positive' : r.score >= 10 ? 'text-warn' : 'text-ink-faint';

                return (
                  <div key={r.item.h} className={`p-4 bg-surface-1 border rounded-lg transition-all ${i === 0 ? 'border-accent/30' : 'border-border'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          {i === 0 && <span className="text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">Best match</span>}
                          <span className="font-mono text-sm font-medium text-accent">{r.item.h}</span>
                        </div>
                        <div className="text-sm text-ink-muted mt-1">{r.item.d}</div>
                        <div className="text-xs text-ink-faint mt-0.5">Ch {r.item.c}: {CHAPTER_NAMES[r.item.c]}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-medium ${confColor}`}>{confidence}</div>
                        <div className="text-[10px] text-ink-faint">Score: {r.score}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 mt-2 text-xs">
                      <span>MFN: <span className="font-mono text-warn font-medium">{r.item.m === 0 ? 'Free' : r.item.m + '%'}</span></span>
                      {best && <span>Best FTA: <span className="font-mono text-positive">{best.rate === 0 ? 'Free' : best.rate + '%'} ({best.label})</span></span>}
                      {r.item.g && <span className="text-ink-faint">General: {r.item.g}%</span>}
                      {imp && <span className="text-ink-faint">2025 imports: {fmtVal(imp.t)}</span>}
                    </div>

                    {imp && imp.c.length > 0 && (
                      <div className="text-[11px] text-ink-faint mt-1.5">
                        Top sources: {imp.c.map(c => `${c.n} (${Math.round(c.v / imp.t * 100)}%)`).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 p-3 bg-warn/5 border border-warn/15 rounded text-xs text-warn/80">
            <strong>Important:</strong> This is a keyword-based suggestion tool, not a legal classification.
            For binding tariff classification, request an advance ruling from CBSA.
          </div>
        </div>
      )}
    </div>
  );
}
