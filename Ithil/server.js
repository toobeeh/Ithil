fs = require('fs');

// Options for socket.io > 1.0.0
var options = {
    allowUpgrades: true,
    transports: ['polling', 'websocket'],
    pingTimeout: 6000,
    pingInterval: 3000,
    httpCompression: true,
    key: fs.readFileSync('/etc/letsencrypt/live/typo.rip/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/typo.rip/fullchain.pem'),
    origins: '*:*'
};

io = require('socket.io')(8000, options);