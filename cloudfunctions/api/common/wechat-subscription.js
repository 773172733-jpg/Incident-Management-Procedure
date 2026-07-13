const WECHAT_SUBSCRIPTION_TEMPLATE = {
  enabled: true,
  id: 'wwBCr2fNJh7Ezk8ZWO3R1s9QSyLrtZOvDV5P3PYLZaM',
  title: 'todo reminder',
  fields: {
    taskTitle: 'thing1',
    projectTitle: 'thing18',
    dueAt: 'time10',
    scheduledAt: 'time23',
    priority: 'thing17'
  }
};

const PRIORITY_TEXT = {
  core: '核心',
  important: '重要',
  optional: '可选'
};

function validTemplateId(templateId) {
  return Boolean(WECHAT_SUBSCRIPTION_TEMPLATE.enabled
    && templateId
    && templateId === WECHAT_SUBSCRIPTION_TEMPLATE.id);
}

function priorityText(priority) {
  return PRIORITY_TEXT[priority] || '普通';
}

module.exports = {
  WECHAT_SUBSCRIPTION_TEMPLATE,
  PRIORITY_TEXT,
  validTemplateId,
  priorityText
};
