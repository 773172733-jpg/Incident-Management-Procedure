'use strict';

const PROJECT_ICON_TYPE = Object.freeze({
  TEXT: 'text',
  EMOJI: 'emoji',
  IMAGE: 'image'
});

const ALLOWED_PROJECT_IMAGE_ICONS = new Set([
  'memo-default'
]);

function normalizeProjectIcon(iconType, iconValue) {
  const value = typeof iconValue === 'string' ? iconValue.trim() : '';
  const type = iconType === undefined || iconType === null || iconType === ''
    ? PROJECT_ICON_TYPE.TEXT
    : iconType;

  if (!Object.values(PROJECT_ICON_TYPE).includes(type)) {
    return { error: '备忘录图标类型无效' };
  }

  if (type === PROJECT_ICON_TYPE.IMAGE) {
    if (!ALLOWED_PROJECT_IMAGE_ICONS.has(value)) {
      return { error: '备忘录图片图标不在允许范围内' };
    }
    return {
      data: {
        iconType: PROJECT_ICON_TYPE.IMAGE,
        iconValue: value
      }
    };
  }

  return {
    data: {
      iconType: type,
      iconValue: value.slice(0, 4)
    }
  };
}

module.exports = {
  PROJECT_ICON_TYPE,
  ALLOWED_PROJECT_IMAGE_ICONS,
  normalizeProjectIcon
};
