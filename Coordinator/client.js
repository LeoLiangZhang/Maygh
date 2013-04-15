/**
 * A node.js based RTMFP client.
 */
//var profiler = require('profiler');
//var prof_time = 70; // seconds
//profiler.resume();
//profiler.pause();
//setTimeout(function(){profiler.resume(); console.log("profiling.");}, prof_time * 1000);

var util = require('util');
var events = require('events');
var dgram = require('dgram');
var Packet = require('./lib/packet.js');
var RTMFP = require('./lib/rtmfp.js');
//var nativeRTMFP = require('./build/default/rtmfp.node');
var http = require('http');

var _rtmfp = new RTMFP();

var DefaultSettings = {
		manageInterval: 60, //seconds
		connectionTimeout: 120000, //milliseconds
		groupTimeout: 360000, //milliseconds
		P2SKeepalive: 60000, //milliseconds, should be less then connectionTimeout, the timeout before the server sends a keepalive message to the client
		maxP2SKeepalive: 3, //How often to max keepalive the connection before dropping it
		port: 15000,
		address: '', //ArcusNode can be run on a specific interface if wanted
		logLevel: 'info', //String: ['fatal', 'error', 'warn', 'info', 'debug']
		logFile: null,
		serverPort: 1935,
		serverAddress: "127.0.0.1",
		totalpeers: 2, // total clients in this instance.
		maxpeers: 8, // Max number of peer can a net connection hold
		maxReconnect: 20,
		maxGetPeerAddressRetry: 3 //Max number of times to retry to get address of a peer.
};

var reconnection = 0;

var logger = null;
//Packet Markers
var RTMFP_MARKER_HANDSHAKE = 0x0b,
RTMFP_MARKER_REQUEST_1 = 0x0d,
RTMFP_MARKER_REQUEST_2 = 0x8d,
RTMFP_MARKER_REQUEST_3 = 0x89,
RTMFP_MARKER_REQUEST_4 = 0x09,
RTMFP_MARKER_RESPONSE_1 = 0x4e,
RTMFP_MARKER_RESPONSE_2 = 0x4a;

var _epoch = (function(){
	var d = new Date();
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
})();

var _timeNow = function() {
	var d = new Date();
	return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()) - _epoch) / 4);
};

var http_get = function(host, port, path, callback){
	var req = http.get({
		host: host,
		port: port,
		path: path
	}, function(res){
		var _body = [];
		var body ='';
		res.setEncoding('utf-8');
		res.on('data', function(chunk){
			_body.push(chunk);
		});
		res.on('end', function(){
			body = _body.join();
			res.body = body;
			if(callback){
				callback(res);
			}
		});
	});
};

var getNetworkIP = (function () {
    var ignoreRE = /^(127\.0\.0\.1|::1|fe80(:1)?::1(%.*)?)$/i;

    var exec = require('child_process').exec;
    var cached;
    var command;
    var filterRE;

    switch (process.platform) {
    // TODO: implement for OSs without ifconfig command
    case 'darwin':
         command = 'ifconfig';
         filterRE = /\binet\s+([^\s]+)/g;
         // filterRE = /\binet6\s+([^\s]+)/g; // IPv6
         break;
    default:
         command = 'ifconfig';
         filterRE = /\binet\b[^:]+:\s*([^\s]+)/g;
         // filterRE = /\binet6[^:]+:\s*([^\s]+)/g; // IPv6
         break;
    }

    return function (callback, bypassCache) {
         // get cached value
        if (cached && !bypassCache) {
            callback(null, cached);
            return;
        }
        // system call
        exec(command, function (error, stdout, sterr) {
            var ips = [];
            // extract IPs
            var matches = stdout.match(filterRE);
            // JS has no lookbehind REs, so we need a trick
            for (var i = 0; i < matches.length; i++) {
                ips.push(matches[i].replace(filterRE, '$1'));
            }

            // filter BS
            for (var i = 0, l = ips.length; i < l; i++) {
                if (!ignoreRE.test(ips[i])) {
                    //if (!error) {
                        cached = ips[i];
                    //}
                    callback(error, ips[i]);
                    return;
                }
            }
            // nothing found
            callback(error, null);
        });
    };
})();

