module.exports = {
    apps: [
        {
            name: "Ithil Master Server",
            script: "ithilMaster.js"
        }, {
            name: "Ithil Worker Server",
            script: "ithilWorker.js",
            exec_mode: "cluster",
            instances: 8,
            wait_ready: true,
            listen_timeout: 1000
        }]
}