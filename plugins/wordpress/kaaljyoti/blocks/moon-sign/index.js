/**
 * `kaal-jyoti/moon-sign` in the block editor: the live `<kj-moon-sign>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/moon-sign', {
    tag: 'kj-moon-sign',
    attributes: [
      'datetime',
      'timezone',
      'lat',
      'lon',
      'city',
      'place',
      'name',
      'reading',
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
      'sign-icons',
    ],
    kind: 'birth',
    panels: [
      {
        title: 'readingPanel',
        fallback: 'Reading',
        open: false,
        fields: [
          {
            attr: 'reading',
            type: 'select',
            options: 'onOff',
            label: 'readingShown',
            fallback: 'Reading',
          },
        ],
      },
    ],
    disclaimer: true,
    form: true,
  });
})(window.kaalJyotiBlockKit);
