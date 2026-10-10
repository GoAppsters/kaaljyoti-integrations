/**
 * `kaal-jyoti/manglik` in the block editor: the live `<kj-manglik>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/manglik', {
    tag: 'kj-manglik',
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
      'powered-by',
      'theme',
      'preset',
      'font',
      'heading',
    ],
    kind: 'birth',
    panels: [],
    form: true,
  });
})(window.kaalJyotiBlockKit);
