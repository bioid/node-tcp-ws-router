var net = require('net'),
    crypto = require('crypto'),
    parser = require('http-string-parser'),
    config = require('./config.js'),
    frame = require('./frame/frame.js');

var server = net.createServer(function(socket) {
  // socket.setEncoding('ascii');
      console.log('new connection');

      var isWebSocket = false;
      var client = net.connect({host: config.TCP_SERVER.HOST, port: config.TCP_SERVER.PORT}, function() {
          client.on('data', function(data) {
            // data from the TCP server - send to the client
            if (!isWebSocket) {
              socket.write(data);
              console.log('tcp - data from server forwarded to client');
            }
            else {
              // construct the websocket frame to send here
              binaryFrame = frame.createBinaryFrame(data, false, true, true);
              socket.write(binaryFrame);
            }
          });
      });
      
      socket.on('data', function(data) {
        // data from the client - send to the tcp server
        var request = parser.parseRequest(data.toString());
        //console.log('request: ', request);

        if (Object.keys(request.headers).length > 0) {
          // HTTP
         if (request.headers.Upgrade && request.headers.Upgrade == 'websocket') {
          // WEBSOCKET CONNECTION
          isWebSocket = true;
          console.log('ws - websocket connection detected');
          // Create the Sec-WebSocket-Accept header for our reponse
          // (WEB SOCKET GUID) 258EAFA5-E914-47DA-95CA-C5AB0DC85B11
          var guid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
          var shasum = crypto.createHash('sha1');
          shasum.update(request.headers['Sec-WebSocket-Key'] + guid, 'string');
          hash = shasum.digest('base64');

          // Send the handshake
          socket.write( "HTTP/1.1 101 Switching Protocols\r\n"
                + "Upgrade: WebSocket\r\n"
                + "Connection: Upgrade\r\n"
                + "WebSocket-Origin: http://"+ request.headers.host +"\r\n"
                + "WebSocket-Location: ws://"+ request.headers.host +"\r\n"
                + "Sec-WebSocket-Accept: " + hash + "\r\n"
                + "Sec-WebSocket-Protocol: binary\r\n"
                + "\r\n"
                );
          console.log('ws - handshake sent');

          socket.ondata = function (data, start, end) {
            // Parse the websocket frame
            // frame parsing courtesy of Logan Smythe's answer on stackoverflow:
            // http://stackoverflow.com/a/14515142
            var message = data.slice(start, end);
            var FIN = (message[0] & 0x80);
            var RSV1 = (message[0] & 0x40);
            var RSV2 = (message[0] & 0x20);
            var RSV3 = (message[0] & 0x10);
            var Opcode = message[0] & 0x0F;
            var mask = (message[1] & 0x80);
            var length = (message[1] & 0x7F);

            var nextByte = 2;
            if (length === 126) {
              // length = next 2 bytes
              nextByte += 2;
            } else if (length === 127){
              // length = next 8 bytes
              nextByte += 8;
            }

            var maskingKey = null;
            if (mask){
              maskingKey = message.slice(nextByte, nextByte + 4);
              nextByte += 4;
            }

            var payload = message.slice(nextByte, nextByte + length);

            if (maskingKey){
              for (var i = 0; i < payload.length; i++){
                payload[i] = payload[i] ^ maskingKey[i % 4];
              }
            }

            console.log('ws - parsed message:', payload.toString());

            // create a tcp connection and forward the data
            client.write(payload.toString());
            console.log('ws - forwarded websocket message to tcp server');
          };
        }
      }
        else {
          // THIS IS RAW TCP - FORWARD IT AS IS
          console.log('tcp - message from client:', data);
          client.write(data);
          console.log('tcp - forwarded data to server');
        }
      });

});

server.listen(config.LISTEN_PORT);
console.log('ws/tcp router listening on '+ config.LISTEN_PORT +' - routing to localhost:4343');