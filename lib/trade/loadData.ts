import { promises as fs } from 'fs';
import path from 'path';
import type { TariffItem, ImportOverlay, USRatesOverlay, SurtaxOverlay, HSSection } from './data';

/**
 * Load all data from JSON files and integrate with StatsCan API
 * 
 * Data hierarchy:
 * 1. Try to fetch fresh data from /api/data/refresh (real-time StatsCan)
 * 2. Fallback to local JSON files if API unavailable
 * 3. Always return complete dataset
 */

async function fetchLiveStatsCan() {
  try {
    const response = await fetch('/api/data/refresh', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      return {
        mfgHealth: data.data?.mfgHealth,
        labour: data.data?.labour,
        inputCosts: data.data?.inputCosts,
        sectionImports: data.data?.sectionImports,
        generated: data.generated,
        lastUpdated: new Date(data.generated).toISOString(),
      };
    }
  } catch (error) {
    console.warn('[v0] StatsCan API fetch failed, using cached data:', error);
  }
  return null;
}

export async function loadAllData() {
  const d = path.join(process.cwd(), 'public', 'data');
  
  // Attempt to fetch live StatsCan data (client-side will use cached version)
  const liveData = typeof window !== 'undefined' ? await fetchLiveStatsCan() : null;
  
  const [t, i, u, s, sec, mfgHealth, labour, inputCosts] = await Promise.all([
    fs.readFile(path.join(d, 'tariff.json'), 'utf-8'),
    fs.readFile(path.join(d, 'imports.json'), 'utf-8'),
    fs.readFile(path.join(d, 'us_rates.json'), 'utf-8'),
    fs.readFile(path.join(d, 'surtaxes.json'), 'utf-8'),
    fs.readFile(path.join(d, 'sections.json'), 'utf-8'),
    fs.readFile(path.join(d, 'intel', 'mfg-health.json'), 'utf-8').catch(() => '{}'),
    fs.readFile(path.join(d, 'intel', 'labour.json'), 'utf-8').catch(() => '{}'),
    fs.readFile(path.join(d, 'intel', 'input-costs.json'), 'utf-8').catch(() => '{}'),
  ]);
  
  return {
    tariffData: JSON.parse(t) as TariffItem[],
    importData: JSON.parse(i) as ImportOverlay,
    usRates: JSON.parse(u) as USRatesOverlay,
    surtaxData: JSON.parse(s) as SurtaxOverlay,
    sections: JSON.parse(sec) as HSSection[],
    // Intel modules (fallback to local if live API unavailable)
    mfgHealth: liveData?.mfgHealth || JSON.parse(mfgHealth),
    labour: liveData?.labour || JSON.parse(labour),
    inputCosts: liveData?.inputCosts || JSON.parse(inputCosts),
    // Data source metadata
    dataSource: {
      live: !!liveData,
      generated: liveData?.generated || JSON.parse(sec).generated,
      lastUpdated: liveData?.lastUpdated || new Date().toISOString(),
      refreshEndpoint: '/api/data/refresh',
      documentation: 'See DATA-INFRASTRUCTURE.md',
    },
  };
}
