import type { LocationMode, OpportunityLocation } from "./types";

export const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  PR: "Puerto Rico",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const STATE_BY_NAME = new Map(
  Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]),
);

/** Metro shorthands that job boards use instead of "City, ST". */
const CITY_ALIASES: Record<string, string> = {
  nyc: "NY",
  "new york city": "NY",
  "new york": "NY",
  manhattan: "NY",
  brooklyn: "NY",
  sf: "CA",
  "san francisco": "CA",
  "san francisco bay area": "CA",
  "bay area": "CA",
  "silicon valley": "CA",
  "mountain view": "CA",
  "palo alto": "CA",
  sunnyvale: "CA",
  cupertino: "CA",
  "san jose": "CA",
  "los angeles": "CA",
  "san diego": "CA",
  la: "CA",
  seattle: "WA",
  redmond: "WA",
  bellevue: "WA",
  chicago: "IL",
  boston: "MA",
  cambridge: "MA",
  austin: "TX",
  dallas: "TX",
  houston: "TX",
  denver: "CO",
  boulder: "CO",
  atlanta: "GA",
  "atlanta metro": "GA",
  charlotte: "NC",
  raleigh: "NC",
  durham: "NC",
  "research triangle park": "NC",
  rtp: "NC",
  "chapel hill": "NC",
  greensboro: "NC",
  charleston: "SC",
  columbia: "SC",
  greenville: "SC",
  richmond: "VA",
  arlington: "VA",
  reston: "VA",
  "mclean": "VA",
  "tysons": "VA",
  "virginia beach": "VA",
  blacksburg: "VA",
  charlottesville: "VA",
  "morgantown": "WV",
  "washington dc": "DC",
  "washington, d.c.": "DC",
  "philadelphia": "PA",
  pittsburgh: "PA",
  detroit: "MI",
  "ann arbor": "MI",
  minneapolis: "MN",
  phoenix: "AZ",
  "salt lake city": "UT",
  nashville: "TN",
  miami: "FL",
  orlando: "FL",
  tampa: "FL",
  "st. louis": "MO",
  "kansas city": "MO",
  portland: "OR",
  "new orleans": "LA",
  baltimore: "MD",
  "bethesda": "MD",
  princeton: "NJ",
  "jersey city": "NJ",
  hoboken: "NJ",
  newark: "NJ",
  madison: "WI",
  milwaukee: "WI",
  cincinnati: "OH",
  columbus: "OH",
  cleveland: "OH",
  indianapolis: "IN",
  "des moines": "IA",
  omaha: "NE",
  albuquerque: "NM",
  "las vegas": "NV",
  "oklahoma city": "OK",
  memphis: "TN",
  louisville: "KY",
  birmingham: "AL",
  jacksonville: "FL",
  hartford: "CT",
  stamford: "CT",
  providence: "RI",
  "ithaca": "NY",
  "rochester": "NY",
  "buffalo": "NY",
  "albany": "NY",
};

const NON_US_HINTS = [
  "canada",
  "united kingdom",
  "u.k.",
  "uk",
  "england",
  "scotland",
  "ireland",
  "india",
  "china",
  "japan",
  "singapore",
  "germany",
  "france",
  "spain",
  "portugal",
  "italy",
  "netherlands",
  "belgium",
  "switzerland",
  "sweden",
  "norway",
  "denmark",
  "finland",
  "poland",
  "austria",
  "australia",
  "new zealand",
  "brazil",
  "mexico",
  "argentina",
  "chile",
  "colombia",
  "peru",
  "israel",
  "uae",
  "dubai",
  "abu dhabi",
  "south africa",
  "nigeria",
  "kenya",
  "ghana",
  "egypt",
  "morocco",
  "turkey",
  "korea",
  "taiwan",
  "hong kong",
  "vietnam",
  "thailand",
  "indonesia",
  "philippines",
  "malaysia",
  "pakistan",
  "bangladesh",
  "sri lanka",
  "nepal",
  "toronto",
  "vancouver",
  "montreal",
  "ottawa",
  "waterloo, on",
  "london",
  "dublin",
  "edinburgh",
  "manchester",
  "bristol",
  "cambridge, uk",
  "paris",
  "berlin",
  "munich",
  "amsterdam",
  "brussels",
  "zurich",
  "geneva",
  "stockholm",
  "copenhagen",
  "oslo",
  "helsinki",
  "warsaw",
  "krakow",
  "prague",
  "vienna",
  "budapest",
  "lisbon",
  "madrid",
  "barcelona",
  "milan",
  "rome",
  "athens",
  "tel aviv",
  "bangalore",
  "bengaluru",
  "hyderabad",
  "mumbai",
  "delhi",
  "pune",
  "chennai",
  "gurgaon",
  "noida",
  "beijing",
  "shanghai",
  "shenzhen",
  "tokyo",
  "osaka",
  "seoul",
  "taipei",
  "sydney",
  "melbourne",
  "auckland",
  "lagos",
  "nairobi",
  "cairo",
  "sao paulo",
  "são paulo",
  "rio de janeiro",
  "mexico city",
  "buenos aires",
  "santiago",
  "bogota",
  "bogotá",
  "lima",
];

