//#import util.lang.js

//Most of the time, log equals console.
if(!console){
	(function () {
        var _console = {};
        _console.alertable = false;

        function createFoo(type) {
            _console['msg_' + type] = [];
            var foo = function (msg) {
                _console['msg_' + type].push(msg);
                if (_console.alertable) alert('' + type + ': ' + msg);
            };
            return foo;
        }
        _console.log = createFoo('log');
        _console.log = createFoo('info');
        _console.warn = createFoo('warn');
        _console.error = createFoo('error');
        _console.debug = createFoo('debug');

        window.console = _console;
    })();
}

//log = Object.create(console);
log = console;

(function(){
	if(!console.debug){ // An IE hack
		console.debug = console.info = console.warn = console.error = console.log;
	}
	try{
//		log.info('Testing Logger.');
	} catch(e){
		log = {};
		['log', 'info', 'warn', 'error', 'debug'].forEach(function(t){
			log[t] = function(){
				console[t].apply(console, toArray(arguments));
			};
		});
	}
})();
