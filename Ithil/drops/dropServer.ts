// require packets
const app = require('express')();
const workerHttps = require('https');
const fs = require('fs');
import WebSocket, { WebSocketServer } from 'ws';
const ipc = require('node-ipc');
const config = require("../ecosystem.config").config;
const palantirDb = require("../palantirDatabase");

console.log("hi");

