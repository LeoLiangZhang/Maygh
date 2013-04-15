var helper = require('./helper.js');
var ARRAY_DELIMITER = '&';

var CloudCDN = function(config){
	/*
	 * connection variable in this class should have a) peerid:string; b) item:
	 * [list of ItemID], ItemID:string.
	 *
	 */
	var settings = {
			logger: null
	};
	settings = helper.updateSettings(settings, config);
	var logger = settings.logger;

	var self = this;
	self.dict_pid_connections = {};
	self.dict_item_connections = {}; // (item_key, [listof connection]) pair

	var items_counter = 1;
	self.items_counter = items_counter;

	self.addPeer = function(connection){
		self.dict_pid_connections[connection.peerid] = connection;
	};

	self.removePeer = function(connection){
		var id = connection.peerid;
		delete self.dict_pid_connections[id];
		connection.items.forEach(function(elm, idx, arr){
			var lst = self.dict_item_connections[elm];
			if(lst){
				var idx = lst.indexOf(connection);
				delete lst[idx];
			}
		});
	};

//	self.getAllPeerids = function(){
//		var keys = Object.keys(self.dict_pid_connections);
//		return keys;
//	};
//
//	self.getConnectionByPeerid = function(peerid){
//		return self.dict_pid_connections[peerid];
//	};

	self.addItem = function(item, connection){
		var lst = [];
		if(item in self.dict_item_connections){
			lst = self.dict_item_connections[item];
			if(lst.indexOf(connection) < 0)
				lst.push(connection);
			// else connection already there
		} else {
			lst.push(connection);
			self.dict_item_connections[item] = lst;
		}
	};

	self.removeItem = function(item, connection){
		var lst = [];
		if(item in self.dict_item_connections){
			lst = self.dict_item_connections[item];
			var idx = lst.indexOf(connection);
			if(idx >= 0){
				delete lst[idx];
			}
			if(lst.length == 0){
				delete self.dict_item_connections[item];
			}
		}
	};

	self.getItemConnections = function(item){
		return self.dict_item_connections[item];
	};
};

function ConnectionWrapper(){
	this.nc = null; //inner the actual NetConnection object
	this.peerid = ''; // e.g. "512e453bf35a8694d10b338d94afccc1895b123c4f60f1b18be38d11d3a68a49"
	this.items = [];
}

function main(){
	var settings = {
//			logger: logger
			logFile: null,
			logLevel: 'info',
			items_peer: 20
	};

	settings = helper.parseSettings(settings);

	var ArcusNode = require('./lib/arcus_node.js');
	var logger = require('./logger.js').createLogger(settings.logFile, settings.logLevel);
	logger.getTime = function(){return helper.now().toString();};
	logger.format = function(level, date, message) {
		  return [level, ' ', date, ' ', message].join('');
		};

	var cloud = new CloudCDN();
	var items_counter = 0;

	var arc = new ArcusNode({ logger: logger});

	arc.on('connect', function(nc, obj){
		var connection = new ConnectionWrapper();
		connection.nc = nc;
		nc.wrapper = connection;
		connection.peerid = helper.formatPeerID(nc.peerId);

		nc.on('close', function(){
			cloud.removePeer(connection);
		});

		cloud.addPeer(connection);
	});

	// register client commands
	arc.command('getInitItems', function(nc, data){
//		console.log(data);
		var lst = [];
		var count = settings.items_peer;
		for(var i = 0; i < count; i++){
			var key = "item."+(i + items_counter);
			lst.push(key);
		}
		items_counter += count;
		var cmd = {cmd: "getInitItems", tid: data.tid, items: lst.join(ARRAY_DELIMITER), count: items_counter};
		return cmd;
	});

	arc.command('requestItem', function(nc, data){
//		console.log(data);
		var item = data.item;
		var lst_connections = cloud.getItemConnections(item);

		var pid = '';
		if(lst_connections && lst_connections.length > 0){
			pid = lst_connections[0].peerid;
		}
		return {cmd: 'requestItem', tid: data.tid, item: item, peerid: pid, count: items_counter};
	});

	arc.command('setItems', function(nc, data){
//		console.log(data);
		var connection = nc.wrapper;
		var items = data.items;
		items = items.split(ARRAY_DELIMITER);
		var oldItems = connection.items;
		var adds = [];
		var dels = [];
		var tmp = {};
		oldItems.forEach(function(elm, idx, arr){
			tmp[elm] = true;
		});
		items.forEach(function(elm, idx, arr){
			if(elm in tmp) {
				delete tmp[elm];
				return;
			} else {
				adds.push(elm);
			}
		});
		dels = Object.keys(tmp);
		adds.forEach(function(elm){cloud.addItem(elm, connection);});
		dels.forEach(function(elm){cloud.removeItem(elm, connection);});

		return {cmd: 'setItems', tid: data.tid, items: data.items, count: items_counter};
	});

	arc.run();
//	require('repl').start().context.cloud = cloud;
};

main();
