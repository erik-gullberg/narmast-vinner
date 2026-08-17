/**
 * Image URL optimisation.
 *
 * 83 of the 102 events are hosted on upload.wikimedia.org, and 69 of those
 * pointed at the full-resolution original. Measured, those originals average
 * well over a megabyte and the worst is 10.8 MB — roughly 22 seconds on a 4G
 * phone, which is longer than a whole round.
 *
 * Wikimedia exposes a deterministic thumbnail URL for every file, so we can ask
 * for a sensible width instead. Sampled over 12 real originals this took
 * 22.7 MB down to 2.22 MB, a 90% reduction, with the worst case going from
 * 10.8 MB to 244 KB.
 *
 * This is a pure URL transform: no image CDN, no third-party optimiser, no
 * quota. Callers should still fall back to the original URL if the rewritten
 * one fails to load — see EventDisplay.
 */

/** Wide enough for a full-bleed image on a desktop display, including 2x phones. */
export const IMAGE_TARGET_WIDTH = 1280

// .../wikipedia/commons/thumb/a/ab/Name.jpg/800px-Name.jpg
const WIKIMEDIA_THUMB =
  /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+\/thumb\/.+\/)(\d+)(px-.+)$/

// .../wikipedia/commons/a/ab/Name.jpg
const WIKIMEDIA_ORIGINAL =
  /^https:\/\/upload\.wikimedia\.org\/wikipedia\/([^/]+)\/([0-9a-fA-F])\/([0-9a-fA-F]{2})\/([^/]+)$/

/**
 * Returns a lighter URL for the same picture where we know how, otherwise the
 * URL unchanged. Safe to call on any URL.
 */
export function optimizedImageUrl(
  url: string,
  width: number = IMAGE_TARGET_WIDTH
): string {
  if (!url) return url

  // Already a thumbnail — only ever shrink it, never ask for a bigger one.
  const thumb = url.match(WIKIMEDIA_THUMB)
  if (thumb) {
    const current = parseInt(thumb[2], 10)
    if (current <= width) return url
    return `${thumb[1]}${width}${thumb[3]}`
  }

  // Full-resolution original — point at the generated thumbnail instead.
  const original = url.match(WIKIMEDIA_ORIGINAL)
  if (original) {
    const [, project, a, ab, name] = original
    return `https://upload.wikimedia.org/wikipedia/${project}/thumb/${a}/${ab}/${name}/${width}px-${name}`
  }

  return url
}
