/** Regional configuration: countries, regions, and intelligent defaults. */

export interface CountryConfig {
  code: string
  name_es: string
  name_en: string
  timeFormat: "24h" | "12h"
  firstDayOfWeek: number // 0=Mon, 5=Sat, 6=Sun
  regions: { code: string; name: string }[]
}

export const COUNTRIES: CountryConfig[] = [
  {
    code: "ES", name_es: "España", name_en: "Spain",
    timeFormat: "24h", firstDayOfWeek: 0,
    regions: [
      { code: "and", name: "Andalucía" },
      { code: "ara", name: "Aragón" },
      { code: "ast", name: "Asturias" },
      { code: "bal", name: "Islas Baleares" },
      { code: "can", name: "Canarias" },
      { code: "cnt", name: "Cantabria" },
      { code: "clm", name: "Castilla-La Mancha" },
      { code: "cyl", name: "Castilla y León" },
      { code: "cat", name: "Cataluña" },
      { code: "val", name: "Comunidad Valenciana" },
      { code: "ext", name: "Extremadura" },
      { code: "gal", name: "Galicia" },
      { code: "rio", name: "La Rioja" },
      { code: "mad", name: "Comunidad de Madrid" },
      { code: "mur", name: "Región de Murcia" },
      { code: "nav", name: "Navarra" },
      { code: "vac", name: "País Vasco" },
      { code: "ceu", name: "Ceuta" },
      { code: "mel", name: "Melilla" },
    ],
  },
  {
    code: "AE", name_es: "Emiratos Árabes Unidos", name_en: "United Arab Emirates",
    timeFormat: "12h", firstDayOfWeek: 6,
    regions: [
      { code: "abu", name: "Abu Dhabi" },
      { code: "dxb", name: "Dubai" },
      { code: "shj", name: "Sharjah" },
      { code: "ajm", name: "Ajman" },
      { code: "uaq", name: "Umm Al Quwain" },
      { code: "rak", name: "Ras Al Khaimah" },
      { code: "fuj", name: "Fujairah" },
    ],
  },
  {
    code: "GB", name_es: "Reino Unido", name_en: "United Kingdom",
    timeFormat: "12h", firstDayOfWeek: 0,
    regions: [
      { code: "eng", name: "England" },
      { code: "sco", name: "Scotland" },
      { code: "wal", name: "Wales" },
      { code: "nir", name: "Northern Ireland" },
    ],
  },
  {
    code: "FR", name_es: "Francia", name_en: "France",
    timeFormat: "24h", firstDayOfWeek: 0,
    regions: [
      { code: "idf", name: "Île-de-France" },
      { code: "pac", name: "Provence-Alpes-Côte d'Azur" },
      { code: "occ", name: "Occitanie" },
      { code: "naq", name: "Nouvelle-Aquitaine" },
      { code: "ara", name: "Auvergne-Rhône-Alpes" },
    ],
  },
  {
    code: "DE", name_es: "Alemania", name_en: "Germany",
    timeFormat: "24h", firstDayOfWeek: 0,
    regions: [
      { code: "bay", name: "Bayern" },
      { code: "nrw", name: "Nordrhein-Westfalen" },
      { code: "baw", name: "Baden-Württemberg" },
      { code: "ber", name: "Berlin" },
      { code: "ham", name: "Hamburg" },
    ],
  },
  {
    code: "IT", name_es: "Italia", name_en: "Italy",
    timeFormat: "24h", firstDayOfWeek: 0,
    regions: [
      { code: "lom", name: "Lombardia" },
      { code: "laz", name: "Lazio" },
      { code: "cam", name: "Campania" },
      { code: "ven", name: "Veneto" },
      { code: "tos", name: "Toscana" },
    ],
  },
  {
    code: "PT", name_es: "Portugal", name_en: "Portugal",
    timeFormat: "24h", firstDayOfWeek: 0,
    regions: [
      { code: "lis", name: "Lisboa" },
      { code: "por", name: "Porto" },
      { code: "alg", name: "Algarve" },
      { code: "mad", name: "Madeira" },
      { code: "azo", name: "Açores" },
    ],
  },
  {
    code: "US", name_es: "Estados Unidos", name_en: "United States",
    timeFormat: "12h", firstDayOfWeek: 6,
    regions: [
      { code: "ca", name: "California" },
      { code: "ny", name: "New York" },
      { code: "tx", name: "Texas" },
      { code: "fl", name: "Florida" },
      { code: "il", name: "Illinois" },
      { code: "ma", name: "Massachusetts" },
    ],
  },
  {
    code: "SA", name_es: "Arabia Saudita", name_en: "Saudi Arabia",
    timeFormat: "12h", firstDayOfWeek: 6,
    regions: [
      { code: "riy", name: "Riyadh" },
      { code: "jed", name: "Jeddah" },
      { code: "dam", name: "Dammam" },
    ],
  },
  {
    code: "IN", name_es: "India", name_en: "India",
    timeFormat: "12h", firstDayOfWeek: 6,
    regions: [
      { code: "mah", name: "Maharashtra" },
      { code: "del", name: "Delhi" },
      { code: "kar", name: "Karnataka" },
      { code: "tn", name: "Tamil Nadu" },
    ],
  },
  {
    code: "AU", name_es: "Australia", name_en: "Australia",
    timeFormat: "12h", firstDayOfWeek: 0,
    regions: [
      { code: "nsw", name: "New South Wales" },
      { code: "vic", name: "Victoria" },
      { code: "qld", name: "Queensland" },
    ],
  },
]

export function getCountry(code: string): CountryConfig | undefined {
  return COUNTRIES.find((c) => c.code === code)
}
