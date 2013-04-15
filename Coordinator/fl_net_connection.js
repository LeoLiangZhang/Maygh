var dgram = require('dgram');
var RTMFP = require('./lib/rtmfp.js');
var AMF0 = require('./lib/amf0.js');
var NetConnection = require('./lib/net_connection.js');
var Packet = require('./lib/packet.js');
var logger = require('./logger.js').createLogger();
var EventEmitter = require('events').EventEmitter;

var helper = require('./helper.js');
var deformatPeerID = helper.deformatPeerID;
var formatPeerID = helper.formatPeerID;

var send = function(socket, packet, endpoint) {
  socket.send(packet.buffer(), 0, packet.size(), endpoint.port, endpoint.address, function (err, bytes) {
    if (err) {
      //TODO: Handle error and recover
      throw err;
    }
  });
};

/**
 * Writes packet size to given position and returns to current write position
 */
var writeSize = function(pkt, pos, size) {
  var lastPos = pkt.pos();
  pkt.pos(pos);
  pkt.writeInt16( pkt.size() - pos - 2);
  pkt.pos(lastPos);
};

var idCounter = 1;
var rtmfp = new RTMFP();

APP_NAME = "test";

var FlNetConnection = function(port, address){

	this._nc = new NetConnection(idCounter++);
	this.state = FlNetConnection.S_UNINIT;
	this._port = 0;
	this._address = address || '127.0.0.1';
	this.socket = null;
	this.endpoint = {address: "localhost", port: 1935};
	this.url = "rtmfp://localhost/";
	this.tag = null; // a Buffer object
	this.clientConnectionId = 0;
	this.requesting_peerid = '';
	this._buf_peerid = null;
	this._peerid = '';
	this.initPort(port);

//	logger.debug(this.peerid());
};

FlNetConnection.prototype.__proto__ = EventEmitter.prototype;

FlNetConnection.prototype.initPort = function(port){
	if(this.state != FlNetConnection.S_UNINIT) return this._port;
	var self = this;
	this.setState(FlNetConnection.S_INIT);
	this._port = -1; // binding port
	this.socket = dgram.createSocket('udp4', function(buffer, remoteInfo){
		self._packetHandler(buffer, remoteInfo);
	});
	this.socket.on('listening', function(){
		self.setState(FlNetConnection.S_LISTENING);
		self._port = port;
	});
	['error', 'drain', 'timeout', 'close', 'end'].forEach(function(i){
		self.socket.on(i, (function(){
			var ename = i;
			return function(e){
				logger.warn('Unwatched event', ename, e ? e.stack : '');
			};
		})());
	});
	this.socket.bind(port);

};

FlNetConnection.prototype.peerid = function(){
	if(!this._peerid){
		var pkt = new Packet(new Buffer(4 + this._nc.publicKey.length), 0);
		pkt.writeBytes([0x81, 0x02, 0x1D, 0x02]); //clientSignature
		pkt.writeBuffer(this._nc.publicKey);
		var signkey = pkt.buffer();
		this._buf_peerid = rtmfp.nativeRTMFP.computePeerId(signkey, signkey.length);
		this._peerid = formatPeerID(this._buf_peerid);
	}
	return this._peerid;
};

