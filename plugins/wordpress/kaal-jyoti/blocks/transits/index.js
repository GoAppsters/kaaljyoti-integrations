/**
 * `kaal-jyoti/transits` in the block editor: the live `<kj-transits>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/transits', {
    tag: 'kj-transits',
    attributes: [
      'city',
      'lat',
      'lon',
      'timezone',
      'place',
      'chart',
      'chart-style',
      'size',
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
        title: 'chart',
        fallback: 'Chart',
        open: false,
        fields: [
          {
            attr: 'chart',
            type: 'select',
            options: 'onOff',
            label: 'chartShown',
            fallback: 'Chart',
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
  });
})(window.kaalJyotiBlockKit);
