// English defaults for new org implementation

export const EN_SHIFTS = [
  { code: "Early", name_es: "Early",  name_en: "Early",  start_time: "07:30", end_time: "15:30" },
  { code: "Mid",   name_es: "Mid",    name_en: "Mid",    start_time: "08:00", end_time: "16:00" },
  { code: "Late",  name_es: "Late",   name_en: "Late",   start_time: "08:30", end_time: "16:30" },
  { code: "Flex1", name_es: "Flex 1", name_en: "Flex 1", start_time: "09:00", end_time: "17:00" },
  { code: "Flex2", name_es: "Flex 2", name_en: "Flex 2", start_time: "09:30", end_time: "17:30" },
]

export const EN_TECNICAS = [
  { codigo: "ICSI", nombre_es: "ICSI",               nombre_en: "ICSI",              department: "lab",       color: "blue"   },
  { codigo: "BIO",  nombre_es: "Biopsy",             nombre_en: "Biopsy",            department: "lab",       color: "purple" },
  { codigo: "OPU",  nombre_es: "Egg Collection",     nombre_en: "Egg Collection",    department: "lab",       color: "amber"  },
  { codigo: "ET",   nombre_es: "Embryo Transfer",    nombre_en: "Embryo Transfer",   department: "lab",       color: "green"  },
  { codigo: "DEN",  nombre_es: "Denudation",         nombre_en: "Denudation",        department: "lab",       color: "teal"   },
  { codigo: "VIT",  nombre_es: "Vitrification",      nombre_en: "Vitrification",     department: "lab",       color: "coral"  },
  { codigo: "THA",  nombre_es: "Thaw",               nombre_en: "Thaw",              department: "lab",       color: "blue"   },
  { codigo: "MED",  nombre_es: "Media Preparation",  nombre_en: "Media Preparation", department: "lab",       color: "slate"  },
  { codigo: "SEM",  nombre_es: "Semen Analysis",     nombre_en: "Semen Analysis",    department: "andrology", color: "green"  },
  { codigo: "FRE",  nombre_es: "Freezing",           nombre_en: "Freezing",          department: "andrology", color: "blue"   },
  { codigo: "PREP", nombre_es: "Sperm Prep",         nombre_en: "Sperm Prep",        department: "andrology", color: "teal"   },
]

export const EN_DEPARTMENTS = [
  { code: "lab",       name: "Embryology",      name_en: "Embryology",      abbreviation: "EM", colour: "#3B82F6" },
  { code: "andrology", name: "Andrology",       name_en: "Andrology",       abbreviation: "AN", colour: "#10B981" },
  { code: "admin",     name: "Administration",  name_en: "Administration",  abbreviation: "AD", colour: "#64748B" },
]
