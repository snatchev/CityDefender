/** Street-name helpers shared by level bounds and labels. */

/** "North 18th Street" → "18th Street": the two halves of a street share one name. */
export const stripDirection = (name: string) => name.replace(/^(North|South|East|West) /, '');

/** "North Broad Street" → "Broad St", for map labels. */
export const shortName = (name: string) =>
  stripDirection(name)
    .replace(/ Street$/, ' St')
    .replace(/ Avenue$/, ' Ave')
    .replace(/ Boulevard$/, ' Blvd');
