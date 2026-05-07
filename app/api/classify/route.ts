import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { description } = await request.json();

    if (!description || description.length < 3) {
      return NextResponse.json({ error: 'Description too short' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // Fallback: keyword-based matching without AI
      return NextResponse.json({
        status: 'fallback',
        message: 'Add ANTHROPIC_API_KEY env var for AI classification. Using keyword matching.',
        suggestions: keywordMatch(description)
      });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a Canadian customs tariff classification expert. Given this product description, suggest the most likely HS codes from the Canadian Customs Tariff (T2026).

Product: "${description}"

Return ONLY a JSON array of up to 3 suggestions, each with:
- "hs6": the 6-digit HS code (e.g. "731815")
- "hs_formatted": formatted (e.g. "7318.15")
- "description": what this HS code covers
- "confidence": "high", "medium", or "low"
- "reasoning": one sentence why this matches

Return ONLY the JSON array, no other text.`
        }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ status: 'error', message: `Anthropic API: ${res.status}`, detail: err });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '[]';

    try {
      const suggestions = JSON.parse(text.replace(/```json|```/g, '').trim());
      return NextResponse.json({ status: 'ok', suggestions });
    } catch {
      return NextResponse.json({ status: 'ok', raw: text, suggestions: [] });
    }
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message });
  }
}

function keywordMatch(desc: string): any[] {
  const d = desc.toLowerCase();
  const matches: any[] = [];

  const rules: [string[], string, string, string][] = [
    [['bolt', 'screw', 'nut', 'fastener', 'washer'], '7318', '7318.15', 'Screws, bolts, nuts, washers of iron or steel'],
    [['steel', 'iron', 'coil', 'hot-rolled', 'cold-rolled'], '7208', '7208.51', 'Flat-rolled products of iron/steel'],
    [['aluminum', 'aluminium', 'bar', 'rod', 'profile'], '7604', '7604.10', 'Aluminium bars, rods and profiles'],
    [['motor', 'electric motor', 'dc motor'], '8501', '8501.31', 'Electric motors and generators'],
    [['wire', 'cable', 'conductor', 'electric cable'], '8544', '8544.49', 'Electric conductors'],
    [['valve', 'tap', 'cock', 'hydraulic'], '8481', '8481.80', 'Taps, cocks, valves and similar appliances'],
    [['bearing', 'ball bearing', 'roller bearing'], '8482', '8482.10', 'Ball or roller bearings'],
    [['pump', 'compressor', 'hydraulic pump'], '8413', '8413.30', 'Pumps and compressors'],
    [['gear', 'shaft', 'transmission', 'crank'], '8483', '8483.10', 'Transmission shafts, cranks, gearing'],
    [['plastic', 'polyethylene', 'polypropylene', 'pvc'], '3920', '3920.10', 'Plates, sheets, film of plastics'],
    [['brake', 'brake pad', 'disc brake'], '8708', '8708.30', 'Brakes and parts for motor vehicles'],
    [['vehicle', 'car', 'truck', 'auto part'], '8708', '8708.99', 'Parts and accessories for motor vehicles'],
    [['sensor', 'instrument', 'regulating', 'thermostat'], '9032', '9032.89', 'Automatic regulating instruments'],
    [['tube', 'pipe', 'steel tube', 'welded tube'], '7306', '7306.30', 'Tubes, pipes of iron or steel'],
    [['rubber', 'gasket', 'seal', 'o-ring'], '4016', '4016.93', 'Articles of vulcanized rubber'],
    [['circuit', 'pcb', 'printed circuit', 'electronic'], '8534', '8534.00', 'Printed circuits'],
    [['glass', 'lens', 'optical'], '7007', '7007.19', 'Safety glass, tempered or laminated'],
    [['copper', 'copper wire', 'copper tube'], '7408', '7408.11', 'Copper wire and tubes'],
  ];

  for (const [keywords, hs4, hs6, description] of rules) {
    if (keywords.some(kw => d.includes(kw))) {
      matches.push({
        hs6: hs6.replace('.', ''),
        hs_formatted: hs6,
        description,
        confidence: keywords.filter(kw => d.includes(kw)).length > 1 ? 'high' : 'medium',
        reasoning: `Matched keywords: ${keywords.filter(kw => d.includes(kw)).join(', ')}`
      });
    }
  }

  return matches.slice(0, 3);
}
