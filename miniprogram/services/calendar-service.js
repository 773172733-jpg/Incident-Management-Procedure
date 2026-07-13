const { callApi } = require('./api');
function month(params) { return callApi('calendar', 'month', params); }
function day(params) { return callApi('calendar', 'day', params); }
module.exports = { month, day };
