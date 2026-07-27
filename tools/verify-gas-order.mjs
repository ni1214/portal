import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const GAS_SOURCE_URL = new URL('../gas-order-script.js', import.meta.url);
const TOKEN = 'test-order-token-0123456789abcdef';
const VALID_ORDER = {
  token: TOKEN,
  to: 'supplier@example.com',
  subject: '鋼材発注',
  body: 'テスト発注です。',
  replyTo: 'portal@example.com',
};

function createGasHarness(source) {
  const properties = new Map([['PORTAL_ORDER_TOKEN', TOKEN]]);
  const propertyWrites = [];
  const gmailCalls = [];
  let gmailShouldFail = false;
  let lockDepth = 0;

  const scriptProperties = {
    getProperty(key) {
      return properties.get(key) || null;
    },
    setProperty(key, value) {
      properties.set(key, `${value}`);
      propertyWrites.push({ key, value: `${value}` });
      return scriptProperties;
    },
  };

  const context = vm.createContext({
    console,
    PropertiesService: {
      getScriptProperties() {
        return scriptProperties;
      },
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock() {
            lockDepth += 1;
          },
          releaseLock() {
            lockDepth -= 1;
          },
        };
      },
    },
    GmailApp: {
      sendEmail(to, subject, body, options) {
        gmailCalls.push({ to, subject, body, options });
        if (gmailShouldFail) throw new Error('forced Gmail failure');
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(_algorithm, value) {
        return Array.from(
          createHash('sha256').update(`${value}`, 'utf8').digest(),
          byte => (byte > 127 ? byte - 256 : byte),
        );
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) {
        return {
          text: `${text}`,
          mimeType: '',
          setMimeType(mimeType) {
            this.mimeType = mimeType;
            return this;
          },
          getContent() {
            return this.text;
          },
        };
      },
    },
  });

  vm.runInContext(
    `${source}\n;globalThis.__gasOrderTestApi = { doPost, processedOrderKey, readOrderState };`,
    context,
    { filename: 'gas-order-script.js' },
  );

  const gas = context.__gasOrderTestApi;

  return {
    gmailCalls,
    propertyWrites,
    post(payload) {
      const output = gas.doPost({
        postData: { contents: JSON.stringify(payload) },
      });
      const text = typeof output?.getContent === 'function'
        ? output.getContent()
        : output?.text;
      return JSON.parse(text);
    },
    rawState(orderId) {
      return properties.get(gas.processedOrderKey(orderId)) || '';
    },
    state(orderId) {
      return gas.readOrderState(orderId);
    },
    stateWrites(orderId) {
      const key = gas.processedOrderKey(orderId);
      return propertyWrites.filter(write => write.key === key);
    },
    setGmailFailure(value) {
      gmailShouldFail = value === true;
    },
    assertUnlocked() {
      assert.equal(lockDepth, 0, 'The script lock must always be released.');
    },
  };
}

function sendPayload(orderId, attemptId) {
  return { ...VALID_ORDER, orderId, attemptId };
}

function reconcilePayload(orderId, attemptId, resolution) {
  return {
    token: TOKEN,
    action: 'reconcile',
    orderId,
    attemptId,
    resolution,
  };
}

function storedStatus(value) {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.status === 'string') return parsed.status.toUpperCase();
  } catch {}
  return `${value || ''}`.split(':', 1)[0].toUpperCase();
}

const source = await readFile(GAS_SOURCE_URL, 'utf8');

// 1, 2: a send records SENDING before Gmail and SENT afterward; retries are safe.
{
  const harness = createGasHarness(source);
  const first = harness.post(sendPayload('order-first', 'attempt-first'));
  assert.deepEqual(first, {
    success: true,
    status: 'sent',
    orderId: 'order-first',
    attemptId: 'attempt-first',
  });
  assert.equal(harness.gmailCalls.length, 1, 'The first attempt must send exactly once.');
  assert.deepEqual(
    harness.stateWrites('order-first').map(write => storedStatus(write.value)),
    ['SENDING', 'SENT'],
    'The state must move from SENDING to SENT around the Gmail call.',
  );
  assert.equal(harness.state('order-first').status, 'sent');

  const retry = harness.post(sendPayload('order-first', 'attempt-retry'));
  assert.equal(retry.success, true);
  assert.equal(retry.status, 'already_sent');
  assert.equal(harness.gmailCalls.length, 1, 'A sent order must never be sent twice.');
  assert.equal(
    harness.stateWrites('order-first').length,
    2,
    'A duplicate send must not rewrite completed state.',
  );
  harness.assertUnlocked();
}

