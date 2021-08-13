module.exports = {
    apps: [
        {
            name: "Ithil Master Server",
            script: "ithilMaster.js"
        }, {
            name: "Ithil Worker Server",
            script: "ithilWorker.js",
            exec_mode: "cluster",
            instances: 4,
            wait_ready: true,
            listen_timeout: 10000
        }]
}