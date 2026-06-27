// Geo code → display name resolution for the demographic breakdown. Sources the same MIT
// `country-region-data` package the profile dropdowns use (ProfileEditor), so a stored code
// ("US", "US-CA") maps back to the exact label the voter picked. Lookup maps are built once
// at module load (static data); an unknown code falls back to the raw code, never throws.

import { allCountries } from "country-region-data";

// country-region-data tuples: country = [name, isoCode, regions]; region = [name, isoCode].
const COUNTRY_NAME = new Map<string, string>();
const STATE_NAME = new Map<string, string>();

for (const country of allCountries) {
  const name = country[0];
  const iso = country[1];
  COUNTRY_NAME.set(iso, name);
  for (const region of country[2]) {
    const regionCode = region[1];
    if (regionCode) STATE_NAME.set(`${iso}-${regionCode}`, region[0]);
  }
}

/** "US" → "United States" (raw code if unknown). */
export function countryLabel(code: string): string {
  return COUNTRY_NAME.get(code) ?? code;
}

/** "US-CA" → "California" (raw code if unknown). */
export function stateLabel(code: string): string {
  return STATE_NAME.get(code) ?? code;
}
