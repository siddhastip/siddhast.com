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
      ['name', payload.name],
      ['email', payload.email],
      ['message', payload.message],
      ['page', payload.page]
    ];
    if (payload.phone) pairs.push(['phone', payload.phone]);
    if (payload.company) pairs.push(['company', payload.company]);
    if (payload.sentAt) pairs.push(['sentAt', payload.sentAt]);
    if (spreadsheetId) pairs.push(['spreadsheetId', spreadsheetId]);

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
      name: payload.name,
      email: payload.email,
      message: payload.message,
      page: payload.page,
      sentAt: payload.sentAt
    };
    if (payload.phone) fields.phone = payload.phone;
    if (payload.company) fields.company = payload.company;
    if (spreadsheetId) fields.spreadsheetId = spreadsheetId;
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
