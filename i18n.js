var I18N = (function () {
  var _locale = localStorage.getItem('cupping_locale') || 'en';

  function strings() {
    return LOCALES[_locale] || LOCALES.en;
  }

  function t(key) {
    return strings()[key] || LOCALES.en[key] || key;
  }

  function geo(value) {
    if (!value) return value;
    var g = strings().geo || {};
    return g[value] || value;
  }

  function tpl(key, vars) {
    var s = t(key);
    Object.keys(vars).forEach(function (k) {
      s = s.replace('{' + k + '}', vars[k]);
    });
    return s;
  }

  function setLocale(lang) {
    if (!LOCALES[lang]) return;
    _locale = lang;
    localStorage.setItem('cupping_locale', lang);
    apply();
  }

  function apply() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = val;
      } else if (el.tagName === 'OPTION') {
        el.textContent = val;
      } else if (val.indexOf('\n') > -1) {
        el.innerHTML = val.replace(/\n/g, '<br>');
      } else {
        el.textContent = val;
      }
    });
    document.title = t('site_title');
  }

  function locale() {
    return _locale;
  }

  function allLocales() {
    return Object.keys(LOCALES).map(function (code) {
      return { code: code, label: LOCALES[code]._label || code };
    });
  }

  function notes(flavorString) {
    if (!flavorString || _locale === 'en') return flavorString;
    var d = strings().desc || {};
    return flavorString.split(', ').map(function (s) {
      return d[s.trim()] || s;
    }).join(', ');
  }

  function personalNote(id, fallback) {
    var pn = strings().personal_notes || {};
    return pn[id] || fallback || '';
  }

  function name(englishName) {
    if (_locale === 'en' || !englishName) return englishName;
    var entry = (typeof NAME_LOCALES !== 'undefined') && NAME_LOCALES[englishName];
    return (entry && entry[_locale]) || englishName;
  }

  return {
    t: t,
    geo: geo,
    tpl: tpl,
    notes: notes,
    personalNote: personalNote,
    name: name,
    setLocale: setLocale,
    apply: apply,
    locale: locale,
    allLocales: allLocales,
  };
})();
