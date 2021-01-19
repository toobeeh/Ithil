var fs = require('fs');
var https = require('https');
let app = https.createServer({
    key: fs.readFileSync('/etc/letsencrypt/live/typo.rip/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/typo.rip/cert.pem')
});
var io = require('socket.io').listen(app);
app.listen(3000);
io.on('connection', (socket) => {
    console.log('a user connected');
});