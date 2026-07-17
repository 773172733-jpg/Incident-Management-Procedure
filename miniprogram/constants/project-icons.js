'use strict';

const DEFAULT_PROJECT_IMAGE_ICON = 'memo-default';

const PROJECT_IMAGE_ICON_MAP = Object.freeze({
  [DEFAULT_PROJECT_IMAGE_ICON]: '/assets/icons/memo-default.png'
});

const PROJECT_ICON_OPTIONS = Object.freeze([
  {
    type: 'image',
    value: DEFAULT_PROJECT_IMAGE_ICON,
    label: '默认',
    src: PROJECT_IMAGE_ICON_MAP[DEFAULT_PROJECT_IMAGE_ICON]
  },
  ...['🏠','📚','✏️','🎨','💪','🎵','🌍','🛒','💼','🎮','💡','🌱','🍳','🎬','📷','🔧','🎯','🏃','🌿','💻']
    .map(value => ({ type: 'emoji', value, label: '', src: '' }))
]);

function projectIconView(project = {}, fallbackText = '') {
  const value = typeof project.iconValue === 'string' ? project.iconValue : '';
  if (project.iconType === 'image') {
    const iconSrc = PROJECT_IMAGE_ICON_MAP[value] || '';
    return {
      iconSrc,
      iconText: iconSrc ? '' : fallbackText
    };
  }
  return {
    iconSrc: '',
    iconText: value || fallbackText
  };
}

function projectImageIconSrc(iconType, iconValue) {
  return iconType === 'image' ? (PROJECT_IMAGE_ICON_MAP[iconValue] || '') : '';
}

module.exports = {
  DEFAULT_PROJECT_IMAGE_ICON,
  PROJECT_IMAGE_ICON_MAP,
  PROJECT_ICON_OPTIONS,
  projectIconView,
  projectImageIconSrc
};
