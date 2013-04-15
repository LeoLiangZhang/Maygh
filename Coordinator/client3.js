var helper = require('./helper.js');
var FlNetConnection = require('./fl_net_connection.js');
var ARRAY_DELIMITER = '&';


LOCAL_ADDRESS = '';
helper.getNetworkIP(function (error, ip){
	if(error){
		console.error("CANNOT GET MY IP.");
		process.exit(1);
	}
	console.log("My ip:", ip);
	LOCAL_ADDRESS = ip;
	main();
}, false);

function ExpClient(settings, port){
	var logger = settings.logger;

	var flconn = new FlNetConnection(port, LOCAL_ADDRESS);
	var tid = 0;
	var items = [];
	var requesting_item = '';
	var connecting_peerid = '';
	var item_count = 0;
	var States = {stop: 0, wait: 1, requestItem: 2, requestPeer: 3, init: 4, updateServerList: 5, connecting: 6, getInitItems: 7};
	var StateEvents = {stop: 0, start: 1, tick: 2, requestItem: 3, rendezvouz_response: 4, init: 5, setItem: 6, timeout: 7, connected: 8, getInitItems: 9};
	var state = States.stop;
	var lastState = States.stop;
	var stateTimer = 0;
	var retryCount = 0;

	var lastAction = null;
	var expectingEvent = -1;

	var flcall = function(data){
		data.tid = tid;
		flconn.flcall(data.cmd, data);
		logger.log(data.tid, flconn.peerid(), 'send_'+data.cmd, data.item || '');
	};

	var nextTick = function(){
		var t = Math.floor(Math.random() * settings.requestInterval);
		setTimeout(function(){nextState(StateEvents.tick);}, t);
	};

	var storeItem = function(item){
		// TODO: replace with LRUStore
		items.push(item);
		if(items.length > settings.localStorageSize)
			items.shift();
	};

	var generateRequestItem = function(){
		for (var i = 0; i < 10; i ++) {
			var idx = Math.floor(Math.random()*item_count );
			var item = 'item.' + idx.toString();
			if(items.indexOf(item) < 0) return item;
		}
		var max = -1;
		items.forEach(function(elm){
			max = elm > max ? elm : max;
		});
		max += 1;
		return 'item.' + max.toString();
	};

	var startStateTimer = function(){
		if(stateTimer)
			clearTimeout(stateTimer);

		if(++retryCount >settings.retries){
			// TODO: do something, now it only log.
			if(retryCount > 20){
				console.error("ERROR:Too_Many_Retry", flconn.peerid(), port, tid, items.length, requesting_item, helper.getKeyName(States, state), helper.getKeyName(StateEvents, expectingEvent), flconn.state, flconn._nc.state);
				return;
			}
			logger.warn(tid, flconn.peerid(), "Retry", retryCount, "times at state", helper.getKeyName(States, state));
		}

		stateTimer = setTimeout(function(){nextState(StateEvents.timeout);}, settings.timeout);
	};

	var clearStateTimer = function(){
		if(stateTimer){
			clearTimeout(stateTimer);
			stateTimer = 0;
		}
		lastAction = null;
		expectingEvent = -1;
		retryCount = 0;
	};

	var setState = function(new_state){
		lastState = state;
		state = new_state;
	};

	var timingAction = function(action, waitingEvent){
		if(stateTimer)
			throw new Error("Only one timing action at a time.");
		lastAction = action;
		expectingEvent = waitingEvent;
		action();
		startStateTimer();
	};

	var checkExpectingEvent = function(event){
		if(expectingEvent == event){
			clearStateTimer();
		}
	};

	var redoLastTimingAction = function(){
		lastAction();
		startStateTimer();
	};


//	var _args = [];
//	var nextState = function(event, opt){
//		if(event == StateEvents.timeout){
//			_nextState(event, opt);
//			return;
//		}
//		_args.push(arguments);
//		logger.log(event, helper.getKeyName(StateEvents, event), helper.getKeyName(States, state), opt);
//	};
//	this.doNextState = function(event, opt){
//		if(event){
//			_nextState(event, opt);
//		}
//		else{
//			_nextState.apply(null, _args.shift());
//		}
//
//	};

	var nextState = function(event, opt){
		if(stateTimer && event == StateEvents.timeout){
			logger.warn(tid, flconn.peerid(), 'timeout_event', helper.getKeyName(StateEvents, expectingEvent), "redo_last_action");
			redoLastTimingAction();
			return;
		}
		if(stateTimer){
			checkExpectingEvent(event);
		}
		switch(state){
		case States.stop:
			if(event == StateEvents.start){
				setState(States.connecting);
				var address = opt.address, port = opt.port;
				timingAction(function(){
					logger.log(tid, flconn.peerid(), 'send_'+'connectArcus', address, port);
					console.log('flconn.connect', address, port);
					flconn.connect(address, port);
				}, StateEvents.connected);
			}
			break;
		case States.connecting:
			if(event == StateEvents.connected){
				if(settings.skipInitItems){
					setState(States.wait);
					nextTick();
				} else {
					setState(States.getInitItems);
					timingAction(function(){flcall({cmd: 'getInitItems'});}, StateEvents.getInitItems);
				}
			}
			break;
		case States.getInitItems:
			if(event == StateEvents.getInitItems){
				setState(States.updateServerList);
				var s_item = opt;
				timingAction(function(){flcall({cmd: 'setItems', items: s_item});}, StateEvents.setItem);
			}
			break;
		case States.init:
			if(event == StateEvents.setItem){
				setState(States.wait);
				nextTick();
			}
			break;
		case States.wait:
			if(event == StateEvents.tick){
				setState(States.requestItem);
				tid ++;
				requesting_item = generateRequestItem();
				timingAction(function(){flcall({cmd:'requestItem', item: requesting_item});}, StateEvents.requestItem);
			}
			break;
		case States.requestItem:
			if(event == StateEvents.requestItem){
				setState(States.requestPeer);
				var data = opt;
				if(data.peerid){
					timingAction(function(){
						// Check if peer is connected.
						logger.info(data.tid, flconn.peerid(), 'send_'+ "connectPeer", data.peerid || undefined);
						connecting_peerid = data.peerid;
						flconn.connectPeer(data.peerid);
					}, StateEvents.rendezvouz_response);
				} else {
					setState(States.updateServerList);
					logger.info(data.tid, flconn.peerid(), 'getItemFromOrigin', requesting_item);
					storeItem(requesting_item);
					logger.info(data.tid, flconn.peerid(), 'requestFinished', requesting_item);
					timingAction(function(){flcall({cmd: 'setItems', items: items.join(ARRAY_DELIMITER)});}, StateEvents.setItem);
				}
			}
			break;
		case States.requestPeer:
			if(event == StateEvents.rendezvouz_response){
				setState(States.updateServerList);
				storeItem(requesting_item);
				logger.info(tid, flconn.peerid(), 'requestFinished', requesting_item);
				timingAction(function(){flcall({cmd: 'setItems', items: items.join(ARRAY_DELIMITER)});}, StateEvents.setItem);
				connecting_peerid = null;
			}
			break;
		case State.loadingFromPeer:
			// DO something
			
			break;
		case States.updateServerList:
			if(event == StateEvents.setItem){
				setState(States.wait);
				logger.info(tid, flconn.peerid(), 'transactionDONE', requesting_item);
				nextTick();
			}
			break;
		default:
			throw new Error('Unknown state', state);
		}
		logger.debug('State Changed:', helper.getKeyName(States, lastState), '->', helper.getKeyName(States, state), 'on', helper.getKeyName(StateEvents, event));
	};

	var start = function(address, port){
		nextState(StateEvents.start, {address: address, port: port});
	};

	flconn.on('connect', function(){
		logger.log(tid, flconn.peerid(), 'recv_'+'connectArcus');
		nextState(StateEvents.connected);
	});
	flconn.on('rendezvouz_response', function(nc, msg){
		logger.log(tid, flconn.peerid(), 'recv_'+'connectPeer', msg.addresses[0]); // only print the first address
		// address: { address: '127.0.0.1', port: 15000 }
		nextState(StateEvents.rendezvouz_response, msg);
	});
	flconn.on('command', function(nc, cname, chandle, data){
		data = data[0];
		if(data.count)
			item_count = data.count;
		if(settings.skipInitItems)
			item_count = settings.totalItems;
		if(data.cmd && (data.tid+1))
			logger.log(data.tid, flconn.peerid(), 'recv_'+data.cmd, data.items||data.peerid||'');
		switch(data.cmd){
		case 'getInitItems':
			var s_items = data.items;
			nextState(StateEvents.getInitItems, s_items);
			break;
		case 'setItems':
			var s_items = data.items;
			items = s_items.split(ARRAY_DELIMITER);
			nextState(StateEvents.setItem, data);
			break;
		case 'requestItem':
			nextState(StateEvents.requestItem, data);
			break;
		default:
			logger.debug('recv', cname, data);
			break;
		}
	});

	this.flconn = flconn;
	this.start = start;
}


