/**
 *
 */

var webox = require('./webox');
var createApplication = webox.createApplication;
var staticHandler = webox.staticHandler;
var logger = null;

var DefaultSettings = {
		startInterval: 10000, // in second
		startCount: 50, // # peers to start
		autoStart: false,
		items_peer: 25, // # of items per peer
		logLevel: 'info'
};

function Coordinator(settings){

	var self = this;
	self.peers = {};
	self.settings = settings || DefaultSettings;

	self.handler_FileNotFound = function(req, res, ctx){
		res.statusCode = 404;
		res.setHeader("Content-Type", "text/html");
		res.write("Your request <b> \""+req.url +"\" </b> cannot be found.");
		res.end();
	};

	// Not functional, for debugging only.
	self.handler_PostPeerID = function(req, res, ctx){

		if (req.method == 'POST'){
			var body = [];
			req.on('data', function(chunk){
				body.push(chunk);
			});
			req.on('end', function() {
				var fullbody = body.join();
				console.log(fullbody);
				res.write(fullbody);
				res.end();
			});
		}
	};

	self.handler_AddPeerID = function(req, res, ctx){
		var url = req.url2;
		if(url && url.query){
			if(url.query.add){
				self.peers[url.query.add] = {};
			}
			if(url.query.del){
				delete self.peers[url.query.del];
			}
		}

		res.setHeader("Content-Type", "application/json");
		res.write(JSON.stringify(self.peers));
		res.end();

	};



	createApplication({
		context: self,
		mapping: [
		          [/^\/peer/, self.handler_AddPeerID],
		          [/\/post/i, self.handler_PostPeerID],
		          [/^\/$/, staticHandler("Server is alive.")],
		          [/.*/, self.handler_FileNotFound]
		          ]
	});

	var my_util = require('./util');


	self.unstarted = [];
	self.dict_pid_connections = {};
	self.dict_item_connections = {}; // (item_key, [listof connection]) pair

	var items_counter = 1;
	self.items_counter = items_counter;

	self.addPeer = function(jsonConnection){
		self.unstarted.push(jsonConnection);
		self.dict_pid_connections[jsonConnection.str_peerid] = jsonConnection;
	};

	self.removePeer = function(jsonConnection){
		var id = jsonConnection.str_peerid;
		delete self.dict_pid_connections[id];
		jsonConnection.items.forEach(function(elm, idx, arr){
			var lst = self.dict_item_connections[elm];
			if(lst){
				var idx = lst.indexOf(jsonConnection);
				delete lst[idx];
			}
		});
	};

	self.getAllPeerids = function(){
		var keys = Object.keys(self.dict_pid_connections);
		return keys;
	};

	self.getConnectionByPeerid = function(peerid){
		return self.dict_pid_connections[peerid];
	};

	self.addItem = function(item, jsonConnection){
		var lst = [];
		if(item in self.dict_item_connections){
			lst = self.dict_item_connections[item];
			if(lst.indexOf(jsonConnection) < 0)
				lst.push(jsonConnection);
			// else connection already there
		} else {
			lst.push(jsonConnection);
			self.dict_item_connections[item] = lst;
		}
	};

	self.removeItem = function(item, jsonConnection){
		var lst = [];
		if(item in self.dict_item_connections){
			lst = self.dict_item_connections[item];
			var idx = lst.indexOf(jsonConnection);
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



	self.server.on('upgrade', function(req, sock, head){
		(function(){
			var str_peerid = "";

			var jsonConnection = new my_util.JSONConnection(sock);

//		console.log("upgrade:", req.headers);

			sock.on('error', function(exp){
				logger.error('error', Object.keys(self.dict_pid_connections).length, str_peerid, sock.remoteAddress, exp.stack);
			});
			sock.on('close', function(){
				logger.info('close', Object.keys(self.dict_pid_connections).length, str_peerid, sock.remoteAddress);
			});

			sock.write("HTTP/1.1 101 Switching Protocols\r\n\
					Upgrade: websocket\r\n\
					Connection: Upgrade\r\n\
			Sec-WebSocket-Accept: HSmrc0sMlYUkAGmm5OPpG2HaGWk=\r\n\r\n");


			jsonConnection.hasBegan = false;
			jsonConnection.str_peerid = str_peerid;
			jsonConnection.items = [];
			jsonConnection.onjsonData = function(cmd){
				logger.debug('Process', str_peerid, "data:", cmd);
				return false;
			};

			jsonConnection.onerror = function(ex){
				logger.error(ex.stack);
			};

			jsonConnection.onclose = function(ex){
				self.removePeer(jsonConnection);
			};

			jsonConnection.recv_LOGIN = function(cmd){
				var peerid = cmd.peerid;
				str_peerid = peerid;
				jsonConnection.str_peerid = peerid;
				self.addPeer(jsonConnection);
				jsonConnection.send_ITEMLIST();
				logger.info("AddPeer", Object.keys(self.dict_pid_connections).length, str_peerid, sock.remoteAddress );
				jsonConnection.send_BEGIN();
			};

			jsonConnection.send_ITEMLIST = function(){
				var lst = [];
				var count = self.settings.items_peer;
				for(var i = 0; i < count; i++){
					var key = "item."+(i + items_counter);
					lst.push(key);
				}
//			jsonConnection.items = lst;
				items_counter += count;
				var cmd = {cmd: "ITEMLIST", items: lst};
				jsonConnection.write(cmd);
			};

			jsonConnection.recv_ITEMLIST = function(cmd){
				var items = cmd.items;
				var oldItems = jsonConnection.items;
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
				adds.forEach(function(elm){self.addItem(elm, jsonConnection);});
				dels.forEach(function(elm){self.removeItem(elm, jsonConnection);});

			};

//		jsonConnection.recv_REQUEST = function(cmd){
//			var peers = cmd.peers;
//			var keys = self.getAllPeerids();
//			if(peers.length < keys.length){
//				while(true){
//					var i = Math.floor(Math.random() * (keys.length));
//					var pid = keys[i];
//					if(peers.indexOf(pid) >= 0)
//						continue;
//					jsonConnection.write({cmd: "PEERID", peerid: pid});
//					break;
//				};
//			};
//
//		};

			jsonConnection.recv_REQUEST = function(cmd){
				var item = cmd.item;
				var lst_connections = self.getItemConnections(item);
				var pid = '';
				if(lst_connections && lst_connections.length > 0){
					pid = lst_connections[0].str_peerid;
				}
//			console.log(lst_connections);
				jsonConnection.send_response(item, pid);
			};

			jsonConnection.send_response = function(item, pid){
				var cmd = {cmd: "RESPONSE", item: item, peerid: pid, itemcount: items_counter};
				jsonConnection.write(cmd);
			};

			jsonConnection.send_BEGIN = function(){
				var cmd = {cmd: "BEGIN", itemcount: items_counter};
				jsonConnection.write(cmd);
				this.hasBegan = true;
			};
		})();

	});

	self.sendBegin = function(){
		self.unstarted.forEach(function(val, idx, arr){
			var jsconn = val;
			jsconn.send_BEGIN();
		});
		self.unstarted = [];
	};

	self.autoStartTimerID = null;
	if(self.settings.autoStart){
		self.autoStartTimerID = setInterval(function(){
//			console.log('timer beat');
			for(var i = 0; i < self.settings.startCount && self.unstarted.length > 0; i++){
				var jsconn = self.unstarted.shift();
				jsconn.send_BEGIN();
			};
		}, self.settings.startInterval);
	}

	return self;
}

function main(){

	var args = require( "./argsparser" ).parse();
	console.log(args);
	for(var i in args){
		var key = i.replace(/^(--|-)/, "");
		if(key in DefaultSettings){
			DefaultSettings[key] = args[i];
		}
	}
	logger = require('./logger.js').createLogger(null, DefaultSettings.logLevel);

	var cor = new Coordinator(DefaultSettings);
	cor.server.listen(8808);
	var repl = require('repl');
	repl.start().context.cor = cor;
}

main();






