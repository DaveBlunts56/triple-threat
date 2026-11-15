import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT } from '../src/render/light.js';

test('the key light\'s shadows sit off a surface by its normal, so skin shows no shadow acne', () => {
  assert.equal(LIGHT.normalBias, 0.02);
});