function main(){
	var args = require( "./argsparser" ).parse();
	console.log(args);
	for(var i in args){
		var key = i.replace(/^(--|-)/, "");
		if(key in DefaultSettings){
			DefaultSettings[key] = args[i];
		}
	}
	console.log(DefaultSettings);

	getNetworkIP(function (error, ip){
		if(error){
			console.error("CANNOT GET MY IP.");
			process.exit(1);
		}
		console.log("My ip:", ip);
		if(!DefaultSettings.address)
			DefaultSettings.address = ip;
		_main();
	}, false);
}

function _main(){
	logger = require('./logger.js').createLogger(DefaultSettings.logFile, DefaultSettings.logLevel);
	logger.getTime = function(){return nativeRTMFP.now().toString();};
	logger.format = function(level, date, message) {
		  return [level, ' ', date, ' ', message].join('');
		};


	for(var i = 0; i < DefaultSettings.totalpeers; i++){
		(function(){
			var port = DefaultSettings.port + i;
			var t = Math.floor(Math.random() * 60000);
			setTimeout(function(){
				var client = new Client({port: port});
				try{
					client.run();
				} catch (e){
					logger.error(e.stack);
				}
			}, t);
		})();
	}
}

CLIENT_STAGE_HANDSHAKE = 0x01;
CLIENT_STAGE_CONNECTION_OPEN = 0x02;

var reprHexList = function(lst){
	var str = [];
	for(var i = 0; i < lst.length; i ++){
		str.push("0x"+Packet.string_256[lst[i]]);
	}
	return "[" + str.join(', ') + "]";
};
var formatPeerID = function(lst){
	var str = [];
	for(var i = 0; i < lst.length; i ++){
		str.push(Packet.string_256[lst[i]]);
	}
	return str.join('').toLowerCase() ;
};
var deformatPeerID = function(txt){
	logger.debug("deformating peerid: "+txt);
	var bytes = [];
	for(var i = 0; i < txt.length; i += 2){
		var t = txt.substr(i, 2);
		bytes.push(parseInt(t, 16));
	}
	return bytes;
};



function Client(settings){
	this.socket = null;
	this.stage = CLIENT_STAGE_HANDSHAKE;
	this.serverAddress = "";
	this.serverPort = 0;
	this.connection = null;
	this.settings = {};
	this.socket = null; // the udp socket
	this.jsonConnection = null;

	this.connectingPeer = '';
	this.connectedPeers = [];
	this.filenames = [];
	this.local_filenames = [];
	this.request_num = 0;

	// Copy settings
	settings = settings || {};
	for(var i in DefaultSettings){
		if (!(i in settings)){
			settings[i] = DefaultSettings[i];
		}
	}
	this.my_rtmfp = new nativeRTMFP.RTMFP();
	this.clientKey = this.my_rtmfp.getPublicKey(); // it's a buffer object;
	this.settings = settings;
	this.serverAddress = settings.serverAddress;
	this.serverPort = settings.serverPort;
	this.clientSignature = new Packet(new Buffer(4)).writeBytes([0x81, 0x02, 0x1D, 0x02]).buffer();
	this.clientCertificate = new Packet(new Buffer(76)).writeBytes([0x02, 0x1D, 0x02, 0x41, 0x0E]).writeRandom(64).writeBytes([0x03,0x1A,0x02,0x0A,0x1E,0x02,0x58]).buffer();
	this.signkey = new Packet(new Buffer(this.clientSignature.length + this.clientKey.length)).writeBytes(this.clientSignature).writeBytes(this.clientKey).buffer();
	this.peerid = this.my_rtmfp.computePeerId(this.signkey, this.signkey.length);
	this.str_peerid = formatPeerID(this.peerid);
	logger.debug("peerid:\n"+reprHexList(this.peerid));
	logger.info("peerid (easy read): "+ this.str_peerid);
	logger.debug("clientKey:\n", Packet.prettyBuffer(this.clientKey));
	logger.debug("clientSignature:\n", Packet.prettyBuffer(this.clientSignature));
	logger.debug("clientCertificate:\n", Packet.prettyBuffer(this.clientCertificate));

	var self = this;
//	process.stdin.resume();
//	process.stdin.setEncoding('utf8');
//	process.stdin.on('data', function(chunk){
//		if(!chunk) return;
//		logger.info("STDIN: " + chunk);
//		try{
//			logger.info("eval: ", eval(chunk));
//		} catch(e) {
//			logger.info("eval error:", e);
//		};
//	});

	if(DefaultSettings.totalpeers < 2){

		var repl = require('repl');
		repl.start().context.self = self;
	}

	this.peers = {};


};

