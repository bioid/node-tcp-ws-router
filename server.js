var net = require('net'),
    parser = require('http-string-parser'),
    websocket = require('websocket-driver'),
    argv = require('yargs').argv,
    fs = require('fs'),
    hexy = require('hexy'),
    config = require('./config.js');

var streams = {}

if (argv.server) {
  streams.server = fs.createWriteStream(argv.server);
}

if (argv.client) {
  streams.client = fs.createWriteStream(argv.client);
}

var formatDate = function(date) {
  var hours = date.getHours();
  var minutes = date.getMinutes();
  var seconds = date.getSeconds();

  // the above date.get...() functions return a single digit
  // so prepend the zero when needed
  if (hours < 10) 
    hours = '0' + hours;

  if (minutes < 10) 
    minutes = '0' + minutes;

  if (seconds < 10) 
    seconds = '0' + seconds;

  return hours + ":" + minutes + ":" + seconds;
};

var logHex = function(data, conn, direction) {
  var hex = formatDate(new Date(Date.now())) + direction + hexy.hexy(data, {format: 'twos'}).replace(/\n/g, "\n         ");
  if (conn && argv[conn]) {
    streams[conn].write(hex);
  }
  else {
    return console.log(hex);
  }
}

var direction = function(from, to) {
  return ' IP ' + from + ' > ' + to + ': \n         ';
}

var server = net.createServer(function(socket) {
  socket.isWebSocket = false;
  var driver = websocket.server({'protocols':'binary'});
  console.log(socket.remoteAddress + ':' + socket.remotePort);
  var serverAddress = null;
  var clientAddress = socket.remoteAddress + ':' + socket.remotePort;

  var tcpconn = net.connect({host: config.TCP_SERVER.HOST, port: config.TCP_SERVER.PORT}, function() {
    console.log(tcpconn.remoteAddress);
    serverAddress = tcpconn.remoteAddress + ':' + tcpconn.remotePort;
    // tcpconn is the connection to the destination TCP server
      tcpconn.on('data', function(data) {
        // data from the TCP server - send to the client
        if (argv.debug) {
          logHex(data, 'client', direction(serverAddress, clientAddress));
        }
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
    console.log('first packet');
    firstPacket = false;
    var request = parser.parseRequest(data.toString());
    if (Object.keys(request.headers).length === 0 && !socket.isWebSocket) {
      tcpconn.write(data);
      if (argv.debug) { logHex(data, 'server', direction(clientAddress, serverAddress)); }
    }
    
    socket.on('data', function(data) {
      if (!socket.isWebSocket) {
        tcpconn.write(data);
      if (argv.debug) { logHex(data, 'server', direction(clientAddress, serverAddress)); }
      }
    });
  });

  driver.on('message', function(ev) {
    tcpconn.write(ev.data);
    if (argv.debug) {
      logHex(ev.data, 'server', direction(clientAddress, serverAddress));
    }
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
if (argv.debug != 'hexonly') {
  console.log('ws/tcp router listening on '+ config.LISTEN_PORT +' - routing to '+ config.TCP_SERVER.HOST +':'+ config.TCP_SERVER.PORT);
}
