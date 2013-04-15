var CHelper = require('./build/default/chelper.node').CHelper;
var chelper = new CHelper();
var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var Net = require('net');

function now(){
	return chelper.now();
}

var _string_256 =
	[
	 "00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0A", "0B", "0C", "0D", "0E", "0F",
	 "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "1A", "1B", "1C", "1D", "1E", "1F",
	 "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2A", "2B", "2C", "2D", "2E", "2F",
	 "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "3A", "3B", "3C", "3D", "3E", "3F",
	 "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "4A", "4B", "4C", "4D", "4E", "4F",
	 "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "5A", "5B", "5C", "5D", "5E", "5F",
	 "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "6A", "6B", "6C", "6D", "6E", "6F",
	 "70", "71", "72", "73", "74", "75", "76", "77", "78", "79", "7A", "7B", "7C", "7D", "7E", "7F",
	 "80", "81", "82", "83", "84", "85", "86", "87", "88", "89", "8A", "8B", "8C", "8D", "8E", "8F",
	 "90", "91", "92", "93", "94", "95", "96", "97", "98", "99", "9A", "9B", "9C", "9D", "9E", "9F",
	 "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "AA", "AB", "AC", "AD", "AE", "AF",
	 "B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "BA", "BB", "BC", "BD", "BE", "BF",
	 "C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "CA", "CB", "CC", "CD", "CE", "CF",
	 "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "DA", "DB", "DC", "DD", "DE", "DF",
	 "E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "EA", "EB", "EC", "ED", "EE", "EF",
	 "F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "FA", "FB", "FC", "FD", "FE", "FF"
	];

var formatPeerID = function(lst){
	var str = [];
	for(var i = 0; i < lst.length; i ++){
		str.push(_string_256[lst[i]]);
	}
	return str.join('').toLowerCase() ;
};
var deformatPeerID = function(txt){
//	logger.debug("deformating peerid: "+txt);
	var bytes = [];
	for(var i = 0; i < txt.length; i += 2){
		var t = txt.substr(i, 2);
		bytes.push(parseInt(t, 16));
	}
	return bytes;
};

/**
 * Parser arguments array
 * @param {Array} args optional arguments arrray.
 * @return {Object} opts key value hash.
 * @export
 */
var parse = function(args) {
    // args is optional, default is process.argv
    args = args || process.argv;

    var opts = {}, curSwitch;

    args.forEach(function(arg) {
        // its a switch
        if (/^(-|--)/.test(arg) || !curSwitch) {
            opts[arg] = true;
            curSwitch = arg;
        // this arg is a data
        } else {
            if (arg === 'false') {
                arg = false;
            } else if (arg === 'true') {
                arg = true;
            } else if (!isNaN(arg)) {
                arg = Number(arg);
            }

            // it was a boolean switch per default,
            // now it has got a val
            if (typeof opts[curSwitch] === 'boolean') {
                opts[curSwitch] = arg;
            } else if (Array.isArray(opts[curSwitch])) {
                opts[curSwitch].push(arg);
            } else {
                opts[curSwitch] = [opts[curSwitch], arg];
            }
        }
    });

    return opts;
};

var updateSettings = function (set0, set1){
	for (var key in set1){
		set0[key] = set1[key];
	}
	return set0;
};

var Messenger = function(){
	this.sockets = {};
	this.name = '';

	this.sock_unix = null; // my listening socket
	this.sock_tcp = null;

};

Messenger.prototype.__proto__ = EventEmitter.prototype;

Messenger.prototype.loadConfig = function(name, config){
	if(!name) throw new Error("Messenger name must be set.");
//	var oldUmask = process.umask(0000);
	this.name = name;
	var self = this;
	for(var i = 0; i < config.length; i++){
		var m = config[i];
		if(m.name == name){ // config myself
			var onconnect = function(sock){
				self.initSocket(sock);
				var buf = self.encodeMsg(self.name);
				self._send(sock, buf);
			};
			this.sock_unix = Net.createServer(onconnect);
			this.sock_tcp =  Net.createServer(onconnect);
			this.sock_unix.listen(m.path);
			this.sock_tcp.listen(m.port);
			break;
		} else {
			this.connectServer(m);
		}
	}
};

Messenger.prototype.connectServer = function(server){
	if(server.name in this.sockets) return;

	var self = this;
	var sock = null;
	var onerror = function(e){
		if(sock.type == 'unix'){
			sock.destroy();
			sock = Net.createConnection(server.port, server.host, onconnect);
			sock.on('error', onerror);
		} else {
//			console.error(self.name, 'Connect to Messenger', server.name, "error:", arguments, e.stack(), sock);
		}
	};
	var onconnect = function(){
		console.log('on connect');
		sock.removeListener('error', onerror);
		self.initSocket(sock);
		var buf = self.encodeMsg(self.name);
		self._send(sock, buf);
	};

	// try unix sock first
	sock = Net.createConnection(server.path, onconnect);

	sock.on('error', onerror);
};