Client.prototype.login = function(){
	var self = this;

	var my_util = require('./util');
	var net = require('net');
	var connection = net.createConnection(8808, this.settings.serverAddress);
	this.connection = connection;

	var num_items = 0;
	var lst_items = [];

	function reconnect(){
		reconnection ++;
		if (reconnection > self.settings.maxReconnect){
			logger.info("Reach max reconnect times. Client exit.");
			process.exit(1);
		}
		self.login();
	};

	connection.on('error', function(e){
//		reconnect();
	});

	connection.on('close', function(had_error){
		reconnect();
	});

	connection.once('data', function(data){
		logger.debug('server response:', data.toString('utf8'));
		var jsonConnection = new my_util.JSONConnection(connection);

		function send_request(){
			var t = Math.floor(Math.random() * 5000);
			setTimeout(self.jsonConnection.send_REQUEST, t);
		}

		self.jsonConnection = jsonConnection;

		jsonConnection.onclose = function(e){
//			reconnect();
		};

		jsonConnection.onjsonData = function(cmd){
//			logger.info('Coordinator:', cmd);
			return false;
		};

		jsonConnection.recv_BEGIN = function(cmd){
			if(cmd.itemcount) num_items = cmd.itemcount;
			send_request();
		};

		jsonConnection.recv_ITEMLIST = function(cmd){
			lst_items = cmd.items;
			jsonConnection.send_ITEMLIST();
		};


		jsonConnection.recv_RESPONSE = function(cmd){
			var item = cmd.item;
			var pid = cmd.peerid;
			var itemcount = cmd.itemcount;
			num_items = itemcount;

			logger.info(self.request_num, self.str_peerid, "GetResponse", item, pid || "undefined");

			if(lst_items.indexOf(item) < 0){
				if(pid && pid != self.str_peerid && self.connectedPeers.indexOf(pid) < 0){
					self.connectPeer(pid);
					self.connectedPeers.push(pid);
				}
				lst_items.push(item);
				jsonConnection.send_ITEMLIST();
			}

//			console.log(cmd);
			send_request();
		};

		jsonConnection.send_ITEMLIST = function(){
			var cmd = {cmd:"ITEMLIST", items: lst_items};
			self.jsonConnection.write(cmd);
		};

		var getPeerAddrRetry = 0;
		jsonConnection.send_REQUEST = function(){
			if(self.connectingPeer){
				if(getPeerAddrRetry++ < self.settings.maxGetPeerAddressRetry){
					self.connectPeer(self.connectingPeer);
					send_request();
					return;
				}
			}
			getPeerAddrRetry = 0;
			var item;
			for(var j = 0; j < lst_items.length; j++){
				var i = Math.floor(Math.random() * num_items);
				item = "item." + i;
				if(lst_items.indexOf(item) < 0){
					break;
				}
				item = "item.0";
			}
			self.jsonConnection.write({cmd: "REQUEST", peers: self.connectedPeers, item: item});
			logger.info(++self.request_num, self.str_peerid, "Requesting", item);
		};

		jsonConnection.write({cmd: "LOGIN", peerid: self.str_peerid});

//		send_request();
	});

	connection.on('connect', function(){
		connection.write("GET /ws HTTP/1.1\r\n\
Host: localhost\r\n\
Upgrade: websocket\r\n\
Connection: Upgrade\r\n\
Sec-WebSocket-Version: 6\r\n\
Sec-WebSocket-Origin: http://localhost\r\n\
Sec-WebSocket-Extensions: deflate-stream\r\n\
Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==\r\n\r\n");

		// decrease reconnect times so as to keep this client running longger.
		reconnection --;
		if(reconnection < 0)
			reconnection = 0;

	});



};
Client.prototype.run = function(){
	var self = this;
	this.socket = dgram.createSocket('udp4', function(buffer, remoteInfo){
		var evt = {buffer: buffer, remoteInfo: remoteInfo};
		self.socketHandler(evt);
	});
	this.socket.bind(this.settings.port, this.settings.address);
	logger.info("Client started at", this.settings.port );
	this.send_HANDSHAKE_1(this.settings.serverAddress, this.settings.serverPort);
};

