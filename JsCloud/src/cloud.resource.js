//#import util.lang.js
//#import flash.js

function NetLoader(bridge){
	this.bridge = bridge;
}

NetLoader.prototype.load = function(){

};

function Loading(key, url, callback){
	this.key = key;
	this.url = url;
	this.callback = callback;
	this.status = 'init';// wait_server|wait_peer|error|done
	this.peer = '';
	this.tick = 0; // count down counter
	this.data = null;
}
Loading.INIT = 'init';
Loading.WAIT_SERVER = 'wait_server';
Loading.WAIT_PEER = 'wait_peer';
Loading.ERROR = 'error';
Loading.DONE = 'done';


function CachePool(){
	this._cache = new LRUStorage();
}

extend(CachePool.prototype,
		EventListenerMixin);

CachePool.prototype.get = function(key){
	return this._cache.getItem(key);
};

CachePool.prototype.set = function(key, value){
	var oldkeys = this.keys();
	this._cache.setItem(key, value);
	var newkeys = this.keys();
	var evt = {pool: this, oldkeys:oldkeys, newkeys:newkeys, key:key, value:value};
	this.dispatchEvent('update', evt);
};

CachePool.prototype.keys = function(){
	return this._cache.itemList();
};

CachePool.prototype.onupdate = function(){};


function guessMimeType(filename) {
	var type = "image/jpeg";
	if (filename.match(/.jpg$/i)) type = "image/jpeg";
	else if (filename.match(/.jpeg$/i)) type = "image/jpeg";
	else if (filename.match(/.gif$/i)) type = "image/gif";
	else if (filename.match(/.png$/i)) type = "image/png";
	else {
//		log.warn("Warning: Unable to determine content type of " + filename);
		type = "application/x-binary";
	}
	return type;
}

function PeerLoader(bridge){
	var self = this;
	this.pm = new FlashPeerManager(bridge);
	this.pm.addEventListener('connected', function(connection){
		log.info('Connected to server', self.pm.nearID);
	});
	this.msgr = new FlashPeerMessenger(this.pm);
	this.msgr.addEventListener('message', function(sender){
		var evt = sender.msg;
		var cmd = evt.cmd;
		log.debug('onPeerMessage', cmd);
		if(cmd == 'requestPeerItem'){
			var item = evt.item;
			var data = self.cachepool.get(item);
			self.msgr.send(sender.farID,
					{cmd:'responsePeerItem', data: data, item: item}, null);
		}
		if(cmd == 'responsePeerItem'){
			var key = evt.item;
			var datauri = evt.data;
			self.cachepool.set(key, datauri);
		}
	});

	this.loading_list = [];
	this.cachepool = new CachePool();
	this.cachepool.addEventListener('update', function(evt){
		var oldkeys = evt.oldkeys;
		var newkeys = evt.newkeys;
		var key = evt.key;

		// Load DONE
		var lst = [];
		var calllst = [];
		self.loading_list.forEach(function(loading){
			if(loading.key == key){
				loading.data = evt.value;
				loading.status = Loading.DONE;
				calllst.push(loading);
			}else{
				lst.push(loading);
			}
		}, self);
		self.loading_list = lst;
		calllst.forEach(function(loading){
			self._loading_callback(loading);
		}, this);

		self.sendCacheList(oldkeys, newkeys);

	});
}

PeerLoader.prototype._loading_callback = function(loading){
	if(loading.callback){
		try{
			loading.callback(loading);
		} catch(e){
			log.error('Caught an error while executing loading.callback().', e);
		}
	}
};

