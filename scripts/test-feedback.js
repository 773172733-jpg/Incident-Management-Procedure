#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const {
  FEEDBACK_STATUS,
  FEEDBACK_LIMITS,
  normalizeFeedbackPayload,
  shanghaiDayRange,
  checkFeedbackRateLimit
} = require('../cloudfunctions/api/common/feedback');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function valid(payload) {
  const result = normalizeFeedbackPayload(payload);
  assert.equal(result.error, undefined);
  return result.data;
}

function invalid(payload) {
  const result = normalizeFeedbackPayload(payload);
  assert.equal(typeof result.error, 'string');
}

function makeCondition(kind, value) {
  return {
    kind,
    value,
    and(other) {
      return { kind: 'and', items: [this, other] };
    }
  };
}

function matchesDate(value, condition) {
  if (!condition) return true;
  const time = new Date(value).getTime();
  if (condition.kind === 'gte') return time >= new Date(condition.value).getTime();
  if (condition.kind === 'lt') return time < new Date(condition.value).getTime();
  if (condition.kind === 'and') return condition.items.every(item => matchesDate(value, item));
  return false;
}

function createDb(rows) {
  return {
    command: {
      gte(value) { return makeCondition('gte', value); },
      lt(value) { return makeCondition('lt', value); }
    },
    collection(name) {
      assert.equal(name, 'feedbacks');
      return {
        where(filter) {
          return {
            async count() {
              const total = rows.filter(row => row.ownerId === filter.ownerId && matchesDate(row.createdAt, filter.createdAt)).length;
              return { total };
            }
          };
        }
      };
    }
  };
}

async function run() {
  assert.equal(FEEDBACK_STATUS.PENDING, 'pending');
  assert.equal(FEEDBACK_LIMITS.DAILY_MAX, 10);

  assert.deepEqual(valid({ category: 'bug', content: '  abcde  ' }), {
    category: 'bug',
    content: 'abcde',
    appVersion: '1.2.0-beta.1'
  });
  assert.equal(valid({ category: 'suggestion', content: '建议优化页面反馈', appVersion: '1.2.0-beta.1' }).category, 'suggestion');
  assert.equal(valid({ category: 'other', content: '其他问题反馈内容' }).category, 'other');
  assert.equal(valid({ category: 'bug', content: '  前后空格会被清理  ' }).content, '前后空格会被清理');

  invalid({ category: 'bug', content: '' });
  invalid({ category: 'bug', content: '    ' });
  invalid({ category: 'bug', content: '四字' });
  assert.equal(valid({ category: 'bug', content: '五个字可以' }).content.length >= 5, true);
  valid({ category: 'bug', content: 'a'.repeat(500) });
  invalid({ category: 'bug', content: 'a'.repeat(501) });
  invalid({ category: 'bad', content: '有效内容不少于五字' });
  invalid({ category: 'bug', content: '有效内容不少于五字', appVersion: 'local/dev' });

  const now = new Date('2026-07-17T04:00:00.000Z');
  assert.deepEqual(await checkFeedbackRateLimit(createDb([]), 'u1', now), { limited: false });
  assert.deepEqual(await checkFeedbackRateLimit(createDb([
    { ownerId: 'u1', createdAt: new Date(now.getTime() - 30 * 1000) }
  ]), 'u1', now), { limited: true, reason: 'minute' });

  const range = shanghaiDayRange(now);
  assert.equal(range.start.toISOString(), '2026-07-16T16:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-07-17T16:00:00.000Z');
  assert.deepEqual(await checkFeedbackRateLimit(createDb(Array.from({ length: 10 }, (_, index) => ({
    ownerId: 'u1',
    createdAt: new Date(range.start.getTime() + (index + 1) * 70 * 1000)
  }))), 'u1', now), { limited: true, reason: 'day' });

  const moduleSource = read('cloudfunctions/api/modules/feedback/index.js');
  assert.match(moduleSource, /auth\.getUserId\(context\)/);
  assert.match(moduleSource, /status:\s*FEEDBACK_STATUS\.PENDING/);
  assert.doesNotMatch(moduleSource, /payload\.ownerId/);
  assert.doesNotMatch(moduleSource, /payload\.status/);

  const routerSource = read('cloudfunctions/api/router.js');
  assert.match(routerSource, /feedbackModule/);
  assert.match(routerSource, /feedback:\s*feedbackModule/);

  const pageSource = read('miniprogram/pages/feedback/feedback.js');
  assert.match(pageSource, /feedbackService\.create/);
  assert.match(pageSource, /appVersion:\s*APP_VERSION/);
  assert.match(pageSource, /请至少填写5个字/);
  assert.match(pageSource, /提交太频繁，请稍后再试/);

  console.log('PASS feedback payload validation');
  console.log('PASS feedback category whitelist and trim');
  console.log('PASS feedback length boundaries');
  console.log('PASS feedback rate limits');
  console.log('PASS feedback owner/status are cloud controlled');
  console.log('PASS feedback page and router wiring');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
