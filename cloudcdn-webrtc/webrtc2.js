/**
 * Require jQuery
 */
 
// Generate UUID

var UUID = (function(){
	function b(
	  a                  // placeholder
	){
	  return a           // if the placeholder was passed, return
	    ? (              // a random number from 0 to 15
	      a ^            // unless b is 8,
	      Math.random()  // in which case
	      * 16           // a random number from
	      >> a/4         // 8 to 11
	      ).toString(16) // in hexadecimal
	    : (              // or otherwise a concatenated string:
	      [1e7] +        // 10000000 +
	      -1e3 +         // -1000 +
	      -4e3 +         // -4000 +
	      -8e3 +         // -80000000 +
	      -1e11          // -100000000000,
	      ).replace(     // replacing
	        /[018]/g,    // zeroes, ones, and eights with
	        b            // random hex digits
	      )
	}
	return b;
})();

var myid = UUID();
var remoteId = "peer_id";
var socket = null;
var $main = $('div#main');
var $log = $('div#log');
var $print = $('div#print');
var pc = dc = null;
var WS_URL = 'ws://'+location.hostname+':1337/?id=' + myid;
var enable_trace = false;

var slide_window = null;
var datachannel_onopen_callback = null;
$('#enable_trace').prop('checked', enable_trace).on('change', function(){
	enable_trace = $('#enable_trace').prop('checked')
});

function print(s){
	$print.append($('<span>').text(s), "<br>");
}

function trace() {
	if(!enable_trace) return;
	var t = (performance.now() / 1000).toFixed(3);
	var lst = $.makeArray(arguments);
	lst.unshift(t)
	console.log.apply(console, lst);
	var s = lst.join(' ');
	$log.append($('<span>').text(s), "<br>");
}

var events = [];
var createEventHandler = function(name){
	return function(evt){
		trace(''+ name + ' Event '+events.length, evt); events.push(evt);
	};
};


//////////////////////////////////////////////////////////////////////////////
/////// Implement a simple silding window transimission algorithm. ///////////
//////////////////////////////////////////////////////////////////////////////



var MTU = 1024;
var RTT = 2 * 1000; // 2 sec by default
var WINDOW_SIZE = 20;
var MAX_SEQ_NUM = WINDOW_SIZE * 10000;
var TOTAL_NUM = MAX_SEQ_NUM + 1;
var pay_load_size = 1000;
var timeout = 200; //ms
var should_stop_timer = false;

