/**
 * `kaal-jyoti/vimshottari-reading` in the block editor: the live `<kj-vimshottari-reading>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/vimshottari-reading', {
    tag: 'kj-vimshottari-reading',
    attributes: [
      'datetime',
      'timezone',
      'lat',
      'lon',
      'city',
      'place',
      'name',
      'time-format',
      'remember',
      'lang',
      'disclaimer',
      'disclaimer-name',
      'disclaimer-url',
      'powered-by',
      'theme',
      'preset',
      'font',
      'heading',
    ],
    kind: 'birth',
    panels: [],
    disclaimer: true,
    form: true,
    note: 'readingNote',
  });
})(window.kaalJyotiBlockKit);
