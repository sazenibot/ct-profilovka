/*
 * Konfigurace profilovky. Nový rámeček = nahrát SVG do static/profilovka/frames/
 * a přidat sem jeden řádek. `id` se posílá do počítadla stažení (jen a–z, 0–9, pomlčka).
 * SVG: čtverec (viewBox i width/height), průhledné pozadí, texty převedené na křivky,
 * důležitý obsah uvnitř vepsaného kruhu (Facebook ořízne rohy).
 */
window.PROFILOVKA_CONFIG = {
  outputSize: 1080,
  fileName: 'profilovka-ceska-televize.png',
  maxFileSizeMB: 30,
  maxWorkingPx: 2048,
  frames: [
    { id: 'fandim-ct', label: 'Fandím České televizi', file: 'fandim-ct.svg' },
    { id: 'verejna-sluzba', label: 'Veřejná služba. Pro všechny.', file: 'verejna-sluzba.svg' },
    { id: 'divam-se-na-ct', label: 'Dívám se na ČT', file: 'divam-se-na-ct.svg' },
    { id: 'kruh-ct', label: 'Kruh Česká televize', file: 'kruh-ct.svg' },
  ],
};
