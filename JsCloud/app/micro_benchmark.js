//#import cloud.js

//var bridge = new Bridge();
var flobj_id = "flCloud";
var fl_path = "fl/flCloud.swf";
var serverAddress = 'rtmfp://'+location.hostname+'/';

var lc, pm, bridge, msgr, pl;

function test_PeerLoader(){
	pl = new PeerLoader(bridge);
	pl.pm.addEventListener('connected', function(connection){
		print('Connected to', serverAddress);
		post_connection_action();
//		pl.sendCacheList();
//		setTimeout(function(){
//			pl.load(new Loading(img_key, img_key, load_callback));
//		}, 1);
	});
	pl.connect(serverAddress);

}


function load_callback(){
	log.debug('load_callback', arguments);
}

var img_key = 'data/1.data';

function cleanItems(items, callback){
	var self = pl;
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
		var responder = new Responder();
		if(callback)
			responder.result = callback;
		self.remoteCall(cmdname, responder, cmd);
	}
	_sendItems('cleanItems', items);
}

var data_keys = ['data/1.data', 'data/2.data', 'data/3.data', 'data/4.data',
                 'data/5.data', 'data/6.data', 'data/7.data', 'data/8.data',
                 'data/9.data', 'data/10.data'];

function getOutput(){
	return document.getElementById('output');
}

function log_time(){
	return;
	var args = toArray(arguments);
	args.unshift(getTime());
	log.debug.apply(log, args);
}

function print(){
	var lst = toArray(arguments, 0);
	var elm = getOutput();
	elm.value += lst.join(' ');
	elm.value += '\n';
}

Object.size = function(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

function serverInit(){
	localStorage.clear();
	cleanItems(data_keys, function(){
		load_items(data_keys);
	});
}

function hash(data){
//	var b64 = md5.hex_md5(evt.data);
	var b64 = md5.md5_2(evt.data);
//	var b64 = shautils.hex(data);
	return b64;
}

function load_items(items){
	var lst = items.slice();
	var all_start = getTime();

	function next(){
		if(lst.length == 0) {
			print('Load Completed.', 'Time', getTime()-all_start);
			return;
		}
		var key = lst.shift();
		var start = getTime();
		pl.load(new Loading(key, key, function(evt){
			if(evt.status == 'done'){
				var h_start = getTime();
				var b64 = hash(evt.data);
				var end = getTime();
				print('loaded', key, 'in', end-start, 'b64', b64, 'hash_time', end - h_start);
				next();
			} else {
				print('ERROR:', key, 'loaded error.');
			}
		}));
	}
	next();
}

function load_items2(items){
	var lst = items.slice();
	var waiting = {};

	var all_start = getTime();
	lst.forEach(function(key){
		waiting[key] = true;
		var start = getTime();
		pl.load(new Loading(key, key, function(evt){
			if(evt.status == 'done'){
				var h_start = getTime();
				var b64 = hash(evt.data);
				var end = getTime();
				print('loaded', key, 'in', end-start, 'b64', b64, 'hash_time', end - h_start);
				delete waiting[key];
				if(Object.size(waiting) == 0){
					print('Load Completed.','Time', getTime()-all_start);
				}
			} else {
				print('ERROR:', key, 'loaded error.');
			}
		}));
	});
}

function serverInit(){
	localStorage.clear();
	cleanItems(data_keys, function(){
		load_items(data_keys);
	});
}

function serverInit2(){
	localStorage.clear();
	cleanItems(data_keys, function(){
		load_items2(data_keys);
	});
}


function clientInit2(){
	localStorage.clear();
	load_items2(data_keys);
}

function clientInit(){
	localStorage.clear();
	load_items(data_keys);
}

function post_connection_action(){
	// e.g. http://localhost:8000/micro_benchmark.html?serverInit
	if(!location.search)
		return;
	var foo = location.search.substr(1);
	foo = window[foo];
	foo();
}

function main(msg){
	log.debug(msg);
	jstrace = function(){
//		console.log(getTime(), arguments);
	}; // disable flash rawjstrace.

	bridge = new Bridge(flobj_id);
//	test_peer();
//	test_LocalConnection();
//	test_LocalMessenger();

	test_PeerLoader();

}

function jsmain(){
	function onload_flash(e){
		// NOTE: the swf file loaded does NOT mean that the script
		// is init.
	};

	var onflashinit = "__onFlashInit_" +getTime();
	window[onflashinit] = main;
	function onload_swfobjects(){
		swfobject.embedSWF(fl_path, flobj_id,
				"0", "0", "10.1.0", "playerProductInstall.swf",
				{main_callback: onflashinit}, //Flash Vars
				{allowscriptaccess: "always"}, {},
				onload_flash);
	};

	window.addEventListener('load', function(){
		onload_swfobjects();
	}, false);
}

jsmain();