/**
 * `kaal-jyoti/kundli-form` in the block editor.
 *
 * Plain ES5 on the `wp.*` globals: no JSX and no build step (design decision
 * 7). This is the one element that is always rendered in the browser — there
 * is nothing to draw until a visitor has typed a birth — so the preview here
 * is an empty form and costs nothing until one is submitted. With readings
 * on, each submit costs one more call per reading.
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

  /**
   * Only the attributes block.json declares reach the element. WordPress adds
   * its own (`style` from the Styles tab, `lock`, `metadata`, `className`)
   * and a `style` object handed to React as a string throws error #62,
   * which the editor shows as a block that cannot be previewed.
   */
  var ELEMENT_ATTRIBUTES = [
    'tabs',
    'show',
    'city',
    'chart-style',
    'size',
    'varga',
    'readings',
    'lang',
    'disclaimer',
    'disclaimer-name',
    'disclaimer-url',
    'powered-by',
    'theme',
    'time-format',
    'remember',
    'pdf',
    'preset',
    'font',
    'heading',
    'sign-icons',
  ];

  /**
   * The disclaimer, resolved the way `Elements` resolves it on the page: the
   * block's own choice, else the site's setting. `default` is the plugin's
   * word for "the API's own line" and is never handed to the element.
   */
  function withDisclaimer(attributes, out) {
    delete out.disclaimer;
    delete out['disclaimer-name'];
    delete out['disclaimer-url'];

    if (attributes.disclaimer === 'off') {
      out.disclaimer = 'off';
      return out;
    }
    if (attributes.disclaimer === 'default') {
      return out;
    }
    if (attributes['disclaimer-name']) {
      out['disclaimer-name'] = String(attributes['disclaimer-name']);
      if (attributes['disclaimer-url']) {
        out['disclaimer-url'] = String(attributes['disclaimer-url']);
      }
      return out;
    }

    var site = (config().defaults || {}).disclaimer || {};
    Object.keys(site).forEach(function (name) {
      out[name] = String(site[name]);
    });
    return out;
  }

  /**
   * The attributes the custom element carries; an empty one is left off.
   *
   * `readings` is the exception: the element reads the attribute present and
   * empty as the lagna and nakshatra readings, so the stored `both` is
   * written as an empty string, and `all` as every reading the element
   * knows; a list such as `lagna,nakshatra,house_lords` goes through as it
   * is. With readings off there is no disclaimer to configure.
   */
  function elementAttributes(attributes) {
    var out = {};
    ELEMENT_ATTRIBUTES.forEach(function (name) {
      var value = attributes[name];
      if (value !== '' && value !== undefined && value !== null) {
        out[name] = String(value);
      }
    });

    if (out.readings === undefined) {
      delete out.disclaimer;
      delete out['disclaimer-name'];
      delete out['disclaimer-url'];
      return out;
    }

    if (out.readings === 'both') {
      out.readings = '';
    } else if (out.readings === 'all') {
      out.readings = 'lagna,nakshatra,house_lords,grahas,yogas,vimshottari,varshphal,life_areas';
    }
    return withDisclaimer(attributes, out);
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

  /** The tabs the report shows. */
  function tabsControl(props) {
    return el(TextControl, {
      key: 'tabs',
      label: label('tabs', 'Tabs'),
      help: label('tabsHelp', ''),
      value: props.attributes.tabs,
      onChange: set(props, 'tabs'),
    });
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

  wp.blocks.registerBlockType('kaal-jyoti/kundli-form', {
    edit: function (props) {
      var a = props.attributes;
      var blockProps = useBlockProps();

      var form = el(
        PanelBody,
        { title: label('display', 'Display'), initialOpen: true },
        el(TextControl, {
          label: label('formSections', 'Sections'),
          help: label('formSectionsHelp', ''),
          value: a.show,
          onChange: set(props, 'show'),
        }),
        el(SelectControl, {
          label: label('city', 'City'),
          help: label('cityHelp', ''),
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
        el(SelectControl, {
          label: label('signIcons', 'Sign icons'),
          help: label('signIconsHelp', ''),
          value: a['sign-icons'],
          options: config().signIcons || [],
          onChange: set(props, 'sign-icons'),
        }),
      );

      var readings = el(
        PanelBody,
        { title: label('readings', 'Readings after the chart'), initialOpen: false },
        el(SelectControl, {
          label: label('readings', 'Readings after the chart'),
          help: label('readingsHelp', ''),
          value: a.readings,
          options: config().readings || [],
          onChange: set(props, 'readings'),
        }),
        el(SelectControl, {
          label: label('disclaimer', 'Disclaimer'),
          help: label('disclaimerHelp', ''),
          value: a.disclaimer,
          options: config().disclaimers || [],
          onChange: set(props, 'disclaimer'),
        }),
        el(TextControl, {
          label: label('disclaimerName', "Astrologer's name"),
          help: label('disclaimerNameHelp', ''),
          value: a['disclaimer-name'],
          onChange: set(props, 'disclaimer-name'),
        }),
        el(TextControl, {
          label: label('disclaimerUrl', "Astrologer's link"),
          type: 'url',
          value: a['disclaimer-url'],
          onChange: set(props, 'disclaimer-url'),
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
      );

      return el(
        Fragment,
        null,
        el(
          InspectorControls,
          null,
          form,
          readings,
          chart,
          stylePanel(props, [tabsControl(props)].concat(formControls(props))),
        ),
        el(
          'div',
          blockProps,
          el(
            'div',
            { className: 'kj-block-preview', style: { pointerEvents: 'none' } },
            el('kj-kundli-form', elementAttributes(a)),
          ),
        ),
      );
    },

    save: function () {
      return null;
    },
  });
})(window.wp);
