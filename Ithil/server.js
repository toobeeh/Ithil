const app = require('express')();
const http = require('http').createServer(app);

app.get('/', (req, res) => {
  res.send('<h1>Hello world</h1>');
});
app.get('/sub', (req, res) => {
    res.send('<h1>Hello subdirectory</h1>');
});

http.listen(3000, () => {
  console.log('listening on *:3000');
});