const { callApi } = require('./api');

function create(data) {
  return callApi('feedback', 'create', data);
}

module.exports = { create };
