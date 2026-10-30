/*
 * Konfigurace profilovky. Nový rámeček = nahrát PNG nebo SVG do static/profilovka/frames/
 * a přidat sem jeden řádek. `id` se posílá do počítadla stažení (jen a–z, 0–9, pomlčka).
 * Rámeček: čtverec s průhledným pozadím (PNG s alfa kanálem, ideálně aspoň 1080×1080 px,
 * nebo SVG s texty v křivkách), důležitý obsah uvnitř vepsaného kruhu (Facebook ořízne rohy).
 */
window.PROFILOVKA_CONFIG = {
  outputSize: 1080,
  fileName: 'profilovka-ceska-televize.png',
  maxFileSizeMB: 30,
  maxWorkingPx: 2048,
  frames: [
    { id: 'ceska-je-srdce-modra', label: 'Česká je ♥ – modrá', file: 'ceska-je-srdce-modra.png' },
    { id: 'ceska-je-moje-cervena', label: 'Česká je moje – červená', file: 'ceska-je-moje-cervena.png' },
    { id: 'ceska-je-moje-modra', label: 'Česká je moje – modrá', file: 'ceska-je-moje-modra.png' },
    { id: 'ceska-je-srdce-bila', label: 'Česká je ♥ – bílá', file: 'ceska-je-srdce-bila.png' },
    { id: 'ceska-je-srdce-logo-modra', label: 'Česká je ♥ s logem – modrá', file: 'ceska-je-srdce-logo-modra.png' },
  ],
};
