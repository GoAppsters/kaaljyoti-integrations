/**
 * `kaal-jyoti/chart` in the block editor.
 *
 * Plain ES5 on the `wp.*` globals: no JSX and no build step (design decision
 * 7). The preview is the live `<kj-chart>`, which asks the API to draw the
 * chart — a real call, as the block's description says. The drawing is one
 * call per language, because the labels are drawn into the document.
 */
(function (wp) {
  'use strict';

  if (!wp || !wp.blocks || !wp.element || !wp.blockEditor || !wp.components) {
    return;
  }

  var el = wp.element.createElement;
  var Fragment = wp.element.Fragment;
  var InspectorControls = wp.blockEditor.InspectorControls;
  var useBlockProps = wp.blockEditor.useBlockProps;
  var PanelBody = wp.components.PanelBody;
  var SelectControl = wp.components.SelectControl;
  var TextControl = wp.components.TextControl;

  /** What `Blocks::enqueue_editor()` localised. Read when a panel draws, not now. */
  function config() {
    return window.kaalJyotiBlocks || {};
  }

  /** One localised string, with the English in the source as the fallback. */
  function label(key, fallback) {
    var strings = config().i18n || {};
    return strings[key] || fallback;
  }

  /** A setter for one attribute. Everything is stored as a string. */
  function set(props, name) {
    return function (value) {
      var change = {};
      change[name] = value === undefined || value === null ? '' : String(value);
      props.setAttributes(change);
    };
  }

  /** The attributes the custom element carries; an empty one is left off. */
  /**
   * Only the attributes block.json declares reach the element. WordPress adds
   * its own (`style` from the Styles tab, `lock`, `metadata`, `className`)
   * and a `style` object handed to React as a string throws error #62,
   * which the editor shows as a block that cannot be previewed.
   */
  var ELEMENT_ATTRIBUTES = [
    'datetime',
    'timezone',
    'lat',
    'lon',
    'place',
    'city',
    'chart-style',
    'size',
    'varga',
    'show-degrees',
    'lang',
    'powered-by',
    'theme',
    'preset',
    'font',
    'heading',
  ];

  function elementAttributes(attributes) {
    var out = {};
    ELEMENT_ATTRIBUTES.forEach(function (name) {
      var value = attributes[name];
      if (value !== '' && value !== undefined && value !== null) {
        // React reserves `style` for an object of CSS, so the chart's style
        // travels as `chart-style`, which the element reads the same way;
        // `style` itself is WordPress's Styles-tab object and is never copied.
        out[name === 'style' ? 'chart-style' : name] = String(value);
      }
    });
    return out;
  }

  /** `show-degrees` is a three-state choice: leave it alone, or force it. */
  function degreeOptions() {
    return [
      { value: '', label: label('default', 'Default') },
      { value: 'true', label: label('yes', 'Shown') },
      { value: 'false', label: label('no', 'Hidden') },
    ];
  }

  /** The look every block shares: preset, font and the card's heading. */
  function stylePanel(props, extra) {
    var a = props.attributes;
    return el(
      PanelBody,
      { title: label('stylePanel', 'Style'), initialOpen: false },
      el(SelectControl, {
        label: label('preset', 'Preset'),
        help: label('presetHelp', ''),
        value: a.preset,
        options: config().presets || [],
        onChange: set(props, 'preset'),
      }),
      el(SelectControl, {
        label: label('font', 'Font'),
        value: a.font,
        options: config().fonts || [],
        onChange: set(props, 'font'),
      }),
      el(TextControl, {
        label: label('heading', 'Heading'),
        help: label('headingHelp', ''),
        value: a.heading,
        onChange: set(props, 'heading'),
      }),
      extra || null,
    );
  }

  wp.blocks.registerBlockType('kaal-jyoti/chart', {
    edit: function (props) {
      var a = props.attributes;
      var blockProps = useBlockProps();

      var birth = el(
        PanelBody,
        { title: label('place', 'Place'), initialOpen: true },
        el(TextControl, {
          label: label('datetime', 'Birth date and time'),
          help: label('datetimeHelp', ''),
          value: a.datetime,
          onChange: set(props, 'datetime'),
        }),
        el(SelectControl, {
          label: label('city', 'City'),
          help: label('cityHelp', ''),
          value: a.city,
          options: config().cities || [],
          onChange: set(props, 'city'),
        }),
        el(TextControl, {
          label: label('latitude', 'Latitude'),
          value: a.lat,
          onChange: set(props, 'lat'),
        }),
        el(TextControl, {
          label: label('longitude', 'Longitude'),
          value: a.lon,
          onChange: set(props, 'lon'),
        }),
        el(TextControl, {
          label: label('timezone', 'Time zone'),
          help: label('timezoneHelp', ''),
          value: a.timezone,
          onChange: set(props, 'timezone'),
        }),
        el(TextControl, {
          label: label('placeLabel', 'Place label'),
          value: a.place,
          onChange: set(props, 'place'),
        }),
      );

      var chart = el(
        PanelBody,
        { title: label('chart', 'Chart'), initialOpen: false },
        el(SelectControl, {
          label: label('style', 'Style'),
          value: a['chart-style'],
          options: config().styles || [],
          onChange: set(props, 'chart-style'),
        }),
        el(TextControl, {
          label: label('size', 'Size in pixels'),
          help: label('sizeHelp', ''),
          value: a.size,
          onChange: set(props, 'size'),
        }),
        el(TextControl, {
          label: label('varga', 'Divisional chart'),
          help: label('vargaHelp', ''),
          value: a.varga,
          onChange: set(props, 'varga'),
        }),
        el(SelectControl, {
          label: label('showDegrees', 'Degrees on the chart'),
          value: a['show-degrees'],
          options: degreeOptions(),
          onChange: set(props, 'show-degrees'),
        }),
        el(SelectControl, {
          label: label('lang', 'Language'),
          value: a.lang,
          options: config().langs || [],
          onChange: set(props, 'lang'),
        }),
        el(SelectControl, {
          label: label('poweredBy', 'Powered by'),
          value: a['powered-by'],
          options: config().poweredBy || [],
          onChange: set(props, 'powered-by'),
        }),
        el(SelectControl, {
          label: label('theme', 'Theme'),
          help: label('themeHelp', ''),
          value: a.theme,
          options: config().themes || [],
          onChange: set(props, 'theme'),
        }),
      );

      return el(
        Fragment,
        null,
        el(InspectorControls, null, birth, chart, stylePanel(props)),
        el(
          'div',
          blockProps,
          el(
            'div',
            { className: 'kj-block-preview', style: { pointerEvents: 'none' } },
            el('kj-chart', elementAttributes(a)),
          ),
        ),
      );
    },

    save: function () {
      return null;
    },
  });
})(window.wp);
