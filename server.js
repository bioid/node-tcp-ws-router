var net = require('net'),
    parser = require('http-string-parser'),
    websocket = require('websocket-driver'),
    config = require('./config.js');


var server = net.createServer(function(socket) {
  socket.isWebSocket = false;
  var driver = websocket.server({'protocols':'binary'});

  var client = net.connect({host: config.TCP_SERVER.HOST, port: config.TCP_SERVER.PORT}, function() {
    // client is the connection to the destination TCP server
      client.on('data', function(data) {
        // data from the TCP server - send to the client
        if (!socket.isWebSocket) {
          // our client is connected through tcp, send the data straight through
          socket.write(data);
          //console.log('tcp - data from server forwarded to client');
        }
        else {
          // our client is connection through ws, send the data with ws
          driver.binary(data);
          //console.log('ws - data from server forwarded to client');
        }
      });
  });

  driver.on('connect', function() {
    // if the connection is a websocket, let the driver handle it
    if (websocket.isWebSocket(driver)) {
      socket.isWebSocket = true;
      driver.start();
      //console.log('websocket conn');
    }
    else{ console.log(driver); }
  });

  socket.on('data', function(data) {
    var request = parser.parseRequest(data.toString());
    // console.log(request);
    //console.log('headers', Object.keys(request.headers).length)
    if (Object.keys(request.headers).length === 0 && !socket.isWebSocket) {
      // TCP
      // THIS IS RAW TCP - FORWARD IT AS IS
      //console.log('tcp - message from client:', data);
      client.write(data);
      //console.log('tcp - forwarded data to server');
    }
  });
  driver.on('message', function(ev) {
    // WS MESSAGE - FORWARD IT TO SERVER    
    //console.log('ws - message from client', ev.data);
    client.write(ev.data);
    //console.log('ws - forwarded data to server');
  });

  driver.on('close', function(ev) {
    socket.end();
  });

  socket.on('error', function(ev) { console.log(ev); });

  socket.pipe(driver.io).pipe(socket);

  setInterval(function() { 
    console.log('buffersize(router <-> client)', socket.bufferSize);
    console.log('buffersize(router <-> server', socket.bufferSize);
  }, 5000);
});

server.listen(config.LISTEN_PORT);
console.log('ws/tcp router listening on '+ config.LISTEN_PORT +' - routing to '+ config.TCP_SERVER.HOST +':'+ config.TCP_SERVER.PORT);