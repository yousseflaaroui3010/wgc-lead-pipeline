// Guards the workflow JSON against the "import re-breaks production" trap.
//
// The repo files are the source of truth for logic, and a human imports them
// into a live n8n. Anything left as a placeholder in these files gets applied
// OVER the working production value at import time. That is not a documentation
// problem, it is a live outage waiting for the next deploy:
//
//   wf1-intake.json  Dispatch WF-2 (async).workflowId = SET-AFTER-IMPORT-WF2-ID
//     -> importing WF-1 stops it handing leads to WF-2. The pipeline dies at
//        the join, and WF-1 still returns 200 to the visitor.
//   wf1/wf2         settings.errorWorkflow = SET-AFTER-IMPORT-WF3-ID
//     -> importing either one unsets the alarm, so a hard node failure tells
//        nobody. Exactly the silence this whole task existed to remove.
//
// Written 2026-08-18 as a FAILING test, on purpose, while the placeholders were
// still there. It has been seen red before it was seen green.
//
// Run: node --test n8n/test/wf-import-safety.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../workflows/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

const load = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));

test('the workflow directory is not empty (control: this suite can actually see files)', () => {
  assert.ok(files.length >= 4, 'expected WF-0..WF-3, found: ' + files.join(', '));
});

// Widened 2026-08-18 after a drift check against the LIVE n8n export. The first
// version of this test only looked for SET-AFTER-IMPORT and therefore missed
// `path: "REPLACE-HOOK-ID/lead"` sitting in WF-1's webhook node, which would
// have changed the production endpoint URL on import and 404'd the live form.
// A guard that only knows one spelling of "placeholder" is barely a guard.
const PLACEHOLDER = /(SET-AFTER-IMPORT|REPLACE-[A-Z0-9-]+|UNVERIFIED|CHANGEME|TODO-|<your-|YOUR-|xxxx)/;

for (const f of files) {
  test(`${f} carries no placeholder of any spelling`, () => {
    const raw = readFileSync(new URL(f, DIR), 'utf8');
    const hits = [...raw.matchAll(/"([A-Za-z_]+)"\s*:\s*"([^"]*)"/g)]
      .filter((m) => PLACEHOLDER.test(m[2]))
      .map((m) => `${m[1]} = ${m[2]}`);
    assert.deepEqual(
      hits,
      [],
      `${f} would overwrite live n8n config with a placeholder on import:\n  ` + hits.join('\n  '),
    );
  });
}

test('every webhook keeps its real path and its CORS origins', () => {
  // Both are production wiring that lives in n8n, and both are silently
  // destroyed by importing a file that does not carry them. Losing the path
  // 404s the live form; losing allowedOrigins blocks every cross-origin submit
  // from westromgroup.com, which is where the widget is meant to be embedded.
  for (const f of files) {
    const wf = load(f);
    for (const node of wf.nodes || []) {
      if (node.type !== 'n8n-nodes-base.webhook') continue;
      const p = node.parameters || {};
      assert.ok(p.path, `${f}: ${node.name} has no path`);
      assert.doesNotMatch(String(p.path), PLACEHOLDER,
        `${f}: ${node.name} path is a placeholder, so importing changes the live endpoint URL`);
      const origins = (p.options || {}).allowedOrigins;
      assert.ok(origins, `${f}: ${node.name} has no allowedOrigins, so importing wipes CORS and cross-origin submits fail`);
      assert.match(String(origins), /wgcassetguide\.com/, `${f}: ${node.name} must allow the site that hosts the widget`);
    }
  }
});

test('a dispatched workflow id uses the shape live n8n actually stores', () => {
  // Verified 2026-08-18 by exporting the live WF-1: n8n stores this field as a
  // resource-locator OBJECT, not a bare string:
  //   {"__rl":true,"value":"<id>","mode":"list","cachedResultName":"..."}
  // An earlier fix put the correct id in as a plain string. The id was right
  // and the shape was wrong, which is the kind of fix that looks done and is not.
  for (const f of files) {
    const wf = load(f);
    for (const node of wf.nodes || []) {
      if (node.type !== 'n8n-nodes-base.executeWorkflow') continue;
      const id = (node.parameters || {}).workflowId;
      assert.equal(typeof id, 'object',
        `${f}: ${node.name} stores workflowId as a ${typeof id}; live n8n uses a resource-locator object`);
      assert.equal(id.__rl, true, `${f}: ${node.name} workflowId is missing __rl`);
      assert.ok(id.value && !PLACEHOLDER.test(String(id.value)), `${f}: ${node.name} workflowId.value is empty or a placeholder`);
    }
  }
});

test('workflows that call or are called keep callerPolicy set', () => {
  // WF-1 invokes WF-2. If callerPolicy is absent on import, n8n falls back to
  // its instance default, which can refuse the call and break the hand-off.
  for (const f of ['wf1-intake.json', 'wf2-delivery.json']) {
    const wf = load(f);
    assert.ok(wf.settings && wf.settings.callerPolicy,
      `${f}: settings.callerPolicy is unset, so importing may block the WF-1 -> WF-2 hand-off`);
  }
});

test('every workflow that dispatches another names a real workflow id', () => {
  for (const f of files) {
    const wf = load(f);
    for (const node of wf.nodes || []) {
      if (node.type !== 'n8n-nodes-base.executeWorkflow') continue;
      const id = node.parameters && node.parameters.workflowId;
      const value = id && typeof id === 'object' ? id.value : id;
      assert.ok(value, `${f}: ${node.name} has no workflowId`);
      assert.doesNotMatch(String(value), /SET-AFTER-IMPORT|UNVERIFIED|TODO|CHANGEME|xxx/i,
        `${f}: ${node.name} points at a placeholder, so importing it breaks the chain`);
    }
  }
});

test('WF-1 and WF-2 both route hard failures to a real error workflow', () => {
  // A caught error raises the in-workflow alert. A node that HARD-fails does
  // not, and falls to errorWorkflow instead. Unset, that failure is silent.
  for (const f of ['wf1-intake.json', 'wf2-delivery.json']) {
    const wf = load(f);
    const ew = wf.settings && wf.settings.errorWorkflow;
    assert.ok(ew, `${f}: settings.errorWorkflow is unset, so a hard node failure alerts nobody`);
    assert.doesNotMatch(String(ew), /SET-AFTER-IMPORT|UNVERIFIED|TODO|CHANGEME/i,
      `${f}: errorWorkflow is a placeholder, and importing this file would UNSET a working alarm`);
  }
});

test('no workflow smuggles a credential value in its JSON', () => {
  // The files are committed. Credentials belong in n8n's own encrypted store
  // and in Railway env, never here. gitleaks covers known key shapes; this
  // covers the specific mistake of pasting a value into a header parameter.
  for (const f of files) {
    const wf = load(f);
    for (const node of wf.nodes || []) {
      const params = JSON.stringify(node.parameters || {});
      const headers = (node.parameters && node.parameters.headerParameters
        && node.parameters.headerParameters.parameters) || [];
      for (const h of headers) {
        if (!/authorization|api-key|x-api-key|token/i.test(h.name || '')) continue;
        assert.match(String(h.value || ''), /^=?\{\{|^=\$/,
          `${f}: ${node.name} header "${h.name}" looks like a literal secret, not an expression`);
      }
      assert.doesNotMatch(params, /"(sk|pk)_(live|test)_[A-Za-z0-9]{10,}"/,
        `${f}: ${node.name} contains something shaped like a live key`);
    }
  }
});
