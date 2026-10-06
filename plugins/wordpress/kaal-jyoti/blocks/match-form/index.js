/**
 * `kaal-jyoti/match-form` in the block editor.
 *
 * Plain ES5 on the `wp.*` globals: no JSX and no build step (design decision
 * 7). Like the kundli form, this element is always rendered in the browser —
 * there is nothing to score until a visitor has typed two births — so the
 * preview here is the two empty forms and costs nothing until a match is
 * submitted, which is one call.
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
    'time-format',
    'remember',
    'pdf',
    'lang',
    'powered-by',
    'theme',
    'preset',
    'font',
    'heading',
    'sign-icons',
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

  /** The birth form's own choices: the time fields, remembering, PDFs. */
  function formControls(props) {
    var a = props.attributes;
    return [
      el(SelectControl, {
        key: 'time-format',
        label: label('timeFormat', 'Birth time'),
        value: a['time-format'],
        options: config().timeFormats || [],
        onChange: set(props, 'time-format'),
      }),
      el(SelectControl, {
        key: 'remember',
        label: label('remember', 'Remember the last entry'),
        help: label('rememberHelp', ''),
        value: a.remember,
        options: config().onOff || [],
        onChange: set(props, 'remember'),
      }),
      el(SelectControl, {
        key: 'pdf',
        label: label('pdf', 'Download PDF'),
        help: label('pdfHelp', ''),
        value: a.pdf,
        options: config().onOff || [],
        onChange: set(props, 'pdf'),
      }),
    ];
  }

  wp.blocks.registerBlockType('kaal-jyoti/match-form', {
    edit: function (props) {
      var a = props.attributes;
      var blockProps = useBlockProps();

      var display = el(
        PanelBody,
        { title: label('display', 'Display'), initialOpen: true },
        el(SelectControl, {
          label: label('city', 'City'),
          help: label('matchCityHelp', ''),
          value: a.city,
          options: config().cities || [],
          onChange: set(props, 'city'),
        }),
        el(SelectControl, {
          label: label('lang', 'Language'),
          value: a.lang,
          options: config().langs || [],
          onChange: set(props, 'lang'),
        }),
        el(SelectControl, {
          label: label('theme', 'Theme'),
          help: label('themeHelp', ''),
          value: a.theme,
          options: config().themes || [],
          onChange: set(props, 'theme'),
        }),
        el(SelectControl, {
          label: label('signIcons', 'Sign icons'),
          help: label('signIconsHelp', ''),
          value: a['sign-icons'],
          options: config().signIcons || [],
          onChange: set(props, 'sign-icons'),
        }),
        el(SelectControl, {
          label: label('poweredBy', 'Powered by'),
          value: a['powered-by'],
          options: config().poweredBy || [],
          onChange: set(props, 'powered-by'),
        }),
      );

      return el(
        Fragment,
        null,
        el(InspectorControls, null, display, stylePanel(props, formControls(props))),
        el(
          'div',
          blockProps,
          el(
            'div',
            { className: 'kj-block-preview', style: { pointerEvents: 'none' } },
            el('kj-match-form', elementAttributes(a)),
          ),
        ),
      );
    },

    save: function () {
      return null;
    },
  });
})(window.wp);
