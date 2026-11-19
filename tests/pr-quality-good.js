const METERS_PER_MILE = 1609.344;

export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) {
    throw new RangeError("Distance must be a non-negative number.");
  }

  return `${(meters / METERS_PER_MILE).toFixed(1)} mi`;
}
