# Ithil

## Interface Documentation
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
### Set searching status 

