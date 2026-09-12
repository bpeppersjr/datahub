// Inherited by the synthetic supervisor and source CLI processes in tests.
globalThis.fetch = () => { throw new Error('Retained feed fixture forbids network access.'); };
