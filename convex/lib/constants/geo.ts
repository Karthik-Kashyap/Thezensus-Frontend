// Geo demographics constants (DESIGN-008 region split). `region` was a single free-text
// string ("US-CA"); it's replaced by two flat marginal dims — `country` (ISO-3166-1
// alpha-2, e.g. "US") and `state` (ISO-3166-2, e.g. "US-CA"). Both stay FLAT marginals,
// never crossed (DESIGN-008 §Caps). The frontend sources its dropdowns from the MIT
// `country-region-data` package; the backend validates shape against this allowlist only
// (subdivision membership is deliberately NOT checked — the dropdown constrains input and a
// stray code only pollutes that one voter's own marginal).

/** ISO-3166-1 alpha-2 country codes (the 249 officially assigned), as a fast lookup Set. */
const ALPHA2 =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO " +
  "BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ " +
  "DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP " +
  "GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG " +
  "KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML " +
  "MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE " +
  "PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL " +
  "SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM " +
  "US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";

export const COUNTRY_CODES: ReadonlySet<string> = new Set(ALPHA2.split(" "));

/** Field-length caps (mirrors PROFILE_LIMITS style). state = "US-CA" → at most 6 chars. */
export const GEO_LIMITS = {
  countryMax: 2,
  stateMax: 6,
} as const;

/** Whether `code` is an assigned ISO-3166-1 alpha-2 country code. */
export function isValidCountry(code: string): boolean {
  return COUNTRY_CODES.has(code);
}

/**
 * Shape-validate an ISO-3166-2 state ("US-CA"): its country prefix must equal `country`
 * (which must itself be a valid country) and the subdivision part is 1–3 alphanumerics.
 * Membership of the specific subdivision is intentionally NOT checked.
 */
export function isValidState(state: string, country: string): boolean {
  if (!isValidCountry(country)) return false;
  return new RegExp(`^${country}-[A-Z0-9]{1,3}$`).test(state);
}
