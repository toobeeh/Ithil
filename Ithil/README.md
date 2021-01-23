# Ithil

## Interface Documentation
To receive responses without having to register permanent handlers for them, a promise-based function is used to listen for responses:
```js
const emitEvent = (event, payload, listenResponse = false, responseTimeout = 2000) => {
        return new Promise((resolve, reject) => {
            if (listenResponse) socket.once(event + " response", (data) => {
                resolve(data.payload);
            });
            try { socket.sck.emit(event, { event: event, payload: payload }); }
            catch { reject(new Error("Failed emitting event: " + event)); }
            if (!listenResponse) resolve(true);
            else setTimeout(() => reject(new Error("Response timed out")), responseTimeout);
        });
    }
```
#### Connect to the socketio server
Open the socket:
```js
const socket = io("https://typo.rip:3000");
```
Authorize with the user login token, "true" means a response is awaited via the emitEvent function:
```js
let loginstate = await emitEvent("login", { loginToken: token }, true);
```
Reponse:
```json
{
    "authorized":true,
    "activeLobbies":[
       {
          "guildID":"123456",
          "guildLobbies":[
             // guild lobbies
          ]
       }
    ],
    "member":{
        "user":{
           "valid":true,
           "member":{
              "UserID":"123456",
              "UserName":"tobeh",
              "UserLogin":"123456",
              "Guilds":[
                 {
                    "GuildID":"123456",
                    "ChannelID":"123456",
                    "MessageID":"123456",
                    "ObserveToken":"123456",
                    "GuildName":"saple",
                    "Webhooks":null
                 }
              ]
           },
           "bubbles":100,
           "sprites":"0,1",
           "drops":100,
           "flag":2
        }
    }
 }
```
if authorized, or 
```json
{
    "authorized":false
}
```
if unauthorized via login token.  

The socket is now either in idle (authorized) or public (unauthorized) state.  
In idle state, events for joining and searching lobbies, drops and updated active lobbies are emitted by the server.  
Public sockets only get onlinesprite data events if this data changes, so sprites are visible for everyone.
### Set lobby searching status 
To set a idle socket to searching or waiting, emit following data:
```js
await emitEvent("search lobby", {searchData: {userName: "tobeh", waiting: false}}) 
```
If the player isn't currently jumping through lobbies but waiting for a free slot, set waiting to true.
### Join a lobby
Before lobby data is accepted by the server, the socket has to join the playing state.
This is done by joining the lobby with the join lobby event:
```js
await emitEvent("join lobby", {key: "1234"},true) 
```
The server will search for an active lobby with the same key. If there's already an open lobby, the players are shown together by setting the same lobby ID.  
A response with the id of the found or created lobby is sent:
```json
{
    "valid":true,
    "lobbyData":{
       "valid":true,
       "lobby":{
          "ID":"65731316",
          "Key":"123456-1234",
          "Description":""
       },
       "found":true
    }
 }
```
### Send lobby data
As soon as the socket is in playing state and has a set lobby ID, lobby data can be sent via the set lobby event.
The lobby data has to contain lobby properties like language, link, players and the current lobby key.
If the lobby key differs from the lobby key of the lobby ID in the database, the lobby key is updated.
The set lobby event:
```js
await emitEvent("set lobby", {lobbyKey: "666", lobby: lobby}) 
```
where lobby has to contain following properties:
```json
{
   "ID":"17710700",
   "Round":"3",
   "Private":false,
   "Link":"",
   "Host":"skribbl.io",
   "Players":[
      {
         "Name":"name fortnit",
         "Score":"965",
         "Drawing":false,
         "Sender":false,
         "LobbyPlayerID":"0"
      },
      {
         "Name":"So Bright",
         "Score":"0",
         "Drawing":false,
         "Sender":true,
         "ID":"334048043638849536",
         "LobbyPlayerID":"21"
      }
   ],
   "Language":"German",
   "Key":"0-1109710910132-7110111410997",
   "Description":""
}
```
### Leave the lobby
To stop being shown in the bot, the socket has to get back to the idle state.
This is done with the leave lobby event:
```js
await emitEvent("leave lobby", {}, true) 
```
The response conatins active lobbies, which can be used if a search is active.
Now, the socket is idle and can get back to either searching, waiting or playing state.
It will also receive active lobby data again.
