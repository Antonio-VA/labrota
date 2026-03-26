// Spanish defaults for new org implementation

export const ES_SHIFTS = [
  { code: "T1", name_es: "Mañana",       name_en: "Morning",   start_time: "07:30", end_time: "15:30" },
  { code: "T2", name_es: "Media mañana", name_en: "Mid",       start_time: "08:00", end_time: "16:00" },
  { code: "T3", name_es: "Tarde",        name_en: "Afternoon", start_time: "08:30", end_time: "16:30" },
  { code: "T4", name_es: "Tarde-tarde",  name_en: "Flex 1",    start_time: "09:00", end_time: "17:00" },
  { code: "T5", name_es: "Noche",        name_en: "Flex 2",    start_time: "09:30", end_time: "17:30" },
]

export const ES_TECNICAS = [
  { codigo: "ICSI", nombre_es: "ICSI",                        nombre_en: "ICSI",              department: "lab",       color: "blue"   },
  { codigo: "BIO",  nombre_es: "Biopsia",                     nombre_en: "Biopsy",            department: "lab",       color: "purple" },
  { codigo: "OPU",  nombre_es: "Punción folicular",           nombre_en: "Egg Collection",    department: "lab",       color: "amber"  },
  { codigo: "ET",   nombre_es: "Transferencia embrionaria",   nombre_en: "Embryo Transfer",   department: "lab",       color: "green"  },
  { codigo: "DEN",  nombre_es: "Denudación",                  nombre_en: "Denudation",        department: "lab",       color: "teal"   },
  { codigo: "VIT",  nombre_es: "Vitrificación",               nombre_en: "Vitrification",     department: "lab",       color: "coral"  },
  { codigo: "THA",  nombre_es: "Desvitrificación",            nombre_en: "Thaw",              department: "lab",       color: "blue"   },
  { codigo: "MED",  nombre_es: "Preparación de medios",       nombre_en: "Media Preparation", department: "lab",       color: "slate"  },
  { codigo: "SEM",  nombre_es: "Análisis seminal",            nombre_en: "Semen Analysis",    department: "andrology", color: "green"  },
  { codigo: "FRE",  nombre_es: "Congelación",                 nombre_en: "Freezing",          department: "andrology", color: "blue"   },
  { codigo: "PREP", nombre_es: "Preparación espermática",     nombre_en: "Sperm Prep",        department: "andrology", color: "teal"   },
]

export const ES_DEPARTMENTS = [
  { code: "lab",       name: "Embriología",   name_en: "Embryology",      abbreviation: "EM", colour: "#3B82F6" },
  { code: "andrology", name: "Andrología",    name_en: "Andrology",       abbreviation: "AN", colour: "#10B981" },
  { code: "admin",     name: "Administración", name_en: "Administration", abbreviation: "AD", colour: "#64748B" },
]
