import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { runOvertureExtraction } from './overture-extraction-lifecycle.mjs';
function fixture(overrides = {}) {
    const events = [], controller = new AbortController();
    const connection = { run: async () => { events.push('run'); }, interrupt: () => { events.push('interrupt'); }, closeSync: () => { events.push('connection-close'); } };
    const instance = { connect: async () => { events.push('connect'); return connection; }, closeSync: () => { events.push('instance-close'); } };
    const options = { databasePath: 'fixture.duckdb', query: 'LOCAL FAKE QUERY', signal: controller.signal,
        createInstance: async (file) => { assert.equal(file, 'fixture.duckdb'); events.push('create'); return instance; },
        removeFile: async (file, options) => { assert.deepEqual(options, { force: true }); events.push(`remove:${file}`); } };
    return { events, controller, connection, instance, options, ...overrides };
}
test('success closes connection then instance before removing exact DB and WAL, and removes abort listener', async () => {
    const f = fixture();
    await runOvertureExtraction(f.options);
    assert.deepEqual(f.events, ['create', 'connect', 'run', 'connection-close', 'instance-close', 'remove:fixture.duckdb', 'remove:fixture.duckdb.wal']);
    f.controller.abort();
    assert.ok(!f.events.includes('interrupt'));
});
test('create, connect and query failures reject with acquired resources closed', async () => {
    for (const stage of ['create', 'connect', 'run']) {
        const f = fixture(), failure = new Error(stage);
        if (stage === 'create')
            f.options.createInstance = async () => { f.events.push('create'); throw failure; };
        if (stage === 'connect')
            f.instance.connect = async () => { f.events.push('connect'); throw failure; };
        if (stage === 'run')
            f.connection.run = async () => { f.events.push('run'); throw failure; };
        await assert.rejects(runOvertureExtraction(f.options), error => error === failure);
        assert.deepEqual(f.events.filter(event => event.startsWith('remove:')), stage === 'create' ? [] : ['remove:fixture.duckdb', 'remove:fixture.duckdb.wal']);
        if (stage !== 'create')
            assert.ok(f.events.includes('instance-close'));
        if (stage === 'run')
            assert.ok(f.events.includes('connection-close'));
        f.controller.abort();
        assert.ok(!f.events.includes('interrupt'));
    }
});
test('preabort performs no create and abort during create or connect prevents query', async () => {
    const pre = fixture();
    pre.controller.abort();
    await assert.rejects(runOvertureExtraction(pre.options));
    assert.ok(!pre.events.includes('create'));
    for (const stage of ['create', 'connect']) {
        const f = fixture();
        if (stage === 'create')
            f.options.createInstance = async () => { f.events.push('create'); f.controller.abort(); return f.instance; };
        else
            f.instance.connect = async () => { f.events.push('connect'); f.controller.abort(); return f.connection; };
        await assert.rejects(runOvertureExtraction(f.options));
        assert.ok(!f.events.includes('run'));
        assert.ok(f.events.includes('instance-close'));
        if (stage === 'connect')
            assert.ok(f.events.includes('connection-close'));
        assert.deepEqual(getEventListeners(f.controller.signal, 'abort'), []);
    }
});
test('running abort interrupts and drains query before closing resources', async () => {
    const f = fixture();
    let entered, release;
    const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    f.connection.run = async () => { f.events.push('run'); entered(); await gate; f.events.push('query-settled'); };
    const pending = runOvertureExtraction(f.options);
    await ready;
    f.controller.abort();
    assert.ok(f.events.includes('interrupt'));
    assert.ok(!f.events.includes('connection-close'));
    release();
    await assert.rejects(pending);
    assert.ok(f.events.indexOf('query-settled') < f.events.indexOf('connection-close'));
    assert.ok(f.events.indexOf('connection-close') < f.events.indexOf('instance-close'));
});
test('close failures preserve files and attempt both close calls; multiple failures aggregate', async () => {
    for (const stages of [['connection'], ['instance'], ['connection', 'instance']]) {
        const f = fixture();
        if (stages.includes('connection'))
            f.connection.closeSync = () => { f.events.push('connection-close'); throw Error('connection'); };
        if (stages.includes('instance'))
            f.instance.closeSync = () => { f.events.push('instance-close'); throw Error('instance'); };
        await assert.rejects(runOvertureExtraction(f.options), error => stages.length === 1 || error instanceof AggregateError);
        assert.ok(f.events.includes('connection-close'));
        assert.ok(f.events.includes('instance-close'));
        assert.ok(!f.events.some(x => x.startsWith('remove:')));
        const before = f.events.length;
        f.controller.abort();
        assert.equal(f.events.length, before);
    }
});
test('removal failure is surfaced and primary plus cleanup failure aggregates', async () => {
    const failures = [Error('remove DB'), Error('remove WAL')];
    let index = 0;
    const f = fixture();
    f.options.removeFile = async (file) => { f.events.push(`remove:${file}`); throw failures[index++]; };
    await assert.rejects(runOvertureExtraction(f.options), error => { assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, failures); return true; });
    assert.deepEqual(f.events.filter(event => event.startsWith('remove:')), ['remove:fixture.duckdb', 'remove:fixture.duckdb.wal']);
    const g = fixture(), primary = Error('query'), cleanup = Error('close');
    g.connection.run = async () => { throw primary; };
    g.instance.closeSync = () => { throw cleanup; };
    await assert.rejects(runOvertureExtraction(g.options), error => { assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, [primary, cleanup]); return true; });
});
test('throwing interrupt is captured in awaited failure and query drains before close', async () => {
    const f = fixture(), failure = Error('interrupt');
    let entered, release;
    const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    f.connection.interrupt = () => { f.events.push('interrupt'); throw failure; };
    f.connection.run = async () => { entered(); await gate; f.events.push('settled'); };
    const pending = runOvertureExtraction(f.options);
    await ready;
    assert.doesNotThrow(() => f.controller.abort());
    assert.ok(!f.events.includes('connection-close'));
    release();
    await assert.rejects(pending, error => { assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, [f.controller.signal.reason, failure]); return true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(f.events.indexOf('settled') < f.events.indexOf('connection-close'));
    assert.deepEqual(getEventListeners(f.controller.signal, 'abort'), []);
});
