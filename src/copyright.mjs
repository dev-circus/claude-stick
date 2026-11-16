// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang

const START_YEAR = 2026;

/** The copyright line, with a year range from the second year on. */
export function copyrightLine(year = new Date().getFullYear()) {
  const years = year > START_YEAR ? `${START_YEAR}–${year}` : `${START_YEAR}`;
  return `© ${years} >devcircus_ · www.dev-circus.com · by Patrick B. Stang`;
}
