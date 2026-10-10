/**
 * `kaal-jyoti/strength` in the block editor: the live `<kj-strength>`, with its
 * panels described as data for the plugin's block kit (`assets/blocks-kit.js`).
 * Plain ES5, no build step (design decision 7).
 */
(function (kit) {
  'use strict';

  if (!kit) {
    return;
  }

  kit.register('kaal-jyoti/strength', {
    tag: 'kj-strength',
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
            options: 'strengthTabs',
            label: 'openTab',
            fallback: 'Opens on',
          },
        ],
      },
    ],
    form: true,
  });
})(window.kaalJyotiBlockKit);
