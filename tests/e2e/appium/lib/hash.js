const crypto = require('crypto');

const hashFor = (algorithm, value) => crypto.createHash(algorithm).update(value).digest('hex');

module.exports = {
    hashFor,
};