const VIRTUAL_HINTS = [
  "online",
  "virtual",
  "remote",
  "anywhere",
  "worldwide",
  "global",
  "digital",
  "internet",
];

const US_HINTS = [
  "united states",
  "usa",
  "u.s.a.",
  "u.s.",
  "us",
  "america",
];

export function normalizeStateToken(token: string | undefined | null): string | undefined {
  if (!token) return undefined;
  const cleaned = token.trim().replace(/\.$/, "");
  if (!cleaned) return undefined;
  const upper = cleaned.toUpperCase();
  if (upper.length === 2 && US_STATES[upper]) return upper;
  const byName = STATE_BY_NAME.get(cleaned.toLowerCase());
  if (byName) return byName;
  return undefined;
}

function detectMode(raw: string): LocationMode {
  const lower = raw.toLowerCase();
  const virtual = VIRTUAL_HINTS.some((hint) =>
    new RegExp(`\\b${hint}\\b`).test(lower),
  );
  const hybrid = /\bhybrid\b/.test(lower) || (virtual && /\bin[- ]person\b/.test(lower));
  if (hybrid) return "hybrid";
  if (virtual) return "virtual";
  return "in_person";
}

/**
 * Turns the free-text location strings every source uses into a comparable shape.
 * Sources are inconsistent ("GA ", "Georgia", "Atlanta, GA", "NYC", "Remote in USA"),
 * so every downstream rule reads this instead of the raw string.
 */
export function parseLocation(raw: string): OpportunityLocation {
  const input = (raw ?? "").trim();
  if (!input) return { raw: "Unspecified", mode: "unknown" };

  const lower = input.toLowerCase();
  const mode = detectMode(input);

  if (mode === "virtual" && !/,/.test(input)) {
    const country = US_HINTS.some((hint) => lower.includes(hint)) ? "US" : undefined;
    return { raw: input, mode, country };
  }

  const directState = normalizeStateToken(input);
  if (directState) {
    return {
      raw: input,
      state: directState,
      stateName: US_STATES[directState],
      country: "US",
      mode,
    };
  }

  const parts = input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const state = normalizeStateToken(parts[i]);
    if (state) {
      const city = parts.slice(0, i).join(", ") || undefined;
      return {
        raw: input,
        city,
        state,
        stateName: US_STATES[state],
        country: "US",
        mode,
      };
    }
  }

  const aliasKey = parts[0]?.toLowerCase() ?? lower;
  const aliasState = CITY_ALIASES[aliasKey] ?? CITY_ALIASES[lower];
  if (aliasState) {
    return {
      raw: input,
      city: parts[0],
      state: aliasState,
      stateName: US_STATES[aliasState],
      country: "US",
      mode,
    };
  }

  const foreign = NON_US_HINTS.find((hint) => {
    const needle = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`).test(lower);
  });
  if (foreign) {
    return { raw: input, city: parts[0], country: "NON_US", mode };
  }

  if (US_HINTS.some((hint) => new RegExp(`\\b${hint}\\b`).test(lower))) {
    return { raw: input, city: parts[0], country: "US", mode };
  }

  return { raw: input, city: parts[0], mode };
}

export function isUnitedStates(location: OpportunityLocation): boolean {
  return location.country === "US";
}

export function inHomeRegion(
  location: OpportunityLocation,
  homeRegion: string[],
): boolean {
  return Boolean(location.state && homeRegion.includes(location.state));
}

export function isVirtual(location: OpportunityLocation): boolean {
  return location.mode === "virtual" || location.mode === "hybrid";
}

export function formatLocation(location: OpportunityLocation): string {
  if (location.mode === "virtual") return "Virtual";
  if (location.city && location.state) return `${location.city}, ${location.state}`;
  if (location.state) return US_STATES[location.state] ?? location.state;
  return location.raw;
}

export function formatLocations(locations: OpportunityLocation[]): string {
  if (!locations.length) return "Location unspecified";
  const unique = Array.from(new Set(locations.map(formatLocation)));
  if (unique.length <= 2) return unique.join(" · ");
  return `${unique.slice(0, 2).join(" · ")} +${unique.length - 2} more`;
}
