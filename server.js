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
  return date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
};

var logHex = function(data, conn) {
  var hex = formatDate(new Date(Date.now())) + ' ' + hexy.hexy(data, {format: 'twos'});
  if (conn && argv[conn]) {
    streams[conn].write(hex);
  }
  else {
    return console.log(hex);
  }
}

var server = net.createServer(function(socket) {
  socket.isWebSocket = false;
  var driver = websocket.server({'protocols':'binary'});

  var client = net.connect({host: config.TCP_SERVER.HOST, port: config.TCP_SERVER.PORT}, function() {
    // client is the connection to the destination TCP server
      client.on('data', function(data) {
        // data from the TCP server - send to the client
        if (argv.debug) {
          logHex(data, 'client');
        }
        if (!socket.isWebSocket) {
          // our client is connected through tcp, send the data straight through
          socket.write(data);

          //console.log('tcp - data from server forwarded to client');
        }
        else {
          // our client is connection through ws, send the data with ws
          driver.binary(data);
        }
      });
      client.on('close', function(ev) {
        if (argv.debug && argv.debug != 'hexonly') {
          console.log('socket to server closed');
        }
        client.end();
      });
  });

  driver.on('connect', function() {
    // if the connection is a websocket, let the driver handle it
    if (websocket.isWebSocket(driver)) {
      socket.isWebSocket = true;
      driver.start();
    }
  });

  socket.on('data', function(data) {
    var request = parser.parseRequest(data.toString());
    if (Object.keys(request.headers).length === 0 && !socket.isWebSocket) {
      // TCP
      // THIS IS RAW TCP - FORWARD IT AS IS
      client.write(data);
      if (argv.debug) {
        logHex(data, 'server');
      }
    }
  });

  driver.on('message', function(ev) {
    client.write(ev.data);
    if (argv.debug) {
      logHex(ev.data, 'server');
    }
  });

  driver.on('close', function(ev) {
    socket.end();
    client.end();
    if (argv.debug && argv.debug != 'hexonly') {
      console.log('websocket closed');
    }
  });

  socket.on('close', function(ev) {
    if (argv.debug && argv.debug != 'hexonly') {
      console.log('socket to client closed');
    }
    socket.end();
    client.end();
  });

  client.on('close', function(ev) {
    client.end();
    socket.end();
  });
  socket.on('error', function(ev) { console.log(ev); });

  socket.pipe(driver.io).pipe(socket);

});

server.listen(config.LISTEN_PORT);
if (argv.debug != 'hexonly') {
  console.log('ws/tcp router listening on '+ config.LISTEN_PORT +' - routing to '+ config.TCP_SERVER.HOST +':'+ config.TCP_SERVER.PORT);
}