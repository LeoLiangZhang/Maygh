//#import util.js
//#import flash.net.js
//#import flash.net.peer.js

/**
 * A high level Flash P2P Messenger.
 *
 * It automatically connects to new peer, and buffer unsent messages. Resume
 * sending when peer connection established.
 */
function FlashPeerMessenger(manager){
	this.manager = null;
	this.sending_buffer = [];

	if(manager)
		this.init(manager);
}

extend(FlashPeerMessenger.prototype,
		EventListenerMixin);

FlashPeerMessenger.prototype.init = function(manager){
	if(!manager) throw new Error("FlashPeerMessenger cannot init with null object.");
	if(this.manager) throw new Error("FlashPeerMessenger cannot be re-init.");

	var self = this;
	this.manager = manager;
	var _wrapped_processSending = function(){
		self._processSending();
	};
	this.manager.addEventListener('connected', _wrapped_processSending);
	this.manager.addEventListener('peerConnected', _wrapped_processSending);
	this.manager.addEventListener('peerMessage', function(evt){
		var receiving = {farID: evt.peer.farID, msg: evt.data, _evt:evt};
		self.dispatchEvent('message', receiving);
	});
	self._processSending();
};

FlashPeerMessenger.prototype._processSending = function(){
	if(!(this.ready() && this.manager.connected)) return;

	var lst = [];
	this.sending_buffer.forEach(function(sendmsg){
		var farID = sendmsg.farID;
		var msg = sendmsg.msg;
		var callback = sendmsg.callback;
		if(!this.manager.hasConnectedPeer(farID)){
			lst.push(sendmsg);
			this.manager.connectPeer(farID);
		} else {
			log.debug('FlashPeerMessenger_send', farID);
			this.manager.send(farID, msg);
			try{
				if(callback)
					callback(sendmsg);
			} catch (e){
				log.error("FlashPeerMessenger caught an error on invoking after sending callback.", e);
			}
		}
	}, this);
	this.sending_buffer = lst;
};

/**
 * Return true if FlashPeerMessenger has initialed with FlashPeerManager.
 */
FlashPeerMessenger.prototype.ready = function(){
	return this.manager ? true : false;
};

FlashPeerMessenger.prototype.send = function(farID, msg, callback){
	var sendmsg = {farID: farID, msg: msg, callback: callback};
	this.sending_buffer.push(sendmsg);
	this._processSending();
	return sendmsg;
};

FlashPeerMessenger.prototype.onmessage = function(evt){};


/*
 * FlashLocalMessenger
 * - packet(packet: Packet):void
 * - open(endpoint: String):void throws Error #if endpoint is occupied
 * - close():void
 * - send(endpoint: String, message: String, callback): void
 * - onmessage(msg: Message):void
 *
 * Message
 * - from: String
 * - to  : String
 * - data: String
 *
 * Packet
 * - from: String
 * - to  : String
 * - type: PacketTypeEnum
 *  + MessageBegin
 *  + MessageEnd
 *  + Ack
 * - ref : int  # reference counter
 * - data: string # payload, only string is supported at the moment.
 *
 */

function FlashLocalMessenger(bridge){
	var self = this;
	this.bridge = bridge;
	this.lc = null; // create when call open
	this.lc = new FlashLocalConnection(this.bridge);
	this.lc.addClientHandler(FlashLocalMessenger.PACKET);
	this.lc.addEventListener(function(evt){self._status(evt);});
	this.lc.packet = (function(pkt){self.packet(pkt);});
	this.endpoint = '';

	this.message_queue = [];
	this.senderWindow = new SenderWindow(this);
	this.recvWindow = new RecvWindow(this);
}

extend(FlashLocalMessenger.prototype,
		EventListenerMixin);

FlashLocalMessenger.SEND_LIMIT = 10240;
// There is a 40 kilobyte limit to the amount of data you can pass as
// parameters to this command.
// http://help.adobe.com/en_US/FlashPlatform/reference/actionscript/3/flash/net/LocalConnection.html
FlashLocalMessenger.MSG_MSG = "MSG_MSG";
FlashLocalMessenger.MSG_END = "MSG_END";
FlashLocalMessenger.MSG_ACK = "MSG_ACK";
FlashLocalMessenger.PACKET = 'packet';

FlashLocalMessenger.prototype._status = function(evt){
	if(evt.level == 'error'){
		if(this.senderWindow.message.callback){
			var pkt = this.senderWindow.pkt;
			var evt = {from: pkt.from, to: pkt.to, content:
				this.senderWindow.message.content,
				status: 'error'};
			this.senderWindow.message.callback(evt); // TODO: try_catch
		}
		this.senderWindow.clear();
		this._send();
	}
};

