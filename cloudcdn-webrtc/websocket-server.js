var WebSocketServer = require('./websocket').server;
var http = require('http');
var named_clients = {}
var clients = [];
var server = http.createServer(function(request, response) {
    // process HTTP request. Since we're writing just WebSockets server
    // we don't have to implement anything.
});
server.listen(1337, function() {
  console.log((new Date()) + " Server is listening on port 1337");
});

// create the server
wsServer = new WebSocketServer({
    httpServer: server
});

function sendCallback(err) {
    if (err) console.error("send() error: " + err);
}

// This callback function is called every time someone
// tries to connect to the WebSocket server
wsServer.on('request', function(request) {
    console.log((new Date()) + ' Connection from origin ' + request.origin + '.');
    var connection = request.accept(null, request.origin);
    console.log(' Connection ' + connection.remoteAddress);

    connection.sendObj = function(obj){
	var s = JSON.stringify(obj);
	connection.send(s, sendCallback);
    };
    clients.push(connection);
	
	var peer_id = "";
	if(request.resourceURL && request.resourceURL.query && request.resourceURL.query.id){
		peer_id = request.resourceURL.query.id;
		console.log("PeerID: "+peer_id);
	}
    
    // This is the most important callback for us, we'll handle
    // all messages from users here.
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            // process WebSocket message
            console.log((new Date()) + ' Received Message ' + message.utf8Data);

            // broadcast message to all connected clients
            clients.forEach(function (outputConnection) {
                if (outputConnection != connection) {
                  outputConnection.send(message.utf8Data, sendCallback);
                }
            });
        }
    });
    
    connection.on('close', function(evt) {
        // close user connection
        console.log((new Date()) + " Peer disconnected.");
		var index = clients.indexOf(connection);
		if(index >= 0)
			clients.splice(index,1);
		else
			trace("Delete disconnected peer fail.");
    });
});