Client.prototype.send_HANDSHAKE_1 = function(s_address, s_port){
	if(s_address)
		this.serverAddress = s_address;
	if(s_port)
		this.serverPort = s_port;

	var pkt = new Packet(new Buffer(255), 0);
	pkt.pos(6); // reserve for checksum and connection id
	pkt.writeInt8(RTMFP_MARKER_HANDSHAKE);
	pkt.writeInt16(_timeNow());

	pkt.writeInt8(0x30); //handshake 1
	var url = "rtmfp://localhost/";
	pkt.writeInt16(3+url.length+16);
	pkt.writeInt8(0x14);
	pkt.writeInt8(url.length + 1); // url lenght + 1
	pkt.writeInt8(0x0A); // Handshake 1
	for(var i = 0; i < url.length; i++){
		pkt.writeInt8(url.charCodeAt(i));
	}

	var tag = Packet.randomBytes(16);
	//var _tag = new Buffer(16);

	//_tag.copy(tag);
	logger.debug("Generated tag: \n" + Packet.prettyBuffer(tag));
	pkt.writeBytes(tag);
//	logger.debug("My tag -0: \n" + Packet.prettyBuffer(tag));
//	this.tag = tag;
	this.tag = new Buffer(16);
	tag.copy(this.tag);

	logger.debug("Handshake request: " + pkt.toString());
	//TODO: encryptPacket would change the first 5 bytes of tag, which it shouldn't.
	_rtmfp.encryptPacket(pkt, RTMFP.SYMETRIC_KEY);
//	logger.debug("My tag -1: \n" + Packet.prettyBuffer(tag));
	_rtmfp.encodePacket(pkt, 0);
//	logger.debug("My tag -2: \n" + Packet.prettyBuffer(tag));
	this.send(pkt, {address: this.serverAddress, port: this.serverPort});

};

Client.prototype.socketHandler = function(evt){
	try{
		this.messageHandler(evt);
	} catch (e){
		logger.error('Message handler error: ' + e.stack);
	}
};

Client.prototype.messageHandler = function(evt){
	// First decode
	var pkt = new Packet(evt.buffer, evt.buffer.length);
	var connectionId = _rtmfp.decodePacket(pkt);

	// Then decrypt
	var _key = this.stage == CLIENT_STAGE_HANDSHAKE ? RTMFP.SYMETRIC_KEY : this.encryptKey;
	if (connectionId == 0)
		_key = RTMFP.SYMETRIC_KEY;
	logger.debug("Stage type: " + this.stage);
	if(!_rtmfp.decryptPacket(pkt, _key)){
		logger.warn('Handshake Decryption Failed!');
		return;
	}
	logger.debug("Received Pkt:\n" + pkt.toString());


	var marker = pkt.readInt8();
	// Disable marker check:
//	if (marker != 0x8d && marker != 0x0d && marker != 0x0b && marker != 0x89 && marker != 0x09 && marker != 0x49){
//		logger.warn("Marker error: " + marker);
//		return;
//	}

	var time1 = pkt.readInt16();
	var time2 = 0;

	logger.debug("Marker: " + marker);
	//with echo time
	if((marker | 0xF0) == 0xFD || (this.stage == CLIENT_STAGE_CONNECTION_OPEN && marker != 0x0B) || marker == 0x4E){
		time2 = pkt.readInt16();
	}


	while(pkt.available() >0){
		var request = {};
		request.connectionId = connectionId;
		request.pkt = pkt;
		request.type = pkt.readInt8();
		if(request.type == 0){
			logger.debug("request.type == 0");
			logger.debug(pkt.toString());
		}
		logger.debug("request.type: "+ request.type);
		if(pkt.available() < 2){
			//throw new Error("Packet size descriptor error.");
			break;
		}
		request.requestSize = pkt.readInt16();
		if(pkt.available() < request.requestSize){
			//throw new Error("Packet size error.");
			break;
		}
		switch(request.type){
		case 0x70:
			this.recv_HANDSHAKE_1(request);
			break;
		case 0x78:
			this.recv_HANDSHAKE_2(request);
			break;
		case 0x71:
			this.recv_RENDEZVOUZ_1(request);
			break;
		case 0x0F:
			this.recv_RENDEZVOUZ_2(request);
			break;
		case 0x51:
			this.recv_ACK(request);
			break;
		case 0x10:
			this.recv_CONNECTION_ADDRESS(request);
			break;
		default:
			logger.debug("Unknown Message");
			logger.debug(pkt.toString());
		}
	}
};

