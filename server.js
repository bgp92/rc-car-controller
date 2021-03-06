/*** Robot Controller Script
 * application for controlling the RC car through a web browser
 * parts:
 * * express.js - serves webpage for direct robot management
 * * socket.io - streams information
 * * johnny-five - interacts with the Arduino, and the RC car by extension
 * run in conjunction with python opencv.py for AI commands
 *
 * Command line options:
 * * noArduino - skip all johnny-five content
*/

// Consider require('minimist') in the future
var args = process.argv.slice(2);

var express = require('express')
var app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server);
//var zerorpc = require("zerorpc");

// noArduino is to be used when the Raspberry Pi isn't connected to an Arduino through serial
if (args.indexOf("noArduino") == -1) {
  var five = require("johnny-five")
    , board, servo;
  
  var arduinoServos = {};
  var throttleTimeout;
  var accelerationServo = {
    pin: 9,
    range: [0, 180],    // Default: 0-180
    type: "standard",   // Default: "standard". Use "continuous" for continuous rotation servos
    startAt: 90,          // if you would like the servo to immediately move to a degree
    center: false         // overrides startAt if true and moves the servo to the center of the range
  }
  var steeringServo = {
    pin: 10, 
    range: [40, 100], 
    type: "standard", 
    startAt: 75, 
    center: true, 
  }
}

stringValues = {
  //throttle
  'forward': 65,
  'reverse': 105,
  'stop': 90,
  'throttleTime': 500,
  //steering
  'left': 40,
  'right': 100,
  'neutral': 75,
}

serverStatus = {
    hasArduino: false,
    hasCamera: false,
    currentAI: 'none',
}

// ----- socket.io -----
server.listen(80);

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

// allow commands to be send via http call
app.get('/command/', function (req, res) {
  processRobotCommand (req.query.command);
  res.send('command: ' + req.query.command);
  
  // Eventually replace with json so commands can be sent back
  //res.json({ 'command': 'face-start' });
});

io.sockets.on('connection', function (socket) {
  socket.emit('robot status', { data: 'server connected' });
  
  // Robot commands
  socket.on('robot command', function (data) {
    processRobotCommand (data.data);
  });
  
  // Status update - gets forwarded to the webpage
  socket.on('robot update', function (data) {
    var updatedData = data.data;
    updatedData['Arduino Attached'] = serverStatus.hasArduino;
    
    socket.broadcast.emit('robot status', { 'data': updatedData });
  });
});

function processRobotCommand (command) {
  var parsedCommand = command.split("-");
  console.log('----- Command: -----');
  console.log(parsedCommand);
  
  if (serverStatus.hasArduino) {
    // commands to johnny five
    // A bit convoluted here: commands are split between '-', with an arbitrary order for each section
    if (parsedCommand[0] == 'manual') {
      if (parsedCommand[1] == 'throttle') {
        if (parsedCommand.length < 4) {
          parsedCommand[3] = stringValues['throttleTime'];
        }
        if (parsedCommand[2] in stringValues) {
          accelChange(stringValues[parsedCommand[2]], parsedCommand[3]);
        }
        else {
          accelChange(parseInt(parsedCommand[2]), parsedCommand[3]);
        }
      }
      else if (parsedCommand[1] == 'turn') {
        if (parsedCommand[2] in stringValues) {
          steerChange(stringValues[parsedCommand[2]]);
        }
        else {
          steerChange(parseInt(parsedCommand[2]));
        }
      }
    }
    // AI commands - to be forwarded to opencv
    else if (parsedCommand[0] == 'face') {
      console.log('facing');
      if (parsedCommand[1] == 'begin') {
        serverStatus.currentAI = 'upper_body';
      }
      else {
        serverStatus.currentAI = 'none';
      }
    }
    else if (parsedCommand[0] == 'red') {
      if (parsedCommand[1] == 'begin') {
        serverStatus.currentAI = 'red';
      }
      else {
        serverStatus.currentAI = 'none';
      }
    }
    else {    // parsedCommand[0] = 'stop'
      steerChange(stringValues['neutral']);
      accelChange(stringValues['stop']);
    }
  }
}

// ----- Johnny Five -----
// These should only be called or accessed if "noArduino" is not an option

function steerChange (value) {
  arduinoServos.steering.to(value);
  
  board.repl.inject({
    s: arduinoServos
  });
}

function accelChange (value, accelFor) {
  // Throttle has an automatic timeout so car doesn't run into things
  if (accelFor) {
    if (throttleTimeout) {
      clearTimeout(throttleTimeout);
    }
    throttleTimeout = setTimeout(function(){accelChange(stringValues['stop'])}, accelFor);
  }
  
  arduinoServos.acceleration.to(value);
  
  board.repl.inject({
    s: arduinoServos
  });
}

if (args.indexOf("noArduino") == -1) {
  board = new five.Board();

  board.on("ready", function() {
    arduinoServos = {
      acceleration: new five.Servo(accelerationServo),
      steering: new five.Servo(steeringServo)
    };
    acceleration = arduinoServos.acceleration;
    steering = arduinoServos.steering;
   
    // Inject the `servo` hardware into
    // the Repl instance's context;
    // allows direct command line access
    board.repl.inject({
      s: arduinoServos
    });
    
    serverStatus.hasArduino = true;
  });
}
