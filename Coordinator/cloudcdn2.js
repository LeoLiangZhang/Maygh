var helper = require('./helper.js');
var md5 = require('./md5.js');
var ARRAY_DELIMITER = '&';
var Messenger = helper.Messenger;

var hashCode = helper.hashCode;

var CloudCDN = function(config){
	/*
	 * connection variable in this class should have a) peerid:string; b) item:
	 * [list of ItemID], ItemID:string.
	 *
	 */
	var settings = {
			logger: null,
			items_peer: 20
	};
	settings = helper.updateSettings(settings, config);
	var logger = settings.logger;

	var self = this;
	self.helper = helper; // for ArcusNode
	self.name = '';
	self.serverNames = [];
	self.messenger = null;
	self.msgid = 1;
	self.arcus = null;
	self.getPeerByItemRequests = {};
	self.dict_pid_connections = {};
	self.dict_item_connections = {}; // (item_key, [listof connection]) pair
	self.n_peers = 0;

	var items_counter = 1;
	self.items_counter = items_counter;

	self.setMessenger = function(messenger){
		self.messenger = messenger;
		messenger.on('message', self.onmessage);
	};

	self.onmessage = function(sender, msg){

		var cmd = null;
		try {
			cmd= JSON.parse(msg);
		} catch (e){
			logger.warn("ERROR_JSON_MSG", msg);
			return;
		}
//		console.log('recv', sender.name, msg);
		self.handleCommand(sender, cmd);
	};

	self.handleCommand = function(sender, cmd){
		var msgid = cmd.msgid;
		var sname = cmd.sname;
		switch(cmd.cmd){
		case "addItem":
		case "removeItem":
			var connection = self.dict_pid_connections[cmd.peerid];
			var item = cmd.item;
			if(!connection){
				connection = new ConnectionWrapper();
				connection.peerid = cmd.peerid;
				connection.sname = cmd.sname;
				connection.nc = {addresses: cmd.addresses};
			}
			if(cmd.cmd == "addItem"){
				connection.items.push(item);
				self.addPeer(connection);
				self.addItem(item, connection);
			} else {
				var idx = connection.items.indexOf(item);
				if(idx >= 0)
					connection.items.splice(idx, 1);
				self.removeItem(item, connection);
			}
			break;
		case "getPeerByItem":
			var item = cmd.item;
			var requester_pid = cmd.requester_pid;
			var pid = self.getPeerByItem(requester_pid, item);
			// pid may be empty string
			msg = cmd;
			msg.peerid = pid;
			var connection = self.dict_pid_connections[pid];
			if(connection){
				msg.addresses = connection.nc.addresses;
				msg.serverName = connection.sname;
			}

			msg.cmd = "response_getPeerByItem";

			self.sendMessage(msg.sname, msg);

			break;
		case "response_getPeerByItem":
			var pid = cmd.peerid;
			var connection = self.dict_pid_connections[pid];
			if(!connection){
				connection = new ConnectionWrapper();
				connection.peerid = cmd.peerid;
				connection.sname = cmd.serverName;
				connection.nc = {addresses: cmd.addresses};
				connection.nc.wrapper = connection;
//				connection.nc.peerId = helper.deformatPeerID(pid);
				self.dict_pid_connections[pid] = connection;
			}
			var idx = connection.items.indexOf(cmd.item);
			if(idx < 0){
				connection.items.push(cmd.item)
				if(connection.items.length > settings.items_peer)
					connection.items.shift();
			}
			var args = self.getPeerByItemRequests[cmd.msgid];
			if(!args){
				console.error(self.name, 'ERROR:CALLBACK_NOT_FOUND', cmd, self.getPeerByItemRequests);
				throw new Error('Not Found Callback');
			}
			args.callback(pid);
			delete self.getPeerByItemRequests[cmd.msgid];
			break;
		case "informNewcomer":
			var peerId = new Buffer(cmd.b64_pid, 'base64'),
				tag = new Buffer(cmd.b64_tag, 'base64');
			self.arcus.informNewcomer(peerId, tag, cmd.remoteInfo);
			break;
		default:
			throw new Error("Unsupported message command", cmd.cmd);
		}
	};

	self.informNewcomer = function(sname, peerId, tag, remoteInfo){
		// peerId is a buffer, tag is a buffer, remoteInfo is {address:'', port: #}
		var b64_pid = peerId.toString('base64'),
			b64_tag = tag.toString('base64'),
			msg = {cmd: "informNewcomer", b64_pid: b64_pid, b64_tag: b64_tag, remoteInfo: remoteInfo};
		self.sendMessage(sname, msg);
	};

	self.addPeer = function(connection){
		self.n_peers ++;
		self.dict_pid_connections[connection.peerid] = connection;
		logger.info('SYS', '#Peers+', self.n_peers, connection.peerid);
	};

	self.removePeer = function(connection){
		self.n_peers --;
		var id = connection.peerid;
		logger.info('SYS', '#Peers-', self.n_peers, connection.peerid);
		delete self.dict_pid_connections[id];
		connection.items.forEach(function(elm, idx, arr){
			self.removeItem(elm, connection);
//			var lst = self.dict_item_connections[elm];
//			if(lst){
//				var idx = lst.indexOf(connection);
//				lst.splice(idx, 1);
//			}
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




	self.getServerNameByItem = function(item){
//		var prefix = item.substr(0, 5);
//		if(prefix != 'item.') throw new Error('Item prefix error');
//		var str_num = item.substring(5);
//		var hash = parseInt(str_num);
		var hash = hashCode(item);
		var len = self.serverNames.length;
		var idx = hash % len;
		return self.serverNames[idx];
	};

	self.sendMessage = function(sname, msg){
		if(!msg.msgid)
			msg.msgid = self.msgid ++;
		msg.sname = self.name;
//		logger.debug(self.name, 'sending', msg);
		self.messenger.send(sname, msg);
//		console.log('send', sname, msg);
		return msg.msgid; // To keep track of response.
	};

	self.addItem = function(item, connection){
		if(!connection)
			throw new Error('Connection object ERROR', item, connection);
		var sname = self.getServerNameByItem(item);
		if(sname != self.name){ // not in local
			var pid = connection.peerid;
			var msg = {cmd: 'addItem', item: item, peerid: pid, addresses: connection.nc.addresses};
			self.sendMessage(sname, msg);
			return;
		}
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
		if(!connection){ // Clean item, for testing purpose.
		    delete self.dict_item_connections[item];
		    return;
		}

		if(!connection)
			throw new Error('Connection object ERROR', item, connection);

		var sname = self.getServerNameByItem(item);
		if(sname != self.name){ // not in local
			var pid = connection.peerid;
			var msg = {cmd: 'removeItem', item: item, peerid: pid};
			self.sendMessage(sname, msg);
			return;
		}

		var lst = [];
		if(item in self.dict_item_connections){
			lst = self.dict_item_connections[item];
			var idx = lst.indexOf(connection);
			if(idx >= 0){
				lst.splice(idx, 1);
			}
			if(lst.length == 0){
				delete self.dict_item_connections[item];
			}
		}
	};

	self.getItemConnections = function(item){
		return self.dict_item_connections[item];
	};

	self.getPeerByItem = function(requester_pid, item, callback){
		// return pid to requesting item.
		var sname = self.getServerNameByItem(item);
		if(sname != self.name){ // not in local
			var msg = {cmd: 'getPeerByItem', item: item, requester_pid: requester_pid};
			var msgid = self.sendMessage(sname, msg);
			self.getPeerByItemRequests[msgid] = {item: item, callback: callback};
			return;
		}
		// local
		var lst_connections = self.dict_item_connections[item];
		var pid = '';
		if(lst_connections && lst_connections.length > 0){
			var i = 0;
			while(i < lst_connections.length){
				var nc = lst_connections.shift();
				lst_connections.push(nc);
				if(nc.peerid != requester_pid){
					pid = nc.peerid;
					break;
				}
				i++;
			}
//			var nc = lst_connections[0];
//			pid = nc.peerid;
//			if(pid == requester_pid ){
//				if(lst_connections.length > 1)
//					pid = lst_connections[1].peerid;
//				else
//					pid = '';
//			}
		}
		if (callback){
			callback(pid);
		}
		return pid;
	};
};

function ConnectionWrapper(){
	this.nc = null; //inner the actual NetConnection object
	this.peerid = ''; // e.g. "512e453bf35a8694d10b338d94afccc1895b123c4f60f1b18be38d11d3a68a49"
	this.items = [];
	this.sname = '';
}

function main(){
	var settings = {
//			logger: logger
			logFile: null,
			logLevel: 'info',
			items_peer: 20,
			port: 1935,
			servers: '', //#of servers, if '', then read config
			name: "", // Server name must set
			host: "localhost",
			config : [{name: 's1', host: 'localhost', port: 9901, path: "s1.sock"},
		              {name: 's2', host: 'localhost', port: 9902, path: "s2.sock"},
		              ]
	};

	// read command line settings
	settings = helper.parseSettings(settings);

	if(settings.servers){
		var n = parseInt(settings.servers);
		var lst = [];var _hosts = settings.host ? settings.host.split(',') : [];
		for(var i = 1; i <= n; i++){
			var s = {
					name: 's'+i.toString(),
					host: _hosts[i-1],//settings.host,
					port: 9900+i,
					path: 's'+i.toString()+'.sock'
			};
			lst.push(s);
		}
		settings.config = lst;
	}

	var ArcusNode = require('./lib/arcus_node.js');
	var logger = require('./logger.js').createLogger(settings.logFile, settings.logLevel);
	logger.getTime = function(){return helper.now().toString();};
	logger.format = function(level, date, message) {
		  return [level, ' ', date, ' ', message].join('');
		};

	var messenger = new Messenger();
	messenger.loadConfig(settings.name, settings.config);
	var snames = [];
	settings.config.forEach(function(elm){
		snames.push(elm.name);
	});

	var cloud = new CloudCDN({logger: logger, items_peer: settings.items_peer});
	cloud.name = settings.name;
	cloud.serverNames = snames;
	cloud.setMessenger(messenger);
	var items_counter = 0;

	var arc = new ArcusNode({ logger: logger, port: settings.port});
	arc.cloud = cloud;
	cloud.arcus = arc;
	arc.on('connect', function(nc, obj){
		var connection = new ConnectionWrapper();
		connection.sname = cloud.name;
		connection.nc = nc;
		nc.wrapper = connection;
		connection.peerid = helper.formatPeerID(nc.peerId);

		nc.on('close', function(){
			cloud.removePeer(connection);
			logger.info('srvInfo', connection.peerid, "PeerClosed");
		});

		cloud.addPeer(connection);
		var addr = nc.addresses[0];
		if(addr){
			var ip = md5.hex_md5(addr.address);
			var port = addr.port;
		}
		var s_addr = [ip, port].join(':');

		logger.info('srvInfo', connection.peerid, "Connected", s_addr);//nc.addresses);
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

	arc.command('requestItem', function(nc, data, message){
        // console.log(data);
		var item = data.item;
		var mypid = nc.wrapper.peerid;
		var h_item = md5.hex_md5(item);
		cloud.getPeerByItem(mypid, item, function(pid){
			var result = {cmd: 'requestItem', tid: data.tid, item: item, peerid: pid, count: items_counter};
			arc.commandResult(nc, message, result);
			logger.info('srvInfo', mypid, "requestItem_response", h_item, pid);
		});

		logger.info('srvInfo', mypid, "requestItem", h_item);

		return ArcusNode.ASYNCOMMANDRESULT;
//		var lst_connections = cloud.getItemConnections(item);
//
//		var pid = '';
//		if(lst_connections && lst_connections.length > 0){
//			pid = lst_connections[0].peerid;
//		}
//		return {cmd: 'requestItem', tid: data.tid, item: item, peerid: pid, count: items_counter};
	});

	arc.command('logInfo', function(nc, data){
		var mypid = nc.wrapper.peerid;
		logger.info('logInfo', mypid, data);
		return data;
	});

	function _logItems(tag, connection){
		var hash_items = [];
		connection.items.forEach(function(elm, idx, arr){
			if(!elm) return;
			hash_items.push(md5.hex_md5(elm));
		});
		logger.info('srvInfo', connection.peerid, tag, hash_items.join('&'));
	}

	arc.command('addItems', function(nc,data){
		var _data = data;
		if(typeof(data) == 'string'){
			data = JSON.parse(data);
		}

		var connection = nc.wrapper;
		var items = data.items;
		items.forEach(function(elm){if(connection.items.indexOf(elm) >= 0) return; cloud.addItem(elm, connection); connection.items.push(elm);});
		_logItems('addItems', connection);
		return {cmd: 'addItems', tid: data.tid, items: items.join('&'), count: connection.items.length};;
	});

	arc.command('removeItems', function(nc,data){
		var _data = data;
		if(typeof(data) == 'string'){
			data = JSON.parse(data);
		}

		var connection = nc.wrapper;
		var items = data.items;
		items.forEach(function(elm){cloud.removeItem(elm, connection);connection.items.splice(connection.items.indexOf(elm), 1);});
		_logItems('removeItems', connection);
		return {cmd: 'removeItems', tid: data.tid, items: items.join('&'), count: connection.items.length};;
	});
	
	arc.command('cleanItems', function(nc, data){
	    var _data = data;
		if(typeof(data) == 'string'){
			data = JSON.parse(data);
		}

		var connection = nc.wrapper;
		var items = data.items;
		items.forEach(function(elm){cloud.removeItem(elm);connection.items.splice(connection.items.indexOf(elm), 1);});
		_logItems('cleanItems', connection);
		return {cmd: 'cleanItems', tid: data.tid, items: items.join('&'), count: connection.items.length};
	});

	arc.command('setItems', function(nc, data){
//		console.log(data);
		var _data = data;
		if(typeof(data) == 'string'){
			data = JSON.parse(data);
		}

		var connection = nc.wrapper;
		var items = data.items;
		items = items.split(ARRAY_DELIMITER);
		var hash_items = [];
		var oldItems = connection.items;
		var adds = [];
		var dels = [];
		var tmp = {};
		oldItems.forEach(function(elm, idx, arr){
			tmp[elm] = true;
		});
		items.forEach(function(elm, idx, arr){
			if(!elm) return;
			hash_items.push(md5.hex_md5(elm));
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
		connection.items = items;

		logger.info('srvInfo', connection.peerid, "setItems", hash_items.join('&'));

		return {cmd: 'setItems', tid: data.tid, items: data.items, count: items_counter};
	});

	// For video demo
	arc.command('getList', function(nc, data){
		var keys = [];
		for(var i in cloud.dict_item_connections){
			if(cloud.dict_item_connections.hasOwnProperty(i))
				keys.push(i);
		}
		return {cmd: 'getList', tid: data.tid, items: keys.join('&')};

	});
	arc.run();
//	require('repl').start().context.cloud = cloud;
};

main();
