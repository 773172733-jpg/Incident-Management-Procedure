#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {
  PROJECT_ICON_TYPE,
  ALLOWED_PROJECT_IMAGE_ICONS,
  normalizeProjectIcon
} = require('../cloudfunctions/api/common/project-icon');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function valid(iconType, iconValue) {
  const result = normalizeProjectIcon(iconType, iconValue);
  assert.equal(result.error, undefined);
  return result.data;
}

function invalid(iconType, iconValue) {
  const result = normalizeProjectIcon(iconType, iconValue);
  assert.equal(typeof result.error, 'string');
  assert.equal(result.data, undefined);
}

function run() {
  assert.deepEqual(valid('text', '  备忘录标题  '), {
    iconType: 'text',
    iconValue: '备忘录标'
  });
  assert.deepEqual(valid('emoji', '  🏠  '), {
    iconType: 'emoji',
    iconValue: '🏠'
  });
  assert.deepEqual(valid('image', 'memo-default'), {
    iconType: 'image',
    iconValue: 'memo-default'
  });
  assert.equal(valid('image', 'memo-default').iconValue, 'memo-default');

  const textToImage = valid('image', 'memo-default');
  assert.equal(textToImage.iconType, 'image');
  const imageToEmoji = valid('emoji', '📚');
  assert.equal(imageToEmoji.iconType, 'emoji');
  assert.deepEqual(valid('text', ''), {
    iconType: 'text',
    iconValue: ''
  });

  const existingImage = { iconType: 'image', iconValue: 'memo-default' };
  const titleOnlyUpdate = { ...existingImage, title: '新标题' };
  assert.deepEqual(
    valid(titleOnlyUpdate.iconType, titleOnlyUpdate.iconValue),
    existingImage
  );

  invalid('image', 'other-image');
  invalid('image', '/assets/icons/memo-default.png');
  invalid('image', 'https://example.com/icon.png');
  invalid('image', 'data:image/png;base64,abc');
  invalid('image', '../memo-default');
  invalid('custom', 'memo-default');

  assert.deepEqual(valid(undefined, undefined), {
    iconType: 'text',
    iconValue: ''
  });
  assert.deepEqual(valid(undefined, '旧数据'), {
    iconType: 'text',
    iconValue: '旧数据'
  });

  assert.equal(PROJECT_ICON_TYPE.IMAGE, 'image');
  assert.deepEqual([...ALLOWED_PROJECT_IMAGE_ICONS], ['memo-default']);

  const projectSource = read('cloudfunctions/api/modules/project/index.js');
  assert.match(projectSource, /normalizeProjectIcon\(payload\.iconType,\s*payload\.iconValue\)/);
  assert.match(projectSource, /cleanProjectInput\(\{\s*\.\.\.project,\s*\.\.\.payload\s*\}\)/);
  assert.doesNotMatch(projectSource, /payload\.iconValue\.trim\(\)\.slice\(0,\s*4\)/);

  const calendarSource = read('cloudfunctions/api/common/calendar-entry.js');
  assert.match(calendarSource, /iconType:\s*project\.iconType\s*\|\|\s*'text'/);
  assert.match(calendarSource, /iconValue:\s*project\.iconValue/);

  console.log('PASS project icon text and emoji compatibility');
  console.log('PASS whitelisted image icon normalization');
  console.log('PASS invalid image identifiers and icon types are rejected');
  console.log('PASS title-only updates preserve image icons');
  console.log('PASS project and calendar read paths preserve image icon fields');
}

run();
