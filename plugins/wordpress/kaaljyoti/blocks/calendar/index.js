/**
 * `kaal-jyoti/calendar` in the block editor: the live `<kj-calendar>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/calendar', {
    tag: 'kj-calendar',
    attributes: [
      'city',
      'lat',
      'lon',
      'timezone',
      'place',
      'date',
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
        title: 'dateTitle',
        fallback: 'Date',
        open: true,
        fields: [{ attr: 'date', label: 'date', fallback: 'Date', help: 'dateHelp' }],
      },
    ],
  });
})(window.kaalJyotiBlockKit);
