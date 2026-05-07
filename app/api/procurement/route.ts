import { NextRequest, NextResponse } from 'next/server';

const CONTRACTS_URL = 'https://open.canada.ca/data/api/action/datastore_search';
const CONTRACTS_RESOURCE = 'fac950c0-00d5-4ec1-a4d3-9cbebf98a305';
const AWARDS_CSV = 'https://canadabuys.canada.ca/opendata/pub/2025-2026-awardNotice-avisAttribution.csv';
const AWARDS_PREV_CSV = 'https://canadabuys.canada.ca/opendata/pub/2024-2025-awardNotice-avisAttribution.csv';

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].replace(/^\uFEFF/, '').split('","').map(h => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split('","').map(v => v.replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get('tab') ?? 'opportunities';
  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '0');
  const search = req.nextUrl.searchParams.get('q') ?? '';
  const PER_PAGE = 100;

  try {
    if (tab === 'opportunities' || tab === 'suppliers') {
      // Fetch from contracts proactive disclosure (datastore)
      const params = new URLSearchParams({
        resource_id: CONTRACTS_RESOURCE,
        limit: String(PER_PAGE),
        offset: String(page * PER_PAGE),
        sort: 'contract_date desc',
      });
      if (search) params.set('q', search);

      const res = await fetch(`${CONTRACTS_URL}?${params}`, { next: { revalidate: 3600 } });
      const json = await res.json();
      const records = json?.result?.records ?? [];
      const total = json?.result?.total ?? 0;

      if (tab === 'opportunities') {
        // For opportunities use award notices CSV (actual tenders/awards)
        const csvRes = await fetch(AWARDS_CSV, { next: { revalidate: 3600 } });
        const csvText = await csvRes.text();
        let rows = parseCSV(csvText);

        // Filter & search
        if (search) {
          const q = search.toLowerCase();
          rows = rows.filter(r =>
            (r['title-titre-eng'] ?? '').toLowerCase().includes(q) ||
            (r['contractingEntityName-nomEntitContractante-eng'] ?? '').toLowerCase().includes(q) ||
            (r['supplierLegalName-nomLegalFournisseur-eng'] ?? '').toLowerCase().includes(q)
          );
        }

        const totalRows = rows.length;
        const paged = rows.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

        const mapped = paged.map(r => ({
          title: r['title-titre-eng'] || r['awardDescription-descriptionAttribution-eng'] || '—',
          department: r['contractingEntityName-nomEntitContractante-eng'] || '—',
          supplier: r['supplierLegalName-nomLegalFournisseur-eng'] || '—',
          supplierCity: r['supplierAddressCity-fournisseurAdresseVille-eng'] || '',
          supplierCountry: r['supplierAddressCountry-fournisseurAdressePays-eng'] || 'Canada',
          value: parseFloat(r['totalContractValue-valeurTotaleContrat'] || r['contractAmount-montantContrat'] || '0') || 0,
          category: r['procurementCategory-categorieApprovisionnement'] || '',
          method: r['procurementMethod-methodeApprovisionnement-eng'] || '',
          status: r['awardStatus-attributionStatut-eng'] || '',
          gsin: r['gsinDescription-nibsDescription-eng'] || '',
          awardDate: r['contractAwardDate-dateAttributionContrat'] || r['publicationDate-datePublication'] || '',
          endDate: r['contractEndDate-dateFinContrat'] || '',
          refNumber: r['referenceNumber-numeroReference'] || '',
        }));

        return NextResponse.json({ records: mapped, total: totalRows });
      }

      // Suppliers tab — use contracts datastore
      return NextResponse.json({ records, total });
    }

    if (tab === 'organizations') {
      const params = new URLSearchParams({
        resource_id: CONTRACTS_RESOURCE,
        limit: String(PER_PAGE),
        offset: String(page * PER_PAGE),
        sort: 'contract_value desc',
      });
      if (search) params.set('q', search);
      const res = await fetch(`${CONTRACTS_URL}?${params}`, { next: { revalidate: 3600 } });
      const json = await res.json();
      return NextResponse.json({ records: json?.result?.records ?? [], total: json?.result?.total ?? 0 });
    }

    return NextResponse.json({ records: [], total: 0 });
  } catch (e) {
    console.error('Procurement API error:', e);
    return NextResponse.json({ records: [], total: 0, error: String(e) }, { status: 500 });
  }
}
