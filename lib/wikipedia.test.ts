import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyRegion,
  cleanImageUrl,
  extractYearFromText,
  isDuplicateEvent,
  isUsableEventImage,
  normalizeImageFilename,
  parseWikidataYear,
  parseWikipediaUrl,
  trimDescription,
} from './wikipedia.ts'
import { optimizedImageUrl } from './images.ts'

describe('parseWikipediaUrl', () => {
  it('parses Swedish and English Wikipedia URLs with encoded characters', () => {
    assert.deepEqual(
      parseWikipediaUrl('https://sv.wikipedia.org/wiki/Vasaskeppet'),
      { lang: 'sv', title: 'Vasaskeppet' }
    )
    assert.deepEqual(
      parseWikipediaUrl(
        'https://en.wikipedia.org/wiki/Machu_Picchu#History'
      ),
      { lang: 'en', title: 'Machu_Picchu' }
    )
    assert.deepEqual(
      parseWikipediaUrl(
        'https://sv.wikipedia.org/wiki/Skogsbr%C3%A4nderna_i_Australien_2019%E2%80%932020'
      ),
      { lang: 'sv', title: 'Skogsbränderna_i_Australien_2019–2020' }
    )
  })

  it('throws a Swedish error message on invalid URLs', () => {
    assert.throws(
      () => parseWikipediaUrl('https://example.com/not-wiki'),
      /Ogiltig Wikipedia-URL/
    )
  })
})

describe('classifyRegion', () => {
  it('classifies coordinates into the expected continents', () => {
    assert.equal(classifyRegion(59.3293, 18.0686), 'Europa') // Stockholm
    assert.equal(classifyRegion(35.6762, 139.6503), 'Asien') // Tokyo
    assert.equal(classifyRegion(-13.1631, -72.545), 'Sydamerika') // Machu Picchu
    assert.equal(classifyRegion(40.6892, -74.0445), 'Nordamerika') // New York
    assert.equal(classifyRegion(-33.8568, 151.2153), 'Oceanien') // Sydney
    assert.equal(classifyRegion(-33.8067, 18.3662), 'Afrika') // Robben Island
    assert.equal(classifyRegion(null, null), 'Övrigt')
  })
})

describe('isUsableEventImage', () => {
  it('accepts normal Wikimedia JPEG/PNG photos and rejects maps, flags, and SVGs', () => {
    assert.equal(
      isUsableEventImage(
        'https://upload.wikimedia.org/wikipedia/commons/e/eb/Machu_Picchu%2C_Peru.jpg'
      ),
      true
    )
    assert.equal(
      isUsableEventImage(
        'https://upload.wikimedia.org/wikipedia/commons/a/ab/Peru_location_map.svg'
      ),
      false
    )
    assert.equal(
      isUsableEventImage(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Flag_of_Sweden.svg/800px-Flag_of_Sweden.svg.png'
      ),
      false
    )
    assert.equal(
      isUsableEventImage(
        'https://upload.wikimedia.org/wikipedia/commons/1/12/Stockholm_locator_map.png'
      ),
      false
    )
  })
})

describe('year extraction', () => {
  it('parses Wikidata timestamps and text extracts', () => {
    assert.equal(parseWikidataYear('+1989-11-09T00:00:00Z'), 1989)
    assert.equal(parseWikidataYear('+0793-06-08T00:00:00Z'), 793)
    assert.equal(parseWikidataYear('-0044-03-15T00:00:00Z'), null)

    assert.equal(
      extractYearFromText(
        'Tjernobylolyckan inträffade den 26 april 1986 i Pripyat.'
      ),
      1986
    )
    assert.equal(
      extractYearFromText('Slaget vid Hastings stod år 1066 i England.'),
      1066
    )
  })
})

describe('isDuplicateEvent', () => {
  const existing = [
    {
      title: 'Tjernobylolyckan',
      image_url:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Chernobyl.jpg/800px-Chernobyl.jpg',
      latitude: 51.389,
      longitude: 30.099,
      year: 1986,
    },
  ]

  it('detects duplicates by title, underlying Wikimedia filename, or close coordinates + same year', () => {
    assert.equal(
      isDuplicateEvent(
        {
          title: 'tjernobylolyckan ',
          image_url: 'https://upload.wikimedia.org/other.jpg',
          latitude: 0,
          longitude: 0,
          year: 2000,
        },
        existing
      ),
      true
    )

    assert.equal(
      isDuplicateEvent(
        {
          title: 'Annan titel',
          image_url:
            'https://upload.wikimedia.org/wikipedia/commons/1/1c/Chernobyl.jpg',
          latitude: 0,
          longitude: 0,
          year: 2000,
        },
        existing
      ),
      true
    )

    assert.equal(
      isDuplicateEvent(
        {
          title: 'Reaktor 4',
          image_url: 'https://upload.wikimedia.org/other.jpg',
          latitude: 51.3895,
          longitude: 30.0995,
          year: 1986,
        },
        existing
      ),
      true
    )

    assert.equal(
      isDuplicateEvent(
        {
          title: 'Fukushima-olyckan',
          image_url: 'https://upload.wikimedia.org/fukushima.jpg',
          latitude: 37.421,
          longitude: 141.032,
          year: 2011,
        },
        existing
      ),
      false
    )
  })
})

describe('trimDescription, cleanImageUrl & optimizedImageUrl', () => {
  it('trims descriptions to two sentences and normalizes thumbnail prefixes', () => {
    const text =
      'Första meningen om händelsen. Andra meningen ger lite mer kontext. Tredje meningen är överflödig.'
    assert.equal(
      trimDescription(text, 2),
      'Första meningen om händelsen. Andra meningen ger lite mer kontext.'
    )
    assert.equal(
      normalizeImageFilename(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu.jpg/1280px-Machu_Picchu.jpg'
      ),
      'machu_picchu.jpg'
    )
  })

  it('REGRESSION: strips ?utm_source=... from Wikimedia URLs before building thumbnail paths', () => {
    const rawWithUtm =
      'https://upload.wikimedia.org/wikipedia/commons/2/2f/Atomic_cloud_over_Hiroshima_-_NARA_542192_-_Edit.jpg?utm_source=sv.wikipedia.org&utm_campaign=imageinfo&utm_content=original'
    assert.equal(
      cleanImageUrl(rawWithUtm),
      'https://upload.wikimedia.org/wikipedia/commons/2/2f/Atomic_cloud_over_Hiroshima_-_NARA_542192_-_Edit.jpg'
    )
    assert.equal(
      optimizedImageUrl(rawWithUtm, 1280),
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Atomic_cloud_over_Hiroshima_-_NARA_542192_-_Edit.jpg/1280px-Atomic_cloud_over_Hiroshima_-_NARA_542192_-_Edit.jpg'
    )
  })
})
