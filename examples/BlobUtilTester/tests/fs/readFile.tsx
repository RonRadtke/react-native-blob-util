import ReactNativeBlobUtil from 'react-native-blob-util';

import {assertEquals, TestFunction} from '../../testHelpers';
import {FILES} from '../../testData';

const {fs} = ReactNativeBlobUtil;

export async function testReadFileShortUtf8DefaultBufferSize() {
  const content = await fs.readFile(
    fs.dirs.DocumentDir + '/short-utf8.txt',
    'utf8',
  );
  return assertEquals(FILES.SIMPLE_UTF.CONTENT, content);
}

export const testReadFileShortUtf8SmallBufferSize: TestFunction = async () => {
  const content = await fs.readFile(
    fs.dirs.DocumentDir + '/short-utf8.txt',
    'utf8',
    2,
  );
  return assertEquals(FILES.SIMPLE_UTF.CONTENT, content);
};
