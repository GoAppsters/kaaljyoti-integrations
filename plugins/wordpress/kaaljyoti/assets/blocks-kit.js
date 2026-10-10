/**
 * The block editor kit the revamp's fifteen blocks are built with.
 *
 * Plain ES5 on the `wp.*` globals, like every block script here: no JSX and
 * no build step (design decision 7). A block's `index.js` describes its
 * panels as data and calls `kaalJyotiBlockKit.register()`; the kit draws the
 * inspector, the live preview and the "Style" panel every block shares. The
 * seven blocks of 0.1.0 keep their own scripts.
 *
 * Every attribute is a string, as in block.json, and only the attributes a
 * block declares reach the element: WordPress adds its own (`style` from the
 * Styles tab, `className`, `lock`) and handing React an object as a string
 * attribute breaks the preview.
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
  var Notice = wp.components.Notice;

  /** What `Blocks::enqueue_editor()` localised. Read when a panel draws. */
  function config() {
    return window.kaalJyotiBlocks || {};
  }

  /** One localised string, with the English in the source as the fallback. */
  function label(key, fallback) {
    var strings = config().i18n || {};
    return strings[key] || fallback || '';
  }

  /** A setter for one attribute. */
  function set(props, name) {
    return function (value) {
      var change = {};
      change[name] = value === undefined || value === null ? '' : String(value);
      props.setAttributes(change);
    };
  }

  /** A field's options: a list, or the name of one in the localised data. */
  function optionsOf(field) {
    if (Array.isArray(field.options)) {
      return field.options.map(function (option) {
        return { value: option.value, label: label(option.label, option.fallback || option.value) };
      });
    }
    return config()[field.options] || [];
  }

  /** One control. */
  function control(props, field) {
    var common = {
      key: field.attr,
      label: label(field.label, field.fallback || field.attr),
      help: field.help ? label(field.help, '') : undefined,
      value: props.attributes[field.attr] || '',
      onChange: set(props, field.attr),
    };
    if (field.type === 'select') {
      common.options = optionsOf(field);
      return el(SelectControl, common);
    }
    if (field.inputType) common.type = field.inputType;
    return el(TextControl, common);
  }

  /** A panel of fields, the ones whose `when` says no left out. */
  function panel(props, spec, index) {
    var fields = spec.fields
      .filter(function (field) {
        return !field.when || field.when(props.attributes);
      })
      .map(function (field) {
        return control(props, field);
      });
    return el(
      PanelBody,
      {
        key: 'panel-' + index,
        title: label(spec.title, spec.fallback || ''),
        initialOpen: !!spec.open,
      },
      fields,
    );
  }

  /** The panels every block ends with. */
  var BIRTH_FIELDS = [
    { attr: 'datetime', label: 'datetime', fallback: 'Birth date and time', help: 'calcBirthHelp' },
    {
      attr: 'city',
      type: 'select',
      options: 'cities',
      label: 'city',
      fallback: 'City',
      help: 'calcCityHelp',
    },
    { attr: 'lat', label: 'latitude', fallback: 'Latitude' },
    { attr: 'lon', label: 'longitude', fallback: 'Longitude' },
    { attr: 'timezone', label: 'timezone', fallback: 'Time zone', help: 'timezoneHelp' },
    { attr: 'place', label: 'placeLabel', fallback: 'Place label' },
    { attr: 'name', label: 'personName', fallback: 'Name' },
  ];

  var PLACE_FIELDS = [
    {
      attr: 'city',
      type: 'select',
      options: 'cities',
      label: 'city',
      fallback: 'City',
      help: 'cityHelp',
    },
    { attr: 'lat', label: 'latitude', fallback: 'Latitude' },
    { attr: 'lon', label: 'longitude', fallback: 'Longitude' },
    { attr: 'timezone', label: 'timezone', fallback: 'Time zone', help: 'timezoneHelp' },
    { attr: 'place', label: 'placeLabel', fallback: 'Place label' },
  ];

  var FORM_FIELDS = [
    {
      attr: 'time-format',
      type: 'select',
      options: 'timeFormats',
      label: 'timeFormat',
      fallback: 'Birth time',
    },
    {
      attr: 'remember',
      type: 'select',
      options: 'onOff',
      label: 'remember',
      fallback: 'Remember the last entry',
      help: 'rememberHelp',
    },
  ];

  var DISCLAIMER_FIELDS = [
    {
      attr: 'disclaimer',
      type: 'select',
      options: 'disclaimers',
      label: 'disclaimer',
      fallback: 'Disclaimer',
      help: 'disclaimerHelp',
    },
    {
      attr: 'disclaimer-name',
      label: 'disclaimerName',
      fallback: "Astrologer's name",
      help: 'disclaimerNameHelp',
    },
    {
      attr: 'disclaimer-url',
      label: 'disclaimerUrl',
      fallback: "Astrologer's link",
      inputType: 'url',
    },
  ];

  var DISPLAY_FIELDS = [
    { attr: 'lang', type: 'select', options: 'langs', label: 'lang', fallback: 'Language' },
    {
      attr: 'theme',
      type: 'select',
      options: 'themes',
      label: 'theme',
      fallback: 'Theme',
      help: 'themeHelp',
    },
    {
      attr: 'preset',
      type: 'select',
      options: 'presets',
      label: 'preset',
      fallback: 'Preset',
      help: 'presetHelp',
    },
    { attr: 'font', type: 'select', options: 'fonts', label: 'font', fallback: 'Font' },
    { attr: 'heading', label: 'heading', fallback: 'Heading', help: 'headingHelp' },
    {
      attr: 'powered-by',
      type: 'select',
      options: 'poweredBy',
      label: 'poweredBy',
      fallback: 'Powered by',
    },
  ];

  /** The sign icons' theme, on the blocks whose element shows a sign. */
  var SIGN_FIELD = {
    attr: 'sign-icons',
    type: 'select',
    options: 'signIcons',
    label: 'signIcons',
    fallback: 'Sign icons',
    help: 'signIconsHelp',
  };

  /**
   * The disclaimer, resolved the way `Elements` resolves it on the page: the
   * block's own choice, else the site's setting.
   */
  function withDisclaimer(attributes, out) {
    delete out.disclaimer;
    delete out['disclaimer-name'];
    delete out['disclaimer-url'];
    if (attributes.disclaimer === 'off') {
      out.disclaimer = 'off';
      return out;
    }
    if (attributes.disclaimer === 'default') return out;
    if (attributes['disclaimer-name']) {
      out['disclaimer-name'] = String(attributes['disclaimer-name']);
      if (attributes['disclaimer-url'])
        out['disclaimer-url'] = String(attributes['disclaimer-url']);
      return out;
    }
    var site = (config().defaults || {}).disclaimer || {};
    Object.keys(site).forEach(function (name) {
      out[name] = String(site[name]);
    });
    return out;
  }

  /**
   * Registers one block.
   *
   * spec.tag         the custom element, `kj-…`
   * spec.attributes  every attribute the block stores (block.json's)
   * spec.panels      [{ title, fallback, open, fields: [{ attr, type, options, label, help, when }] }]
   * spec.kind        `place` (a place panel), `birth` (the birth calculators) or nothing
   * spec.disclaimer  true for the elements that end with a reading
   * spec.form        true for the elements with a birth form
   * spec.note        an i18n key for a notice above the preview's panels
   */
  function register(name, spec) {
    var panels = [];
    if (spec.kind === 'place') {
      panels.push({ title: 'place', fallback: 'Place', open: true, fields: PLACE_FIELDS });
    }
    if (spec.kind === 'birth') {
      panels.push({
        title: 'calcBirth',
        fallback: 'Birth (optional)',
        open: false,
        fields: BIRTH_FIELDS,
      });
    }
    panels = panels.concat(spec.panels || []);
    var display = DISPLAY_FIELDS.slice();
    if (spec.form) display = FORM_FIELDS.concat(display);
    if (spec.disclaimer) display = display.concat(DISCLAIMER_FIELDS);
    if (spec.attributes.indexOf('sign-icons') !== -1) display = display.concat([SIGN_FIELD]);
    panels.push({ title: 'display', fallback: 'Display', open: false, fields: display });

    function elementAttributes(attributes) {
      var out = {};
      spec.attributes.forEach(function (attr) {
        var value = attributes[attr];
        if (value !== '' && value !== undefined && value !== null) out[attr] = String(value);
      });
      // The site's default city, as `Elements` adds it on the page.
      var city = (config().defaults || {}).city;
      if (spec.kind && city && !out.city && !out.lat) out.city = city;
      if (spec.disclaimer) withDisclaimer(attributes, out);
      return out;
    }

    wp.blocks.registerBlockType(name, {
      edit: function (props) {
        var blockProps = useBlockProps();
        var inspector = panels.map(function (spec, index) {
          return panel(props, spec, index);
        });
        var note =
          spec.note && Notice
            ? el(
                Notice,
                { status: 'info', isDismissible: false, key: 'note' },
                label(spec.note, ''),
              )
            : null;
        return el(
          Fragment,
          null,
          el(InspectorControls, null, note, inspector),
          el(
            'div',
            blockProps,
            // The live element; the editor's clicks are kept off it so the
            // block stays selectable in the canvas.
            el(
              'div',
              { className: 'kj-block-preview', style: { pointerEvents: 'none' } },
              el(spec.tag, elementAttributes(props.attributes)),
            ),
          ),
        );
      },
      // Dynamic: `Elements` draws the markup at render time.
      save: function () {
        return null;
      },
    });
  }

  window.kaalJyotiBlockKit = { register: register };
})(window.wp);
