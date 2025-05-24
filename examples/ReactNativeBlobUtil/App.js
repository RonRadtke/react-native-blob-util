/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React, {useState} from 'react';
import {Alert, Button, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
// import {Picker} from '@react-native-picker/picker'; Need to remove this package as it is not supported in Windows New Architecture

import {Colors} from 'react-native/Libraries/NewAppScreen';

import ReactNativeBlobUtil from 'react-native-blob-util';

const App: () => React$Node = () => {
    // Variables ******************************************************************
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

    // Methods ********************************************************************
    // exists()
    const existsCall = () => {
        ReactNativeBlobUtil.fs
            .exists(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + existsParam)
            .then((result) => {
                Alert.alert('Exists: ' + result);
            })
            .catch((err) => {
                Alert.alert(err.message);
            });
    };

    const isDirCall = () => {
        ReactNativeBlobUtil.fs
            .exists(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + existsParam)
            .then((result) => {
                Alert.alert('isDir: ' + result);
            })
            .catch((err) => {
                Alert.alert(err.message);
            });
    };

    // df()
    const dfCall = () => {
        ReactNativeBlobUtil.fs
            .df()
            .then((result) => {
                Alert.alert('Free space: ' + result.free + ' bytes\nTotal space: ' + result.total + ' bytes');
            })
            .catch((err) => {
                Alert.alert(err.message);
            });
    };

    // ls()
    const lsCall = () => {
        ReactNativeBlobUtil.fs.ls(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + lsParam).then((files) => {
            Alert.alert('Method finished: check debug console for results');
            console.log(files);
        });
    };

    // cp()
    const cpCall = () => {
        ReactNativeBlobUtil.fs
            .cp(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + cpSourceParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + cpDestParam)
            .then(Alert.alert('File successfully copied'))
            .catch((err) => {
                Alert.alert(err.message);
            });
    };

    // mv()
    const mvCall = () => {
        ReactNativeBlobUtil.fs
            .mv(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + cpSourceParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + cpDestParam)
            .then(Alert.alert('File successfully moved'))
            .catch((err) => {
                Alert.alert(err.message);
            });
    };

    // unlink()
    const unlinkCall = () => {
        ReactNativeBlobUtil.fs
            .unlink(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + unlinkParam)
            .then(Alert.alert('file/directory successfully unlinked'))
            .catch((err) => {
                Alert.alert(err.message);
            });
    };

    // stat(), lstat()
    const statCall = () => {
        ReactNativeBlobUtil.fs
            .stat(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + statParam)
            .then((stats) => {
                console.log(stats);
                Alert.alert('stat() result (others logged in console)', 'filename: ' + stats.filename + '\nlastModified: ' + stats.lastModified + '\npath: ' + stats.path + '\nsize: ' + stats.size + '\ntype: ' + stats.type);
            })
            .catch((err) => {
                Alert.alert(err.message);
            });
    };

    const lstatCall = () => {
        ReactNativeBlobUtil.fs
            .lstat(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + statParam)
            .then((stats) => {
                console.log(stats);
                Alert.alert('lstat() result (others logged in console)', 'filename: ' + stats[0].filename + '\nlastModified: ' + stats[0].lastModified + '\npath: ' + stats[0].path + '\nsize: ' + stats[0].size + '\ntype: ' + stats[0].type);
            })
            .catch((err) => {
                Alert.alert(err.message);
            });
    };

    // mkdir()
    const mkdirCall = () => {
        if (mkdirParam.length > 0) {
            ReactNativeBlobUtil.fs
                .mkdir(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam)
                .then(() => {
                    Alert.alert('successfully created file:', ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam);
                })
                .catch((err) => {
                    Alert.alert(err.message);
                });
        } else {
            Alert.alert('Cannot make file with no name provided');
        }
    };

    // createFile()
    const createFileUTF8Call = () => {
        ReactNativeBlobUtil.fs.createFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam, 'foo', 'utf8');
    };

    const createFileASCIICall = () => {
        ReactNativeBlobUtil.fs.createFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam, [102, 111, 111], 'ascii');
    };

    const createFileBase64Call = () => {
        ReactNativeBlobUtil.fs.createFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam, 'Zm9v', 'base64');
    };

    const createFileURICall = () => {
        ReactNativeBlobUtil.fs.createFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + mkdirURIParam, 'uri');
    };

    // readFile()
    const readFileUTF8Call = () => {
        ReactNativeBlobUtil.fs.readFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + readParam, 'utf8').then((data) => {
            Alert.alert('UTF8 result of ' + readParam, data);
        });
    };

    const readFileASCIICall = () => {
        ReactNativeBlobUtil.fs.readFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + readParam, 'ascii').then((data) => {
            Alert.alert('UTF8 result of ' + readParam, data);
        });
    };

    const readFileBase64Call = () => {
        ReactNativeBlobUtil.fs.readFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + readParam, 'base64').then((data) => {
            Alert.alert('UTF8 result of ' + readParam, data);
        });
    };

    // hash()
    const hashCall = () => {
        ReactNativeBlobUtil.fs
            .hash(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + hashPathParam, hashAlgValue)
            .then((hash) => {
                Alert.alert(hashAlgValue, hash);
            })
            .catch((err) => {
                console.log(hashAlgValue + ': ' + err);
            });
    };

    // writeFile()
    const writeFileCall = () => {
        if (writeParam.length > 0) {
            if (writeEncodeParam === 'uri') {
                if (writeURIParam.length > 0) {
                    ReactNativeBlobUtil.fs.writeFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeURIParam, writeEncodeParam);
                } else {
                    Alert.alert('uri path undefined');
                }
            } else if (writeEncodeParam === 'ascii') {
                ReactNativeBlobUtil.fs.writeFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, [102, 111, 111], writeEncodeParam);
            } else {
                ReactNativeBlobUtil.fs.writeFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, 'foo', writeEncodeParam);
            }
        }
    };

    // appendFile()
    const appendFileCall = () => {
        if (writeParam.length > 0) {
            if (writeEncodeParam === 'uri') {
                if (writeURIParam.length > 0) {
                    ReactNativeBlobUtil.fs.appendFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeURIParam, writeEncodeParam);
                } else {
                    Alert.alert('uri path undefined');
                }
            } else if (writeEncodeParam === 'ascii') {
                ReactNativeBlobUtil.fs.appendFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, [102, 111, 111], writeEncodeParam);
            } else {
                ReactNativeBlobUtil.fs.appendFile(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeParam, 'foo', writeEncodeParam);
            }
        }
    };

    const writeStreamCall = () => {
        if (writeStreamParam.length > 0) {
            if (writeEncodeStreamParam === 'base64') {
                ReactNativeBlobUtil.fs.writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, false).then((stream) => {
                    stream.write('Zm9vIChXcml0ZSBCYXNlNjQpMQ==');
                    stream.write('Zm9vIChXcml0ZSBCYXNlNjQpMg==');
                    return stream.close();
                });
            } else if (writeEncodeStreamParam === 'ascii') {
                ReactNativeBlobUtil.fs.writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, false).then((stream) => {
                    stream.write([102, 111, 111, 32, 40, 87, 114, 105, 116]);
                    stream.write([101, 32, 97, 115, 99, 105, 105, 41]);
                    return stream.close();
                });
            } else {
                ReactNativeBlobUtil.fs.writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, false).then((stream) => {
                    stream.write('foo (Write utf8)1');
                    stream.write('foo (Write utf8)2');
                    return stream.close();
                });
            }
        }
    };

    const appendStreamCall = () => {
        if (writeStreamParam.length > 0) {
            if (writeEncodeStreamParam === 'base64') {
                ReactNativeBlobUtil.fs.writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, true).then((stream) => {
                    stream.write('Zm9vIChBcHBlbmQgQmFzZTY0KTE=');
                    stream.write('Zm9vIChBcHBlbmQgQmFzZTY0KTI=');
                    return stream.close();
                });
            } else if (writeEncodeStreamParam === 'ascii') {
                ReactNativeBlobUtil.fs.writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, true).then((stream) => {
                    stream.write([102, 111, 111, 32, 40]);
                    stream.write([65, 112, 112, 101, 110, 100, 32, 65, 83, 67, 73, 73, 41]);
                    return stream.close();
                });
            } else {
                ReactNativeBlobUtil.fs.writeStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + writeStreamParam, writeEncodeStreamParam, true).then((stream) => {
                    stream.write('foo (Append utf8)1');
                    stream.write('foo (Append utf8)2');
                    return stream.close();
                });
            }
        }
    };

    // readStream
    const readStreamCall = () => {
        ReactNativeBlobUtil.fs.readStream(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + readStreamParam, readEncodeStreamParam, 4000, 200).then((stream) => {
            let data = '';
            stream.open();
            stream.onData((chunk) => {
                data += chunk;
            });
            stream.onEnd(() => {
                console.log('data: ' + data);
            });
        });
    };

    // fetchCall
    const fetchCall = () => {
        ReactNativeBlobUtil.config({
            // add this option that makes response data to be stored as a file,
            // this is much more performant.
            fileCache: true,
        })
            .fetch('GET', 'https://upload.wikimedia.org/wikipedia/commons/c/c4/Change-5.png')
            .then((res) => {
                // the temp file path
                console.log('The file saved to ', res.path());
            });
    };

    // Android mediastorage store
    const androidmediastore = () => {
        ReactNativeBlobUtil.config({
            // add this option that makes response data to be stored as a file,
            // this is much more performant.
            fileCache: true,
        })
            .fetch('GET', 'https://upload.wikimedia.org/wikipedia/commons/c/c4/Change-5.png')
            .then((res) => {
                // the temp file path
                ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
                    {
                        name: 'test.png',
                        parentFolder: '',
                        mimeType: 'image/png',
                    },
                    'Download',
                    res.path(),
                ).then((dest) => ReactNativeBlobUtil.android.actionViewIntent(dest, 'image/png'));
            });
    };

    // uploadFileFromStorage
    const uploadFromStorageCall = () => {
        ReactNativeBlobUtil.fetch(
            'POST',
            'https://enb954aqyumba.x.pipedream.net/',
            {
                Authorization: 'Bearer access-token...',
                'Dropbox-API-Arg': JSON.stringify({
                    path: '/img-from-react-native.png',
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }),
                'Content-Type': 'application/octet-stream',
                // here's the body you're going to send, should be a BASE64 encoded string
                // (you can use "base64"(refer to the library 'mathiasbynens/base64') APIs to make one).
                // The data will be converted to "byte array"(say, blob) before request sent.
            },
            ReactNativeBlobUtil.wrap(ReactNativeBlobUtil.fs.dirs.DocumentDir + '\\ImageToUpload.jpg'),
        )
            .then((res) => {
                console.log(res.text());
            })
            .catch((err) => {
                // error handling ..
            });
    };

    // uploadTextFromStorage
    const uploadTextFromCall = () => {
        ReactNativeBlobUtil.fetch(
            'POST',
            'https://enb954aqyumba.x.pipedream.net/',
            {
                Authorization: 'Bearer access-token...',
                'Dropbox-API-Arg': JSON.stringify({
                    path: '/img-from-react-native.png',
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }),
                'Content-Type': 'application/octet-stream',
                // here's the body you're going to send, should be a BASE64 encoded string
                // (you can use "base64"(refer to the library 'mathiasbynens/base64') APIs to make one).
                // The data will be converted to "byte array"(say, blob) before request sent.
            },
            'Waka Flacka Flame goes very well with Thomas the Tank Engine.',
        )
            .then((res) => {
                console.log(res.text());
            })
            .catch((err) => {
                // error handling ..
            });
    };

    // MultipartFileAndData
    const MultipartFileAndData = () => {
        ReactNativeBlobUtil.fetch(
            'POST',
            'https://enb954aqyumba.x.pipedream.net/',
            {
                Authorization: 'Bearer access-token...',
                'Dropbox-API-Arg': JSON.stringify({
                    path: '/img-from-react-native.png',
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }),
                'Content-Type': 'application/octet-stream',
                // here's the body you're going to send, should be a BASE64 encoded string
                // (you can use "base64"(refer to the library 'mathiasbynens/base64') APIs to make one).
                // The data will be converted to "byte array"(say, blob) before request sent.
            },
            'Waka Flacka Flame goes very well with Thomas the Tank Engine.',
        )
            .uploadProgress((received, total) => {
                console.log('upload progress', received / total);
            })
            .progress((received, total) => {
                console.log('download progress', received / total);
            })
            .then((res) => {
                console.log(res.text());
            })
            .catch((err) => {
                // error handling ..
            });
    };

    //
    const MakeRequestWithProgress = () => {
        ReactNativeBlobUtil.config({
            // add this option that makes response data to be stored as a file,
            // this is much more performant.
            fileCache: true,
        })
            .fetch(
                'POST',
                'https://enb954aqyumba.x.pipedream.net/',
                {
                    Authorization: 'Bearer access-token',
                    otherHeader: 'foo',
                    'Content-Type': 'multipart/form-data',
                },
                [
                    // element with property `filename` will be transformed into `file` in form data
                    {name: 'avatar', filename: 'avatar.png', data: 'Kentucky Fried Seth'},
                    // custom content type
                    {
                        name: 'avatar-png',
                        filename: 'avatar-png.png',
                        type: 'image/png',
                        data: 'whaddup my pickles',
                    },
                    // part file from storage
                    {
                        name: 'avatar-foo',
                        filename: 'avatar-foo.png',
                        type: 'image/foo',
                        data: ReactNativeBlobUtil.wrap(ReactNativeBlobUtil.fs.dirs.DocumentDir + '\\ImageToUpload.jpg'),
                    },
                    // elements without property `filename` will be sent as plain text
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
                console.log('uploaded', written / total);
            })
            .progress({count: 10, interval: -1}, (received, total) => {
                console.log('progress', received / total);
            })
            .then((res) => {
                console.log(res.text());
            })
            .catch((err) => {
                console.log(err.text());
            });
    };

    // App ************************************************************************
    return (
        <>
            <View>
                <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.scrollView}>
                    {global.HermesInternal == null ? null : (
                        <View style={styles.engine}>
                            <Text style={styles.footer}>Engine: Hermes</Text>
                        </View>
                    )}
                    <Text style={styles.sectionTitle}>{'React Native Fetch Blob Windows Demo App'}</Text>
                    <View style={styles.body}>
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
                            <Text style={styles.sectionTitle}>{'exists - exists(), isDir()'}</Text>
                            <TextInput style={styles.input} placeholder="Path" onChangeText={(existsParam) => setExistsParam(existsParam)} placeholderTextColor="#9a73ef" autoCapitalize="none" />
                            <Button title="Check if exists" color="#9a73ef" onPress={existsCall} />
                            <Button title="Check if is dir" color="#9a73ef" onPress={isDirCall} />
                        </View>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>{'df - df()'}</Text>
                            <Button title="Get free/total disk space" color="#9a73ef" onPress={dfCall} />
                        </View>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>{'ls - ls()'}</Text>
                            <View style={styles.sectionDescription}>
                                <TextInput style={styles.input} placeholder="Directory Path" onChangeText={(lsParam) => setLSParam(lsParam)} placeholderTextColor="#9a73ef" autoCapitalize="none" />
                            </View>
                            <Button title="Get specified directory info" color="#9a73ef" onPress={lsCall} />
                        </View>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>{'cp and mv - cp() and mv()'}</Text>
                            <View style={styles.sectionDescription}>
                                <TextInput style={styles.input} placeholder="Source File Path" onChangeText={(cpSourceParam) => setCPSourceParam(cpSourceParam)} placeholderTextColor="#9a73ef" autoCapitalize="none" />
                                <TextInput style={styles.input} placeholder="Destintation File Path" onChangeText={(cpDestParam) => setCPDestParam(cpDestParam)} placeholderTextColor="#9a73ef" autoCapitalize="none" />
                            </View>
                            <Button title="Copy File to Destination" color="#9a73ef" onPress={cpCall} />
                            <Button title="Move File to Destination" color="#9a73ef" onPress={mvCall} />
                        </View>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>{'unlink - unlink()'}</Text>
                            <View style={styles.sectionDescription}>
                                <TextInput style={styles.input} placeholder="File Path" onChangeText={(unlinkParam) => setUnlinkParam(unlinkParam)} placeholderTextColor="#9a73ef" autoCapitalize="none" />
                            </View>
                            <Button title="Copy File to Destination" color="#9a73ef" onPress={unlinkCall} />
                        </View>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>{'stat - stat(), lstat()'}</Text>
                            <View style={styles.sectionDescription}>
                                <TextInput style={styles.input} placeholder="Source path" onChangeText={(statParam) => setStatParam(statParam)} placeholderTextColor="#9a73ef" autoCapitalize="none" />
                            </View>
                            <Button title="stat Call" color="#9a73ef" onPress={statCall} />
                            <Button title="lstat Call" color="#9a73ef" onPress={lstatCall} />
                        </View>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>{'mkdir - mkdir(), createFile()'}</Text>
                            <View style={styles.sectionDescription}>
                                <TextInput style={styles.input} placeholder="Source path" onChangeText={(mkdirParam) => setMkdirParam(mkdirParam)} placeholderTextColor="#9a73ef" autoCapitalize="none" />
                                <TextInput style={styles.input} placeholder="URI source path" onChangeText={(mkdirURIParam) => setMkdirURIParam(mkdirURIParam)} placeholderTextColor="#9a73ef" autoCapitalize="none" />
                            </View>
                            <Button title="mkdir" color="#9a73ef" onPress={mkdirCall} />
                            <Button title="Create UTF8 file" color="#9a73ef" onPress={createFileUTF8Call} />
                            <Button title="Create ASCII file" color="#9a73ef" onPress={createFileASCIICall} />
                            <Button title="Create base64 file" color="#9a73ef" onPress={createFileBase64Call} />
                            <Button title="Create file from URI" color="#9a73ef" onPress={createFileURICall} />
                        </View>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>{'readFile - readFile()'}</Text>
                            <View style={styles.sectionDescription}>
                                <TextInput style={styles.input} placeholder="Source path" onChangeText={(readParam) => setReadParam(readParam)} placeholderTextColor="#9a73ef" autoCapitalize="none" />
                            </View>
                            <Button title="Read UTF8 file" color="#9a73ef" onPress={readFileUTF8Call} />
                            <Button title="Read ASCII file" color="#9a73ef" onPress={readFileASCIICall} />
                            <Button title="Read base64 file" color="#9a73ef" onPress={readFileBase64Call} />
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
                        />
                        <View style={styles.buttonGroup}>
                            {['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'].map((alg) => (
                            <Button
                                key={alg}
                                title={alg.toUpperCase()}
                                color={hashAlgValue === alg ? '#7a42f4' : '#ccc'}
                                onPress={() => setHashAlgValue(alg)}
                            />
                            ))}
                        </View>
                        </View>
                        <Button title="Hash File" color="#9a73ef" onPress={hashCall} />
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
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Destination path"
                            onChangeText={setWriteURIParam}
                            placeholderTextColor="#9a73ef"
                            autoCapitalize="none"
                        />
                        <View style={styles.buttonGroup}>
                            {['utf8', 'base64', 'ascii', 'uri'].map((enc) => (
                            <Button
                                key={enc}
                                title={enc.toUpperCase()}
                                color={writeEncodeParam === enc ? '#7a42f4' : '#ccc'}
                                onPress={() => setWriteEncodeParam(enc)}
                            />
                            ))}
                        </View>
                        </View>
                        <Button title="Write" color="#9a73ef" onPress={writeFileCall} />
                        <Button title="Append" color="#9a73ef" onPress={appendFileCall} />
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
                        />
                        <View style={styles.buttonGroup}>
                            {['utf8', 'base64', 'ascii'].map((enc) => (
                            <Button
                                key={enc}
                                title={enc.toUpperCase()}
                                color={writeEncodeStreamParam === enc ? '#7a42f4' : '#ccc'}
                                onPress={() => setWriteStreamEncodeParam(enc)}
                            />
                            ))}
                        </View>
                        </View>
                        <Button title="Write" color="#9a73ef" onPress={writeStreamCall} />
                        <Button title="Append" color="#9a73ef" onPress={appendStreamCall} />
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
                        />
                        <View style={styles.buttonGroup}>
                            {['utf8', 'base64', 'ascii'].map((enc) => (
                            <Button
                                key={enc}
                                title={enc.toUpperCase()}
                                color={readEncodeStreamParam === enc ? '#7a42f4' : '#ccc'}
                                onPress={() => setReadStreamEncodeParam(enc)}
                            />
                            ))}
                        </View>
                        </View>
                        <Button title="Read" color="#9a73ef" onPress={readStreamCall} />
                    </View>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>{'FetchBlobTest'}</Text>
                            <View style={styles.sectionDescription} />
                            <Button title="Attempt Fetch" color="#9a73ef" onPress={fetchCall} />
                            <Button title="Attempt Android Media Storage" color="#9a73ef" onPress={androidmediastore} />
                            <Button title="Upload File from Storage" color="#9a73ef" onPress={uploadFromStorageCall} />
                            <Button title="Upload Text From Storage" color="#9a73ef" onPress={uploadTextFromCall} />
                            <Button title="Multipart Call" color="#9a73ef" onPress={MultipartFileAndData} />
                            <Button title="Progress Call" color="#9a73ef" onPress={MakeRequestWithProgress} />
                        </View>
                    </View>
                </ScrollView>
            </View>
        </>
    );
};

const styles = StyleSheet.create({
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
});

export default App;
