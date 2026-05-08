export type EventType = 'mission' | 'trade-show' | 'summit' | 'conference' | 'other';

export interface TradeEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  endDate?: string;
  source: string;
  sourceUrl: string;
  eventType: EventType;
  countryIso3: string[];
  fetchedAt: string;
}

export interface EventsData {
  events: TradeEvent[];
  lastUpdated: string;
}

export interface FtaAgreement {
  id: string;
  name: string;
  fullName: string;
  inForce: string;
  countries: string[];
  description: string;
  tariffCoverage?: string;
  covers: string[];
  keyProvisions: string[];
  website: string;
}

export interface CountryTrade {
  iso3: string;
  name: string;
  flag: string;
  exports2022: number;
  imports2022: number;
  sparkline: { year: number; exports: number; imports: number }[];
  fta?: FtaAgreement;
}

export interface EnrichedEvent extends TradeEvent {
  countries: CountryTrade[];
}
