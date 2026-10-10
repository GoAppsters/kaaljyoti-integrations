/**
 * `kaal-jyoti/vargas` in the block editor: the live `<kj-vargas>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/vargas', {
    tag: 'kj-vargas',
    attributes: [
      'datetime',
      'timezone',
      'lat',
      'lon',
      'city',
      'place',
      'name',
      'varga',
      'chart-style',
      'size',
      'time-format',
      'remember',
      'lang',
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
        title: 'chart',
        fallback: 'Chart',
        open: false,
        fields: [
          {
            attr: 'varga',
            type: 'select',
            options: 'vargas',
            label: 'vargaOpen',
            fallback: 'Opens on',
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
    form: true,
  });
})(window.kaalJyotiBlockKit);