var SlideWindow = function(){ // This is a class
	var self = this;
	
	var SEND_WINDOW_SIZE = RECEIVE_WINDOW_SIZE = WINDOW_SIZE;
	
	// Sender side state:
	var lar = 0, 	// seqno of last ack received
	lfs = 0, 		// last frame sent
	send_window_count = SEND_WINDOW_SIZE, // number of slot in sender window
	sendQ = [];
	
	// Receiver side state:
	var nfe = 1, // seqno of next frame expected
	recvQ = [];
	
	// my fields
	var buffer_messages = [],
	sending_message = '',
	sending_buffer = [];
	receive_message = ''; 
	timeout_buffer = [];
	
	var init = function(){
		sendQ = new Array(SEND_WINDOW_SIZE);
		recvQ = new Array(RECEIVE_WINDOW_SIZE);
	}; init();
	
	var make_sendQ_slot = function(timeout, msg){
		return {timeout: timeout, msg:msg};
	};
	
	var make_recvQ_slot = function(){
		return {received: false, msg: null};
	};
	
	var makeTimeout = function(slot){
		return setTimeout(function() {
				timeout_buffer.push(slot);
				setTimeout(process_timeout, 0);
			}, timeout);
	};
	
	var process_timeout = function(){
		if(should_stop_timer) return;
		timeout_buffer.forEach(function(slot,i){
			var packet = slot.msg;
			if(!packet) return;
			slot.timeout = makeTimeout(slot)
			self.sendPacket(packet);
		});
		timeout_buffer = [];
	};
	
	var sendSWP = function(){
		while(send_window_count > 0){
			if(!sending_message){
				var msg = buffer_messages.shift();
				if(!msg) return;
				sending_buffer.push(msg);
				sending_message = msg.msg;
			}
			send_window_count --;
			var text = sending_message.substr(0, pay_load_size);
			sending_message = sending_message.substr(pay_load_size);
			
			var type = sending_message ? "data" : "msg";
			var packet = {SeqNum: ++lfs, Data: text, Type:type}; // Shape of a packet
			if(type == "msg"){
				for(var i = 0; i < sending_buffer.length; i++){
					if(sending_buffer[i].sn == -1){
						sending_buffer[i].sn = lfs;
						break;
					}
				}
			}
			var slot = make_sendQ_slot(null, packet);
			slot.timeout = makeTimeout(slot);
			sendQ[lfs % SEND_WINDOW_SIZE] = slot;
			self.sendPacket(packet);
		}
	};
	
	var swpInWindow = function(seqno, min, max){
		var pos = seqno - min; // pos should be in range [0..MAX)
		var maxpos = max-min+1; // maxpos is in range [0..MAX)
		return pos < maxpos && pos >= 0;
	};
	
	var fireSendCallback = function(sn){
		for(var i = 0; i < sending_buffer.length; i++){
			if(sending_buffer[i].sn == sn){
				if(sending_buffer[i].callback){
					try{
						sending_buffer[i].callback()
					}catch(err){
						console.log("fireSendCallback:", err);
						//trace("fireSendCallback:", err);
					}
				}
			}
		}
	};
	
	var deliverSWP = function(data){
		var packet = data;
		if (packet.Type == "ack") {
			if(swpInWindow(packet.AckNum, lar+1, lfs)){
				do{
					var slot = sendQ[++lar % SEND_WINDOW_SIZE];
					clearTimeout(slot.timeout);
					slot.msg = null;
					send_window_count ++;
					fireSendCallback(lar);
				} while(lar != packet.AckNum);
				sendSWP();
			}
		} else if(packet.Type == "data" || packet.Type == "msg"){
			var msgs = []; // a small temp buffer for fully received messages
			var slot = recvQ[packet.SeqNum % RECEIVE_WINDOW_SIZE];
			if(!slot){
				slot = make_recvQ_slot();
				recvQ[packet.SeqNum % RECEIVE_WINDOW_SIZE] = slot;
			}
			if (!swpInWindow(packet.SeqNum, nfe, nfe+RECEIVE_WINDOW_SIZE-1)){
				// Drop the message
				trace("Not in window, dropping. NFE="+nfe);
				return;
			}
			slot.received = true;
			slot.msg = packet;
			if(packet.SeqNum == nfe){
				while(slot && slot.received){
					// deliver
					receive_message += slot.msg.Data;
					if(slot.msg.Type == "msg"){
						msgs.push(receive_message);
						receive_message = '';
					}
					slot.received = false;
					slot.msg = null;
					slot = recvQ[++nfe % RECEIVE_WINDOW_SIZE];
				}
				// send ack;
				var ack_packet = {Type:"ack", AckNum:nfe-1};
				self.sendPacket(ack_packet);
			}
			
			if(msgs.length > 0){
				msgs.forEach(function(msg){
					var obj = JSON.parse(msg);
					self.onmessage(obj);
				});
			}
		}
	};
	
	self.sendPacket = function(data){}; // the underlying sending method, override this
	self.onmessage = function(msg){
		// override this method
	};
	self.receivePacket = function(data){ // call this when received packet
		deliverSWP(data);
	};
	self.send = function(obj, callback){
		if(!obj) return;
		var s = JSON.stringify(obj);
		var msg = {msg: s, callback: callback, sn:-1};
		buffer_messages.push(msg);
		sendSWP();
	};
};


//////////////////////////////////////////////////////////////////////////////
///////////////////////// END of Sliding Window //////////////////////////////
//////////////////////////////////////////////////////////////////////////////

function createPeerConnection() {
	var stun_url = "stun:stun.l.google.com:19302";
	stun_url = "stun:achtung.ccs.neu.edu:3478";
	var servers = {iceServers:[{url:stun_url}]};
	var pc_constraints = { optional:[ { RtpDataChannels: true } ]};
	var pc = new webkitRTCPeerConnection(servers, pc_constraints);

	var name = "peerConnection";
	pc.onconnecting = createEventHandler(name+" onconnecting");
	pc.onopen = createEventHandler(name+" onopen");
	pc.onaddstream = createEventHandler(name+" onaddstream");
	pc.onremovestream = createEventHandler(name+" onremovestream");
	pc.ondatachannel = createEventHandler(name+" ondatachannel");

	return pc;
}

