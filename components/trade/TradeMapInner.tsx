'use client';

import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const NUM_TO_ISO3: Record<number, string> = {
  840: 'USA', 156: 'CHN', 484: 'MEX', 392: 'JPN', 276: 'DEU', 826: 'GBR',
  410: 'KOR', 250: 'FRA', 380: 'ITA', 356: 'IND', 76: 'BRA', 528: 'NLD',
  756: 'CHE', 36: 'AUS', 724: 'ESP', 458: 'MYS', 158: 'TWN', 56: 'BEL',
  752: 'SWE', 764: 'THA', 578: 'NOR', 704: 'VNM', 710: 'ZAF', 360: 'IDN',
  784: 'ARE', 682: 'SAU', 792: 'TUR', 616: 'POL', 152: 'CHL', 32: 'ARG',
  170: 'COL', 608: 'PHL', 203: 'CZE', 40: 'AUT', 208: 'DNK', 643: 'RUS',
  246: 'FIN', 620: 'PRT', 702: 'SGP', 348: 'HUN', 376: 'ISR', 554: 'NZL',
  300: 'GRC', 368: 'IRQ', 586: 'PAK', 818: 'EGY', 100: 'BGR', 642: 'ROU',
  804: 'UKR', 191: 'HRV', 398: 'KAZ', 12: 'DZA', 504: 'MAR', 604: 'PER',
  566: 'NGA', 50: 'BGD', 218: 'ECU', 320: 'GTM', 188: 'CRI', 384: 'CIV',
  414: 'KWT', 634: 'QAT', 512: 'OMN', 400: 'JOR', 144: 'LKA',
  104: 'MMR', 116: 'KHM', 344: 'HKG', 196: 'CYP',
  703: 'SVK', 705: 'SVN', 440: 'LTU', 428: 'LVA', 233: 'EST', 372: 'IRL',
  442: 'LUX', 352: 'ISL',
};

function getColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return '#d1fae5';
  const t = Math.log(value + 1) / Math.log(max + 1);
  const r = Math.round(209 - t * (209 - 30));
  const g = Math.round(250 - t * (250 - 58));
  const b = Math.round(229 - t * (229 - 138));
  return `rgb(${r},${g},${b})`;
}

interface Props {
  valueMap: Map<string, number>;
  maxValue: number;
  onMove: (name: string, value: number, x: number, y: number) => void;
  onLeave: () => void;
}

export default function TradeMapInner({ valueMap, maxValue, onMove, onLeave }: Props) {
  return (
    <ComposableMap
      projectionConfig={{ scale: 140, center: [0, 20] }}
      style={{ width: '100%', height: 'auto' }}
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map((geo: any) => {
            const numId = parseInt(geo.id);
            const iso3 = NUM_TO_ISO3[numId];
            const value = iso3 ? (valueMap.get(iso3) ?? 0) : 0;
            const isCanada = iso3 === 'CAN';

            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={isCanada ? '#FF6B35' : getColor(value, maxValue)}
                stroke="#fff"
                strokeWidth={0.3}
                style={{
                  default: { outline: 'none' },
                  hover:   { outline: 'none', opacity: 0.85 },
                  pressed: { outline: 'none' },
                }}
                onMouseMove={(evt: any) =>
                  onMove(geo.properties?.name ?? iso3 ?? '', value, evt.clientX, evt.clientY)
                }
                onMouseLeave={onLeave}
              />
            );
          })
        }
      </Geographies>
    </ComposableMap>
  );
}
