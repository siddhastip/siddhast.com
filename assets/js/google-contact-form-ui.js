/**
 * Contact form UI — bundled into google-contact-form.js (requires ContactFormCore).
 */
(function () {
  var C = typeof ContactFormCore !== 'undefined' ? ContactFormCore : null;
  if (!C) {
    console.error('ContactFormCore missing — rebuild google-contact-form.js (npm run build:contact-form)');
    return;
  }

  var form = document.getElementById('google-contact-form');
  if (!form) return;

  var setupEl = document.getElementById('contact-form-setup');
  var successEl = document.getElementById('contact-form-success');
  var errorEl = document.getElementById('contact-form-error');
  var submitBtn = document.getElementById('contact-form-submit');
  var submitText = submitBtn && submitBtn.querySelector('.contact-form__submit-text');
  var submitLoading = submitBtn && submitBtn.querySelector('.contact-form__submit-loading');

  var cfg = C.resolveConfig({
    scriptUrl: form.getAttribute('data-script-url'),
    formAction: form.getAttribute('data-form-action'),
    spreadsheetId: form.getAttribute('data-spreadsheet-id'),
    entryName: form.getAttribute('data-entry-name'),
    entryEmail: form.getAttribute('data-entry-email'),
    entryCompany: form.getAttribute('data-entry-company'),
    entryPhone: form.getAttribute('data-entry-phone'),
    entryMessage: form.getAttribute('data-entry-message')
  });

  if (C.isEchoUrl(form.getAttribute('data-script-url'))) {
    if (setupEl) {
      setupEl.hidden = false;
      var note = setupEl.querySelector('.contact-form-setup__note');
      if (note) {
        note.textContent =
          'You pasted the echo redirect URL. In Apps Script use Deploy → Manage deployments and copy the Web app URL ending in /exec (script.google.com/macros/s/…/exec).';
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
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      company: String(fd.get('company') || '').trim(),
      message: String(fd.get('message') || '').trim(),
      page: window.location.href || '',
      sentAt: new Date().toISOString()
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

      function onLoad() {
        finish();
      }

      frame.addEventListener('load', onLoad);
      window.setTimeout(function () {
        finish();
      }, timeoutMs || 8000);

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
        // Network / fetch failure — fall back to Google Form if configured
        if (cfg.useGoogleFormFallback) {
          console.warn('Apps Script fetch failed (' + (err && err.message) + '), falling back to Google Form.');
          return submitViaGoogleForm(payload);
        }
        throw err;
      });
  }

  function submitViaGoogleForm(payload) {
    var built = C.googleFormFields(payload, {
      formAction: cfg.formAction,
      entryName: cfg.entryName,
      entryEmail: cfg.entryEmail,
      entryMessage: cfg.entryMessage,
      entryPhone: cfg.entryPhone,
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

    var payload = getPayload();
    var validationError = C.validate(payload);
    if (validationError) {
      showError(validationError);
      return;
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
          ? ' Check Theme → Settings → Google Apps Script URL and redeploy with SPREADSHEET_ID.'
          : ' Check Google Form settings.';
        showError(
          (err && err.message ? err.message + '. ' : 'Something went wrong. ') +
            'Please try again or email support@siddhast.com directly.' +
            hint
        );
      })
      .finally(function () {
        setSending(false);
      });
  });
})();
