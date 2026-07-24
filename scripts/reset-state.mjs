import { createDefaultState, writeState } from '../server/state-store.mjs';
writeState(createDefaultState(), false);
console.log('OmniForge state reset.');
