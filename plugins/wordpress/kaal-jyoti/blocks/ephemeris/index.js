/**
 * `kaal-jyoti/ephemeris` in the block editor: the live `<kj-ephemeris>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/ephemeris', {
    tag: 'kj-ephemeris',
    attributes: [
      'city',
      'lat',
      'lon',
      'timezone',
      'place',
      'month',
      'system',
      'lang',
      'powered-by',
      'theme',
      'preset',
      'font',
      'heading',
      'sign-icons',
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
            attr: 'system',
            type: 'select',
            options: 'ephemerisSystems',
            label: 'zodiac',
            fallback: 'Zodiac',
          },
        ],
      },
    ],
    note: 'proxyNote',
  });
})(window.kaalJyotiBlockKit);