// 3, 4, 6: a provider failure remains ambiguous until an idempotent reconciliation.
{
  const harness = createGasHarness(source);
  harness.setGmailFailure(true);
  const failed = harness.post(sendPayload('order-retry', 'attempt-failed'));
  assert.equal(failed.success, false);
  assert.equal(failed.status, 'unknown');
  assert.equal(storedStatus(harness.rawState('order-retry')), 'SENDING');
  assert.equal(harness.state('order-retry').status, 'sending');
  harness.assertUnlocked();

  const reconciled = harness.post(
    reconcilePayload('order-retry', 'attempt-failed', 'not_sent'),
  );
  assert.equal(reconciled.success, true);
  assert.equal(reconciled.status, 'retry_allowed');
  assert.equal(storedStatus(harness.rawState('order-retry')), 'RETRY_ALLOWED');
  const retryAllowedState = harness.rawState('order-retry');

  const reconciledAgain = harness.post(
    reconcilePayload('order-retry', 'attempt-failed', 'not_sent'),
  );
  assert.equal(reconciledAgain.success, true);
  assert.equal(reconciledAgain.status, 'already_retry_allowed');
  assert.equal(
    harness.rawState('order-retry'),
    retryAllowedState,
    'Repeated not_sent reconciliation must not rewrite state.',
  );

  harness.setGmailFailure(false);
  const newAttempt = harness.post(sendPayload('order-retry', 'attempt-new'));
  assert.equal(newAttempt.success, true);
  assert.equal(newAttempt.status, 'sent');
  assert.equal(
    harness.gmailCalls.length,
    2,
    'A reconciled not-sent order must permit one new Gmail attempt.',
  );
  assert.equal(harness.state('order-retry').status, 'sent');
  harness.assertUnlocked();
}

// 5: neither another attempt nor a completed send may be cleared for retry.
{
  const harness = createGasHarness(source);
  harness.setGmailFailure(true);
  harness.post(sendPayload('order-mismatch', 'attempt-owner'));
  const sendingState = harness.rawState('order-mismatch');
  const mismatched = harness.post(
    reconcilePayload('order-mismatch', 'attempt-other', 'not_sent'),
  );
  assert.equal(mismatched.success, false);
  assert.notEqual(mismatched.status, 'retry_allowed');
  assert.notEqual(mismatched.status, 'already_retry_allowed');
  assert.equal(
    harness.rawState('order-mismatch'),
    sendingState,
    'A mismatched attempt must not clear SENDING.',
  );

  harness.setGmailFailure(false);
  const sent = harness.post(sendPayload('order-complete', 'attempt-complete'));
  assert.equal(sent.status, 'sent');
  const sentState = harness.rawState('order-complete');
  const clearSent = harness.post(
    reconcilePayload('order-complete', 'attempt-complete', 'not_sent'),
  );
  assert.equal(clearSent.success, false);
  assert.notEqual(clearSent.status, 'retry_allowed');
  assert.notEqual(clearSent.status, 'already_retry_allowed');
  assert.equal(
    harness.rawState('order-complete'),
    sentState,
    'A SENT order must never be cleared for retry.',
  );
  assert.equal(harness.gmailCalls.length, 2);
  harness.assertUnlocked();
}

// 6: confirming an ambiguous attempt as sent is also idempotent.
{
  const harness = createGasHarness(source);
  harness.setGmailFailure(true);
  harness.post(sendPayload('order-confirmed', 'attempt-confirmed'));
  const confirmed = harness.post(
    reconcilePayload('order-confirmed', 'attempt-confirmed', 'sent'),
  );
  assert.equal(confirmed.success, true);
  assert.equal(confirmed.status, 'sent_confirmed');
  assert.equal(storedStatus(harness.rawState('order-confirmed')), 'SENT');
  const confirmedState = harness.rawState('order-confirmed');

  const confirmedAgain = harness.post(
    reconcilePayload('order-confirmed', 'attempt-confirmed', 'sent'),
  );
  assert.equal(confirmedAgain.success, true);
  assert.equal(confirmedAgain.status, 'already_sent');
  assert.equal(
    harness.rawState('order-confirmed'),
    confirmedState,
    'Repeated sent reconciliation must not rewrite state.',
  );
  assert.equal(
    harness.gmailCalls.length,
    1,
    'A sent reconciliation must not invoke Gmail again.',
  );
  harness.assertUnlocked();
}

console.log('GAS order idempotency and reconciliation verification passed.');
