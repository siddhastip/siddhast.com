/* Bundled for Publii — edit contact-form-core.js / google-contact-form-ui.js, then: npm run build:contact-form */
/**
 * Shared contact form logic (browser + Node tests).
 */
(function (root, factory) {
  var core = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = core;
  } else {
    root.ContactFormCore = core;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ECHO_URL_RE = /script\.googleusercontent\.com\/macros\/echo/i;
  var EXEC_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

  function isEchoUrl(url) {
    return ECHO_URL_RE.test(String(url || '').trim());
  }

  function isExecUrl(url) {
    return EXEC_URL_RE.test(String(url || '').trim());
  }

  function resolveConfig(attrs) {
    var scriptUrl = String(attrs.scriptUrl || '').trim();
    var formAction = String(attrs.formAction || '').trim();

    if (isEchoUrl(scriptUrl)) {
      scriptUrl = '';
    }

    var useAppsScript = scriptUrl.length > 0;
    var useGoogleForm = formAction.length > 0 && !useAppsScript;

    return {
      scriptUrl: scriptUrl,
      formAction: formAction,
      spreadsheetId: String(attrs.spreadsheetId || '').trim(),
      entryName: String(attrs.entryName || '').trim(),
      entryEmail: String(attrs.entryEmail || '').trim(),
      entryCompany: String(attrs.entryCompany || '').trim(),
      entryPhone: String(attrs.entryPhone || '').trim(),
      entryMessage: String(attrs.entryMessage || '').trim(),
      useAppsScript: useAppsScript,
      useGoogleForm: useGoogleForm,
      showSetup: !useAppsScript && !useGoogleForm
    };
  }

  function validate(payload) {
    if (!payload.name) return 'Please enter your name.';
    if (!payload.email) return 'Please enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      return 'Please enter a valid email address.';
    }
    if (!payload.message) return 'Please enter a message.';
    return '';
  }

  function parseScriptResponse(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error(
        'Server did not confirm the submission. In Apps Script set SPREADSHEET_ID (or Google Sheet ID in Publii) and redeploy.'
      );
    }
    if (!data || data.status !== 'ok') {
      throw new Error((data && data.message) || 'Submission was rejected by the server.');
    }
    return data;
  }

  function isAppsScriptRedirectSuccess(res) {
    if (!res) return false;
    return res.type === 'opaqueredirect' || res.status === 302 || res.status === 0;
  }

  function buildUrlSearchParams(payload, spreadsheetId) {
    var pairs = [
      ['name',    payload.name],
      ['email',   payload.email],
      ['message', payload.message],
      ['page',    payload.page]
    ];
    if (payload.phone)   pairs.push(['phone',   payload.phone]);
    if (payload.company) pairs.push(['company', payload.company]);
    if (payload.sentAt)  pairs.push(['sentAt',  payload.sentAt]);
    if (spreadsheetId)   pairs.push(['spreadsheetId', spreadsheetId]);
    if (payload.recaptchaToken) pairs.push(['recaptchaToken', payload.recaptchaToken]);

    if (typeof URLSearchParams !== 'undefined') {
      var body = new URLSearchParams();
      pairs.forEach(function (p) {
        body.append(p[0], p[1]);
      });
      return body;
    }
    return pairs
      .map(function (p) {
        return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]);
      })
      .join('&');
  }

  function appsScriptFields(payload, spreadsheetId) {
    var fields = {
      name:    payload.name,
      email:   payload.email,
      message: payload.message,
      page:    payload.page,
      sentAt:  payload.sentAt
    };
    if (payload.phone)          fields.phone = payload.phone;
    if (payload.company)        fields.company = payload.company;
    if (spreadsheetId)          fields.spreadsheetId = spreadsheetId;
    if (payload.recaptchaToken) fields.recaptchaToken = payload.recaptchaToken;
    return fields;
  }

  function googleFormFields(payload, entries) {
    var missing = [];
    if (!entries.formAction) missing.push('Google Form response URL');
    if (!entries.entryName) missing.push('entry ID for Name');
    if (!entries.entryEmail) missing.push('entry ID for Email');
    if (!entries.entryMessage) missing.push('entry ID for Message');
    if (missing.length) {
      return { error: 'Theme settings missing: ' + missing.join(', ') + '.' };
    }

    var fields = {
      submit: 'Submit',
      fvv: '1',
      fbzx: 'test'
    };
    fields[entries.entryName] = payload.name;
    fields[entries.entryEmail] = payload.email;
    fields[entries.entryMessage] = payload.message;
    if (entries.entryPhone && payload.phone) fields[entries.entryPhone] = payload.phone;
    if (entries.entryCompany && payload.company) fields[entries.entryCompany] = payload.company;
    return { fields: fields };
  }

  return {
    ECHO_URL_RE: ECHO_URL_RE,
    EXEC_URL_RE: EXEC_URL_RE,
    isEchoUrl: isEchoUrl,
    isExecUrl: isExecUrl,
    resolveConfig: resolveConfig,
    validate: validate,
    parseScriptResponse: parseScriptResponse,
    isAppsScriptRedirectSuccess: isAppsScriptRedirectSuccess,
    buildUrlSearchParams: buildUrlSearchParams,
    appsScriptFields: appsScriptFields,
    googleFormFields: googleFormFields
  };
});

