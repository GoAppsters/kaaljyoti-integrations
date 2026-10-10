/**
 * `kaal-jyoti/dasha` in the block editor: the live `<kj-dasha>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/dasha', {
    tag: 'kj-dasha',
    attributes: [
      'datetime',
      'timezone',
      'lat',
      'lon',
      'city',
      'place',
      'name',
      'system',
      'yogini',
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
    panels: [
      {
        title: 'dashaPanel',
        fallback: 'Dashas',
        open: false,
        fields: [
          {
            attr: 'system',
            type: 'select',
            options: 'dashaSystems',
            label: 'dashaSystem',
            fallback: 'Opens on',
          },
          {
            attr: 'yogini',
            type: 'select',
            options: 'onOff',
            label: 'yoginiShown',
            fallback: 'Yogini switch',
          },
        ],
      },
    ],
    form: true,
  });
})(window.kaalJyotiBlockKit);
