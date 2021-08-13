module.exports = {
    apps: [
        {
            name: "Ithil Master Server",
            script: "ithilMaster.js"
        }, {
            name: "Ithil Worker Server QUAD 1",
            script: "ithilWorker.js",
            exec_mode: "cluster",
            instances: 4,
            wait_ready: true,
            listen_timeout: 10000
        }, {
            name: "Ithil Worker Server QUAD 2",
            script: "ithilWorker.js",
            exec_mode: "cluster",
            instances: 4,
            wait_ready: true,
            listen_timeout: 10000
        }]
}