import fs from "../fs";
import ReactNativeBlobUtilSession from "./ReactNativeBlobUtilSession";
import base64 from "base-64";
import {binaryStringOfBytes, bytesOfBinaryString, bytesOfUtf8, utf8OfBytes} from "../utils/bytes";
import type {ReactNativeBlobUtilResponseInfo, ReactNativeBlobUtilStream} from "../types";
/**
 * ReactNativeBlobUtil response object class.
 */
export class FetchBlobResponse {

    taskId: string;
    path: () => string | null;
    type: 'base64' | 'path' | 'utf8';
    data: any;
    array: () => Promise<Array<number>>;
    text: () => Promise<string>;
    json: () => Promise<any>;
    base64: () => Promise<string>;
    flush: () => Promise<void>;
    respInfo: ReactNativeBlobUtilResponseInfo;
    session: (name: string) => ReactNativeBlobUtilSession | null;
    readFile: (encode: 'base64' | 'utf8' | 'ascii') => ?Promise<any>;
    readStream: (
        encode: 'utf8' | 'ascii' | 'base64',
    ) => ReactNativeBlobUtilStream | null;

    constructor(taskId: string, info: ReactNativeBlobUtilResponseInfo, data: any) {
        this.data = data;
        this.taskId = taskId;
        this.type = info.rnfbEncode;
        this.respInfo = info;

        this.info = (): ReactNativeBlobUtilResponseInfo => {
            return this.respInfo;
        };

        /**
         * The response body as an array of byte values.
         * @return {Promise<Array<number>>}
         */
        this.array = (): Promise<Array<number>> => {
            switch (this.type) {
                case 'base64':
                    return Promise.resolve(bytesOfBinaryString(base64.decode(this.data)));
                case 'path':
                    return fs.readFile(this.data, 'ascii');
                default:
                    return Promise.resolve(bytesOfUtf8(this.data));
            }
        };

        /**
         * The body as text, decoded as UTF-8. Always a Promise, whether the body
         * is held in memory or in a file. A file is read as base64 and decoded
         * here, so an embedded NUL survives on iOS too, whose native utf8 strings
         * end at the first NUL. A leading byte order mark is dropped, as fetch's
         * Response.text() does; JSON.parse would fail on it.
         * @return {Promise<string>}
         */
        this.text = (): Promise<string> => {
            const decode = (b64) => utf8OfBytes(bytesOfBinaryString(base64.decode(b64)));
            switch (this.type) {
                case 'base64':
                    return Promise.resolve(decode(this.data));
                case 'path':
                    return fs.readFile(this.data, 'base64').then(decode);
                default:
                    return Promise.resolve(typeof this.data === 'string' && this.data.charCodeAt(0) === 0xfeff ? this.data.slice(1) : this.data);
            }
        };
        /**
         * The body parsed as JSON.
         * @return {Promise<any>}
         */
        this.json = (): Promise<any> => {
            return this.text().then((text) => JSON.parse(text));
        };
        /**
         * The body as a base64 string.
         * @return {Promise<string>}
         */
        this.base64 = (): Promise<string> => {
            switch (this.type) {
                case 'base64':
                    return Promise.resolve(this.data);
                case 'path':
                    return fs.readFile(this.data, 'base64');
                default:
                    return Promise.resolve(base64.encode(binaryStringOfBytes(bytesOfUtf8(this.data))));
            }
        };
        /**
         * Remove the response file. Resolves without doing anything when the
         * body is not a file.
         * @return {Promise<void>}
         */
        this.flush = (): Promise<void> => {
            const path = this.path();
            if (!path || this.type !== 'path') {
                return Promise.resolve();
            }
            return fs.unlink(path);
        };
        /**
         * get path of response temp file
         * @return {string} File path of temp file.
         */
        this.path = () => {
            if (this.type === 'path')
                return this.data;
            return null;
        };

        this.session = (name: string): ReactNativeBlobUtilSession | null => {
            if (this.type === 'path')
                return fs.session(name).add(this.data);
            else {
                console.warn('only file paths can be add into session.');
                return null;
            }
        };
        /**
         * Start read stream from cached file
         * @param  {String} encoding Encode type, should be one of `base64`, `ascii`, `utf8`.
         * @return {void}
         */
        this.readStream = (encoding: 'base64' | 'utf8' | 'ascii'): ReactNativeBlobUtilStream | null => {
            if (this.type === 'path') {
                return fs.readStream(this.data, encoding);
            }
            else {
                console.warn('ReactNativeBlobUtil', 'this response data does not contains any available stream');
                return null;
            }
        };
        /**
         * Read file content with given encoding, if the response does not contains
         * a file path, show warning message
         * @param  {String} encoding Encode type, should be one of `base64`, `ascii`, `utf8`.
         * @return {String}
         */
        this.readFile = (encoding: 'base64' | 'utf8' | 'ascii') => {
            if (this.type === 'path') {
                return fs.readFile(this.data, encoding);
            }
            else {
                console.warn('ReactNativeBlobUtil', 'this response does not contains a readable file');
                return null;
            }
        };
    }

}