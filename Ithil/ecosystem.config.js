module.exports = {
    apps: [
        {
            name: "Ithil Master Server",
            script: "ithilMaster.js",
            time: true
        }, {
            name: "Ithil Drop Server",
            script: "drops/dropServer.js",
            time: true
        }, {
            name: "Ithil Worker Server",
            script: "ithilWorker.js",
            exec_mode: "cluster",
            instances: 8,
            wait_ready: true,
            listen_timeout: 10000,
            time: true
        }],
    config: {
        masterPort: 4000,
        coordinationPort: 3999,
        dropPort: 4001,
        workerRange: [4002, 4010],
        minAvailableWorker: 7,
        certificatePath: '/etc/letsencrypt/live/typo.rip'
    }
}