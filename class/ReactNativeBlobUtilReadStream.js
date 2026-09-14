// Copyright 2016 wkh237@github. All rights reserved.
// Use of this source code is governed by a MIT-style license that can be
// found in the LICENSE file.

import UUID from '../utils/uuid';
import {toUnsignedBytes} from '../utils/bytes';

import {getEventEmitter, requireNativeModule} from '../utils/nativeModule';

// A multiple of 3 so that base64 chunks concatenate without padding in the middle.
const DEFAULT_BUFFER_SIZE = 12288;
const DEFAULT_TICK = 10;

export default class ReactNativeBlobUtilReadStream {

    path: string;
    encoding: 'utf8' | 'ascii' | 'base64';
    bufferSize: ?number;
    closed: boolean;
    tick: number = DEFAULT_TICK;

    constructor(path: string, encoding: string, bufferSize?: ?number, tick: number) {
        if (!path)
            throw Error('ReactNativeBlobUtil could not open file stream with empty `path`');
        this.encoding = encoding || 'utf8';
        this.bufferSize = bufferSize;
        this.path = path;
        this.closed = false;
        this.tick = tick > 0 ? tick : DEFAULT_TICK;
        this._onData = () => {
        };
        this._onEnd = () => {
        };
        this._onError = () => {
        };
        this.streamId = 'RNFBRS' + UUID();

        // register for file stream event
        let subscription = getEventEmitter().addListener('ReactNativeBlobUtilFilesystem', (e) => {
            if (typeof e === 'string') e = JSON.parse(e);
            if (e.streamId !== this.streamId) return; // wrong stream
            let {event, code, detail} = e;
            if (this._onData && event === 'data') {
                // ascii chunks are bytes 0..255; Android and iOS send them signed
                this._onData(this.encoding === 'ascii' ? toUnsignedBytes(detail) : detail);
                return;
            }
            else if (this._onEnd && event === 'end') {
                this._onEnd(detail);
            }
            else {
                const err = new Error(detail);
                err.code = code || 'EUNSPECIFIED';
                if (this._onError)
                    this._onError(err);
                else
                    throw err;
            }
            // when stream closed or error, remove event handler
            if (event === 'error' || event === 'end') {
                subscription.remove();
                this.closed = true;
            }
        });

    }

    open() {
        if (!this.closed)
            requireNativeModule().readStream(this.path, this.encoding, this.bufferSize > 0 ? this.bufferSize : DEFAULT_BUFFER_SIZE, this.tick, this.streamId);
        else
            throw new Error('Stream closed');
    }

    onData(fn: () => void) {
        this._onData = fn;
    }

    onError(fn) {
        this._onError = fn;
    }

    onEnd(fn) {
        this._onEnd = fn;
    }

}
