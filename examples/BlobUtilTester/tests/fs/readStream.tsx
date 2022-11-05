import ReactNativeBlobUtil from 'react-native-blob-util';

import {assertEquals, failWithError, TestFunction} from '../../testHelpers';
import {FILES} from '../../testData';

const {fs} = ReactNativeBlobUtil;

export const readStreamShouldReadUtf8FileCorrectlyWithDefaultBufferSize: TestFunction =
  async () => {
    const stream = await fs.readStream(
      fs.dirs.DocumentDir + '/short-utf8.txt',
      'utf8',
    );

    stream.open();

    try {
      const content = await new Promise((resolve, reject) => {
        let data = '';

        stream.onData(chunk => {
          data += chunk;
        });

        stream.onEnd(() => {
          resolve(data);
        });

        stream.onError(reject);
      });
      return assertEquals(FILES.SIMPLE_UTF.CONTENT, content);
    } catch (error) {
      return failWithError(error);
    }
  };

export const readStreamShouldReadUtf8FileCorrectlyWithSmallBufferSize: TestFunction =
  async () => {
    const stream = await fs.readStream(FILES.SIMPLE_UTF.PATH, 'utf8', 3);

    stream.open();

    try {
      const content = await new Promise((resolve, reject) => {
        let data = '';

        stream.onData(chunk => {
          data += chunk;
        });

        stream.onEnd(() => {
          resolve(data);
        });

        stream.onError(reject);
      });
      return assertEquals(FILES.SIMPLE_UTF.CONTENT, content);
    } catch (error) {
      return failWithError(error);
    }
  };

// Reproduces issue #180 https://github.com/RonRadtke/react-native-blob-util/issues/180
export const copiedFileShouldEqualOriginalFile: TestFunction = async () => {
  const ifstream = await fs.readStream(FILES.FILE_A.PATH, 'utf8', 10, 5);
  const ofstream = await fs.writeStream(
    fs.dirs.DocumentDir + '/another-file.txt',
    'utf8',
  );

  await new Promise((resolve, reject) => {
    ifstream.open();

    ifstream.onData(chunk => {
      ofstream.write(chunk as string);
    });
    ifstream.onEnd(() => {
      ofstream.close().then(resolve);
    });
    ifstream.onError(detail => {
      reject(detail);
    });
  });

  const result = await fs.readFile(
    fs.dirs.DocumentDir + '/another-file.txt',
    'utf8',
  );

  return assertEquals(FILES.FILE_A.CONTENT, result);
};
