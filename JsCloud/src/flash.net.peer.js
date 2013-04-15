//#import util.js
//#import flash.net.js

P2PStreamPrefix = 'media_';
MessageHandlerName = 'message';

function FlashPeer(connection){
	this.connection = connection;
	this.neerID = connection.getProperty('nearID');
	this.farID = "";
	this.inStream = null;
	this.outStream = null;
	this.connected = false;
	this.outStreamPublish = '';
	this.inStreamPublish = '';
	this.connected = false;
};

extend(FlashPeer.prototype,
		EventListenerMixin);

FlashPeer.prototype.connect = function(farID){
	if(this.farID != '') throw new Error('FlashPeer: Cannot connect to another peer.');
	this._connect(farID);
};

FlashPeer.prototype._connect = function(farID){
	var self = this;
	this.farID = farID;
	this.outStreamPublish = P2PStreamPrefix+this.neerID+"_"+this.farID;
	this.inStreamPublish = P2PStreamPrefix+this.farID+"_"+this.neerID;

	var has_outStream_onPeerConnect_happened = false;
	this.outStream = this.connection.createStream("directConnections");
	this.outStream.addEventListener("netStatus", function(evt){
		log.debug("outStream Event", evt);
		if(evt.code == "NetStream.Play.Start"
			|| evt.code == "NetStream.Publish.Start"
				){
			if(has_outStream_onPeerConnect_happened)
				self._streamConnected(self.outStream);
		} else {
		}
	});
	this.outStream.onPeerConnect = function(){
		log.debug("OUTSTREAM_onPeerConnect");
		has_outStream_onPeerConnect_happened = true;
//		self._streamConnected(self.outStream);
		return true;
	};

	this.inStream = this.connection.createStream(farID);
	this.inStream.addEventListener("netStatus", function(evt){
		log.debug("inStream Event", evt);
		if(evt.code == "NetStream.Play.Start" ||
				evt.code == 'NetStream.Play.PublishNotify'){
			self._streamConnected(self.inStream);
		} else {
		}
	});
	this.inStream.addClientHandler(MessageHandlerName);
	this.inStream[MessageHandlerName] = function(data){
		self.dispatchEvent('message', data);
	};
	this.inStream.onPeerConnect = function(){
		log.debug("INSTREAM_onPeerConnect");
		self._streamConnected(self.inStream);
		return true;
	};

	this.outStream.publish(this.outStreamPublish);
	this.inStream.play(this.inStreamPublish);
};

FlashPeer.prototype._streamConnected = function(stream){
	var whichone = '';
	if(stream == this.outStream) whichone = 'outStream';
	if(stream == this.inStream) whichone = 'inStream';
	log.debug('INVOKE_streamConnected_BEGIN', whichone);

	stream.__FlashPeer_connected = true;
	if(this.inStream.__FlashPeer_connected &&
			this.outStream.__FlashPeer_connected){
		if(!this.connected){
			log.debug('INVOKE_streamConnected_CONNECTED', whichone);
			this.connected = true;
			this.dispatchEvent('connected', this.farID);
		}
	}
};

FlashPeer.prototype.send = function(msg){
	this.outStream.send(MessageHandlerName, msg);
};

// Events
FlashPeer.prototype.onconnected = function(){};
FlashPeer.prototype.onmessage = function(){};


function FlashPeerManager(bridge){
	var self = this;
	this.connected = false;
	this.bridge = bridge;
	this.connection = new FlashConnection(this.bridge);
	this.connection.addEventListener('netStatus', function(evt){
		if(evt.code == 'NetConnection.Connect.Success'){
			self.connected = true;
			self._publishListeningStream();
			self.dispatchEvent('connected', self.connection);
		} else {
			log.debug("ConnectionNetStatus", evt);
		}
	});
	this.nearID = '';
	this.peers = {}; //connected peers
	this.pubStream = null;
	this.connectingPeers = {}; //
};

extend(FlashPeerManager.prototype,
		EventListenerMixin);

FlashPeerManager.prototype._publishListeningStream = function(){
	var connection = this.connection;
	var self = this;
	var nearID = connection.getProperty('nearID');
	this.nearID = nearID;
	this.pubStream = connection.createStream("directConnections");
	this.pubStream.addEventListener('netStatus', function(evt){
		log.debug('pubStream', evt); // Waiting for connecting peers.
	});
	this.pubStream.onPeerConnect = function(_stream){
		var farID = _stream.getProperty('farID');
		log.debug('pubStream onPeerConnect', farID);
		self._createPeer(farID);
		return false;
	};
	this.pubStream.publish(P2PStreamPrefix+nearID);
};

FlashPeerManager.prototype._createPeer = function(farID){
	var self = this;
	var peer = new FlashPeer(self.connection);
	peer.addEventListener('connected', function(evt){
		log.debug('FlashPeerManager_peer_CONNECTED', farID);
		delete self.connectingPeers[farID];
		self.peers[farID] = peer;
		self.dispatchEvent('peerConnected', peer);
	});
	peer.addEventListener('message', function(data){
		self.dispatchEvent('peerMessage', {data:data, peer:peer});
	});
	self.connectingPeers[farID] = peer;
	peer.connect(farID);
	return peer;
};

FlashPeerManager.prototype.connected = function(){
	return this.connection.getProperty('connected');
};

FlashPeerManager.prototype.connectServer = function(command){
	// Flash NetConnection.connect()
	// public function connect(command:String, ... arguments):void
	this.connection.connect(command);
};

FlashPeerManager.prototype.connectPeer = function(farID){
	if(this.connectingPeers[farID] || this.peers[farID]) return;

	this._createPeer(farID);
	// Probe stream, inform farID peer that this peer is going to connect.
	var probeStream = this.connection.createStream(farID);
	probeStream.addEventListener('netStatus', function(evt){
		log.debug('probeStream', evt);
	});
	probeStream.play(P2PStreamPrefix+farID);
};

FlashPeerManager.prototype.hasConnectedPeer = function(farID){
	return farID in this.peers;
};

FlashPeerManager.prototype.send = function(farID, msg){
	if(farID == this.nearID) throw new Error('FlashPeerManager cannot send message to self.');
	var peer = this.peers[farID];
	if(peer){
		peer.send(msg);
		return true;
	}
	return false;
};

FlashPeerManager.prototype.onconnected = function(){};
FlashPeerManager.prototype.onpeerMessage = function(){};
FlashPeerManager.prototype.onpeerConnected = function(){};