function main(){

	var settings = {
			logFile: null,
			logLevel: 'info',
			localStorageSize: 20,
			basePort: 15000,
			timeout: 3000, //5 sec
			startupTime: 60000, //60 sec
			requestInterval: 5000, // 5 sec
			retries: 5, // number of retry times
			serverAddress: '127.0.0.1',
			serverPort: 1935,
			repl: false,
			totalPeers: 1,
			totalItems: 40,
			skipInitItems: false,
			logger: null
	};
	settings = helper.parseSettings(settings);

	var logger = require('./logger.js').createLogger(settings.logFile, settings.logLevel);
	logger.getTime = function(){return helper.now().toString();};
	logger.format = function(level, date, message) {
		return [level, ' ', date, ' ', message].join('');
	};

	settings.logger = logger;

	FlNetConnection.setLogger(logger);

	var randomPort = Math.round(Math.random()*10);;

//	for (var i = 0; i < 100; i ++){
//		var port = settings.basePort + i;
//		var c = new ExpClient(settings, port);
//
//		c.start();
//
//	}

	var clients = [];

	for(var i = 0; i < settings.totalPeers; i++){
		(function(){
			var port = settings.basePort + i*2;
			var tcp_port = settings.basePort + i*2+1;
			var t = Math.floor(Math.random() * settings.startupTime);
			setTimeout(function(){
				var client;
				try{
					client = new ExpClient(settings, port);
				}catch(ex){
					console.error("ERROR:CREATE_CLIENT", port, ex, ex.stack);
					return;
				}
				clients.push(client);
				client.start(settings.serverAddress, settings.serverPort);

//				try{
//					client.run();
//				} catch (e){
//					logger.error(e.stack);
//				}
			}, t);
		})();
	}

	if(settings.repl){
		var repl = require('repl');
		var re = repl.start();
		re.context.clients = clients;

//		repl.start().context.c = clients[0];
	};
};