PeerLoader.prototype.sendCacheList = function(oldkeys, newkeys){
	var self = this;
	if(!oldkeys && !newkeys){
		oldkeys = []; newkeys = self.cachepool.keys();
	}
	function _processItemList(oldItems, newItems){

		items = newItems;

		var adds = [];
		var dels = [];
		var tmp = {};
		oldItems.forEach(function(elm, idx, arr){
			tmp[elm] = true;
		});
		items.forEach(function(elm, idx, arr){
			if(!elm) return;
			if(elm in tmp) {
				delete tmp[elm];
				return;
			} else {
				adds.push(elm);
			}
		});
		dels = Object.keys(tmp);

		_sendItems('addItems', adds);
		_sendItems('removeItems', dels);

	}

	function _sendItems(cmdname, items){
		if(!items || items.length == 0 ) return;

		var lst = items.slice(0);
		var k = lst.length;

		while(lst.length != 0){
			var itms = lst.slice(0, k);
			var s = itms.join('","');
			if(s.length > 1000){
				k = k / 2;
				if(k == 0) throw new Error("ERROR_FILENAME_TOO_LONG", lst);
				continue;
			}

			var cmd = {cmd: cmdname, items: itms};
			_sendJsonMsg(cmdname, cmd);

			lst = lst.slice(k);
			k = lst.length;
		}
	}

	function _sendJsonMsg(cmdname, obj){
		var cmd = JSON.stringify(obj);
		self.remoteCall(cmdname, null, cmd);
	}
	_processItemList(oldkeys, newkeys);
};

PeerLoader.prototype.connect = function(serverAddress){
	this.pm.connectServer(serverAddress);
};

PeerLoader.prototype.remoteCall = function(cmd, responder, obj){
	this.pm.connection.remoteCall(cmd, responder, obj);
};

PeerLoader.prototype.requestPeerItem = function(peerid, key){
	this.msgr.send(peerid, {cmd:'requestPeerItem', item:key}, null);
};

PeerLoader.prototype.process = function(){
	var self = this;
	var lst = [];
	var calllst = [];
	this.loading_list.forEach(function(loading){
		if(loading.status == Loading.INIT){
			var key  = loading.key;
			var item = key;

			var data = self.cachepool.get(key);
			if(data){
				loading.data = data;
				loading.status = Loading.DONE;
				calllst.push(loading);
				return;
			}

			var responder = new Responder();
			responder.result = function(result){
//				log_time('get back from server', result.item);
				log.debug('requestItem_responder_result', result.cmd, result.item, result.peerid);

				if(result.cmd == 'requestItem'){

					if(!result.peerid){
						self.loadOrigin(result.item);
						return;
					}
//					console.log('requestItem', result.item, result.peerid);
					loading.status = Loading.WAIT_PEER;
					self.requestPeerItem(result.peerid, key);
				}
			};
			responder.status = function(){
				// TODO: handle error
				log.debug('requestItem_responder_status', arguments);
				// call load_fail
			};
//			log_time('start request server', item);
			self.remoteCall('requestItem', responder, {cmd: 'requestItem', item: item});
			loading.status = Loading.WAIT_SERVER;
		};
		lst.push(loading);
	}, this);
	self.loading_list = lst;
	calllst.forEach(function(loading){
		self._loading_callback(loading);
	}, this);
};

PeerLoader.prototype._load_fail = function(key){
	var self = this;
	var lst = [];
	var calllst = [];
	self.loading_list.forEach(function(loading){
		if(loading.key == key){
			loading.status = Loading.ERROR;
			calllst.push(loading);
		}else{
			lst.push(loading);
		}
	}, self);
	self.loading_list = lst;
	calllst.forEach(function(loading){
		_loading_callback(loading);
	}, this);
};

PeerLoader.prototype.loadOrigin = function(item){
	var self = this;
	var xhr = new XMLHttpRequest();
	xhr.open('GET', item, true);
	xhr.overrideMimeType('text/plain; charset=x-user-defined');
	xhr.onreadystatechange = (function (){
		return function (aEvt) {
			if (xhr.readyState == 4) {
				if(xhr.status == 200){
					var txt = xhr.responseText;
					var b64_txt = Base64.encode(txt);
					var mime = guessMimeType(item);
					var datauri = 'data:' + mime + ';base64,' + b64_txt;
					self.cachepool.set(item, datauri);
				}
				else{
					log.error('Error', xhr.statusText);
					self._load_fail(item);
				};
			};
		};
	})();
	xhr.send(null);
};

PeerLoader.prototype.load = function(loading){
	this.loading_list.push(loading);
	this.process();
};