Client.prototype.connectPeer = function(peerid){
	this.connectingPeer = peerid;
	if(typeof peerid === typeof ''){
		logger.info(this.request_num, this.str_peerid, "Connecting", peerid);
		peerid = deformatPeerID(peerid);
	}
	this.send_RENDEZVOUZ({peerid: peerid});
};

Client.prototype.recv_RENDEZVOUZ_1 = function(request){
	var pkt = request.pkt;
	var type = pkt.readInt8(); //should be 0x10
	var tag = pkt.readBytes(16);
	logger.debug("request tag:\n"+ Packet.prettyBuffer(tag));
	var addr = pkt.readBytes(5);
	var port = pkt.readInt16();
	logger.info(this.request_num, this.str_peerid, "GetAddress", this.connectingPeer,':', addr[1], addr[2], addr[3], addr[4], port);
	if(this.requesting_peerid){
		this.peers[formatPeerID(this.requesting_peerid)] = ''+addr[1]+'.'+ addr[2]+'.'+ addr[3]+'.'+addr[4]+':'+ port;
	}
	var unknown = pkt.readBytes(pkt.size() - pkt.pos());
	logger.debug("unknow:", unknown);
	this.connectingPeer = '';
};

Client.prototype.recv_RENDEZVOUZ_2 = function(request){
	var pkt = request.pkt;
	var unknown = pkt.readBytes(3);
	var peerid = pkt.readBytes(32);
	var addr = pkt.readBytes(5);
	var port = pkt.readInt16();
//	logger.info(this.str_peerid, "Got request from:", formatPeerID(peerid), "whose address is: ", addr[1], addr[2], addr[3], addr[4], ":", port);
	var tag = pkt.readBytes(16);
	logger.debug("request tag:\n"+ Packet.prettyBuffer(tag));

	if(peerid){
		this.peers[formatPeerID(peerid)] = ''+addr[1]+'.'+ addr[2]+'.'+ addr[3]+'.'+addr[4]+':'+ port;
	}
};

Client.prototype.recv_HANDSHAKE_1 = function(request){
	var pkt = request.pkt;
	var tagSize = pkt.readInt8(); // should be 16
	var tag = pkt.readBytes(tagSize, true);
	var cookieSize = pkt.readInt8();
	var cookie = pkt.readBytes(cookieSize, true);
	if (!this.tag){
		throw new Error("The client hasn't initConnection yet.");
	}
	logger.debug("My tag:\n" + Packet.prettyBuffer(this.tag));
	logger.debug("Received tag:\n" + Packet.prettyBuffer(tag));
	if(this.tag.toString() != tag.toString()){
		throw new Error("Tag is not the same.");
	}
	request.cookie = cookie;
	logger.debug("Received cookie:\n" + Packet.prettyBuffer(cookie));
	request.serverCertificate = pkt.readBytes(77, true);
	this.serverCertificate = request.serverCertificate;

	logger.debug("Finished reading HANDSHAKE_1");
	this.send_HANDSHAKE_2(request);
};

Client.prototype.recv_HANDSHAKE_2 = function(request){
	var pkt = request.pkt;
	var connectionId = pkt.readInt32();
	var sigkeysize = pkt.read7Bit();
	var serverSignature = pkt.readBytes(sigkeysize-128, true);
	var serverKey = pkt.readBytes(128, true);
	var unknown = pkt.readInt8(); //should be 0x58;
	request.serverKey = this.serverKey = serverKey;
	request.serverSignature = this.serverSignature = serverSignature;
	request.connectionId = this.connectionId = connectionId;
	logger.debug("serverKey:\n" + Packet.prettyBuffer(this.serverKey));
	logger.debug("serverSignature:\n" + Packet.prettyBuffer(this.serverSignature));
	logger.debug("connectionId:\n" + Packet.prettyBuffer(this.connectionId));

	var keys = this.my_rtmfp.computeAsymetricKeys2(this.clientKey, this.clientCertificate, this.serverSignature, this.serverKey);
	var sharesecret = keys[0];
    var decryptKey = keys[1];
    var encryptKey = keys[2];
    logger.debug("decryptKey: \n" + Packet.prettyBuffer(decryptKey));
    logger.debug("encryptKey: \n" + Packet.prettyBuffer(encryptKey));
    this.decryptKey = decryptKey;
    this.encryptKey = encryptKey;

	logger.debug("Finished reading HANDSHAKE_2");
	this.stage = CLIENT_STAGE_CONNECTION_OPEN;
	this.send_CONNECTION_OPEN(request);
};

