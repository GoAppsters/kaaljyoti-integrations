/**
 * `kaal-jyoti/varshphal` in the block editor: the live `<kj-varshphal>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/varshphal', {
    tag: 'kj-varshphal',
    attributes: [
      'datetime',
      'timezone',
      'lat',
      'lon',
      'city',
      'place',
      'name',
      'year',
      'chart-style',
      'size',
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
        title: 'yearPanel',
        fallback: 'Year',
        open: false,
        fields: [
          { attr: 'year', label: 'year', fallback: 'Year', help: 'yearHelp' },
          {
            attr: 'reading',
            type: 'select',
            options: 'onOff',
            label: 'readingShown',
            fallback: 'Reading',
          },
          {
            attr: 'chart-style',
            type: 'select',
            options: 'styles',
            label: 'style',
            fallback: 'Style',
          },
          { attr: 'size', label: 'size', fallback: 'Size in pixels', help: 'sizeHelp' },
        ],
      },
    ],
    disclaimer: true,
    form: true,
    note: 'readingNote',
  });
})(window.kaalJyotiBlockKit);