/**
 * Contact form UI — bundled into google-contact-form.js (requires ContactFormCore).
 *
 * CAPTCHA strategy:
 *   - If data-recaptcha-site-key is set on the form → renders Google reCAPTCHA v2
 *     checkbox widget and sends the token to Apps Script for server-side verification.
 *   - Otherwise → falls back to the built-in client-side math CAPTCHA.
 */
(function () {
  var C = typeof ContactFormCore !== 'undefined' ? ContactFormCore : null;
  if (!C) {
    console.error('ContactFormCore missing — rebuild google-contact-form.js (npm run build:contact-form)');
    return;
  }

  var form = document.getElementById('google-contact-form');
  if (!form) return;

  var setupEl    = document.getElementById('contact-form-setup');
  var successEl  = document.getElementById('contact-form-success');
  var errorEl    = document.getElementById('contact-form-error');
  var submitBtn  = document.getElementById('contact-form-submit');
  var submitText = submitBtn && submitBtn.querySelector('.contact-form__submit-text');
  var submitLoading = submitBtn && submitBtn.querySelector('.contact-form__submit-loading');

  var cfg = C.resolveConfig({
    scriptUrl:     form.getAttribute('data-script-url'),
    formAction:    form.getAttribute('data-form-action'),
    spreadsheetId: form.getAttribute('data-spreadsheet-id'),
    entryName:     form.getAttribute('data-entry-name'),
    entryEmail:    form.getAttribute('data-entry-email'),
    entryCompany:  form.getAttribute('data-entry-company'),
    entryPhone:    form.getAttribute('data-entry-phone'),
    entryMessage:  form.getAttribute('data-entry-message')
  });

  var recaptchaSiteKey = (form.getAttribute('data-recaptcha-site-key') || '').trim();

  if (C.isEchoUrl(form.getAttribute('data-script-url'))) {
    if (setupEl) {
      setupEl.hidden = false;
      var note = setupEl.querySelector('.contact-form-setup__note');
      if (note) {
        note.textContent =
          'You pasted the echo redirect URL. In Apps Script use Deploy \u2192 Manage deployments and copy the Web app URL ending in /exec (script.google.com/macros/s/\u2026/exec).';
      }
    }
    form.hidden = true;
    form.setAttribute('aria-hidden', 'true');
    return;
  }

  if (cfg.showSetup) {
    if (setupEl) setupEl.hidden = false;
    form.hidden = true;
    form.setAttribute('aria-hidden', 'true');
    return;
  }

  if (setupEl) setupEl.hidden = true;

  /* ── reCAPTCHA v2 ──────────────────────────────────────────────── */
  var recaptchaWidgetId = null;
  var recaptchaEl = document.getElementById('contact-recaptcha');

  function initRecaptcha() {
    if (!recaptchaSiteKey || !recaptchaEl || typeof grecaptcha === 'undefined') return;

    recaptchaEl.hidden = false;

    recaptchaWidgetId = grecaptcha.render(recaptchaEl, {
      sitekey: recaptchaSiteKey,
      theme: 'light',
      callback: function () {
        clearError(); // clear any previous "please complete CAPTCHA" error
      }
    });

    // Hide the math CAPTCHA — reCAPTCHA takes over
    var mathWrap = document.getElementById('contact-captcha-wrap');
    if (mathWrap) mathWrap.hidden = true;
  }

  // grecaptcha is loaded with onload=_rcOnload (set by the HBS script tag)
  // We expose _rcOnload globally so the API script can call it.
  window._rcOnload = initRecaptcha;

  // Also try immediately in case the API already loaded (e.g. cached)
  if (recaptchaSiteKey && typeof grecaptcha !== 'undefined') {
    initRecaptcha();
  }

  function getRecaptchaToken() {
    if (recaptchaWidgetId !== null && typeof grecaptcha !== 'undefined') {
      return grecaptcha.getResponse(recaptchaWidgetId) || '';
    }
    return '';
  }

  function resetRecaptcha() {
    if (recaptchaWidgetId !== null && typeof grecaptcha !== 'undefined') {
      grecaptcha.reset(recaptchaWidgetId);
    }
  }
  /* ─────────────────────────────────────────────────────────────── */

  /* ── Math CAPTCHA (fallback when no reCAPTCHA key) ────────────── */
  var captchaAnswer = 0;

  function generateCaptcha() {
    var ops = ['+', '-'];
    var op = ops[Math.floor(Math.random() * ops.length)];
    var a, b;
    if (op === '+') {
      a = Math.floor(Math.random() * 15) + 1;   // 1-15
      b = Math.floor(Math.random() * 15) + 1;
      captchaAnswer = a + b;
    } else {
      a = Math.floor(Math.random() * 15) + 6;   // 6-20
      b = Math.floor(Math.random() * a);         // 0..(a-1) result always >= 1
      captchaAnswer = a - b;
    }
    return a + ' ' + op + ' ' + b + ' = ?';
  }

  function renderMathCaptcha() {
    var container = document.getElementById('contact-captcha-wrap');
    if (!container || container.hidden) return;

    var question = generateCaptcha();

    container.innerHTML =
      '<div class="contact-captcha">' +
        '<label class="contact-form__label contact-captcha__label" for="contact-captcha">' +
          'Verification <span aria-hidden="true">*</span>' +
        '</label>' +
        '<div class="contact-captcha__row">' +
          '<span class="contact-captcha__question" aria-label="Solve: ' + question + '">' + question + '</span>' +
          '<input class="contact-form__input contact-captcha__input" id="contact-captcha" ' +
                 'name="captcha" type="number" inputmode="numeric" autocomplete="off" ' +
                 'placeholder="Answer" required aria-required="true">' +
          '<button type="button" class="contact-captcha__refresh" ' +
                  'aria-label="New verification question" title="New question">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M21 2v6h-6"/>' +
              '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>' +
              '<path d="M3 22v-6h6"/>' +
              '<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
        '<p class="contact-captcha__hint">Please solve the simple maths problem above.</p>' +
      '</div>';

    var refreshBtn = container.querySelector('.contact-captcha__refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        renderMathCaptcha();
        var newInput = container.querySelector('#contact-captcha');
        if (newInput) newInput.focus();
      });
    }
  }

  function validateMathCaptcha() {
    var input = document.getElementById('contact-captcha');
    if (!input) return true; // element not present (e.g. reCAPTCHA is active)
    var val = parseInt(input.value, 10);
    return !isNaN(val) && val === captchaAnswer;
  }

  // Render math CAPTCHA on load (only if reCAPTCHA key is not configured)
  if (!recaptchaSiteKey) {
    renderMathCaptcha();
  }
  /* ─────────────────────────────────────────────────────────────── */

  function setSending(isSending) {
    if (!submitBtn) return;
    submitBtn.disabled = isSending;
    if (submitText) submitText.hidden = isSending;
    if (submitLoading) submitLoading.hidden = !isSending;
  }

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  function showSuccess() {
    form.hidden = true;
    form.setAttribute('aria-hidden', 'true');
    if (successEl) successEl.hidden = false;
    clearError();
  }

  function getPayload() {
    var fd = new FormData(form);
    return {
      name:    String(fd.get('name')    || '').trim(),
      email:   String(fd.get('email')   || '').trim(),
      phone:   String(fd.get('phone')   || '').trim(),
      company: String(fd.get('company') || '').trim(),
      message: String(fd.get('message') || '').trim(),
      page:    window.location.href || '',
      sentAt:  new Date().toISOString()
    };
  }

  function submitViaHiddenPost(actionUrl, fields, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var frameName = 'contact-post-' + Date.now();
      var frame = document.createElement('iframe');
      frame.name = frameName;
      frame.title = 'Form submission';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(frame);

      var hiddenForm = document.createElement('form');
      hiddenForm.method = 'POST';
      hiddenForm.action = actionUrl;
      hiddenForm.target = frameName;
      hiddenForm.style.display = 'none';
      hiddenForm.acceptCharset = 'UTF-8';

      Object.keys(fields).forEach(function (key) {
        var value = fields[key];
        if (value === undefined || value === null || value === '') return;
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        hiddenForm.appendChild(input);
      });

      document.body.appendChild(hiddenForm);

      var settled = false;
      function finish(err) {
        if (settled) return;
        settled = true;
        frame.removeEventListener('load', onLoad);
        hiddenForm.remove();
        frame.remove();
        if (err) reject(err);
        else resolve();
      }

      function onLoad() { finish(); }

      frame.addEventListener('load', onLoad);
      window.setTimeout(function () { finish(); }, timeoutMs || 8000);
      hiddenForm.submit();
    });
  }

  function submitViaAppsScript(payload) {
    var body = C.buildUrlSearchParams(payload, cfg.spreadsheetId);

    return fetch(cfg.scriptUrl, {
      method: 'POST',
      // no-cors: Google Apps Script redirects do not include CORS headers.
      // The response is opaque (status 0, unreadable) but the POST is sent.
      mode: 'no-cors',
      body: body
    })
      .then(function () {
        // Opaque response — cannot read body, but the submission was delivered.
        return;
      })
      .catch(function (err) {
        if (cfg.useGoogleFormFallback) {
          console.warn('Apps Script fetch failed (' + (err && err.message) + '), falling back to Google Form.');
          return submitViaGoogleForm(payload);
        }
        throw err;
      });
  }

  function submitViaGoogleForm(payload) {
    var built = C.googleFormFields(payload, {
      formAction:   cfg.formAction,
      entryName:    cfg.entryName,
      entryEmail:   cfg.entryEmail,
      entryMessage: cfg.entryMessage,
      entryPhone:   cfg.entryPhone,
      entryCompany: cfg.entryCompany
    });
    if (built.error) {
      showError(built.error);
      return Promise.reject(new Error('missing google form config'));
    }
    // fbzx must fit in a signed int64 (max 19 digits). Date.now() is ~13 digits — safe.
    built.fields.fbzx = String(Date.now());
    return submitViaHiddenPost(cfg.formAction, built.fields, 8000);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    // ── CAPTCHA check ─────────────────────────────────────────────
    if (recaptchaSiteKey) {
      // Google reCAPTCHA v2
      var token = getRecaptchaToken();
      if (!token) {
        showError('Please complete the reCAPTCHA verification.');
        return;
      }
      // Token is valid — will be sent with payload via buildUrlSearchParams extension
    } else {
      // Math CAPTCHA fallback
      if (!validateMathCaptcha()) {
        showError('Incorrect answer \u2014 please try again.');
        renderMathCaptcha(); // refresh the question
        var captchaInput = document.getElementById('contact-captcha');
        if (captchaInput) {
          captchaInput.value = '';
          captchaInput.focus();
        }
        return;
      }
    }
    // ─────────────────────────────────────────────────────────────

    var payload = getPayload();
    var validationError = C.validate(payload);
    if (validationError) {
      showError(validationError);
      return;
    }

    // Attach reCAPTCHA token to payload for Apps Script verification
    if (recaptchaSiteKey) {
      payload.recaptchaToken = getRecaptchaToken();
    }

    setSending(true);

    var submitPromise = cfg.useAppsScript
      ? submitViaAppsScript(payload)
      : submitViaGoogleForm(payload);

    submitPromise
      .then(function () {
        showSuccess();
      })
      .catch(function (err) {
        var hint = cfg.useAppsScript
          ? ' Check Theme \u2192 Settings \u2192 Google Apps Script URL and redeploy with SPREADSHEET_ID.'
          : ' Check Google Form settings.';
        showError(
          (err && err.message ? err.message + '. ' : 'Something went wrong. ') +
            'Please try again or email support@siddhast.com directly.' +
            hint
        );
        resetRecaptcha(); // let user try again
      })
      .finally(function () {
        setSending(false);
      });
  });
})();
