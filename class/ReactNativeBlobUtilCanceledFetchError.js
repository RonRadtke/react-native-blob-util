const CANCELED_FETCH_ERROR_NAME = 'ReactNativeBlobUtilCanceledFetch';

class CanceledFetchError extends Error {
    constructor(message) {
        super(message);
        this.name = CANCELED_FETCH_ERROR_NAME;
    }
}

export default CanceledFetchError;