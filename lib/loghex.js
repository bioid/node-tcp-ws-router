module.exports = function(argv) {
  var fs   = require('fs'),
      hexy = require('hexy');

  var formatDate = function(date) {
    var hours   = date.getHours(),
        minutes = date.getMinutes(),
        seconds = date.getSeconds();

    // the above date.get...() functions return a single digit
    // so prepend the zero when needed
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;

    return hours + ":" + minutes + ":" + seconds;
  };

  var direction = function(from, to) {
    return ' IP ' + from + ' > ' + to + ': \n         ';
  };

  var logger = function() {
    this.writeStream = argv.output ? fs.createWriteStream(argv.output) : false;
  };

  logger.prototype.logHex = function(opts) {
    var dir  = direction(opts.from, opts.to),
        date = formatDate(new Date(Date.now())),
        hex = hexy.hexy(opts.data, {format: 'twos'}).replace(/\n/g, "\n         ");

    var logString = date + dir + hex;

    if (this.writeStream) {
      this.writeStream.write(logString + '\n');
    }

    if (argv.debug) {
      return console.log(logString);
    }
  };

  return new logger();
};
