var net = require('net'),
    parser = require('http-string-parser'),
    websocket = require('websocket-driver'),
    argv = require('yargs').argv,
    config = require('./config'),
    logger = require('./lib/loghex')(argv);

var server = net.createServer(function(socket) {
  socket.isWebSocket = false;
  var driver = websocket.server({'protocols':'binary'});
  var serverAddress = null;
  var clientAddress = socket.remoteAddress + ':' + socket.remotePort;

  var tcpconn = net.connect({host: config.TCP_SERVER.HOST, port: config.TCP_SERVER.PORT}, function() {
    serverAddress = tcpconn.remoteAddress + ':' + tcpconn.remotePort;
    // tcpconn is the connection to the destination TCP server
    tcpconn.on('data', function(data) {
      // data from the TCP server - send to the client
      logger.logHex({data: data, from: serverAddress, to: clientAddress});
      if (!socket.isWebSocket) {
        // our client is connected through tcp, send the data straight through
        socket.write(data);
      }
      else {
        // our client is connection through ws, send the data with ws
        driver.binary(data);
      }
    });
    tcpconn.on('close', function(ev) {
      if (argv.debug && argv.debug != 'hexonly') {
        console.log('socket to server closed');
      }
      tcpconn.end();
    });
    tcpconn.on('error', function(ev) {
      console.log(ev);
      tcpconn.destroy();
      socket.destroy();
    });
  });


  driver.on('connect', function() {
    // if the connection is a websocket, let the driver handle it
    if (websocket.isWebSocket(driver)) {
      socket.isWebSocket = true;
      driver.start();
    }
  });

  socket.once('data', function(data) {
    firstPacket = false;
    var request = parser.parseRequest(data.toString());
    if (Object.keys(request.headers).length === 0 && !socket.isWebSocket) {
      tcpconn.write(data);
      logger.logHex({data: data, from: clientAddress, to: serverAddress}); 
    }
    
    socket.on('data', function(data) {
      if (!socket.isWebSocket) {
        tcpconn.write(data);
      logger.logHex({data: data, from: clientAddress, to: serverAddress}); 
      }
    });
  });

  driver.on('message', function(ev) {
    tcpconn.write(ev.data);
    logger.logHex({data: ev.data, from: clientAddress, to: serverAddress}); 
  });

  driver.on('close', function(ev) {
    socket.destroy();
    tcpconn.destroy();
    if (argv.debug && argv.debug != 'hexonly') {
      console.log('websocket closed');
    }
  });

  socket.on('close', function(ev) {
    if (argv.debug && argv.debug != 'hexonly') {
      console.log('socket to client closed');
    }
    socket.destroy();
    tcpconn.destroy();
  });

  socket.on('error', function(ev) { 
    console.log(ev);
    socket.destroy();
    tcpconn.destroy();
  });

  socket.pipe(driver.io).pipe(socket);
});

server.listen(config.LISTEN_PORT);
if (argv.debug && argv.debug != 'hexonly') {
  console.log('ws/tcp router listening on '+ config.LISTEN_PORT +' - routing to '+ config.TCP_SERVER.HOST +':'+ config.TCP_SERVER.PORT);
}
