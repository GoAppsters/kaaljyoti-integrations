/**
 * `kaal-jyoti/reading` in the block editor.
 *
 * Plain ES5 on the `wp.*` globals: no JSX and no build step (design decision
 * 7). The preview is the live `<kj-reading>`: the sign or nakshatra picker
 * when nothing is chosen, which calls nothing, and otherwise the reading for
 * the preset or the birth — one real call, as the block's description says.
 * The personal readings (house lords, grahas, yogas, Vimshottari,
 * varshphal, life areas) have no preset: they are always a birth's, so the
 * pick control goes and the birth panel opens; the varshphal adds a year.
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
    'type',
    'sign',
    'nakshatra',
    'year',
    'parts',
    'datetime',
    'timezone',
    'lat',
    'lon',
    'place',
    'city',
    'lang',
    'disclaimer',
    'disclaimer-name',
    'disclaimer-url',
    'powered-by',
    'theme',
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
   * The attributes the custom element carries; an empty one is left off, and
   * so is the preset that does not belong to the reading's type.
   */
  /** The readings of one birth, with nothing to pick. */
  var PERSONAL = [
    'house_lords',
    'grahas',
    'yogas',
    'vimshottari',
    'varshphal',
    'life_areas',
    'kundli',
  ];

  function elementAttributes(attributes) {
    var out = {};
    ELEMENT_ATTRIBUTES.forEach(function (name) {
      var value = attributes[name];
      if (value !== '' && value !== undefined && value !== null) {
        out[name] = String(value);
      }
    });

    if (out.type !== 'varshphal' && out.type !== 'kundli') {
      delete out.year;
    }
    if (out.type !== 'kundli') {
      delete out.parts;
    }

    if (PERSONAL.indexOf(out.type) !== -1) {
      delete out.sign;
      delete out.nakshatra;
    } else if (out.type === 'nakshatra') {
      delete out.sign;
    } else {
      delete out.nakshatra;
    }

    return withDisclaimer(attributes, out);
  }

  /** The disclaimer controls every report block shares. */
  function disclaimerControls(props) {
    var a = props.attributes;
    return [
      el(SelectControl, {
        key: 'disclaimer',
        label: label('disclaimer', 'Disclaimer'),
        help: label('disclaimerHelp', ''),
        value: a.disclaimer,
        options: config().disclaimers || [],
        onChange: set(props, 'disclaimer'),
      }),
      el(TextControl, {
        key: 'disclaimer-name',
        label: label('disclaimerName', "Astrologer's name"),
        help: label('disclaimerNameHelp', ''),
        value: a['disclaimer-name'],
        onChange: set(props, 'disclaimer-name'),
      }),
      el(TextControl, {
        key: 'disclaimer-url',
        label: label('disclaimerUrl', "Astrologer's link"),
        type: 'url',
        value: a['disclaimer-url'],
        onChange: set(props, 'disclaimer-url'),
      }),
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

  wp.blocks.registerBlockType('kaal-jyoti/reading', {
    edit: function (props) {
      var a = props.attributes;
      var blockProps = useBlockProps();
      var isNakshatra = a.type === 'nakshatra';
      var isPersonal = PERSONAL.indexOf(a.type) !== -1;

      var year = el(TextControl, {
        key: 'year',
        label: label('year', 'Year'),
        help: label('yearHelp', ''),
        type: 'number',
        value: a.year,
        onChange: set(props, 'year'),
      });
      var pick = isPersonal
        ? a.type === 'varshphal'
          ? year
          : a.type === 'kundli'
            ? [
                el(TextControl, {
                  key: 'parts',
                  label: label('parts', 'Parts'),
                  help: label('partsHelp', ''),
                  value: a.parts,
                  onChange: set(props, 'parts'),
                }),
                year,
              ]
            : null
        : isNakshatra
          ? el(SelectControl, {
              label: label('nakshatra', 'Nakshatra'),
              help: label('readingPickHelp', ''),
              value: a.nakshatra,
              options: config().nakshatras || [],
              onChange: set(props, 'nakshatra'),
            })
          : el(SelectControl, {
              label: label('lagnaSign', 'Lagna'),
              help: label('readingPickHelp', ''),
              value: a.sign,
              options: config().signs || [],
              onChange: set(props, 'sign'),
            });

      var reading = el(
        PanelBody,
        { title: label('reading', 'Reading'), initialOpen: true },
        el(SelectControl, {
          label: label('readingType', 'Reading'),
          value: a.type || 'lagna',
          options: config().readingTypes || [],
          onChange: set(props, 'type'),
        }),
        pick,
      );

      var birth = el(
        PanelBody,
        {
          title: isPersonal
            ? label('houseLordsBirth', 'Birth')
            : label('readingBirth', 'Birth (optional)'),
          initialOpen: isPersonal,
        },
        el(TextControl, {
          label: label('datetime', 'Birth date and time'),
          help: isPersonal ? label('houseLordsHelp', '') : label('readingBirthHelp', ''),
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

      var display = el(
        PanelBody,
        { title: label('display', 'Display'), initialOpen: false },
        el(SelectControl, {
          label: label('lang', 'Language'),
          value: a.lang,
          options: config().langs || [],
          onChange: set(props, 'lang'),
        }),
        disclaimerControls(props),
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

      return el(
        Fragment,
        null,
        el(InspectorControls, null, reading, birth, display, stylePanel(props)),
        el(
          'div',
          blockProps,
          el(
            'div',
            { className: 'kj-block-preview', style: { pointerEvents: 'none' } },
            el('kj-reading', elementAttributes(a)),
          ),
        ),
      );
    },

    save: function () {
      return null;
    },
  });
})(window.wp);