FlNetConnection.prototype._packetHandler = function(buffer, remoteInfo){
	if(buffer.length < 20){
		throw new Error('Packet too small');
	}

	var self = this;
	var recv_pkt = new Packet(buffer, buffer.length);

	var id = rtmfp.decodePacket(recv_pkt);

	var decrypt_ok = true;
	if(id != 0 && this.state > FlNetConnection.S_HANDSHAKE){
		decrypt_ok = rtmfp.decryptPacket(recv_pkt, self._nc.__p.decryptKey);
	} else {
		decrypt_ok = rtmfp.decryptPacket(recv_pkt, RTMFP.SYMETRIC_KEY);
	}
	if(!decrypt_ok){
		logger.warn(this.peerid(), "decrypt_error");
		return;
	}
	logger.debug(recv_pkt.toString());
	var msgs = rtmfp.readPacket(recv_pkt);
	msgs.forEach(function(elm, idx){
		var msg = elm;
		logger.debug('received:\n', msg);
		switch(msg.type){
		case RTMFP.HANDSHAKE_RESPONSE:
			msg.type = RTMFP.KEY_REQUEST;

			msg.connectionId = self._nc.id;
			msg.publicKey = self._nc.publicKey;
			msg.certificate = self._nc.certificate;

			var pkt = new Packet(new Buffer(200), 0).clear();
	        rtmfp.writePacket(pkt, msg);
	        rtmfp.encryptPacket(pkt, RTMFP.SYMETRIC_KEY);
	        rtmfp.encodePacket(pkt, 0);
	        send(self.socket, pkt, self.endpoint);
	        self.setState(FlNetConnection.S_HANDSHAKE);
			break;

		case RTMFP.KEY_RESPONSE:
//			console.log('begin computeSharedSecret');
	        self._nc.computeSharedSecret(msg.publicKey);
//	        console.log('after computeSharedSecret');
	        var serverNonce = new Packet(msg.signature.length + msg.publicKey.length);
	        serverNonce.writeBuffer(msg.signature);
	        serverNonce.writeBuffer(msg.publicKey);
	        self._nc.computeAsymetricKeys(serverNonce.buffer(), rtmfp.createClientNonce(self._nc.certificate));
	        self.setState(FlNetConnection.S_CONNECTING);
	        self.clientConnectionId = msg.connectionId;

	        logger.debug(self._port, 'Connection established, ready to loop through.');

	        msg.type = RTMFP.NET_CONNECTION_REQUEST;
	        msg.url = self.url;
	        msg.app = APP_NAME;
	        var pkt = new Packet(300);
	        rtmfp.writePacket(pkt, msg);

	        self._sendEncrypt(pkt);
	        break;

		case RTMFP.COMMAND:
//			if(msg.commandName == '_result'){
//				logger.debug("command result");
//			}
			self.emit('command', self, msg.commandName, msg.commandHandle, msg.commandData);
			break;

		case 23: //rendezvouz_response
			self.emit('rendezvouz_response', self, msg);
			break;

		case 100: // NET_CONNECTION_ADDRESSES_RESPONSE
//			msg.commandName = "foo";
//			msg.commandData = ["test message"];
//			self.send_COMMAND(msg);
		case RTMFP.ACK:
			var pkt = new Packet(64);
			pkt.pos(6);
			pkt.writeInt8(0x0D);
			pkt.writeInt16(rtmfp._timeNow());
			pkt.writeInt16(msg.echoTime);
			rtmfp.writeAck(pkt, msg.sequence, msg.stage, false);
//			rtmfp.writePacket(pkt, msg);
			self._sendEncrypt(pkt);

			if(self.state == FlNetConnection.S_CONNECTING){
				self.send_CONNECTION_ADDRESS(msg);
				self.setState(FlNetConnection.S_CONNECTED);

				self.emit('connect', self);
			}
			break;

		default:
			logger.warn('Unhandle message', msg.type);
			break;
		}
	});
};

FlNetConnection.prototype.flcall = function(name, data){
	var msg = {commandName: name, commandData: data};
	this.send_COMMAND(msg);
};

FlNetConnection.prototype.connectPeer = function(peerid){
	this.connectingPeer = peerid;
	if(typeof peerid === typeof ''){
		peerid = deformatPeerID(peerid);
	}
	this.send_RENDEZVOUZ({peerid: peerid});
};

FlNetConnection.prototype.send_RENDEZVOUZ = function(request){
	var pkt = new Packet(new Buffer(255), 0);
	pkt.pos(6);
	pkt.writeInt8(0x0B);
	pkt.writeInt16(rtmfp._timeNow());

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
	rtmfp.encryptPacket(pkt, RTMFP.SYMETRIC_KEY);
//	logger.debug("My tag -1: \n" + Packet.prettyBuffer(tag));
	rtmfp.encodePacket(pkt, 0);
	send(this.socket, pkt, this.endpoint);
};