FlashLocalMessenger.prototype.packet = function(pkt){
	if(pkt.type == FlashLocalMessenger.MSG_ACK){
		this._send();
	} else {
		var _pkt = this.recvWindow.recv(pkt);
		this.lc.send(_pkt.to, FlashLocalMessenger.PACKET, _pkt);
	}
};

FlashLocalMessenger.prototype.open = function(endpoint){
	this.lc.connect(endpoint);
	this.endpoint = endpoint;
};

FlashLocalMessenger.prototype.close = function(){
	this.lc.close();
	this.endpoint = '';
};

FlashLocalMessenger.prototype.send = function(endpoint, content, callback){
	if(this.endpoint == '') throw new Error('The connection is not open.');
	var sendingMsg = new SendingMessage(endpoint, content, callback);
	this.message_queue.push(sendingMsg);
	this._send();
	return sendingMsg;
};

FlashLocalMessenger.prototype._send = function(){
	var pkt = null;
	if(this.senderWindow.message){
		pkt = this.senderWindow.nextPkt();
		if(pkt == null){
			this.senderWindow.message = null;
		}
	}

	if(this.message_queue.length > 0 && this.senderWindow.message == null){
		pkt = this.senderWindow.nextPkt(this.message_queue.shift());
	}
	if(this.senderWindow.message == null) {
		// finished sending
		return;
	}

	this.lc.send(pkt.to, FlashLocalMessenger.PACKET, pkt); // TODO: refact send
};

FlashLocalMessenger.prototype.onmessage = function(){

};

function SendingMessage(endpoint, content, callback){
	this.endpoint = endpoint;
	this.content = content;
	this.callback = callback;
}

function SenderWindow(messenger){
	this.messenger = messenger;
	this.message = null;
	this.pkt = null;
	this.pkt_offset = 0;
	this.pkt_length = 0;
	this.ref = 0;
}

SenderWindow.prototype.nextPkt = function(message){
	if(message){
		this.message = message;
		this.pkt_offset = 0;
		var len = message.content.length;
		this.pkt_length = len <= FlashLocalMessenger.SEND_LIMIT ? len : FlashLocalMessenger.SEND_LIMIT;
	} else {
		var len = this.message.content.length;
		if(this.pkt_offset + this.pkt_length >= len){
			if(this.message.callback){
				var pkt = this.pkt;
				var evt = {from: pkt.from, to: pkt.to, content:
					this.message.content,
					status: 'DONE'};
				this.message.callback(evt); // TODO: try_catch
			}
			return null;
		} else {
			this.pkt_offset += this.pkt_length;
			this.pkt_length = this.pkt_offset + FlashLocalMessenger.SEND_LIMIT <= len ?
					FlashLocalMessenger.SEND_LIMIT : len - this.pkt_offset;
		}
	}
	var _type = (this.pkt_offset + this.pkt_length) == this.message.content.length ?
			FlashLocalMessenger.MSG_END : FlashLocalMessenger.MSG_MSG;
	var data = this.message.content.substr(this.pkt_offset, this.pkt_length);
	this.pkt = {
			from: this.messenger.endpoint,
			to: this.message.endpoint,
			type: _type,
			data: data,
			ref : this.nextRef()
	};
	return this.pkt;
};

SenderWindow.prototype.clear = function(){
	this.message == null;
};

SenderWindow.prototype.nextRef = function(){
	this.ref = SenderWindow.next_ref(this.ref);
	return this.ref;
};

SenderWindow.MAX_REF_COUNT = 65535;

SenderWindow.next_ref = function(ref){
	return (ref + 1) % SenderWindow.MAX_REF_COUNT;
};


function RecvWindow(messenger){
	this.messenger = messenger;
	this.buffers = {};
}

RecvWindow.prototype.recv = function(pkt){
	if(this.messenger.endpoint != pkt.to) throw new Error('Endpoint assert fail.');
	var buffer = this.buffers[pkt.from];
	if(!buffer){
		buffer = new RecvWindowBuffer(this.messenger, pkt.from);
		this.buffers[pkt.from] = buffer;
	}
	return buffer.recv(pkt);
};

function RecvWindowBuffer(messenger, from){
	this.messenger = messenger;
	this.from = from;
	this.ref = 0;
	this.buf = [];
}

RecvWindowBuffer.prototype.recv = function(pkt){
	this.ref = SenderWindow.next_ref(pkt.ref);
	this.buf.push(pkt.data);
	if(pkt.type == FlashLocalMessenger.MSG_END){
		var evt = {from: pkt.from, to:pkt.to,
				content: this.buf.join(''), status: 'OK'};
		this.messenger.dispatchEvent('message', evt);
		this.buf = [];
	}
	return {
		from: pkt.to,
		to: pkt.from,
		type: FlashLocalMessenger.MSG_ACK,
		data: '',
		ref: this.ref
		};
};



