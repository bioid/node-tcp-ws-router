var net = require('net');

var server = net.createServer(function(socket) {
  // socket.setEncoding('utf-8');
  socket.on('data', function(data) {
    console.log('data', data);
  });
}).listen(4343);
console.log('raw tcp server listening on 4343');