const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const defaults = require('../shared/default-profile.js');
const updates = require('../shared/profile-updates.js');
const clone = value => structuredClone(value);
const envelope = profile => JSON.stringify({ app: 'qiuzhao-autofill', kind: 'structured-profile', schemaVersion: 1, profile });

function fixture(profile = {}, file = null) {
  const state = { data: { profile }, file, writes: 0, fail: false };
  const storage = {
    get: async () => clone(state.data),
    set: async update => {
      if (state.fail) throw Error('storage-unavailable');
      state.writes++;
      Object.assign(state.data, clone(update));
    },
  };
  const options = {
    readFile: async () => state.file,
    hash: async text => createHash('sha256').update(text).digest('hex'),
    keys: new Set(['name', 'email', 'school', 'educationBulk']),
    validate: updates.validate, storage, commit: updates.createWriter(storage),
  };
  return { state, options, load: defaults.createLoader(options) };
}

test('missing optional file preserves both first-run and managed profiles', async () => {
  for (const profile of [{}, { name: '演示姓名', email: 'demo@example.com' }]) {
    const { state, load } = fixture(profile);
    assert.deepEqual(await load(), { ok: true, changed: false, source: 'storage' });
    assert.deepEqual(state.data.profile, profile);
    assert.equal(state.writes, 0);
  }
});

test('file fingerprint is atomic and survives worker restarts and manager edits', async () => {
  const { state, options, load } = fixture({}, envelope({ name: '演示姓名' }));
  await Promise.all([load(), load()]);
  assert.equal(state.writes, 1, 'concurrent requests share one import');
  assert.match(state.data.defaultProfileFileHash || '', /^[a-f0-9]{64}$/);
  state.data.profile.name = '管理页修改';
  state.data.pendingProfileUpdate = { note: '演示待确认更新' };
  const before = clone(state.data);
  const restarted = defaults.createLoader(options);
  assert.equal((await restarted()).changed, false);
  assert.deepEqual(state.data, before, 'unchanged file cannot overwrite edits or clear drafts');
  state.file = envelope({ name: '更新后的演示姓名', email: 'demo@example.com' });
  assert.equal((await restarted()).changed, true);
  assert.deepEqual(state.data.profileRecovery.profile, before.profile);
  assert.equal(state.data.pendingProfileUpdate, null);
  assert.notEqual(state.data.defaultProfileFileHash, before.defaultProfileFileHash);
});

test('key ordering does not trigger a reimport; removal preserves saved data', async () => {
  const { state, load } = fixture({}, envelope({ name: '演示姓名', email: 'demo@example.com' }));
  await load();
  state.file = envelope({ email: 'demo@example.com', name: '演示姓名' });
  assert.equal((await load()).changed, false);
  state.file = null;
  await load();
  assert.equal(state.writes, 1);
  assert.equal(state.data.profile.name, '演示姓名');
});

test('invalid files and storage failures preserve existing data and allow retry', async () => {
  const { state, load } = fixture({ name: '已保存的演示姓名' });
  for (const file of ['', '{', envelope({ unknown: 'value' }), envelope({ name: [] }), envelope({ educationBulk: [null] })]) {
    state.file = file;
    await assert.rejects(load());
    assert.equal(state.writes, 0);
  }
  state.file = envelope({ name: '文件演示姓名' });
  state.fail = true;
  await assert.rejects(load(), /storage-unavailable/);
  assert.equal(state.data.defaultProfileFileHash, undefined);
  assert.equal(state.data.profile.name, '已保存的演示姓名');
  state.fail = false;
  assert.equal((await load()).changed, true);
  assert.equal(state.data.profile.name, '文件演示姓名');
});

test('worker treats missing resources as optional but rejects malformed or failed reads', async () => {
  const worker = fs.readFileSync(path.join(__dirname, '../background/service-worker.js'), 'utf8');
  const snippet = worker.slice(worker.indexOf('const loadDefaultProfile='), worker.indexOf('const AI_EXTRACT_PROMPT'));
  for (const scenario of ['missing', '404', '500', 'invalid', 'valid']) {
    const { state, options } = fixture({ name: '已保存的演示姓名' });
    const load = vm.runInNewContext(snippet + '\nloadDefaultProfile;', {
      QIUZHAO_DEFAULT_PROFILE: defaults, QIUZHAO_PROFILE_UPDATES: updates,
      PROFILE_KEYS: options.keys, commitProfile: options.commit, TypeError,
      crypto: require('node:crypto').webcrypto, TextEncoder,
      chrome: { storage: { local: options.storage }, runtime: { getURL: file => 'chrome-extension://fixture/' + file } },
      fetch: async () => {
        if (scenario === 'missing') throw new TypeError('Failed to fetch');
        return {
          status: Number(scenario) || 200, ok: ['invalid', 'valid'].includes(scenario),
          text: async () => scenario === 'invalid' ? '{' : envelope({ name: '文件演示姓名' }),
        };
      },
    });
    if (['500', 'invalid'].includes(scenario)) await assert.rejects(load());
    else assert.equal((await load()).ok, true);
    assert.equal(state.data.profile.name, scenario === 'valid' ? '文件演示姓名' : '已保存的演示姓名');
    assert.equal(state.writes, scenario === 'valid' ? 1 : 0);
  }
});
