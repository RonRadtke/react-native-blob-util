import fs from "../fs";
import ReactNativeBlobUtilSession from "./ReactNativeBlobUtilSession";
import base64 from "base-64";
import {bytesOfBinaryString, bytesOfUtf8} from "../utils/bytes";
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
    text: () => string | Promise<any>;
    json: () => any;
    base64: () => any;
    flush: () => void;
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
         * Convert result to text.
         * @return {string} Decoded base64 string.
         */
        this.text = (): string | Promise<any> => {
            switch (this.type) {
                case 'base64':
                    return base64.decode(this.data);
                case 'path':
                    return fs.readFile(this.data, 'base64').then((b64) => Promise.resolve(base64.decode(b64)));
                default:
                    return this.data;
            }
        };
        /**
         * Convert result to JSON object.
         * @return {object} Parsed javascript object.
         */
        this.json = (): any => {
            switch (this.type) {
                case 'base64':
                    return JSON.parse(base64.decode(this.data));
                case 'path':
                    return fs.readFile(this.data, 'utf8')
                        .then((text) => Promise.resolve(JSON.parse(text)));
                default:
                    return JSON.parse(this.data);
            }
        };
        /**
         * Return BASE64 string directly.
         * @return {string} BASE64 string of response body.
         */
        this.base64 = (): string | Promise<any> => {
            switch (this.type) {
                case 'base64':
                    return this.data;
                case 'path':
                    return fs.readFile(this.data, 'base64');
                default:
                    return base64.encode(this.data);
            }
        };
        /**
         * Remove cahced file
         * @return {Promise}
         */
        this.flush = () => {
            let path = this.path();
            if (!path || this.type !== 'path')
                return;
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
         * @param  {String} encoding Encode type, should be one of `base64`, `ascrii`, `utf8`.
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