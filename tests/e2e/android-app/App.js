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
const E2EPanelTab = ({id, title, active, onPress}) => (
    <Pressable
        onPress={onPress}
        testID={id}
        nativeID={id}
        accessibilityLabel={id}
        accessibilityRole="button"
        accessible={true}
        style={[styles.e2eTab, active ? styles.e2eTabActive : null]}>
        <Text style={styles.e2eTabText}>{title}</Text>
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

    const [activeE2ePanel, setActiveE2ePanel] = useState('base');

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
        appendLog(`readStream start: ${readStreamParam} ${readEncodeStreamParam}`);
        let sawData = false;
        let totalLength = 0;

        ReactNativeBlobUtil.fs
            .readStream(
                ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + readStreamParam,
                readEncodeStreamParam,
                4000,
                200,
            )
            .then((stream) => {
                stream.onData((chunk) => {
                    sawData = true;
                    totalLength += String(chunk).length;
                    appendLog('readStream data: ' + chunk);
                });

                stream.onError((err) => {
                    notifyError(err);
                });

                stream.onEnd(() => {
                    if (sawData) {
                        notify('readStream', `length: ${totalLength}`);
                    }
                    else {
                        notify('readStream', 'no data emitted');
                    }
                    appendLog('readStream end');
                });

                stream.open();
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
                        if (!e2eEnabled) {
                            ReactNativeBlobUtil.android.actionViewIntent(dest, 'image/png');
                        }
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
        <View style={styles.body}>
            <View style={styles.e2eContainer}>
                <Text style={styles.sectionTitle}>{'E2E Controls'}</Text>

                <View style={styles.e2eTabs}>
                    {[
                        ['base', 'Base'],
                        ['exists', 'Exists'],
                        ['ls', 'LS'],
                        ['copy', 'Copy'],
                        ['unlink', 'Unlink'],
                        ['stat', 'Stat'],
                        ['create', 'Create'],
                        ['read', 'Read'],
                        ['hash', 'Hash'],
                        ['write', 'Write'],
                        ['writeStream', 'WStream'],
                        ['readStream', 'RStream'],
                        ['network', 'Net'],
                    ].map(([panel, title]) => (
                        <E2EPanelTab
                            key={panel}
                            id={`e2e-panel-${panel}`}
                            title={title}
                            active={activeE2ePanel === panel}
                            onPress={() => setActiveE2ePanel(panel)}
                        />
                    ))}
                </View>

                {activeE2ePanel === 'base' ? (
                    <View>
                        <TextInput
                            style={styles.input}
                            placeholder="Base URL"
                            value={baseUrl}
                            onChangeText={setBaseUrl}
                            placeholderTextColor="#9a73ef"
                            autoCapitalize="none"
                            {...e2eId('e2e-base-url-input')}
                        />
                        <View style={styles.buttonGroup}>
                            <E2EButton id="e2e-toggle-button" title={e2eEnabled ? 'Disable E2E Mode' : 'Enable E2E Mode'} color="#9a73ef" onPress={toggleE2eMode} />
                            <E2EButton id="e2e-reset-fixtures-button" title="Reset E2E Fixtures" color="#9a73ef" onPress={resetE2eFixtures} />
                            <E2EButton id="e2e-clear-log-button" title="Clear E2E Log" color="#9a73ef" onPress={clearLog} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'exists' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Path" onChangeText={setExistsParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('exists-path-input')} />
                        <View style={styles.buttonGroup}>
                            <E2EButton id="exists-button" title="Exists" color="#9a73ef" onPress={existsCall} />
                            <E2EButton id="isdir-button" title="Is Dir" color="#9a73ef" onPress={isDirCall} />
                            <E2EButton id="df-button" title="DF" color="#9a73ef" onPress={dfCall} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'ls' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Directory Path" onChangeText={setLSParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('ls-path-input')} />
                        <E2EButton id="ls-button" title="LS" color="#9a73ef" onPress={lsCall} />
                    </View>
                ) : null}

                {activeE2ePanel === 'copy' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Source File Path" onChangeText={setCPSourceParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('cp-source-input')} />
                        <TextInput style={styles.input} placeholder="Destination File Path" onChangeText={setCPDestParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('cp-dest-input')} />
                        <View style={styles.buttonGroup}>
                            <E2EButton id="cp-button" title="Copy" color="#9a73ef" onPress={cpCall} />
                            <E2EButton id="mv-button" title="Move" color="#9a73ef" onPress={mvCall} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'unlink' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="File Path" onChangeText={setUnlinkParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('unlink-path-input')} />
                        <E2EButton id="unlink-button" title="Unlink" color="#9a73ef" onPress={unlinkCall} />
                    </View>
                ) : null}

                {activeE2ePanel === 'stat' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Source path" onChangeText={setStatParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('stat-path-input')} />
                        <View style={styles.buttonGroup}>
                            <E2EButton id="stat-button" title="Stat" color="#9a73ef" onPress={statCall} />
                            <E2EButton id="lstat-button" title="LStat" color="#9a73ef" onPress={lstatCall} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'create' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Source path" onChangeText={setMkdirParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('mkdir-path-input')} />
                        <TextInput style={styles.input} placeholder="URI source path" onChangeText={setMkdirURIParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('mkdir-uri-input')} />
                        <View style={styles.buttonGroup}>
                            <E2EButton id="mkdir-button" title="mkdir" color="#9a73ef" onPress={mkdirCall} />
                            <E2EButton id="create-utf8-button" title="UTF8" color="#9a73ef" onPress={createFileUTF8Call} />
                            <E2EButton id="create-ascii-button" title="ASCII" color="#9a73ef" onPress={createFileASCIICall} />
                            <E2EButton id="create-base64-button" title="Base64" color="#9a73ef" onPress={createFileBase64Call} />
                            <E2EButton id="create-uri-button" title="URI" color="#9a73ef" onPress={createFileURICall} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'read' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Source path" onChangeText={setReadParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('read-path-input')} />
                        <View style={styles.buttonGroup}>
                            <E2EButton id="read-utf8-button" title="UTF8" color="#9a73ef" onPress={readFileUTF8Call} />
                            <E2EButton id="read-ascii-button" title="ASCII" color="#9a73ef" onPress={readFileASCIICall} />
                            <E2EButton id="read-base64-button" title="Base64" color="#9a73ef" onPress={readFileBase64Call} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'hash' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Source path" onChangeText={setHashPathParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('hash-path-input')} />
                        <View style={styles.buttonGroup}>
                            {['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'].map((alg) => (
                                <E2EButton key={alg} id={`hash-${alg}-button`} title={alg.toUpperCase()} color={hashAlgValue === alg ? '#7a42f4' : '#777'} onPress={() => setHashAlgValue(alg)} />
                            ))}
                            <E2EButton id="hash-button" title="Hash" color="#9a73ef" onPress={hashCall} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'write' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Source path" onChangeText={setWriteParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('write-path-input')} />
                        <TextInput style={styles.input} placeholder="Destination path" onChangeText={setWriteURIParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('write-uri-input')} />
                        <View style={styles.buttonGroup}>
                            {['utf8', 'base64', 'ascii', 'uri'].map((enc) => (
                                <E2EButton key={enc} id={`write-enc-${enc}-button`} title={enc.toUpperCase()} color={writeEncodeParam === enc ? '#7a42f4' : '#777'} onPress={() => setWriteEncodeParam(enc)} />
                            ))}
                            <E2EButton id="write-button" title="Write" color="#9a73ef" onPress={writeFileCall} />
                            <E2EButton id="append-button" title="Append" color="#9a73ef" onPress={appendFileCall} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'writeStream' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Source path" onChangeText={setWriteStreamParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('write-stream-path-input')} />
                        <View style={styles.buttonGroup}>
                            {['utf8', 'base64', 'ascii'].map((enc) => (
                                <E2EButton key={enc} id={`write-stream-enc-${enc}-button`} title={enc.toUpperCase()} color={writeEncodeStreamParam === enc ? '#7a42f4' : '#777'} onPress={() => setWriteStreamEncodeParam(enc)} />
                            ))}
                            <E2EButton id="write-stream-button" title="Write" color="#9a73ef" onPress={writeStreamCall} />
                            <E2EButton id="append-stream-button" title="Append" color="#9a73ef" onPress={appendStreamCall} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'readStream' ? (
                    <View>
                        <TextInput style={styles.input} placeholder="Source path" onChangeText={setReadStreamParam} placeholderTextColor="#9a73ef" autoCapitalize="none" {...e2eId('read-stream-path-input')} />
                        <View style={styles.buttonGroup}>
                            {['utf8', 'base64', 'ascii'].map((enc) => (
                                <E2EButton key={enc} id={`read-stream-enc-${enc}-button`} title={enc.toUpperCase()} color={readEncodeStreamParam === enc ? '#7a42f4' : '#777'} onPress={() => setReadStreamEncodeParam(enc)} />
                            ))}
                            <E2EButton id="read-stream-button" title="Read" color="#9a73ef" onPress={readStreamCall} />
                        </View>
                    </View>
                ) : null}

                {activeE2ePanel === 'network' ? (
                    <View style={styles.buttonGroup}>
                        <E2EButton id="fetch-button" title="Fetch" color="#9a73ef" onPress={fetchCall} />
                        <E2EButton id="media-store-button" title="Media" color="#9a73ef" onPress={androidmediastore} />
                        <E2EButton id="upload-file-button" title="Upload File" color="#9a73ef" onPress={uploadFromStorageCall} />
                        <E2EButton id="upload-text-button" title="Upload Text" color="#9a73ef" onPress={uploadTextFromCall} />
                        <E2EButton id="multipart-button" title="Multipart" color="#9a73ef" onPress={MultipartFileAndData} />
                        <E2EButton id="progress-button" title="Progress" color="#9a73ef" onPress={MakeRequestWithProgress} />
                    </View>
                ) : null}

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
    );
};

const styles = StyleSheet.create({
    e2eContainer: {
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 8,
        backgroundColor: Colors.dark,
    },

    e2eTabs: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginVertical: 8,
    },

    e2eTab: {
        paddingVertical: 6,
        paddingHorizontal: 8,
        backgroundColor: '#444',
        borderRadius: 4,
    },

    e2eTabActive: {
        backgroundColor: '#7a42f4',
    },

    e2eTabText: {
        color: Colors.white,
        fontSize: 12,
        fontWeight: '600',
    },
});

export default App;