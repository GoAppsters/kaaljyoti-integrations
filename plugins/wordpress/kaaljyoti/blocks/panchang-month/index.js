/**
 * `kaal-jyoti/panchang-month` in the block editor: the live `<kj-panchang-month>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/panchang-month', {
    tag: 'kj-panchang-month',
    attributes: [
      'city',
      'lat',
      'lon',
      'timezone',
      'place',
      'month',
      'masa',
      'lang',
      'powered-by',
      'theme',
      'preset',
      'font',
      'heading',
    ],
    kind: 'place',
    panels: [
      {
        title: 'month',
        fallback: 'Month',
        open: true,
        fields: [
          { attr: 'month', label: 'month', fallback: 'Month', help: 'monthHelp' },
          {
            attr: 'masa',
            type: 'select',
            options: 'masas',
            label: 'masa',
            fallback: 'Month reckoning',
          },
        ],
      },
    ],
    note: 'proxyNote',
  });
})(window.kaalJyotiBlockKit);
