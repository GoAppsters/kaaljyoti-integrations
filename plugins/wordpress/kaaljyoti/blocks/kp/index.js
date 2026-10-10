/**
 * `kaal-jyoti/kp` in the block editor: the live `<kj-kp>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/kp', {
    tag: 'kj-kp',
    attributes: [
      'datetime',
      'timezone',
      'lat',
      'lon',
      'city',
      'place',
      'name',
      'tab',
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
        title: 'tabsPanel',
        fallback: 'Tabs',
        open: false,
        fields: [
          {
            attr: 'tab',
            type: 'select',
            options: 'kpTabs',
            label: 'openTab',
            fallback: 'Opens on',
          },
        ],
      },
    ],
    form: true,
  });
})(window.kaalJyotiBlockKit);
