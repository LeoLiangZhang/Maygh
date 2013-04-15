//#import flash.interop.js

function FlashConnection(bridge){
	bridge.shadow(this, "net.FlashConnection");
}

extend(FlashConnection.prototype,
		EventListenerMixin,
		Binder.BindingMixin,
		Binder.shadowMethods(["getProperty", "setProperty"]),
		Binder.wrappedMethods(["connect", "close", "addHeader"]));

FlashConnection.prototype.remoteCall = function(command, responder){
	var ref = null;
	if(responder){
		ref = this.binder.bridge.register(responder);
	}
	var args = toArray(arguments, 2);
	this.binder.flcall('remoteCall', command, ref, args);
};

FlashConnection.prototype.createStream = function(peerID){
	var stream = new FlashStream(this.binder.bridge);

	// Bound this NetStream with given remote_ref FlashConnection
	stream.initConnection(this.binder.remote_ref, peerID);
	return stream;
};


function Responder(){
	this.result = function(){};
	this.status = function(){};
}

function FlashStream(bridge){
	bridge.shadow(this, 'net.FlashStream');
}

extend(FlashStream.prototype,
		EventListenerMixin,
		Binder.BindingMixin,
		Binder.shadowMethods(["getProperty", "setProperty",
		                      "initConnection", "addClientHandler"]),
		Binder.wrappedMethods(["play", "publish", "send",
		                       "appendBytes", "appendBytesAction", "close"]));

FlashStream.prototype._createStream = function(){
	var stream = new FlashStream(this.binder.bridge);
	return stream.binder.remote_ref;
};

FlashStream.prototype._onPeerConnect = function(fs_ref){
	var flashstream = this.binder.bridge.getObject(fs_ref);
	return this.onPeerConnect(flashstream);
};

FlashStream.prototype.onPeerConnect = function(flashstream){
	return true;
};


function FlashLocalConnection(bridge){
	bridge.shadow(this, 'net.FlashLocalConnection');
}

extend(FlashLocalConnection.prototype,
		EventListenerMixin,
		Binder.BindingMixin,
		Binder.shadowMethods(["getProperty", "setProperty", "addClientHandler"]),
		Binder.wrappedMethods(["allowDomain", "allowInsecureDomain", "close",
		                       "connect", "send"]));

FlashLocalConnection.onstatus = function(evt){//evt:{code:String, status:String}

};


