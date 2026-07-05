/*!
 * Copiloto de Tráfego — snippet de captura de atribuição (ETAPA2.md 3.1/3.3).
 * Persiste fbclid/gclid/utm_* em cookie + localStorage e injeta como campos
 * ocultos em formulários da página, para que o CRM/checkout do cliente
 * propague esses hints até o `business_events.attribution_hints` via
 * webhook (ver /api/hooks/{connectionId}). Não coleta PII.
 *
 * Instalação: ver docs/tracking-snippet.md
 */
(function (window, document) {
  "use strict";

  var STORAGE_KEY = "_copiloto_attr";
  var COOKIE_MAX_AGE_DAYS = 90; // cobre ciclos de venda B2B longos (ver business_context.ciclo_de_venda_dias)
  var HINT_KEYS = [
    "fbclid",
    "gclid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "landing_page",
    "referrer",
  ];
  var MARKETING_PARAM_KEYS = [
    "fbclid",
    "gclid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ];

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(name, value, maxAgeDays) {
    var maxAge = maxAgeDays * 24 * 60 * 60;
    var secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      name + "=" + encodeURIComponent(value) + "; path=/; max-age=" + maxAge + "; SameSite=Lax" + secure;
  }

  function readStoredHints() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* localStorage indisponível (modo privado/iframe) — segue só com cookie */
    }
    if (!raw) raw = readCookie(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeStoredHints(hints) {
    var raw = JSON.stringify(hints);
    try {
      window.localStorage.setItem(STORAGE_KEY, raw);
    } catch {
      /* segue só com cookie */
    }
    writeCookie(STORAGE_KEY, raw, COOKIE_MAX_AGE_DAYS);
  }

  function paramsFromUrl() {
    var search = new URLSearchParams(window.location.search);
    var found = {};
    var hasMarketingParam = false;
    for (var i = 0; i < MARKETING_PARAM_KEYS.length; i++) {
      var key = MARKETING_PARAM_KEYS[i];
      var value = search.get(key);
      if (value) {
        found[key] = value;
        hasMarketingParam = true;
      }
    }
    return hasMarketingParam ? found : null;
  }

  /**
   * Resolve os hints para a visita atual: se a URL trouxer um novo clique de
   * anúncio, substitui o touch armazenado por inteiro (last-click). Caso
   * contrário, mantém o que já estava salvo de uma visita anterior.
   */
  function resolveAttributionHints() {
    var fromUrl = paramsFromUrl();
    if (fromUrl) {
      fromUrl.landing_page = window.location.href;
      fromUrl.referrer = document.referrer || "";
      writeStoredHints(fromUrl);
      return fromUrl;
    }
    return readStoredHints() || {};
  }

  function injectIntoForm(form, hints) {
    for (var i = 0; i < HINT_KEYS.length; i++) {
      var key = HINT_KEYS[i];
      var value = hints[key];
      if (!value) continue;

      var input = form.querySelector('input[name="' + key + '"]');
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        form.appendChild(input);
      }
      input.value = value;
    }
  }

  function injectIntoAllForms(hints) {
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) {
      injectIntoForm(forms[i], hints);
    }
  }

  function observeNewForms(hints) {
    if (typeof MutationObserver === "undefined") return;
    var observer = new MutationObserver(function () {
      injectIntoAllForms(hints);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    var hints = resolveAttributionHints();
    injectIntoAllForms(hints);
    observeNewForms(hints);

    window.CopilotoTracking = {
      getAttributionHints: function () {
        return resolveAttributionHints();
      },
      injectIntoForm: function (form) {
        injectIntoForm(form, resolveAttributionHints());
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