function createDataChannel(pc, label){
	var constrains = { reliable : false };
	var dc = pc.createDataChannel(label, constrains);
	
	var name = "dataChannel";
	dc.onclose = createEventHandler(name+" onclose");
	dc.onerror = createEventHandler(name+" onerror");
	dc.onmessage = peerMessageHandler;//createEventHandler(name+" onmessage");
	dc.onopen = function(){
		trace("dataChannel onopen");
		// sendPing();
		initSlideWindow();
		if(datachannel_onopen_callback){
			datachannel_onopen_callback();
		}
	};//createEventHandler(name+" onopen");
	
	return dc;
}

var peerMessageHandler = function(event){
	var s = event.data;
	trace("Received message ("+s.length+"): "+getSnippet(s));
	var msg = JSON.parse(s);
	if(msg.type == "ping"){
		sendPong();
	} else if (msg.type == "stream"){
		slide_window.receivePacket(msg.data);
	} else if (msg.type == "pong"){
		
	} else {
		//throw new Error("Unknown message type. "+msg.type);
	}
};


var sendPeerMsg = function(data, type){
	type = type || "message";
	var msg = {type: type, data:data};
	var s = JSON.stringify(msg);
	trace("Sending message ("+s.length+"): "+getSnippet(s));
//	dc.send(s);
	setTimeout(function() {dc.send(s);}, 1);
};


var getSnippet = function(s){
	var max = 50;
	var snippet = s.length > max ? s.substr(0, max) : s;
	return snippet;
}

var generatePayload = function(size){
	var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890-=";
	var output = '';
	for(var i = 0; i < size; i++){
		var j = Math.floor(Math.random()*chars.length);
		output += chars[j];
	}
	return output;
};

var sendPing = function(){
	sendPeerMsg("0123456789", "ping");
};

var sendPong = function(){
	sendPeerMsg("0123456789", "pong");
};

var handleRelayMessage = function(data) {
	var msg = data;
	var started = true;
	if (msg.type === 'offer') {
		// Callee creates PeerConnection
//		if (!initiator && !started) maybeStart();
		pc.setRemoteDescription(new RTCSessionDescription(msg));
		doAnswer();
	} else if (msg.type === 'answer' && started) {
		pc.setRemoteDescription(new RTCSessionDescription(msg));
	} else if (msg.type === 'candidate' && started) {
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: msg.label,
			candidate: msg.candidate
		});
		pc.addIceCandidate(candidate);
	} else if (msg.type === 'bye' && started) {
		//onRemoteHangup();
		trace('Hangup');
	}
};

var initWebSocket = function() {
	if(socket){
		trace("Socket exist, init fail.");
		return;
	}
	socket = new WebSocket(WS_URL);
	socket.addEventListener("open", function(event) {
		trace("WebSocket+onopen", event);
		initPeerConnection();
	}, false);
	socket.addEventListener("close", function(event) {
		trace("WebSocket+onclose", event);
	}, false);
	socket.addEventListener("error", function(event) {
		trace("WebSocket+onerror", event);
	}, false); 
	socket.addEventListener("message", function(event) {
		trace("WebSocket+onmessage", event);
		var msg = JSON.parse(event.data);
		if(msg.type=="relay" && msg.data){
			handleRelayMessage(msg.data);
		}
	}, false);
	return socket;
};

var relay = function(to, data){
	var msg = {type:"relay", to:to, data:data};
	var s_msg = JSON.stringify(msg);
	socket.send(s_msg);
};

function iceCallback(event) {
	trace('local ice callback');
	if (event.candidate) {
		trace('Local ICE candidate: \n' + event.candidate.candidate);
		var data = {
			type: 'candidate',
			label: event.candidate.sdpMLineIndex,
			id: event.candidate.sdpMid,
			candidate: event.candidate.candidate
		};
		relay(remoteId, data);
	}
}

function setLocalAndSendMessage(sessionDescription) {
	// Set Opus as the preferred codec in SDP if Opus is present.
	//sessionDescription.sdp = preferOpus(sessionDescription.sdp);
	pc.setLocalDescription(sessionDescription);
	relay(remoteId, sessionDescription);
}

var initPeerConnection = function() {
	var label = "DC-LABEL";
	pc = createPeerConnection();
	pc.onicecandidate = iceCallback;
	dc = createDataChannel(pc, label);
	trace("Created PeerConnection and DataChannel");
};

