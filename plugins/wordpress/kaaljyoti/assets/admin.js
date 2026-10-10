/**
 * The appearance fields: WordPress's own colour picker on each colour input.
 * An empty field is a valid answer (keep the theme's colour), which the picker's
 * Clear button gives back.
 */
(function ($) {
  'use strict';

  if (!$ || !$.fn || !$.fn.wpColorPicker) {
    return;
  }

  $(function () {
    $('.kaal-jyoti-color').wpColorPicker();
  });
})(window.jQuery);

/**
 * The settings page's "Test connection" button.
 *
 * Posts to `admin-ajax.php` with the nonce WordPress printed beside it and
 * writes the one line that comes back next to the button. Nothing is stored,
 * on either side.
 */
(function () {
  'use strict';

  var settings = window.kaalJyotiAdmin;
  var button = document.getElementById('kaal-jyoti-test');
  var output = document.getElementById('kaal-jyoti-test-result');

  if (!settings || !button || !output) {
    return;
  }

  var failed = function (message) {
    output.textContent = message || settings.failed;
    output.style.color = '#b32d2e';
  };

  button.addEventListener('click', function () {
    var body = new URLSearchParams();
    body.set('action', 'kaal_jyoti_test');
    body.set('nonce', settings.nonce);

    button.disabled = true;
    output.textContent = settings.testing;
    output.style.color = '';

    fetch(settings.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString(),
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (answer) {
        var message = answer && answer.data && answer.data.message;
        if (answer && answer.success) {
          output.textContent = message || '';
          output.style.color = '';
          return;
        }
        failed(message);
      })
      .catch(function () {
        failed();
      })
      .finally(function () {
        button.disabled = false;
      });
  });
})();

/**
 * The zodiac sign icons: twelve media-library pickers, one per sign. Each
 * stores the attachment id in its hidden field (the page gets the URL), shows
 * a preview, and "Clear" puts the default icon back. The row of pickers is
 * shown only while "Your own images" is the chosen theme.
 */
(function () {
  'use strict';

  var settings = window.kaalJyotiAdmin || {};
  var grid = document.querySelector('.kaal-jyoti-sign-images');
  var theme = document.getElementById('kaal_jyoti_sign_icons');
  if (!grid) {
    return;
  }

  var row = grid.closest('tr');
  var toggle = function () {
    if (row && theme) {
      row.style.display = theme.value === 'custom' ? '' : 'none';
    }
  };
  if (theme) {
    theme.addEventListener('change', toggle);
    toggle();
  }

  var preview = function (card, url) {
    var box = card.querySelector('.kaal-jyoti-sign-preview');
    box.textContent = '';
    if (url) {
      var image = document.createElement('img');
      image.src = url;
      image.alt = '';
      image.style.maxWidth = '64px';
      image.style.maxHeight = '64px';
      box.appendChild(image);
    } else {
      var none = document.createElement('span');
      none.className = 'description';
      none.textContent = settings.signDefault || '';
      box.appendChild(none);
    }
    card.querySelector('.kaal-jyoti-sign-clear').hidden = !url;
  };

  grid.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    var card = button && button.closest('.kaal-jyoti-sign-image');
    if (!card) {
      return;
    }
    var field = card.querySelector('.kaal-jyoti-sign-id');

    if (button.classList.contains('kaal-jyoti-sign-clear')) {
      field.value = '';
      preview(card, '');
      return;
    }

    if (!window.wp || !window.wp.media) {
      return;
    }
    var name = card.querySelector('div').textContent;
    var frame = window.wp.media({
      title: (settings.signTitle || '%s').replace('%s', name),
      button: { text: settings.signButton || '' },
      library: { type: 'image' },
      multiple: false,
    });
    frame.on('select', function () {
      var chosen = frame.state().get('selection').first();
      if (!chosen) {
        return;
      }
      var data = chosen.toJSON();
      var sizes = data.sizes || {};
      var shown = (sizes.thumbnail || sizes.medium || data).url;
      field.value = String(data.id);
      preview(card, shown);
    });
    frame.open();
  });
})();

/**
 * The Shortcodes tab's copy buttons. They are drawn hidden, so a page without
 * this script shows only the shortcodes, which can still be selected.
 */
(function () {
  'use strict';

  var settings = window.kaalJyotiAdmin || {};
  var buttons = document.querySelectorAll('.kaal-jyoti-copy');
  if (!buttons.length || !window.navigator.clipboard) {
    return;
  }

  Array.prototype.forEach.call(buttons, function (button) {
    var label = button.textContent;
    button.hidden = false;
    button.addEventListener('click', function () {
      window.navigator.clipboard
        .writeText(button.getAttribute('data-copy') || '')
        .then(function () {
          button.textContent = settings.copied || label;
          window.setTimeout(function () {
            button.textContent = label;
          }, 1500);
        });
    });
  });
})();

/**
 * "Search settings": hides the rows of the open tab that do not match what is
 * typed (and a section left with none), and lists the matching settings on
 * the other tabs as links to them. Drawn hidden, so without this script the
 * page is simply the whole tab.
 */
(function () {
  'use strict';

  var settings = window.kaalJyotiAdmin || {};
  var input = document.getElementById('kaal-jyoti-search');
  var other = document.getElementById('kaal-jyoti-search-other');
  var form = input && document.querySelector('.wrap form[action="options.php"]');
  if (!input || !other || !form) {
    return;
  }
  input.closest('.kaal-jyoti-search').hidden = false;

  // The form's sections: each <h2> and what follows it up to the next.
  var groups = [];
  Array.prototype.forEach.call(form.children, function (node) {
    if (node.tagName === 'H2' || !groups.length) {
      groups.push([]);
    }
    groups[groups.length - 1].push(node);
  });

  var filter = function () {
    var query = input.value.trim().toLowerCase();

    groups.forEach(function (group) {
      var visible = 0;
      var tables = 0;
      group.forEach(function (node) {
        if (!node.matches || !node.matches('table.form-table')) {
          return;
        }
        tables += 1;
        Array.prototype.forEach.call(node.querySelectorAll(':scope > tbody > tr'), function (row) {
          var match = !query || row.textContent.toLowerCase().indexOf(query) !== -1;
          row.hidden = !match;
          if (match) {
            visible += 1;
          }
        });
      });
      if (!tables) {
        return;
      }
      group.forEach(function (node) {
        if (!node.matches('table.form-table, input, p.submit')) {
          // The admin styles give a heading its own display, which beats `hidden`.
          node.style.display = query !== '' && visible === 0 ? 'none' : '';
        }
      });
    });

    other.textContent = '';
    if (!query) {
      return;
    }
    var matches = (settings.fields || []).filter(function (field) {
      return (
        field.tab !== settings.tab &&
        (field.label + ' ' + field.section).toLowerCase().indexOf(query) !== -1
      );
    });
    var here = form.querySelectorAll('table.form-table > tbody > tr:not([hidden])').length;
    if (!matches.length) {
      if (!here) {
        other.textContent = settings.searchNothing || '';
      }
      return;
    }
    var line = document.createElement('p');
    line.textContent = (settings.searchOther || '') + ' ';
    matches.forEach(function (field, index) {
      var link = document.createElement('a');
      link.href = field.url;
      link.textContent = field.label + ' (' + field.tabLabel + ')';
      if (index) {
        line.appendChild(document.createTextNode(', '));
      }
      line.appendChild(link);
    });
    other.appendChild(line);
  };

  input.addEventListener('input', filter);
})();