FlNetConnection.prototype.send_COMMAND = function(msg){
	var pkt = new Packet(new Buffer(255), 0);
	pkt.pos(6);
	pkt.writeInt8(0x8D);
	pkt.writeInt16(rtmfp._timeNow());
	pkt.writeInt16(msg.sendTime);

	pkt.writeInt8(0x10); // RPC
	var sizePos = pkt.pos();
	pkt.skip(2); // size placeholder

	pkt.writeInt8(0x00); // flag
	pkt.writeInt8(0x02); // sequence
	pkt.writeInt8(0x02); // stage
	pkt.writeInt8(0x01); // delta

	pkt.writeBytes([0x11, 0x00, 0x00, 0x00, 0x2D, 0x00]); //unknown, copy from flash dump
	AMF0.writeString(pkt, msg.commandName);
	pkt.writeBytes([0, 64, 0, 0, 0, 0, 0, 0, 0]); // a double number, (1.3580773062177743e-312,), dump from flash
	AMF0.writeNull(pkt);

	AMF0.writeObject(pkt, msg.commandData);
	writeSize(pkt, sizePos, pkt.size() - sizePos - 2);

	this._sendEncrypt(pkt);
};

FlNetConnection.prototype.send_CONNECTION_ADDRESS = function(msg){
	var pkt = new Packet(new Buffer(255), 0);
	pkt.pos(6);
	pkt.writeInt8(0x8D);
	pkt.writeInt16(rtmfp._timeNow());
	pkt.writeInt16(msg.echoTime);
	pkt.writeInt8(0x10); //type

	var pk = new Packet(new Buffer(255), 0);
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
	ipaddr = this._address + ":" + this._port.toString();
	pk.writeBytes([0x02]);
	pk.writeInt8(0);
	pk.writeInt8(ipaddr.length);
	pk.writeBuffer(new Buffer(ipaddr));

	var size = pk.size();
	pk.pos(0);
	pkt.writeInt8(0);
	pkt.writeInt8(size);
	pkt.writeBuffer(pk.readBytes(size, false));

	this._sendEncrypt(pkt);
};

FlNetConnection.prototype._sendEncrypt = function(pkt){
	rtmfp.encryptPacket(pkt, this._nc.__p.encryptKey);
	rtmfp.encodePacket(pkt, this.clientConnectionId);
	send(this.socket, pkt, this.endpoint);
};

FlNetConnection.prototype.setState = function(state){
	this.state = state;
};

FlNetConnection.prototype.connect = function(address, port){
	if(this.state != FlNetConnection.S_LISTENING) return;
	this.tag = Packet.randomBytes(16, new Buffer(16), 0);
	if(address && port){
		this.endpoint.address = address;
		this.endpoint.port = port;
		this.url = 'rtmfp://' + this.endpoint.address + '/';
	}
	var message = {
			type: RTMFP.HANDSHAKE_REQUEST,
			url: this.url,
			tag: this.tag
	};

	console.log('before send connect');
	var pkt = new Packet(64);


	rtmfp.writePacket(pkt, message);
//	logger.debug(pkt.toString());
	rtmfp.encryptPacket(pkt, RTMFP.SYMETRIC_KEY);
	rtmfp.encodePacket(pkt, 0);
	send(this.socket, pkt, this.endpoint);

};

FlNetConnection.setLogger = function(log){
	logger = log;
};

// Reserved first 128 numbers [0-127] for NetConnection
FlNetConnection.S_UNINIT = 0x80;    //128
FlNetConnection.S_INIT = 0x81;      //129
FlNetConnection.S_LISTENING = 0x82; //130
FlNetConnection.S_HANDSHAKE = 0x83; //131
FlNetConnection.S_CONNECTING = 0x84;//132
FlNetConnection.S_CONNECTED = 0x85; //133

module.exports = FlNetConnection;

