// Handle-domain constants: the cosmos/nature word pool + format config for the
// auto-generated public handle that replaces the display name (no real names — DESIGN).
// A handle is `<Word>-<number>`, e.g. `Pulsar-4821`. The Word comes from this curated
// list; the number is a random, zero-padded discriminator that (a) lets many users share
// a word and (b) is widened on repeated collision so a hot word never saturates.
//
// Curation notes: every entry is a single alphanumeric CamelCase token (no spaces, no
// internal hyphens — the hyphen is the separator). The list is the sole curation surface,
// so anything offensive/ambiguous is simply kept out. Words are vendored, not a dependency.
// (The original list's "Space-time" is folded into "Spacetime" to keep tokens hyphen-free.)

export const HANDLE_WORDS = [
  "BlackHole", "Cosmology", "Interstellar", "StarCluster", "CosmicRays", "Exoplanet",
  "Celestial", "SpaceProbe", "Gravity", "SpaceDebris", "EventHorizon", "SpaceExploration",
  "Telescopes", "Cosmic", "Interplanetary", "Asterism", "PlanetaryRing", "HubbleSpaceTelescope",
  "PlanetarySystem", "CosmicInflation", "CelestialSphere", "SolarSystem", "Astrobiology",
  "InterplanetaryDustCloud", "DarkNebula", "Astrodynamics", "MeteorShower", "Magnetosphere",
  "RedGiant", "CelestialEvent", "InterstellarMedium", "Spacetime", "GravitationalLensing",
  "GalacticCenter", "PlanetaryNebula", "LunarModule", "Zenith", "CosmicRad", "Starlight",
  "SolarFlare", "CelestialNavigation", "RocketLaunch", "SpaceWeather", "AstronomicalUnit",
  "CosmicHorizon", "Neutrino", "Cosmonaut", "PlanetaryExploration", "Magnetar",
  "SpaceObservatory", "Astrochemistry", "RocheLimit", "CelestialMechanics", "OrbitalVelocity",
  "StellarEvolution", "Astrogeology", "Mercury", "Equinox", "Jupiter", "NeutronStar",
  "Uranus", "Venus", "SolarEclipse", "Radiation", "Astronomers", "SolarWind", "Pulsar",
  "Meteoroid", "CelestialBody", "SpaceStation", "Magnitude", "DarkMatter", "Supernovae",
  "AuroraAustralis", "KuiperBelt", "DarkEnergy", "Galileo", "AndromedaGalaxy", "SpiralGalaxy",
  "LunarEclipse", "GammaRays", "NorthernLights", "Altitude", "ElectroMagnetic",
  "CelestialEquator", "DwarfPlanet", "Astronaut", "Explosion", "Particle", "Gases", "Aphelion",
  "Fireball", "SouthernLights", "AuroraBorealis", "RadioWaves", "Rocket", "Protons", "Electrons",
  "DoubleStar", "Discovery", "Galaxy", "Moon", "Meteors", "Pluto", "Nebula", "Asteroids",
  "Saturn", "Mars", "Satellites", "Meteorite", "Comets", "Orbit", "Neptune", "Quasar", "JWST",
  "Atom", "Neutron", "String",
] as const;

/** The `<Word>-<number>` separator. Words are kept free of this char so the split is clean. */
export const HANDLE_SEPARATOR = "-";

/** Discriminator width for a fresh handle: 4 digits ⇒ 0000–9999 (10k slots per word). */
export const HANDLE_BASE_DIGITS = 4;

/**
 * Reactive auto-widen guard (answers the saturation question without a stats table):
 * every `HANDLE_ATTEMPTS_PER_WIDEN` consecutive collisions on a word, the candidate's
 * digit count grows by one (×10 the space). A word that's ~full at 4 digits escalates to
 * 5 after a few misses, dropping its fill ratio back near zero — so we never enter the
 * retry-storm regime. At realistic fill the very first attempt succeeds.
 */
export const HANDLE_ATTEMPTS_PER_WIDEN = 4;

/** Hard cap on attempts before giving up (astronomically unreachable — a safety valve). */
export const HANDLE_MAX_ATTEMPTS = 40;