Client.prototype.recv_ACK = function(request){
	logger.debug("Server send ACK\n" + request.pkt.toString());
	if (this.stage == CLIENT_STAGE_CONNECTION_OPEN){
		logger.debug("Reply ack connection");
		this.send_CONNECTION_ACK(request);
	}
};

Client.prototype.recv_CONNECTION_ADDRESS = function(request){
	var pkt = request.pkt;
	logger.debug("recv_CONNECTION_ADDRESS\n" + request.pkt.toString());

//	console.log("peers: ", this.peers);
//	for(var i in this.peers){
//		var arr_pid = deformatPeerID(i);
//		logger.info('connecting: ', arr_pid);
//		this.connectPeer(arr_pid);
//		break; // TODO: allow connect multiple at once.
//	}

	this.login();
};

Client.prototype.send_RENDEZVOUZ = function(request){
	var pkt = new Packet(new Buffer(255), 0);
	pkt.pos(6);
	pkt.writeInt8(0x0B);
	pkt.writeInt16(_timeNow());

	pkt.writeInt8(0x30); // HANDSHAKE / RENDEZVOUZ
	pkt.writeInt16(51); // If I were right, it should be the size of this request
	pkt.writeInt8(0x22); // No idea why it's 0x22
	pkt.writeInt8(0x21); // msg size of peerid
	pkt.writeInt8(0x0F); // Handshake type = RENDEZVOUZ
	pkt.writeBytes(request.peerid); // peerid should be a 32-bytes array

	this.requesting_peerid = request.peerid;

	var tag = new Buffer(16);
	this.tag.copy(tag);
	pkt.writeBuffer(tag);

	logger.debug("RENDEZVOUZ request: " + pkt.toString());
	//TODO: encryptPacket would change the first 5 bytes of tag, which it shouldn't.
	_rtmfp.encryptPacket(pkt, RTMFP.SYMETRIC_KEY);
//	logger.debug("My tag -1: \n" + Packet.prettyBuffer(tag));
	_rtmfp.encodePacket(pkt, 0);
	logger.debug("My tag -2: \n" + Packet.prettyBuffer(tag));
	this.send(pkt, {address: this.serverAddress, port: this.serverPort});

};

Client.prototype.send_CONNECTION_ACK = function(request){
	var pkt = new Packet(new Buffer(255), 0);
	pkt.pos(6);
	pkt.writeInt8(0x0D);
	pkt.writeInt16(_timeNow());
	pkt.writeInt16(_timeNow());
	pkt.writeInt8(0x51);
	pkt.writeBytes([0x00, 0x04, 0x02, 0xFF, 0x7F, 0x01]);
	logger.debug("send_CONNECTION_ACK: \n"+ pkt.toString());
	_rtmfp.encryptPacket(pkt, this.decryptKey);
	_rtmfp.encodePacket(pkt, this.connectionId);
	logger.debug("connectionId: " + this.connectionId);
	this.send(pkt, {address: this.serverAddress, port: this.serverPort});

	this.send_CONNECTION_ADDRESS(request);

};

