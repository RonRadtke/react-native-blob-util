const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const byId = (id) => `~${id}`;

module.exports = {
    sleep,
    byId,
};