Messenger.prototype.initSocket = function(sock){
	var name = '__undefined__';
	if(sock){
		var self = this;
		sock.name = name;

		var bufs = {};
		bufs.msg_buf = null;
		bufs.msg_ptr = 0;
		bufs.len_buf = new Buffer(4);
		bufs.len_ptr = 0; // indicate if is waiting for last few bytes that tells the length of the message.
		sock.bufs = bufs;

		sock.on('error', function(e){
			self.onerror(sock, e);
		});
		sock.on('close', function(e){
			console.warn(self.name, 'Server Socket Close', sock.name);
			process.exit(1);
		});
		sock.on('data', function(e){
			self.ondata(sock, e);
		});
		var _onmsg = function(msg){
			name = msg;
			self.sockets[name] = sock;
			sock.name = name;
			sock.removeListener('message', _onmsg);
			console.log(self.name, 'Server Socket', sock.type, 'Connected', name);
		};
		sock.on('message', _onmsg);

	}
};

Messenger.prototype.onerror = function(sender, e){
	this.emit("error", sender, e);
};

Messenger.prototype.ondata = function(sender, data){
	this._readmsg(sender, data);
	this.emit('data', sender, data);
};

Messenger.prototype.onmessage = function(sender, msg){
//	console.error(now(), 'onmessage', msg);
	this.emit('message', sender, msg);
	sender.emit('message', msg);
};

Messenger.prototype._readbuf = function(data, dataptr, buf, ptr){
	var need = buf.length - ptr;
	var avlb = data.length - dataptr;
	assert.ok(need >= 0 && avlb >= 0, "Read buffer or write buffer size error");
	var len = avlb >= need ? need : avlb; // available to read
	data.copy(buf, ptr, dataptr, dataptr + len);
//	console.error(now(), '_readbuf', "data(len, ptr)", data.length, dataptr, "expecting(len, ptr)", buf.length, ptr, "read", len);
	return len;
};

Messenger.prototype._readmsg = function(sender, data){

	// data MUST be a Buffer object
	var dataptr = 0;
	var bufs = sender.bufs;

	while(dataptr < data.length){
		if(bufs.msg_buf == null){
			var len = this._readbuf(data, dataptr, bufs.len_buf, bufs.len_ptr);
			dataptr += len;
			bufs.len_ptr += len;
			if(bufs.len_ptr == bufs.len_buf.length){
				var mlen = bufs.len_buf.readUInt32(0, 'big');
				bufs.len_ptr = 0;
				// setup msg buffer
				bufs.msg_buf = new Buffer(mlen);
				bufs.msg_ptr = 0;
			}
		} else { // buffer has initialized
			var len = this._readbuf(data, dataptr, bufs.msg_buf, bufs.msg_ptr);
			dataptr += len;
			bufs.msg_ptr += len;
			if(bufs.msg_ptr == bufs.msg_buf.length){
				var msg = bufs.msg_buf.toString('utf8');
				this.onmessage(sender, msg);
				bufs.msg_buf = null;
			}
		}
	}

};

Messenger.prototype.encodeMsg = function(msg){
	var str_msg = typeof msg == typeof '' ? msg : JSON.stringify(msg);
//	console.error(now(), "sending", str_msg);
	var msg_len = Buffer.byteLength(str_msg);
	var len = 4 + msg_len;
	var buf = new Buffer(len);
	buf.writeUInt32(msg_len, 0, 'big');
	buf.write(str_msg, 4);
	return buf;
};

Messenger.prototype._send = function(sock, buf){
	var r = sock.write(buf);
//    console.error("Sock.Write", sock.bufferSize, buf.length, r);
};

Messenger.prototype.broadcast = function(msg){
	var buf = this.encodeMsg(msg);
	for(var i in this.sockets){
		var sock = this.sockets[i];
		if(sock)
			this._send(sock, buf);
	}
};

Messenger.prototype.send = function(name, msg){
	var buf = this.encodeMsg(msg);
	var sock = this.sockets[name];
	if(sock)
		this._send(sock, buf);
};

module.exports.Messenger = Messenger;

module.exports.getKeyName = function(dict, value){
	for(var key in dict){
		if(dict[key] == value) return key;
	}
};

module.exports.hashCode = function(str){
	var hash = 0;
	if (str.length == 0) return hash;
	for (i = 0; i < str.length; i++) {
		char = str.charCodeAt(i);
		hash = ((hash<<5)-hash)+char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash);
};

module.exports.getNetworkIP = (function () {
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

module.exports.updateSettings = updateSettings;

module.exports.parseSettings = function(settings){
	var args = parse();
	for(var i in args){
		var key = i.replace(/^(--|-)/, "");
		if(key in settings){
			settings[key] = args[i];
		}
	}
	return settings;
};

module.exports.now = now;
module.exports.formatPeerID = formatPeerID;
module.exports.deformatPeerID = deformatPeerID;