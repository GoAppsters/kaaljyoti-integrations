/**
 * `kaal-jyoti/panchang` in the block editor.
 *
 * Plain ES5 on the `wp.*` globals: no JSX, no build step, and source that
 * reads on wordpress.org the way it runs (design decision 7). The preview is
 * the live `<kj-panchang>`, so the editor shows what the page will show — and
 * spends the same API call doing it, which the block's description says.
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
    'city',
    'lat',
    'lon',
    'timezone',
    'place',
    'date',
    'lang',
    'show',
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
        out[name] = String(value);
      }
    });
    return out;
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

  wp.blocks.registerBlockType('kaal-jyoti/panchang', {
    edit: function (props) {
      var a = props.attributes;
      var blockProps = useBlockProps();

      var place = el(
        PanelBody,
        { title: label('place', 'Place'), initialOpen: true },
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
        el(TextControl, {
          label: label('date', 'Date'),
          help: label('dateHelp', ''),
          value: a.date,
          onChange: set(props, 'date'),
        }),
      );

      var display = el(
        PanelBody,
        { title: label('display', 'Display'), initialOpen: false },
        el(SelectControl, {
          label: label('lang', 'Language'),
          value: a.lang,
          options: config().langs || [],
          onChange: set(props, 'lang'),
        }),
        el(TextControl, {
          label: label('sections', 'Sections'),
          help: label('sectionsHelp', ''),
          value: a.show,
          onChange: set(props, 'show'),
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
        el(InspectorControls, null, place, display, stylePanel(props)),
        el(
          'div',
          blockProps,
          // The live element, with the editor's own clicks kept off it: the
          // block has to stay selectable in the canvas.
          el(
            'div',
            { className: 'kj-block-preview', style: { pointerEvents: 'none' } },
            el('kj-panchang', elementAttributes(a)),
          ),
        ),
      );
    },

    // Dynamic: the markup is drawn by `Elements` at render time, so nothing
    // goes into the post content.
    save: function () {
      return null;
    },
  });
})(window.wp);
