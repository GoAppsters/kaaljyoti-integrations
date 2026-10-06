/**
 * `kaal-jyoti/life-areas` in the block editor: the live `<kj-life-areas>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/life-areas', {
    tag: 'kj-life-areas',
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
