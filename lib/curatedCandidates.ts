/**
 * Curated starter pool of globally distributed, visually recognizable events
 * and historical places that a Swedish player ("På Spåret"-publiken) has a
 * fair shot at placing or deducing from regional visual clues.
 *
 * Includes fallback coordinates and years because many event articles on
 * `sv.wikipedia.org` have great photos and descriptions but lack a {{coord}}
 * template on the Swedish page.
 */
export interface CuratedSeed {
  url: string
  fallbackLat: number
  fallbackLon: number
  fallbackYear: number
}

export const CURATED_GLOBAL_SEEDS: CuratedSeed[] = [
  // --- ASIEN ---
  {
    url: 'https://sv.wikipedia.org/wiki/Himmelska_fridens_torg-protesterna_1989',
    fallbackLat: 39.9055,
    fallbackLon: 116.3976,
    fallbackYear: 1989,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Fukushima-olyckan',
    fallbackLat: 37.4211,
    fallbackLon: 141.0328,
    fallbackYear: 2011,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Atombomberna_%C3%B6ver_Hiroshima_och_Nagasaki',
    fallbackLat: 34.3946,
    fallbackLon: 132.4547,
    fallbackYear: 1945,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Explosionskatastrofen_i_Beirut_2020',
    fallbackLat: 33.9014,
    fallbackLon: 35.5191,
    fallbackYear: 2020,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Terrakottaarm%C3%A9n',
    fallbackLat: 34.3841,
    fallbackLon: 109.2785,
    fallbackYear: 1974,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Angkor_Wat',
    fallbackLat: 13.4125,
    fallbackLon: 103.867,
    fallbackYear: 1150,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Taj_Mahal',
    fallbackLat: 27.1751,
    fallbackLon: 78.0421,
    fallbackYear: 1653,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Petra',
    fallbackLat: 30.3285,
    fallbackLon: 35.4444,
    fallbackYear: 1812,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Burj_Khalifa',
    fallbackLat: 25.1972,
    fallbackLon: 55.2744,
    fallbackYear: 2010,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Saigons_fall',
    fallbackLat: 10.7769,
    fallbackLon: 106.6953,
    fallbackYear: 1975,
  },

  // --- SYDAMERIKA ---
  {
    url: 'https://sv.wikipedia.org/wiki/Machu_Picchu',
    fallbackLat: -13.1631,
    fallbackLon: -72.545,
    fallbackYear: 1450,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Cristo_Redentor',
    fallbackLat: -22.9519,
    fallbackLon: -43.2105,
    fallbackYear: 1931,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Gruvolyckan_i_Copiap%C3%B3_2010',
    fallbackLat: -27.1603,
    fallbackLon: -70.4967,
    fallbackYear: 2010,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Maracan%C3%A3',
    fallbackLat: -22.9121,
    fallbackLon: -43.2302,
    fallbackYear: 1950,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Iguaz%C3%BAfallen',
    fallbackLat: -25.6953,
    fallbackLon: -54.4367,
    fallbackYear: 1541,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Salar_de_Uyuni',
    fallbackLat: -20.1338,
    fallbackLon: -67.4891,
    fallbackYear: 1978,
  },

  // --- AFRIKA ---
  {
    url: 'https://sv.wikipedia.org/wiki/Robben_Island',
    fallbackLat: -33.8067,
    fallbackLon: 18.3662,
    fallbackYear: 1964,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Blockeringen_av_Suezkanalen_2021',
    fallbackLat: 30.0176,
    fallbackLon: 32.5802,
    fallbackYear: 2021,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Abu_Simbel',
    fallbackLat: 22.3372,
    fallbackLon: 31.6258,
    fallbackYear: 1968,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Victoriafallen',
    fallbackLat: -17.9243,
    fallbackLon: 25.8572,
    fallbackYear: 1855,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Rumble_in_the_Jungle',
    fallbackLat: -4.3378,
    fallbackLon: 15.3222,
    fallbackYear: 1974,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Slaget_vid_el-Alamein',
    fallbackLat: 30.8333,
    fallbackLon: 28.95,
    fallbackYear: 1942,
  },

  // --- NORD- OCH CENTRALAMERIKA ---
  {
    url: 'https://sv.wikipedia.org/wiki/Hindenburgkatastrofen',
    fallbackLat: 40.0333,
    fallbackLon: -74.3536,
    fallbackYear: 1937,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Woodstockfestivalen',
    fallbackLat: 41.7014,
    fallbackLon: -74.8803,
    fallbackYear: 1969,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Mordet_p%C3%A5_John_F._Kennedy',
    fallbackLat: 32.7788,
    fallbackLon: -96.8083,
    fallbackYear: 1963,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Mount_Saint_Helens',
    fallbackLat: 46.1912,
    fallbackLon: -122.1944,
    fallbackYear: 1980,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Alcatraz',
    fallbackLat: 37.8267,
    fallbackLon: -122.4233,
    fallbackYear: 1934,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Chich%C3%A9n_Itz%C3%A1',
    fallbackLat: 20.683,
    fallbackLon: -88.5686,
    fallbackYear: 600,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Panamakanalen',
    fallbackLat: 9.08,
    fallbackLon: -79.68,
    fallbackYear: 1914,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Hooverdammen',
    fallbackLat: 36.0156,
    fallbackLon: -114.7378,
    fallbackYear: 1936,
  },

  // --- OCEANIEN ---
  {
    url: 'https://sv.wikipedia.org/wiki/Operahuset_i_Sydney',
    fallbackLat: -33.8568,
    fallbackLon: 151.2153,
    fallbackYear: 1973,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Uluru',
    fallbackLat: -25.3444,
    fallbackLon: 131.0369,
    fallbackYear: 1985,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Moai',
    fallbackLat: -27.1258,
    fallbackLon: -109.2769,
    fallbackYear: 1400,
  },

  // --- EUROPA & SVERIGE (klassiska historiska platser) ---
  {
    url: 'https://sv.wikipedia.org/wiki/Pompeji',
    fallbackLat: 40.75,
    fallbackLon: 14.486,
    fallbackYear: 79,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Landstigningen_i_Normandie',
    fallbackLat: 49.3697,
    fallbackLon: -0.8711,
    fallbackYear: 1944,
  },
  {
    url: 'https://sv.wikipedia.org/wiki/Vasaskeppet',
    fallbackLat: 59.328,
    fallbackLon: 18.0914,
    fallbackYear: 1628,
  },
]
