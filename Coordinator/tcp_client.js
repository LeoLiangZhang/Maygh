var net = require('net');

var TcpClientStatus = { // An enum of possible status
		init: 0,
		listening: 1,
		stop: -1
};

var ConnectionStatus = {
		error: -1,
		init: 0,
		request: 1,
		response: 2,
		close: 3
};

var charset = "abcdefghijklmnopqrstuvwxyz"+
"ABCDEFGHIJKLMNOPQRSTUVWXYZ"+
"1234567890"+
",.;*-=+_%#@!";

var generate_data = function(size){
	var data = '';
	var len = charset.length;
	for(var i = 0; i < size; i ++){
		data += charset[i%len];
	}
	return data;
};

var TcpConnection = function(){
	var self = this;
	self.start_time = 0; // unix epoch time
	self.local_peerid = '';
	self.remote_peerid = '';
	self.remote_host = '';
	self.remote_port = -1;
	self.sock = null;
	self.closed = false;
	self.buffer = [];
	self.connected = false;
	self.recv_buffer = '';


	self.onmsg = function(js_msg){
		console.log(self.local_peerid, 'onmsg', js_msg);
		var id = js_msg.id;
		var type = js_msg.type;
		var ret = null;
		if(type=='request'){
			ret = self.process_request(js_msg.payload);
			self.buffer.push({id:id, type:'response', payload: js_msg});
			self._sending();
		}else{ //response
			call_callback(id, {status: ConnectionStatus.response, data: js_msg.payload});
		}
	};

	var call_callback = function(id, evt){
		var callback = self.waiting_callback[id];
		if(callback){
			callback(evt);
			delete self.waiting_callback[id];
		}
	};

	self.onerror = function(){};
	self.onconnected = function(me){};
	self.onclose = function(){};

	self.process_request = function(js_msg){
		console.log(self.local_peerid, 'process_request', js_msg);
		var cmd = js_msg.cmd;
		if(cmd == 'hello'){
			self.connected = true;
			self.remote_peerid = js_msg.peerid;
			self.onconnected(self);
			return "ack_hello";
		}else if(cmd == 'requestItem'){
			var request_item = js_msg.item;
			var size = js_msg.size;
			var data = generate_data(size);
			return {item: request_item, size: size, data: data};
		}
	};
	self.process_response = function(js_msg){

	};

	self.counter = 0;
	self.waiting_callback = {};

	self.close = function(){
		self.closed = true;
		self.sock.end();
	};

	self.connect = function(peerid, port, host){
		console.log('connect', peerid, port, host);
		self.remote_peerid = peerid;
		self.remote_port = port;
		self.remote_host = host;
		self.sock = net.createConnection(self.remote_port, self.remote_host, function(){
			self.connected = true;
			self.send({cmd: "hello", peerid: self.local_peerid})
			self._sending();
			self.onconnected(self);
		});
		self.init();
	};

	self.init = function(){

		self.sock.on('data', function(data){
			data = data.toString();
			console.log(self.local_peerid, 'ondata', data);
			var ptr = 0;
			while (ptr < data.length){
				var i = data.indexOf('\n', ptr);
				if(i >= 0 ){
					var s = data.substring(ptr, i);
					var str_msg = self.recv_buffer + s;
					var js_msg = JSON.parse(str_msg);
					self.onmsg(js_msg);
					self.recv_buffer = '';
					ptr = i + 1;
				} else {
					self.recv_buffer += data.substring(ptr);
					ptr = data.length;
				}
			}
		});
		self.sock.on('end', function(){
			console.log(self.local_peerid, 'end');
			self.close();
		});
		var is_timeout = false; exception = null;
		self.sock.on('timeout', function(){
			console.log(self.local_peerid, 'timeout');
			is_timeout = true;
			self.close();
		});
		self.sock.on('error', function (ex) {
			console.log(self.local_peerid, 'error', ex);
			exception = ex;
			self.close();
		});
		self.sock.on('close', function(had_error){
			console.log(self.local_peerid, 'close', had_error);
			self.close = true;
			for(var id in self.waiting_callback){
				call_callback(id, {status: ConnectionStatus.close,
					is_timeout: is_timeout,
					exception: exception});
			}
		});
	};

	self.send = function(js_msg, callback){
		var r = self.counter;
		self.buffer.push({id:r, type:'request', payload: js_msg});
		self.waiting_callback[r] = callback;
		self.counter ++;
		self._sending();
	};

	self._sending = function(){
		if(self.connected && !self.closed){
			var js_msg = null;
			while(js_msg = self.buffer.shift()){
				var str_msg = JSON.stringify(js_msg);
				self.sock.write(str_msg+"\n");
			}
		}
	};

	return self;

};

var TcpClient = function(port, peerid){
	var self = this;
	self.local_peerid = peerid;
	var listen_port = port;
	var status = TcpClientStatus.init;
	var clients = {}; // peerid: socket
	var waiting_clients = [];

	var addClient = function(conn){
		conn.start_time = new Date().getTime();
		clients[conn.remote_peerid] = conn;
	};

	// When close, then close on both ends.
	// This is also the default of SocketServer
	var options = { allowHalfOpen: false };
	var tcp_listener = net.createServer(options, function(sock){
		console.log(self.local_peerid, 'onnewsocket');
		conn = new TcpConnection();
		conn.local_peerid = self.local_peerid;
		conn.sock = sock;
		conn.onconnected = function(){
			addClient(conn);
		};
		conn.init();

	});
	tcp_listener.listen(listen_port, function(){
		status = TcpClientStatus.listening;
	});

	// public methods
	self.hasConnectedPeer = function(peerid){
		var conn = clients[peerid];
		return !!conn;
	};

	/**
	 * peer_info = {
	 *     peerid: "",
	 *     port: 1234,
	 *     host: "127.0.0.1"
	 * }
	 */
	self.send = function(peer_info, data, callback){
		var conn = null;
		var peerid = peer_info.peerid;
		if(self.hasConnectedPeer(peer_info.peerid)){
			console.log(self.local_peerid, 'hasConnectedPeer', peerid);
			conn = self.clients[peerid];
		} else {
			conn = new TcpConnection();
			conn.local_peerid = self.local_peerid;
			conn.connect(peer_info.peerid, peer_info.port, peer_info.host);
			addClient(conn);
		}
		conn.send(data, callback);
	};

	self.send_request = function(peer_info, request_item, size, callback){
		return self.send(peer_info,
				{cmd:"request_item", item:request_item, size:size},
				callback);
	};

	self.clients = clients;
	return self;
};

module.exports = {
		TcpClientStatus: TcpClientStatus,
		ConnectionStatus: ConnectionStatus,
		TcpConnection: TcpConnection,
		TcpClient: TcpClient
};

//tc1 = new TcpClient(10000, 'abc');

//tc2 = new TcpClient(10002, 'def');
//tc2.send_request({peerid:'abc', host:'127.0.0.1', port:10000}, 'item0', 100,
//		function(evt){console.log(evt);});


