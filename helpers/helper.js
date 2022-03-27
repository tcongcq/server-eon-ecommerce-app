let helper 			= {};

helper._get = function (_inp, _default=''){
	return _inp ? _inp : _default;
}
helper.normalizePort = function(val) {
	var port = parseInt(val, 10);
	if (isNaN(port)) return val;
	if (port >= 0)   return port;
	return false;
}

module.exports = helper;