var initSlideWindow = function(){
	slide_window = new SlideWindow();
	slide_window.onmessage = function(data){
		print("slide_window.onmessage:"+ data.length);
		trace("slide_window.onmessage:", data.length, getSnippet(data));
	};
	slide_window.sendPacket = function(data){
		sendPeerMsg(data, "stream");
	};
	trace("Init SlideWindow DONE.");
}

function doAnswer() {
	trace("Sending answer to peer.");
	var mediaConstraints = { optional:[ { RtpDataChannels: true } ]};
	pc.createAnswer(setLocalAndSendMessage, null, mediaConstraints);
}


var doCall = function() {	
	var mediaConstraints = { optional:[ { RtpDataChannels: true } ]};
	pc.createOffer(setLocalAndSendMessage, null, mediaConstraints);
};

var initUI = function(){
	
	datachannel_onopen_callback = function(){
		sendPing();
	};
	
	var $txt_id = $("<span>").text("ID: "+myid);

	var $txt_timeout = $('<input type="text">').val(timeout);
	var $txt_window = $('<input type="text">').val(WINDOW_SIZE);
	var $btn_set = $('<button>').text("set").click(function(){
		timeout = parseInt($txt_timeout.val());
		WINDOW_SIZE = parseInt($txt_window.val());
		initSlideWindow();
		trace("Set timeout to", timeout, ", window size to", WINDOW_SIZE);
	});
	
	var $btn_connect = $('<button>').text("WebSocket Connect").click(function(){
		initWebSocket();
	});
	// var $btn_peerConnect = $('<button>').text("initPeerConnection").click(function(){
	// 	initPeerConnection();
	// });
	var $btn_doCall = $('<button>').text('doCall').click(function(){
		doCall();
	});
	var $btn_sendPing = $('<button>').text('ping').click(function(){
		sendPing();
	});
	var $btn_sendReliableMessage = $('<button>').text('sendReliableMessage').click(function(){
		var t0 = new Date().getTime();
		var func = function(){
			var msg = $txt_peermsg.val();
			var k = 50;
			var data = generatePayload(k*1024);

			slide_window.send(data, function(){
				var t1 = new Date().getTime();
				var s = "Sent "+k+" KB message in " + (t1-t0) +" ms.";
				print(s);
			});
		}
		if(dc.readyState != "open"){
			datachannel_onopen_callback = func;
			doCall();
		}else{
			func();
		}
	});
	var $btn_sendReliableMessage10 = $('<button>').text('sendReliableMessage_x10').click(function(){
		var num_iter = 2;
		var iter = 0;
		var stats = [];
		var t0 = new Date().getTime();
		
		var func = function(){
			if(iter > num_iter) return;
			if(iter == num_iter){
				// print stats
				var min = ss.min(stats),
				max = ss.max(stats),
				avg = ss.mean(stats),
				std = ss.standard_deviation(stats);
				var lst = [min, max, avg, std];
				for(var i = 0; i < lst.length; i++){
					lst[i] = lst[i].toFixed(3);
				}
				print("Total "+num_iter+" iterations. max, min, avg, std = "+lst.join(", "))
				return;
			}
			iter ++;
			var msg = $txt_peermsg.val();
			var k = 50;
			var data = generatePayload(k*1024);

			slide_window.send(data, function(){
				var t1 = new Date().getTime();
				var tt = (t1-t0);
				stats.push(tt);
				var s = "Iter "+ iter +": Sent "+k+" KB message in " + tt +" ms.";
				print(s);
				t0 = new Date().getTime();
				func();
			});
		}
		if(dc.readyState != "open"){
			datachannel_onopen_callback = func;
			doCall();
		}else{
			func();
		}
	});
	var $txt_peermsg = $('<textarea>').val("Hello World.");
	var $btn_send = $('<button>').text("send").click(function(){
		var msg = $txt_peermsg.val();
		sendPeerMsg(msg);
	});
	$main.append($txt_id, "<br>", "TIMEOUT", $txt_timeout, "WINDOW", $txt_window, $btn_set,
		$('<button>').text('toggerTimer').click(function(){should_stop_timer = !should_stop_timer;}),"<br>", 
		$btn_connect, $btn_doCall, $btn_sendPing, $btn_sendReliableMessage, $btn_sendReliableMessage10, "<br>",
		$txt_peermsg, $btn_send);
};

/////////////////////////////////// The MAIN /////////////////////////////////
(function(){
    initUI();
	setTimeout(function() {initWebSocket();}, 0);
})();