Client.prototype.send_CONNECTION_ADDRESS = function(request){
	var pkt = new Packet(new Buffer(255), 0);
	pkt.pos(6);
	pkt.writeInt8(0x8D);
	pkt.writeInt16(_timeNow());
	pkt.writeInt16(_timeNow());
	pkt.writeInt8(0x10); //type

	pk = new Packet(new Buffer(255), 0);
	pk.writeInt8(0x00); // flag
	pk.writeInt8(0x02); // sequence
	pk.writeInt8(0x02); // stage
	pk.writeInt8(0x01); // unknown 1
	pk.writeBytes([0x11, 0x00, 0x00, 0x17, 0x88, 0x00]);  //unknown data
	pk.writeBytes([0x02, 0x00, 0x0B, 0x73, 0x65, 0x74, //setPeerInfo
	               0x50, 0x65, 0x65, 0x72, 0x49, 0x6E,
	               0x66, 0x6F, 0x00, 0x00, 0x00, 0x00, // Number 0
	               0x00, 0x00, 0x00, 0x00, 0x00, 0x05]); // null
	var ipaddr = "192.168.1.70:1234"; // my home setting
	ipaddr = this.settings.address + ":" + this.settings.port.toString();
	pk.writeBytes([0x02]);
	pk.writeInt8(0);
	pk.writeInt8(ipaddr.length);
	pk.writeBuffer(new Buffer(ipaddr));

	var size = pk.size();
	pk.pos(0);
	pkt.writeInt8(0);
	pkt.writeInt8(size);
	pkt.writeBuffer(pk.readBytes(size, false));
	logger.debug("send_CONNECTION_ADDRESS: \n"+ pkt.toString());
	_rtmfp.encryptPacket(pkt, this.decryptKey);
	_rtmfp.encodePacket(pkt, this.connectionId);
	logger.debug("connectionId: " + this.connectionId);
	this.send(pkt, {address: this.serverAddress, port: this.serverPort});
};

Client.prototype.send_HANDSHAKE_2 = function(request){
	// HANDSHAKE_2
	var pkt = new Packet(new Buffer(255), 0);
	pkt.pos(6); // reserve for checksum and connection id
	pkt.writeInt8(RTMFP_MARKER_HANDSHAKE);
	pkt.writeInt16(_timeNow());

	pkt.writeInt8(0x38); // Request HANDSHAKE_2
	pkt.writeInt16(4+1+64+2+4+128+1+76);
	pkt.writeBytes([0x02, 0x00, 0x00, 0x00]); // connectionId
	pkt.writeInt8(64);
	pkt.writeBuffer(request.cookie);
	pkt.writeBytes([0x81, 0x04]); // keysize, is 7bit encoded
	pkt.writeBytes(this.clientSignature);
	pkt.writeBytes(this.clientKey);
	pkt.writeInt8(76); // client cert size
	pkt.writeBytes(this.clientCertificate);

	logger.debug("Handshake request: " + pkt.toString());
	//TODO: encryptPacket would change the first 5 bytes of tag, which it shouldn't.
	_rtmfp.encryptPacket(pkt, RTMFP.SYMETRIC_KEY);
//	logger.debug("My tag -1: \n" + Packet.prettyBuffer(tag));
	_rtmfp.encodePacket(pkt, 0);
//	logger.debug("My tag -2: \n" + Packet.prettyBuffer(tag));
	this.send(pkt, {address: this.serverAddress, port: this.serverPort});


	logger.debug("clientKey:\n" + Packet.prettyBuffer(this.clientKey));
	logger.debug("clientSignature:\n" + Packet.prettyBuffer(this.clientSignature));
	logger.debug("clientCertificate:\n" + Packet.prettyBuffer(this.clientCertificate));

};

