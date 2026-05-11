/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React, {useState} from 'react';
import {Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
// import {Picker} from '@react-native-picker/picker'; Need to remove this package as it is not supported in Windows New Architecture
import {Colors} from 'react-native/Libraries/NewAppScreen';

import ReactNativeBlobUtil from 'react-native-blob-util';

const DEFAULT_BASE_URL = Platform.select({
    android: 'http://10.0.2.2:19076',
    ios: 'http://127.0.0.1:19076',
    default: 'http://127.0.0.1:19076',
});

const MAX_LOG_ENTRIES = 200;

const e2eId = (id) => ({testID: id, nativeID: id, accessibilityLabel: id, accessible: true});
const e2eTestId = (id) => ({testID: id, nativeID: id, accessibilityLabel: id, accessible: true});

const normalizeBaseUrl = (value) => (value || '').trim().replace(/\/+$/, '');

const E2EButton = ({id, title, onPress, color}) => (
    <Pressable
        onPress={onPress}
        testID={id}
        nativeID={id}
        accessibilityLabel={id}
        accessibilityRole="button"
        accessible={true}
        style={[styles.e2eButton, color ? {backgroundColor: color} : null]}>
        <Text style={styles.e2eButtonText}>{title}</Text>
    </Pressable>
);

const App: () => React$Node = () => {
    const [e2eEnabled, setE2eEnabled] = useState(false);
    const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
    const [logEntries, setLogEntries] = useState([]);
    const [lastLogEntry, setLastLogEntry] = useState('');

    const [existsParam, setExistsParam] = useState('');
    const [lsParam, setLSParam] = useState('');

    const [cpSourceParam, setCPSourceParam] = useState('');
    const [cpDestParam, setCPDestParam] = useState('');

    const [unlinkParam, setUnlinkParam] = useState('');

    const [statParam, setStatParam] = useState('');

    const [mkdirParam, setMkdirParam] = useState('');
    const [mkdirURIParam, setMkdirURIParam] = useState('');

    const [readParam, setReadParam] = useState('');

    const [hashPathParam, setHashPathParam] = useState('');
    const [hashAlgValue, setHashAlgValue] = useState('md5');

    const [writeParam, setWriteParam] = useState('');
    const [writeURIParam, setWriteURIParam] = useState('');
    const [writeEncodeParam, setWriteEncodeParam] = useState('utf8');

    const [writeStreamParam, setWriteStreamParam] = useState('');
    const [writeEncodeStreamParam, setWriteStreamEncodeParam] = useState('utf8');

    const [readStreamParam, setReadStreamParam] = useState('');
    const [readEncodeStreamParam, setReadStreamEncodeParam] = useState('utf8');

    const e2eRoot = ReactNativeBlobUtil.fs.dirs.DocumentDir + '/e2e';
    const imageToUploadPath = ReactNativeBlobUtil.fs.dirs.DocumentDir + '/ImageToUpload.jpg';

    const appendLog = (message) => {
        console.log(message);
        if (!e2eEnabled) {
            return;
        }
        setLastLogEntry(message);
        setLogEntries((prev) => {
            const next = [...prev, message];
            if (next.length > MAX_LOG_ENTRIES) {
                next.splice(0, next.length - MAX_LOG_ENTRIES);
            }
            return next;
        });
    };

    const appendE2eLog = (message) => {
        console.log(message);
        setLastLogEntry(message);
        setLogEntries((prev) => {
            const next = [...prev, message];
            if (next.length > MAX_LOG_ENTRIES) {
                next.splice(0, next.length - MAX_LOG_ENTRIES);
            }
            return next;
        });
    };

    const notify = (title, message) => {
        if (e2eEnabled) {
            const line = message ? `${title}: ${message}` : title;
            appendLog(line);
            return;
        }
        if (message !== undefined) {
            Alert.alert(title, message);
        }
        else {
            Alert.alert(title);
        }
    };

    const notifyError = (err) => {
        const message = err?.message ?? String(err);
        notify('Error', message);
    };

    const buildUrl = (path) => {
        const base = normalizeBaseUrl(baseUrl) || DEFAULT_BASE_URL;
        if (!base) {
            return path;
        }
        if (path.startsWith('/')) {
            return `${base}${path}`;
        }
        return `${base}/${path}`;
    };

    const clearLog = () => {
        setLogEntries([]);
    };

    const toggleE2eMode = () => {
        setE2eEnabled((prev) => !prev);
    };

    const resetE2eFixtures = async () => {
        const fs = ReactNativeBlobUtil.fs;
        try {
            const rootExists = await fs.exists(e2eRoot);
            if (rootExists) {
                await fs.unlink(e2eRoot);
            }
            await fs.mkdir(e2eRoot);
            await fs.mkdir(e2eRoot + '/dir');
            await fs.createFile(e2eRoot + '/exists.txt', 'exists', 'utf8');
            await fs.createFile(e2eRoot + '/source.txt', 'source', 'utf8');
            await fs.createFile(e2eRoot + '/stat.txt', 'stat', 'utf8');
            await fs.createFile(e2eRoot + '/read.txt', 'foo', 'utf8');
            await fs.createFile(e2eRoot + '/hash.txt', 'hash-content', 'utf8');
            await fs.createFile(e2eRoot + '/uri-source.txt', 'uri-source', 'utf8');
            await fs.createFile(e2eRoot + '/write-source.txt', 'write-source', 'utf8');
            await fs.createFile(e2eRoot + '/stream.txt', 'stream-data', 'utf8');
            await fs.createFile(e2eRoot + '/unlink.txt', 'unlink', 'utf8');
            await fs.createFile(e2eRoot + '/dir/child.txt', 'child', 'utf8');

            const imageExists = await fs.exists(imageToUploadPath);
            if (imageExists) {
                await fs.unlink(imageToUploadPath);
            }
            await fs.createFile(imageToUploadPath, 'ZmFrZSBqcGc=', 'base64');

            setE2eEnabled(true);
            appendE2eLog('E2E: Fixtures ready');
        } catch (err) {
            notifyError(err);
        }
    };

    const existsCall = () => {
        ReactNativeBlobUtil.fs
            .exists(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + existsParam)
            .then((result) => {
                notify('Exists', String(result));
            })
            .catch(notifyError);
    };

    const isDirCall = () => {
        ReactNativeBlobUtil.fs
            .exists(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + existsParam)
            .then((result) => {
                notify('isDir', String(result));
            })
            .catch(notifyError);
    };

    const dfCall = () => {
        ReactNativeBlobUtil.fs
            .df()
            .then((result) => {
                notify('Disk', 'Free space: ' + result.free + ' bytes\nTotal space: ' + result.total + ' bytes');
            })
            .catch(notifyError);
    };

    const lsCall = () => {
        ReactNativeBlobUtil.fs
            .ls(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + lsParam)
            .then((files) => {
                appendLog('ls: ' + JSON.stringify(files));
                notify('ls', 'ok');
            })
            .catch(notifyError);
    };

    const cpCall = () => {
        ReactNativeBlobUtil.fs
            .cp(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + cpSourceParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + cpDestParam)
            .then(() => notify('Copy', 'File successfully copied'))
            .catch(notifyError);
    };

    const mvCall = () => {
        ReactNativeBlobUtil.fs
            .mv(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + cpSourceParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + cpDestParam)
            .then(() => notify('Move', 'File successfully moved'))
            .catch(notifyError);
    };

    const unlinkCall = () => {
        ReactNativeBlobUtil.fs
            .unlink(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + unlinkParam)
            .then(() => notify('Unlink', 'file/directory successfully unlinked'))
            .catch(notifyError);
    };

    const statCall = () => {
        ReactNativeBlobUtil.fs
            .stat(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + statParam)
            .then((stats) => {
                appendLog('stat: ' + JSON.stringify(stats));
                notify('stat', 'filename: ' + stats.filename + '\nlastModified: ' + stats.lastModified + '\npath: ' + stats.path + '\nsize: ' + stats.size + '\ntype: ' + stats.type);
            })
            .catch(notifyError);
    };

    const lstatCall = () => {
        ReactNativeBlobUtil.fs
            .lstat(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + statParam)
            .then((stats) => {
                appendLog('lstat: ' + JSON.stringify(stats));
                notify('lstat', 'filename: ' + stats[0].filename + '\nlastModified: ' + stats[0].lastModified + '\npath: ' + stats[0].path + '\nsize: ' + stats[0].size + '\ntype: ' + stats[0].type);
            })
            .catch(notifyError);
    };

    const mkdirCall = () => {
        if (mkdirParam.length > 0) {
            ReactNativeBlobUtil.fs
                .mkdir(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam)
                .then(() => {
                    notify('mkdir', ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam);
                })
                .catch(notifyError);
        }
        else {
            notify('mkdir', 'Cannot make file with no name provided');
        }
    };

    const createFileUTF8Call = () => {
        ReactNativeBlobUtil.fs
            .createFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam, 'foo', 'utf8')
            .then(() => notify('createFile', 'utf8'))
            .catch(notifyError);
    };

    const createFileASCIICall = () => {
        ReactNativeBlobUtil.fs
            .createFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam, [102, 111, 111], 'ascii')
            .then(() => notify('createFile', 'ascii'))
            .catch(notifyError);
    };

    const createFileBase64Call = () => {
        ReactNativeBlobUtil.fs
            .createFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam, 'Zm9v', 'base64')
            .then(() => notify('createFile', 'base64'))
            .catch(notifyError);
    };

    const createFileURICall = () => {
        ReactNativeBlobUtil.fs
            .createFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirURIParam, 'uri')
            .then(() => notify('createFile', 'uri'))
            .catch(notifyError);
    };

    const readFileUTF8Call = () => {
        ReactNativeBlobUtil.fs
            .readFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + readParam, 'utf8')
            .then((data) => {
                notify('readFile utf8', data);
            })
            .catch(notifyError);
    };

    const readFileASCIICall = () => {
        ReactNativeBlobUtil.fs
            .readFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + readParam, 'ascii')
            .then((data) => {
                notify('readFile ascii', data);
            })
            .catch(notifyError);
    };

    const readFileBase64Call = () => {
        ReactNativeBlobUtil.fs
            .readFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + readParam, 'base64')
            .then((data) => {
                notify('readFile base64', data);
            })
            .catch(notifyError);
    };

    const hashCall = () => {
        ReactNativeBlobUtil.fs
            .hash(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + hashPathParam, hashAlgValue)
            .then((hash) => {
                notify('hash ' + hashAlgValue, hash);
            })
            .catch(notifyError);
    };

    const writeFileCall = () => {
        if (writeParam.length > 0) {
            if (writeEncodeParam === 'uri') {
                if (writeURIParam.length > 0) {
                    ReactNativeBlobUtil.fs
                        .writeFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeURIParam, writeEncodeParam)
                        .then(() => notify('writeFile', 'uri'))
                        .catch(notifyError);
                }
                else {
                    notify('writeFile', 'uri path undefined');
                }
            }
            else if (writeEncodeParam === 'ascii') {
                ReactNativeBlobUtil.fs
                    .writeFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, [102, 111, 111], writeEncodeParam)
                    .then(() => notify('writeFile', 'ascii'))
                    .catch(notifyError);
            }
            else {
                ReactNativeBlobUtil.fs
                    .writeFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, 'foo', writeEncodeParam)
                    .then(() => notify('writeFile', writeEncodeParam))
                    .catch(notifyError);
            }
        }
    };

    const appendFileCall = () => {
        if (writeParam.length > 0) {
            if (writeEncodeParam === 'uri') {
                if (writeURIParam.length > 0) {
                    ReactNativeBlobUtil.fs
                        .appendFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeURIParam, writeEncodeParam)
                        .then(() => notify('appendFile', 'uri'))
                        .catch(notifyError);
                }
                else {
                    notify('appendFile', 'uri path undefined');
                }
            }
            else if (writeEncodeParam === 'ascii') {
                ReactNativeBlobUtil.fs
                    .appendFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, [102, 111, 111], writeEncodeParam)
                    .then(() => notify('appendFile', 'ascii'))
                    .catch(notifyError);
            }
            else {
                ReactNativeBlobUtil.fs
                    .appendFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, 'foo', writeEncodeParam)
                    .then(() => notify('appendFile', writeEncodeParam))
                    .catch(notifyError);
            }
        }
    };

    const writeStreamCall = () => {
        if (writeStreamParam.length > 0) {
            if (writeEncodeStreamParam === 'base64') {
                ReactNativeBlobUtil.fs
                    .writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, false)
                    .then((stream) => {
                        stream.write('Zm9vIChXcml0ZSBCYXNlNjQpMQ==');
                        stream.write('Zm9vIChXcml0ZSBCYXNlNjQpMg==');
                        return stream.close();
                    })
                    .then(() => notify('writeStream', 'base64'))
                    .catch(notifyError);
            }
            else if (writeEncodeStreamParam === 'ascii') {
                ReactNativeBlobUtil.fs
                    .writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, false)
                    .then((stream) => {
                        stream.write([102, 111, 111, 32, 40, 87, 114, 105, 116]);
                        stream.write([101, 32, 97, 115, 99, 105, 105, 41]);
                        return stream.close();
                    })
                    .then(() => notify('writeStream', 'ascii'))
                    .catch(notifyError);
            }
            else {
                ReactNativeBlobUtil.fs
                    .writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, false)
                    .then((stream) => {
                        stream.write('foo (Write utf8)1');
                        stream.write('foo (Write utf8)2');
                        return stream.close();
                    })
                    .then(() => notify('writeStream', writeEncodeStreamParam))
                    .catch(notifyError);
            }
        }
    };

    const appendStreamCall = () => {
        if (writeStreamParam.length > 0) {
            if (writeEncodeStreamParam === 'base64') {
                ReactNativeBlobUtil.fs
                    .writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, true)
                    .then((stream) => {
                        stream.write('Zm9vIChBcHBlbmQgQmFzZTY0KTE=');
                        stream.write('Zm9vIChBcHBlbmQgQmFzZTY0KTI=');
                        return stream.close();
                    })
                    .then(() => notify('appendStream', 'base64'))
                    .catch(notifyError);
            }
            else if (writeEncodeStreamParam === 'ascii') {
                ReactNativeBlobUtil.fs
                    .writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, true)
                    .then((stream) => {
                        stream.write([102, 111, 111, 32, 40]);
                        stream.write([65, 112, 112, 101, 110, 100, 32, 65, 83, 67, 73, 73, 41]);
                        return stream.close();
                    })
                    .then(() => notify('appendStream', 'ascii'))
                    .catch(notifyError);
            }
            else {
                ReactNativeBlobUtil.fs
                    .writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, true)
                    .then((stream) => {
                        stream.write('foo (Append utf8)1');
                        stream.write('foo (Append utf8)2');
                        return stream.close();
                    })
                    .then(() => notify('appendStream', writeEncodeStreamParam))
                    .catch(notifyError);
            }
        }
    };

    const readStreamCall = () => {
        ReactNativeBlobUtil.fs
            .readStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + readStreamParam, readEncodeStreamParam, 4000, 200)
            .then((stream) => {
                let data = '';
                stream.open();
                stream.onData((chunk) => {
                    data += chunk;
                });
                stream.onEnd(() => {
                    appendLog('readStream data: ' + data);
                    notify('readStream', 'length: ' + data.length);
                });
            })
            .catch(notifyError);
    };

    const fetchCall = () => {
        ReactNativeBlobUtil.config({
            fileCache: true,
        })
            .fetch('GET', buildUrl('/image.png'))
            .then((res) => {
                notify('fetch', res.path());
            })
            .catch(notifyError);
    };

    const androidmediastore = () => {
        ReactNativeBlobUtil.config({
            fileCache: true,
        })
            .fetch('GET', buildUrl('/image.png'))
            .then((res) => {
                ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
                    {
                        name: 'test.png',
                        parentFolder: '',
                        mimeType: 'image/png',
                    },
                    'Download',
                    res.path(),
                )
                    .then((dest) => {
                        ReactNativeBlobUtil.android.actionViewIntent(dest, 'image/png');
                        notify('MediaStore', dest);
                    })
                    .catch(notifyError);
            })
            .catch(notifyError);
    };

    const uploadFromStorageCall = () => {
        ReactNativeBlobUtil.fetch(
            'POST',
            buildUrl('/upload-file'),
            {
                Authorization: 'Bearer access-token...',
                'Dropbox-API-Arg': JSON.stringify({
                    path: '/img-from-react-native.png',
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }),
                'Content-Type': 'application/octet-stream',
            },
            ReactNativeBlobUtil.wrap(imageToUploadPath),
        )
            .then((res) => {
                notify('upload file', res.text());
            })
            .catch((err) => {
                notifyError(err);
            });
    };

    const uploadTextFromCall = () => {
        ReactNativeBlobUtil.fetch(
            'POST',
            buildUrl('/upload-text'),
            {
                Authorization: 'Bearer access-token...',
                'Dropbox-API-Arg': JSON.stringify({
                    path: '/img-from-react-native.png',
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }),
                'Content-Type': 'application/octet-stream',
            },
            'Waka Flacka Flame goes very well with Thomas the Tank Engine.',
        )
            .then((res) => {
                notify('upload text', res.text());
            })
            .catch((err) => {
                notifyError(err);
            });
    };

    const MultipartFileAndData = () => {
        ReactNativeBlobUtil.fetch(
            'POST',
            buildUrl('/multipart'),
            {
                Authorization: 'Bearer access-token...',
                'Dropbox-API-Arg': JSON.stringify({
                    path: '/img-from-react-native.png',
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }),
                'Content-Type': 'application/octet-stream',
            },
            'Waka Flacka Flame goes very well with Thomas the Tank Engine.',
        )
            .uploadProgress((received, total) => {
                if (e2eEnabled && total > 0 && received === total) {
                    appendLog('multipart upload progress: 100%');
                }
            })
            .progress((received, total) => {
                if (e2eEnabled && total > 0 && received === total) {
                    appendLog('multipart download progress: 100%');
                }
            })
            .then((res) => {
                notify('multipart', res.text());
            })
            .catch((err) => {
                notifyError(err);
            });
    };

    const MakeRequestWithProgress = () => {
        ReactNativeBlobUtil.config({
            fileCache: true,
        })
            .fetch(
                'POST',
                buildUrl('/progress'),
                {
                    Authorization: 'Bearer access-token',
                    otherHeader: 'foo',
                    'Content-Type': 'multipart/form-data',
                },
                [
                    {name: 'avatar', filename: 'avatar.png', data: 'Kentucky Fried Seth'},
                    {
                        name: 'avatar-png',
                        filename: 'avatar-png.png',
                        type: 'image/png',
                        data: 'whaddup my pickles',
                    },
                    {
                        name: 'avatar-foo',
                        filename: 'avatar-foo.png',
                        type: 'image/foo',
                        data: ReactNativeBlobUtil.wrap(imageToUploadPath),
                    },
                    {name: 'name', data: 'user'},
                    {
                        name: 'info',
                        data: JSON.stringify({
                            mail: 'example@example.com',
                            tel: '12345678',
                        }),
                    },
                ],
            )
            .uploadProgress({interval: 250}, (written, total) => {
                if (e2eEnabled && total > 0 && written === total) {
                    appendLog('progress upload: 100%');
                }
            })
            .progress({count: 10, interval: -1}, (received, total) => {
                if (e2eEnabled && total > 0 && received === total) {
                    appendLog('progress download: 100%');
                }
            })
            .then((res) => {
                notify('progress', res.text());
            })
            .catch((err) => {
                notifyError(err);
            });
    };

    return (
        <>
            <View style={styles.root}>
                <View
                    testID="main-scroll-container"
                    nativeID="main-scroll-container"
                    accessibilityLabel="main-scroll-container"
                    accessible={true}
                    style={styles.root}>
                    <ScrollView
                        contentInsetAdjustmentBehavior="automatic"
                        style={styles.scrollView}
                        accessible={false}>

                        <Text style={styles.sectionTitle}>{'React Native Blob Util E2E App'}</Text>

                        <View style={{display: 'none'}}>
                            <View style={styles.sectionContainer}>
                                <View style={styles.sectionDescription}>
                                    <Text>
                                        {'DocumentDir: ' + ReactNativeBlobUtil.fs.dirs.DocumentDir + '\n'}
                                        {'CacheDir: ' + ReactNativeBlobUtil.fs.dirs.CacheDir + '\n'}
                                        {'PictureDir: ' + ReactNativeBlobUtil.fs.dirs.PictureDir + '\n'}
                                        {'MusicDir: ' + ReactNativeBlobUtil.fs.dirs.MusicDir + '\n'}
                                        {'DownloadDir: ' + ReactNativeBlobUtil.fs.dirs.DownloadDir + '\n'}
                                        {'DCIMDir: ' + ReactNativeBlobUtil.fs.dirs.DCIMDir + '\n'}
                                        {'SDCardDir: ' + ReactNativeBlobUtil.fs.dirs.SDCardDir + '\n'}
                                        {'SDCardApplicationDir: ' + ReactNativeBlobUtil.fs.dirs.SDCardApplicationDir + '\n'}
                                        {'MainBundleDir: ' + ReactNativeBlobUtil.fs.dirs.MainBundleDir + '\n'}
                                        {'LibraryDir: ' + ReactNativeBlobUtil.fs.dirs.LibraryDir + '\n'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'E2E Controls'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Base URL"
                                        value={baseUrl}
                                        onChangeText={setBaseUrl}
                                        placeholderTextColor="#9a73ef"
                                        autoCapitalize="none"
                                        {...e2eId('e2e-base-url-input')}
                                    />
                                </View>
                                <View style={styles.buttonGroup}>
                                    <E2EButton id="e2e-toggle-button" title={e2eEnabled ? 'Disable E2E Mode' : 'Enable E2E Mode'} color="#9a73ef" onPress={toggleE2eMode}/>
                                    <E2EButton id="e2e-reset-fixtures-button" title="Reset E2E Fixtures" color="#9a73ef" onPress={resetE2eFixtures}/>
                                    <E2EButton id="e2e-clear-log-button" title="Clear E2E Log" color="#9a73ef" onPress={clearLog}/>
                                </View>

                                {e2eEnabled ? (
                                    <View style={styles.e2eLog} {...e2eId('e2e-log')}>
                                        <Text style={styles.e2eLogText} {...e2eId(`e2e-last-log-output:${lastLogEntry}`)}>
                                            {lastLogEntry || 'No last log entry'}
                                        </Text>
                                        <Text style={styles.e2eLogText} {...e2eTestId('e2e-log-output')}>
                                            {logEntries.length === 0 ? 'No log entries' : logEntries.join('\n')}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'exists - exists(), isDir()'}</Text>
                                <TextInput style={styles.input} placeholder="Path" onChangeText={setExistsParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('exists-path-input')} />
                                <E2EButton id="exists-button" title="Check if exists" color="#9a73ef" onPress={existsCall}/>
                                <E2EButton id="isdir-button" title="Check if is dir" color="#9a73ef" onPress={isDirCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'df - df()'}</Text>
                                <E2EButton id="df-button" title="Get free/total disk space" color="#9a73ef" onPress={dfCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'ls - ls()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput style={styles.input} placeholder="Directory Path" onChangeText={setLSParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('ls-path-input')} />
                                </View>
                                <E2EButton id="ls-button" title="Get specified directory info" color="#9a73ef" onPress={lsCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'cp and mv - cp() and mv()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput style={styles.input} placeholder="Source File Path" onChangeText={setCPSourceParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('cp-source-input')} />
                                    <TextInput style={styles.input} placeholder="Destintation File Path" onChangeText={setCPDestParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('cp-dest-input')} />
                                </View>
                                <E2EButton id="cp-button" title="Copy File to Destination" color="#9a73ef" onPress={cpCall}/>
                                <E2EButton id="mv-button" title="Move File to Destination" color="#9a73ef" onPress={mvCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'unlink - unlink()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput style={styles.input} placeholder="File Path" onChangeText={setUnlinkParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('unlink-path-input')} />
                                </View>
                                <E2EButton id="unlink-button" title="Unlink" color="#9a73ef" onPress={unlinkCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'stat - stat(), lstat()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput style={styles.input} placeholder="Source path" onChangeText={setStatParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('stat-path-input')} />
                                </View>
                                <E2EButton id="stat-button" title="stat Call" color="#9a73ef" onPress={statCall}/>
                                <E2EButton id="lstat-button" title="lstat Call" color="#9a73ef" onPress={lstatCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'mkdir - mkdir(), createFile()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput style={styles.input} placeholder="Source path" onChangeText={setMkdirParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('mkdir-path-input')} />
                                    <TextInput style={styles.input} placeholder="URI source path" onChangeText={setMkdirURIParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('mkdir-uri-input')} />
                                </View>
                                <E2EButton id="mkdir-button" title="mkdir" color="#9a73ef" onPress={mkdirCall}/>
                                <E2EButton id="create-utf8-button" title="Create UTF8 file" color="#9a73ef" onPress={createFileUTF8Call}/>
                                <E2EButton id="create-ascii-button" title="Create ASCII file" color="#9a73ef" onPress={createFileASCIICall}/>
                                <E2EButton id="create-base64-button" title="Create base64 file" color="#9a73ef" onPress={createFileBase64Call}/>
                                <E2EButton id="create-uri-button" title="Create file from URI" color="#9a73ef" onPress={createFileURICall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'readFile - readFile()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput style={styles.input} placeholder="Source path" onChangeText={setReadParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('read-path-input')} />
                                </View>
                                <E2EButton id="read-utf8-button" title="Read UTF8 file" color="#9a73ef" onPress={readFileUTF8Call}/>
                                <E2EButton id="read-ascii-button" title="Read ASCII file" color="#9a73ef" onPress={readFileASCIICall}/>
                                <E2EButton id="read-base64-button" title="Read base64 file" color="#9a73ef" onPress={readFileBase64Call}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'Hash - hash()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Source path"
                                        onChangeText={setHashPathParam}
                                        placeholderTextColor="#9a73ef"
                                        autoCapitalize="none"
                                        {...e2eId('hash-path-input')}
                                    />
                                    <View style={styles.buttonGroup}>
                                        {['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'].map((alg) => (
                                            <E2EButton
                                                key={alg}
                                                id={`hash-${alg}-button`}
                                                title={alg.toUpperCase()}
                                                color={hashAlgValue === alg ? '#7a42f4' : '#777'}
                                                onPress={() => setHashAlgValue(alg)}
                                            />
                                        ))}
                                    </View>
                                </View>
                                <E2EButton id="hash-button" title="Hash File" color="#9a73ef" onPress={hashCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'write - writeFile(), appendFile()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Source path"
                                        onChangeText={setWriteParam}
                                        placeholderTextColor="#9a73ef"
                                        autoCapitalize="none"
                                        {...e2eId('write-path-input')}
                                    />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Destination path"
                                        onChangeText={setWriteURIParam}
                                        placeholderTextColor="#9a73ef"
                                        autoCapitalize="none"
                                        {...e2eId('write-uri-input')}
                                    />
                                    <View style={styles.buttonGroup}>
                                        {['utf8', 'base64', 'ascii', 'uri'].map((enc) => (
                                            <E2EButton
                                                key={enc}
                                                id={`write-enc-${enc}-button`}
                                                title={enc.toUpperCase()}
                                                color={writeEncodeParam === enc ? '#7a42f4' : '#777'}
                                                onPress={() => setWriteEncodeParam(enc)}
                                            />
                                        ))}
                                    </View>
                                </View>
                                <E2EButton id="write-button" title="Write" color="#9a73ef" onPress={writeFileCall}/>
                                <E2EButton id="append-button" title="Append" color="#9a73ef" onPress={appendFileCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'WriteStream - writeStream()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Source path"
                                        onChangeText={setWriteStreamParam}
                                        placeholderTextColor="#9a73ef"
                                        autoCapitalize="none"
                                        {...e2eId('write-stream-path-input')}
                                    />
                                    <View style={styles.buttonGroup}>
                                        {['utf8', 'base64', 'ascii'].map((enc) => (
                                            <E2EButton
                                                key={enc}
                                                id={`write-stream-enc-${enc}-button`}
                                                title={enc.toUpperCase()}
                                                color={writeEncodeStreamParam === enc ? '#7a42f4' : '#777'}
                                                onPress={() => setWriteStreamEncodeParam(enc)}
                                            />
                                        ))}
                                    </View>
                                </View>
                                <E2EButton id="write-stream-button" title="Write" color="#9a73ef" onPress={writeStreamCall}/>
                                <E2EButton id="append-stream-button" title="Append" color="#9a73ef" onPress={appendStreamCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'ReadStream - readStream()'}</Text>
                                <View style={styles.sectionDescription}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Source path"
                                        onChangeText={setReadStreamParam}
                                        placeholderTextColor="#9a73ef"
                                        autoCapitalize="none"
                                        {...e2eId('read-stream-path-input')}
                                    />
                                    <View style={styles.buttonGroup}>
                                        {['utf8', 'base64', 'ascii'].map((enc) => (
                                            <E2EButton
                                                key={enc}
                                                id={`read-stream-enc-${enc}-button`}
                                                title={enc.toUpperCase()}
                                                color={readEncodeStreamParam === enc ? '#7a42f4' : '#777'}
                                                onPress={() => setReadStreamEncodeParam(enc)}
                                            />
                                        ))}
                                    </View>
                                </View>
                                <E2EButton id="read-stream-button" title="Read" color="#9a73ef" onPress={readStreamCall}/>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>{'FetchBlobTest'}</Text>
                                <View style={styles.sectionDescription}/>
                                <E2EButton id="fetch-button" title="Attempt Fetch" color="#9a73ef" onPress={fetchCall}/>
                                <E2EButton id="media-store-button" title="Attempt Android Media Storage" color="#9a73ef" onPress={androidmediastore}/>
                                <E2EButton id="upload-file-button" title="Upload File from Storage" color="#9a73ef" onPress={uploadFromStorageCall}/>
                                <E2EButton id="upload-text-button" title="Upload Text From Storage" color="#9a73ef" onPress={uploadTextFromCall}/>
                                <E2EButton id="multipart-button" title="Multipart Call" color="#9a73ef" onPress={MultipartFileAndData}/>
                                <E2EButton id="progress-button" title="Progress Call" color="#9a73ef" onPress={MakeRequestWithProgress}/>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scrollView: {
        backgroundColor: Colors.black,
    },
    engine: {
        position: 'absolute',
        right: 0,
    },
    body: {
        backgroundColor: Colors.dark,
    },
    sectionContainer: {
        marginTop: 32,
        paddingHorizontal: 24,
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: '600',
        color: Colors.white,
    },
    sectionDescription: {
        marginTop: 8,
        fontSize: 18,
        fontWeight: '400',
        color: Colors.dark,
    },
    highlight: {
        fontWeight: '700',
    },
    footer: {
        color: Colors.dark,
        fontSize: 12,
        fontWeight: '600',
        padding: 4,
        paddingRight: 12,
        textAlign: 'right',
    },
    buttonGroup: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginVertical: 8,
    },
    e2eButton: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginVertical: 4,
        backgroundColor: '#9a73ef',
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    e2eButtonText: {
        color: Colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    e2eLog: {
        marginTop: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: Colors.dark,
        backgroundColor: Colors.black,
        maxHeight: 200,
    },
    e2eLogText: {
        color: Colors.white,
        fontSize: 12,
        marginBottom: 4,
    },
    input: {
        color: Colors.white,
        borderColor: '#9a73ef',
        borderWidth: 1,
        padding: 8,
        marginVertical: 4,
    },
});

export default App;