Client.prototype.send_CONNECTION_OPEN = function(request){
	var pkt = new Packet(new Buffer(255), 0);
	pkt.pos(6);
	pkt.writeInt8(0x8D);
	pkt.writeInt16(_timeNow());
	pkt.writeInt16(_timeNow());
	pkt.writeBytes([0x10, 0x01, 0x4A, 0x80, 0x02, 0x01, 0x01, 0x05, 0x00, 0x54,
	                0x43, 0x04, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00, 0x01, 0x02,
	                0x00, 0x07, 0x63, 0x6F, 0x6E, 0x6E, 0x65, 0x63, 0x74, 0x00,
	                0x3F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00,
	                0x03, 0x61, 0x70, 0x70, 0x02, 0x00, 0x00, 0x00, 0x08, 0x66,
	                0x6C, 0x61, 0x73, 0x68, 0x56, 0x65, 0x72, 0x02, 0x00, 0x0F,
	                0x4D, 0x41, 0x43, 0x20, 0x31, 0x30, 0x2C, 0x33, 0x2C, 0x31,
	                0x38, 0x31, 0x2C, 0x32, 0x36, 0x00, 0x06, 0x73, 0x77, 0x66,
	                0x55, 0x72, 0x6C, 0x02, 0x00, 0x31, 0x68, 0x74, 0x74, 0x70,
	                0x3A, 0x2F, 0x2F, 0x6C, 0x6F, 0x63, 0x61, 0x6C, 0x68, 0x6F,
	                0x73, 0x74, 0x3A, 0x38, 0x38, 0x38, 0x38, 0x2F, 0x62, 0x69,
	                0x6E, 0x2D, 0x64, 0x65, 0x62, 0x75, 0x67, 0x2F, 0x57, 0x65,
	                0x62, 0x43, 0x6C, 0x6F, 0x75, 0x64, 0x46, 0x6C, 0x61, 0x73,
	                0x68, 0x2E, 0x73, 0x77, 0x66, 0x00, 0x05, 0x74, 0x63, 0x55,
	                0x72, 0x6C, 0x02, 0x00, 0x12, 0x72, 0x74, 0x6D, 0x66, 0x70,
	                0x3A, 0x2F, 0x2F, 0x6C, 0x6F, 0x63, 0x61, 0x6C, 0x68, 0x6F,
	                0x73, 0x74, 0x2F, 0x00, 0x04, 0x66, 0x70, 0x61, 0x64, 0x01,
	                0x00, 0x00, 0x0C, 0x63, 0x61, 0x70, 0x61, 0x62, 0x69, 0x6C,
	                0x69, 0x74, 0x69, 0x65, 0x73, 0x00, 0x40, 0x6D, 0x60, 0x00,
	                0x00, 0x00, 0x00, 0x00, 0x00, 0x0B, 0x61, 0x75, 0x64, 0x69,
	                0x6F, 0x43, 0x6F, 0x64, 0x65, 0x63, 0x73, 0x00, 0x40, 0xA8,
	                0xEE, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0B, 0x76, 0x69,
	                0x64, 0x65, 0x6F, 0x43, 0x6F, 0x64, 0x65, 0x63, 0x73, 0x00,
	                0x40, 0x6F, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0D,
	                0x76, 0x69, 0x64, 0x65, 0x6F, 0x46, 0x75, 0x6E, 0x63, 0x74,
	                0x69, 0x6F, 0x6E, 0x00, 0x3F, 0xF0, 0x00, 0x00, 0x00, 0x00,
	                0x00, 0x00, 0x00, 0x07, 0x70, 0x61, 0x67, 0x65, 0x55, 0x72,
	                0x6C, 0x02, 0x00, 0x1F, 0x68, 0x74, 0x74, 0x70, 0x3A, 0x2F,
	                0x2F, 0x6C, 0x6F, 0x63, 0x61, 0x6C, 0x68, 0x6F, 0x73, 0x74,
	                0x3A, 0x38, 0x38, 0x38, 0x38, 0x2F, 0x74, 0x65, 0x73, 0x74,
	                0x2E, 0x68, 0x74, 0x6D, 0x6C, 0x00, 0x0E, 0x6F, 0x62, 0x6A,
	                0x65, 0x63, 0x74, 0x45, 0x6E, 0x63, 0x6F, 0x64, 0x69, 0x6E,
	                0x67, 0x00, 0x40, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	                0x00, 0x00, 0x09]);
	logger.debug("Connection request: " + pkt.toString());
	//TODO: encryptPacket would change the first 5 bytes of tag, which it shouldn't.
	_rtmfp.encryptPacket(pkt, this.decryptKey);
//	logger.debug("My tag -1: \n" + Packet.prettyBuffer(tag));
	_rtmfp.encodePacket(pkt, this.connectionId);
//	logger.debug("My tag -2: \n" + Packet.prettyBuffer(tag));
	this.send(pkt, {address: this.serverAddress, port: this.serverPort});


};

Client.prototype.send = function(packet, endpoint){
	this.socket.send(packet.buffer(), 0, packet.size(), endpoint.port, endpoint.address, function (err, bytes) {
		if (err) {
			//TODO: Handle error and recover
			throw err;
		}
		logger.debug('Wrote ' + bytes + ' bytes to socket.');
	});
};



main();

